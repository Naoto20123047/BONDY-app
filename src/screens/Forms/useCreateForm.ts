import { useState } from "react";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { createNotifications } from "../../lib/notify";
import { notifyNewForm } from "../../lib/teamsNotify";
import { formTypeLabel } from "../../lib/formLabel";
import type { FormType, FormQuestion } from "../../Types/types";

const genId = () => Math.random().toString(36).slice(2, 9);

export function useCreateForm() {
  const [type, setType] = useState<FormType>("イベント");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  // 種類を変えても質問は保持する
  const changeType = (newType: FormType) => {
    setType(newType);
  };

  const addQuestion = (qType: "text" | "select") => {
    setQuestions((prev) => [
      ...prev,
      qType === "select"
        ? { id: genId(), label: "", type: "select", options: [""], required: false }
        : { id: genId(), label: "", type: "text", required: false },
    ]);
  };

  const updateLabel = (id: string, label: string) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, label } : q)));
  };

  // 必須のON/OFF
  const toggleRequired = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, required: !q.required } : q))
    );
  };

  const updateOption = (qId: string, index: number, value: string) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === qId);
      if (idx === -1) return prev;
      const oldValue = prev[idx].options?.[index];

      return prev.map((q, i) => {
        // 選択肢を更新
        if (q.id === qId && q.options) {
          const options = [...q.options];
          options[index] = value;
          return { ...q, options };
        }
        // この選択肢を条件にしている次の質問があれば、条件値も追従させる
        if (
          i === idx + 1 &&
          q.showIf?.questionId === qId &&
          q.showIf.value === oldValue
        ) {
          return { ...q, showIf: { questionId: qId, value } };
        }
        return q;
      });
    });
  };

  const addOption = (qId: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId && q.options ? { ...q, options: [...q.options, ""] } : q
      )
    );
  };

  const removeOption = (qId: string, index: number) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === qId);
      const removed = prev[idx]?.options?.[index];

      return prev.map((q, i) => {
        // 選択肢を削除
        if (q.id === qId && q.options) {
          return { ...q, options: q.options.filter((_, oi) => oi !== index) };
        }
        // 削除した選択肢を条件にしていた次の質問は、条件を解除
        if (
          i === idx + 1 &&
          q.showIf?.questionId === qId &&
          q.showIf.value === removed
        ) {
          const { showIf, ...rest } = q;
          return rest as FormQuestion;
        }
        return q;
      });
    });
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) =>
      prev
        .filter((q) => q.id !== id)
        // 削除した質問を条件にしていた質問があれば、条件を解除
        .map((q) => {
          if (q.showIf?.questionId === id) {
            const { showIf, ...rest } = q;
            return rest as FormQuestion;
          }
          return q;
        })
    );
  };

  // 表示条件の設定(直前の質問の選択肢を指定 / null で解除)
  const setShowIf = (id: string, value: string | null) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx <= 0) return prev;
      const prevQuestion = prev[idx - 1];
      if (prevQuestion.type !== "select") return prev;

      return prev.map((q, i) => {
        if (i !== idx) return q;
        if (value === null) {
          const { showIf, ...rest } = q;
          return rest as FormQuestion;
        }
        return { ...q, showIf: { questionId: prevQuestion.id, value } };
      });
    });
  };

  const save = async (onDone: () => void) => {
    if (!title.trim()) {
      window.alert("フォームのタイトルを入力してください。");
      return;
    }
    if (!deadline) {
      window.alert("回答期限を設定してください。");
      return;
    }
    if (questions.length === 0) {
      window.alert("質問を1つ以上追加してください。");
      return;
    }
    if (questions.some((q) => !q.label.trim())) {
      window.alert("質問文が空の項目があります。");
      return;
    }
    if (
      questions.some(
        (q) => q.type === "select" && (q.options ?? []).some((o) => !o.trim())
      )
    ) {
      window.alert("選択肢が空の項目があります。");
      return;
    }
    setSaving(true);
    try {
      // undefined は保存できないため、値のあるフィールドだけを残す
      const cleanedQuestions = questions.map((q) => {
        const base: Record<string, unknown> = {
          id: q.id,
          label: q.label.trim(),
          type: q.type,
          required: q.required === true,
        };
        if (q.type === "select") {
          base.options = (q.options ?? []).map((o) => o.trim());
        }
        if (q.showIf) {
          base.showIf = { questionId: q.showIf.questionId, value: q.showIf.value };
        }
        return base;
      });

      const formRef = await addDoc(collection(db, "forms"), {
        type,
        title: title.trim(),
        deadline,
        questions: cleanedQuestions,
      });

      // 在籍中の全メンバーに「フォーム配信」通知を作成
      const memSnap = await getDocs(collection(db, "members"));
      const targetIds = memSnap.docs
        .filter((d) => (d.data() as { status?: string }).status === "active")
        .map((d) => d.id);
      await createNotifications(
        targetIds,
        "form_published",
        `新しいフォーム「${title.trim()}」が配信されました`,
        `/forms/${formRef.id}`
      );

      // Teams に通知(失敗してもフォーム作成は成立させる)
      await notifyNewForm({
        formId: formRef.id,
        typeLabel: formTypeLabel(type),
        title: title.trim(),
        deadline,
      });

      onDone();
    } catch (e) {
      console.error("フォーム作成に失敗しました", e);
      window.alert("作成に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return {
    type,
    changeType,
    title,
    setTitle,
    deadline,
    setDeadline,
    questions,
    addQuestion,
    updateLabel,
    toggleRequired,
    updateOption,
    addOption,
    removeOption,
    removeQuestion,
    setShowIf,
    saving,
    save,
  } as const;
}
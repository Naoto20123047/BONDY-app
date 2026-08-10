import { useState } from "react";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { createNotifications } from "../../lib/notify";
import type { FormType, FormQuestion } from "../../Types/types";

const genId = () => Math.random().toString(36).slice(2, 9);

const eventTemplate = (): FormQuestion[] => [
  { id: genId(), label: "出演しますか?", type: "select", options: ["参加", "不参加", "未定"] },
];

export function useCreateForm() {
  const [type, setType] = useState<FormType>("イベント");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [questions, setQuestions] = useState<FormQuestion[]>(eventTemplate());
  const [saving, setSaving] = useState(false);

  const changeType = (newType: FormType) => {
    setType(newType);
    setQuestions(newType === "イベント" ? eventTemplate() : []);
  };

  const addQuestion = (qType: "text" | "select") => {
    setQuestions((prev) => [
      ...prev,
      qType === "select"
        ? { id: genId(), label: "", type: "select", options: [""] }
        : { id: genId(), label: "", type: "text" },
    ]);
  };

  const updateLabel = (id: string, label: string) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, label } : q)));
  };

  const updateOption = (qId: string, index: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId || !q.options) return q;
        const options = [...q.options];
        options[index] = value;
        return { ...q, options };
      })
    );
  };

  const addOption = (qId: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId && q.options ? { ...q, options: [...q.options, ""] } : q
      )
    );
  };

  const removeOption = (qId: string, index: number) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId && q.options
          ? { ...q, options: q.options.filter((_, i) => i !== index) }
          : q
      )
    );
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
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
    if (questions.some((q) => !q.label.trim())) {
      window.alert("質問文が空の項目があります。");
      return;
    }
    setSaving(true);
    try {
      // options が undefined の質問があるとエラーになるので整形する
      const cleanedQuestions = questions.map((q) =>
        q.type === "select"
          ? { id: q.id, label: q.label, type: q.type, options: q.options ?? [] }
          : { id: q.id, label: q.label, type: q.type }
      );
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
    updateOption,
    addOption,
    removeOption,
    removeQuestion,
    saving,
    save,
  } as const;
}
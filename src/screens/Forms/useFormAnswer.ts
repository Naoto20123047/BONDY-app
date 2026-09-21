import { useState, useEffect } from "react";
import { doc, getDoc, collection, getDocs, query, where, addDoc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { currentFiscalYear } from "../../lib/grade";
import type { FormDef, Band, FormResponse, FormQuestion } from "../../Types/types";

/**
 * 表示条件をもとに、表示すべき質問だけを返す。
 * - showIf が無ければ常に表示
 * - showIf があれば、対象の質問が「表示されていて」かつ「指定の値が選ばれている」ときだけ表示
 *   (前の質問が非表示なら、この質問も非表示になる)
 */
export const filterVisibleQuestions = (
  questions: FormQuestion[],
  answers: Record<string, string>
): FormQuestion[] => {
  const visibleIds = new Set<string>();
  const result: FormQuestion[] = [];

  for (const q of questions) {
    if (!q.showIf) {
      visibleIds.add(q.id);
      result.push(q);
      continue;
    }
    const targetVisible = visibleIds.has(q.showIf.questionId);
    const matched = answers[q.showIf.questionId] === q.showIf.value;
    if (targetVisible && matched) {
      visibleIds.add(q.id);
      result.push(q);
    }
  }

  return result;
};

export function useFormAnswer(id: string | undefined) {
  const { member } = useAuth();
  const [form, setForm] = useState<FormDef | null>(null);
  const [myBands, setMyBands] = useState<Band[]>([]);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [bandId, setBandId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 会費チェック用:今年度の納入済みメンバーIDと、全メンバーの氏名
  const [paidMemberIds, setPaidMemberIds] = useState<Set<string>>(new Set());
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      if (!id || !member) {
        setLoading(false);
        return;
      }
      try {
        // フォーム定義
        const formRef = doc(db, "forms", id);
        const formSnap = await getDoc(formRef);
        if (!formSnap.exists()) {
          setForm(null);
          setLoading(false);
          return;
        }
        const formData = { id: formSnap.id, ...(formSnap.data() as Omit<FormDef, "id">) };
        setForm(formData);

        // このフォームの全回答(バンド単位の編集判定に使う)
        const respQ = query(collection(db, "formResponses"), where("formId", "==", id));
        const respSnap = await getDocs(respQ);
        setResponses(
          respSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FormResponse, "id">) }))
        );

        // 自分の所属バンド(承認済み、自分がメンバー)
        const bandsSnap = await getDocs(collection(db, "bands"));
        const bands: Band[] = bandsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Band, "id">) }))
          .filter(
            (b) => b.status === "承認済み" && b.members.some((m) => m.memberId === member.id)
          );
        setMyBands(bands);

        // アンケート型なら、自分の既存回答を読み込む
        if (formData.type === "アンケート") {
          const mine = respSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<FormResponse, "id">) }))
            .find((r) => r.memberId === member.id);
          if (mine) setAnswers({ ...mine.answers });
        }

        // イベント型のときだけ、会費チェックの準備(納入済みIDと氏名マップ)
        if (formData.type === "イベント") {
          const cy = currentFiscalYear();
          const duesSnap = await getDocs(
            query(collection(db, "dues"), where("fiscalYear", "==", cy))
          );
          const paidIds = new Set<string>();
          duesSnap.docs.forEach((d) => {
            const data = d.data() as { memberId: string; paid: boolean };
            if (data.paid) paidIds.add(data.memberId);
          });
          setPaidMemberIds(paidIds);

          const memSnap = await getDocs(collection(db, "members"));
          const names: Record<string, string> = {};
          memSnap.docs.forEach((d) => {
            names[d.id] = (d.data() as { name: string }).name;
          });
          setNameMap(names);
        }
      } catch (e) {
        console.error("フォームの取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, member]);

  const isEvent = form?.type === "イベント";
  const isExpired = form ? new Date(form.deadline) < new Date() : false;

  // 選択中バンドの既存回答(あれば編集モード)
  const existingResponse = responses.find((r) => r.bandId === bandId);

  // 表示条件を満たす質問だけ
  const visibleQuestions = form ? filterVisibleQuestions(form.questions, answers) : [];

  const selectBand = (newBandId: string) => {
    setBandId(newBandId);
    const existing = responses.find((r) => r.bandId === newBandId);
    setAnswers(existing ? { ...existing.answers } : {});
  };

  const setAnswer = (qid: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  const selectableBands = myBands;

  // 選択中バンドの未納メンバーの氏名リスト(イベント型のみ)
  const unpaidMemberNames: string[] = (() => {
    if (!isEvent || !bandId) return [];
    const band = myBands.find((b) => b.id === bandId);
    if (!band) return [];
    return band.members
      .filter((m) => !paidMemberIds.has(m.memberId))
      .map((m) => nameMap[m.memberId] ?? "不明");
  })();

  const submit = async (onDone: () => void) => {
    if (!form || !member) return;
    if (isEvent && !bandId) {
      window.alert("出演バンドを選択してください。");
      return;
    }

    // 必須チェック(表示されている質問のみ)
    const unanswered = visibleQuestions.filter(
      (q) => q.required === true && !(answers[q.id] ?? "").trim()
    );
    if (unanswered.length > 0) {
      window.alert(
        `必須項目に回答してください。\n\n${unanswered.map((q) => `・${q.label}`).join("\n")}`
      );
      return;
    }

    setSubmitting(true);
    try {
      // 非表示になった質問の回答は保存しない
      const visibleIds = new Set(visibleQuestions.map((q) => q.id));
      const cleanedAnswers: Record<string, string> = {};
      Object.entries(answers).forEach(([qid, value]) => {
        if (visibleIds.has(qid)) cleanedAnswers[qid] = value;
      });

      if (isEvent) {
        // イベント型:バンド単位。既存があれば更新、なければ新規
        const existing = responses.find((r) => r.bandId === bandId);
        if (existing) {
          await updateDoc(doc(db, "formResponses", existing.id), {
            answers: cleanedAnswers,
            memberId: member.id, // 最後に編集した人
            submittedAt: new Date().toISOString().slice(0, 10),
          });
        } else {
          await addDoc(collection(db, "formResponses"), {
            formId: form.id,
            memberId: member.id,
            bandId,
            answers: cleanedAnswers,
            submittedAt: new Date().toISOString().slice(0, 10),
          });
        }
      } else {
        // アンケート型:個人単位。自分の既存があれば更新、なければ新規
        const mine = responses.find((r) => r.memberId === member.id);
        if (mine) {
          await updateDoc(doc(db, "formResponses", mine.id), {
            answers: cleanedAnswers,
            submittedAt: new Date().toISOString().slice(0, 10),
          });
        } else {
          await addDoc(collection(db, "formResponses"), {
            formId: form.id,
            memberId: member.id,
            answers: cleanedAnswers,
            submittedAt: new Date().toISOString().slice(0, 10),
          });
        }
      }
      onDone();
    } catch (e) {
      console.error("回答の送信に失敗しました", e);
      window.alert("送信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    form,
    isEvent,
    isExpired,
    unpaidMemberNames,
    selectableBands,
    bandId,
    selectBand,
    answers,
    setAnswer,
    visibleQuestions,
    existingResponse,
    responses,
    loading,
    submitting,
    submit,
  } as const;
}
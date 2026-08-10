import { useState, useEffect } from "react";
import { collection, getDocs, query, where, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import type { FormType, FormQuestion, FormDef, FormResponse } from "../../Types/types";

export interface FormListItem {
  id: string;
  title: string;
  type: FormType;
  deadline: string;
  questions: FormQuestion[];
  answered: boolean;
}

export function useForms() {
  const { member } = useAuth();
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForms = async () => {
      if (!member) {
        setLoading(false);
        return;
      }
      try {
        // 全フォーム
        const formsSnap = await getDocs(collection(db, "forms"));
        const formList: FormDef[] = formsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FormDef, "id">),
        }));

        // 自分の回答(回答済み判定用)
        const respQ = query(
          collection(db, "formResponses"),
          where("memberId", "==", member.id)
        );
        const respSnap = await getDocs(respQ);
        const myResponses: FormResponse[] = respSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FormResponse, "id">),
        }));
        const answeredFormIds = new Set(myResponses.map((r) => r.formId));

        setForms(
          formList.map((f) => ({
            id: f.id,
            title: f.title,
            type: f.type,
            deadline: f.deadline,
            questions: f.questions,
            answered: answeredFormIds.has(f.id),
          }))
        );
      } catch (e) {
        console.error("フォーム一覧の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchForms();
  }, [member]);

  const now = new Date();
  const isExpired = (deadline: string) => new Date(deadline) < now;

  const pending = forms.filter((f) => !f.answered && !isExpired(f.deadline));
  const answered = forms.filter((f) => f.answered);
  const expired = forms.filter((f) => !f.answered && isExpired(f.deadline));

  const deleteForm = async (formId: string, title: string) => {
    const ok = window.confirm(`フォーム「${title}」を削除します。回答も全て削除され、元に戻せません。よろしいですか?`);
    if (!ok) return;
    try {
      // このフォームへの回答をすべて削除
      const respSnap = await getDocs(
        query(collection(db, "formResponses"), where("formId", "==", formId))
      );
      await Promise.all(respSnap.docs.map((d) => deleteDoc(doc(db, "formResponses", d.id))));
      // フォーム本体を削除
      await deleteDoc(doc(db, "forms", formId));
      // 画面から除去
      setForms((prev) => prev.filter((f) => f.id !== formId));
    } catch (e) {
      console.error("フォームの削除に失敗しました", e);
      window.alert("削除に失敗しました。");
    }
  };

  return { pending, answered, expired, loading, isExpired, deleteForm } as const;
}
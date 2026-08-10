import { useState, useEffect } from "react";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { FormDef, FormResponse } from "../../Types/types";

export interface ResultRow extends FormResponse {
  respondentName: string; // アンケート型=氏名、イベント型=バンド名
}

export function useFormResults(id: string | undefined) {
  const [form, setForm] = useState<FormDef | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        // フォーム定義
        const formSnap = await getDoc(doc(db, "forms", id));
        if (!formSnap.exists()) {
          setForm(null);
          setLoading(false);
          return;
        }
        const formData = { id: formSnap.id, ...(formSnap.data() as Omit<FormDef, "id">) };
        setForm(formData);

        // このフォームの全回答
        const respQ = query(collection(db, "formResponses"), where("formId", "==", id));
        const respSnap = await getDocs(respQ);
        const responses: FormResponse[] = respSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FormResponse, "id">),
        }));

        // 表示名の解決:イベント型はバンド名、アンケート型は氏名
        let nameResolver: (r: FormResponse) => string;
        if (formData.type === "イベント") {
          const bandsSnap = await getDocs(collection(db, "bands"));
          const bandMap: Record<string, string> = {};
          bandsSnap.docs.forEach((d) => {
            bandMap[d.id] = (d.data() as { name: string }).name;
          });
          nameResolver = (r) => (r.bandId ? bandMap[r.bandId] ?? "不明" : "不明");
        } else {
          const memSnap = await getDocs(collection(db, "members"));
          const memMap: Record<string, string> = {};
          memSnap.docs.forEach((d) => {
            memMap[d.id] = (d.data() as { name: string }).name;
          });
          nameResolver = (r) => memMap[r.memberId] ?? "不明";
        }

        setRows(
          responses.map((r) => ({
            ...r,
            respondentName: nameResolver(r),
          }))
        );
      } catch (e) {
        console.error("集計の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const isEvent = form?.type === "イベント";

  const summarize = (questionId: string, options: string[]) => {
    const counts: Record<string, number> = {};
    options.forEach((opt) => (counts[opt] = 0));
    rows.forEach((r) => {
      const val = r.answers[questionId];
      if (val && counts[val] !== undefined) counts[val] += 1;
    });
    return counts;
  };

  return { form, rows, isEvent, loading, summarize } as const;
}
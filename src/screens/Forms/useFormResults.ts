import { useState, useEffect } from "react";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { calcGrade } from "../../lib/grade";
import { formatParts } from "../../lib/parts";
import { filterVisibleQuestions } from "./useFormAnswer";
import type { FormDef, FormResponse, Member, Band } from "../../Types/types";

// バンドのメンバー(氏名 + パート)
export interface BandMemberInfo {
  name: string;
  part: string;
}

export interface ResultRow extends FormResponse {
  respondentName: string;   // アンケート型=氏名、イベント型=バンド名

  // 回答を送信した本人の情報
  submitterName: string;
  nickname: string;
  studentId: string;
  faculty: string;
  gradeLabel: string;
  parts: string;            // 表示用に整形済み(例: "Vo・Gt")

  // アンケート型:本人の所属バンド名
  bandNames: string[];

  // イベント型:そのバンドのメンバー構成
  bandMembers: BandMemberInfo[];

  // この回答で表示されていた質問のID
  visibleQuestionIds: string[];
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

        // メンバー情報
        const memSnap = await getDocs(collection(db, "members"));
        const memMap: Record<string, Member> = {};
        memSnap.docs.forEach((d) => {
          memMap[d.id] = { id: d.id, ...(d.data() as Omit<Member, "id">) };
        });

        // バンド情報
        const bandsSnap = await getDocs(collection(db, "bands"));
        const bands: Band[] = bandsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Band, "id">),
        }));
        const bandMap: Record<string, Band> = {};
        bands.forEach((b) => (bandMap[b.id] = b));

        const isEventForm = formData.type === "イベント";

        setRows(
          responses.map((r) => {
            const m = memMap[r.memberId];
            const submitterName = m?.name ?? "不明";

            // 表示名:イベント型はバンド名、アンケート型は氏名
            const respondentName = isEventForm
              ? (r.bandId ? bandMap[r.bandId]?.name ?? "不明" : "不明")
              : submitterName;

            // アンケート型:本人が所属する解散以外のバンド
            const bandNames = bands
              .filter(
                (b) =>
                  b.status !== "解散" &&
                  b.members.some((bm) => bm.memberId === r.memberId)
              )
              .map((b) => b.name);

            // イベント型:そのバンドのメンバー構成
            const bandMembers: BandMemberInfo[] =
              isEventForm && r.bandId && bandMap[r.bandId]
                ? bandMap[r.bandId].members.map((bm) => ({
                    name: memMap[bm.memberId]?.name ?? "不明",
                    part: bm.part,
                  }))
                : [];

            // この回答内容で表示されていた質問を再現する
            const visibleQuestionIds = filterVisibleQuestions(
              formData.questions,
              r.answers
            ).map((q) => q.id);

            return {
              ...r,
              respondentName,
              submitterName,
              nickname: m?.nickname ?? "",
              studentId: m?.studentId ?? "—",
              faculty: m?.faculty ?? "—",
              gradeLabel: m ? calcGrade(m.enrollmentYear, m.isOB) : "—",
              parts: formatParts(m?.parts),
              bandNames,
              bandMembers,
              visibleQuestionIds,
            };
          })
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

  /**
   * 選択式の集計。
   * 条件付き質問は「その質問が表示された回答」だけを母数にする。
   */
  const summarize = (questionId: string, options: string[]) => {
    const counts: Record<string, number> = {};
    options.forEach((opt) => (counts[opt] = 0));

    const target = rows.filter((r) => r.visibleQuestionIds.includes(questionId));

    target.forEach((r) => {
      const val = r.answers[questionId];
      if (val && counts[val] !== undefined) counts[val] += 1;
    });

    return counts;
  };

  /** その質問が表示された回答数(割合計算の母数) */
  const countVisible = (questionId: string): number =>
    rows.filter((r) => r.visibleQuestionIds.includes(questionId)).length;

  /** その質問が条件付きかどうか */
  const isConditional = (questionId: string): boolean =>
    form?.questions.find((q) => q.id === questionId)?.showIf !== undefined;

  return { form, rows, isEvent, loading, summarize, countVisible, isConditional } as const;
}
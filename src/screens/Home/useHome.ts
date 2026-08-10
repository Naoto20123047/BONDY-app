import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import type { FormDef, FormResponse, Band } from "../../Types/types";

interface FormSummary {
  id: string;
  title: string;
  deadline: string;
}

// 現在の年度(4月始まり)
const currentFiscalYear = () => {
  const now = new Date();
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
};

export function useHome() {
  const { member } = useAuth();
  const [pendingForms, setPendingForms] = useState<FormSummary[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [bandCount, setBandCount] = useState(0);
  const [duesPaid, setDuesPaid] = useState(false); // 今年度の会費納入状況
  const [loading, setLoading] = useState(true);

  const isOfficer = member?.role === "幹部" || member?.role === "管理者";

  useEffect(() => {
    const fetchData = async () => {
      if (!member) {
        setLoading(false);
        return;
      }
      try {
        const now = new Date();

        // 今年度の自分の会費状況(dues コレクションを正とする)
        const cy = currentFiscalYear();
        const duesSnap = await getDocs(
          query(
            collection(db, "dues"),
            where("memberId", "==", member.id),
            where("fiscalYear", "==", cy)
          )
        );
        const paid = duesSnap.docs.some((d) => (d.data() as { paid: boolean }).paid === true);
        setDuesPaid(paid);

        // 未回答のフォーム(期限内、かつ自分が未回答)
        const formsSnap = await getDocs(collection(db, "forms"));
        const forms: FormDef[] = formsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FormDef, "id">),
        }));

        const respSnap = await getDocs(
          query(collection(db, "formResponses"), where("memberId", "==", member.id))
        );
        const answeredFormIds = new Set(
          respSnap.docs.map((d) => (d.data() as FormResponse).formId)
        );

        const pending = forms
          .filter((f) => new Date(f.deadline) >= now && !answeredFormIds.has(f.id))
          .map((f) => ({ id: f.id, title: f.title, deadline: f.deadline }));
        setPendingForms(pending);

        // 所属バンド数(解散以外で自分がメンバー)
        const bandsSnap = await getDocs(collection(db, "bands"));
        const myBands = bandsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Band, "id">) }))
          .filter(
            (b) => b.status !== "解散" && b.members.some((m) => m.memberId === member.id)
          );
        setBandCount(myBands.length);

        // 承認待ち件数(幹部のみ:ロール申請pending + バンド申請中/解散申請中)
        if (isOfficer) {
          const roleSnap = await getDocs(
            query(collection(db, "roleChangeRequests"), where("status", "==", "pending"))
          );
          const bandPending = bandsSnap.docs.filter((d) => {
            const s = (d.data() as { status: string }).status;
            return s === "申請中" || s === "解散申請中";
          }).length;
          setPendingApprovals(roleSnap.size + bandPending);
        }
      } catch (e) {
        console.error("ホーム情報の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [member, isOfficer]);

  return {
    member,
    pendingForms,
    pendingApprovals,
    bandCount,
    duesPaid,
    isOfficer,
    loading,
  } as const;
}
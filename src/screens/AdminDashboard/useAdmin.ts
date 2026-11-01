import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { fetchActiveMembers, fetchPendingMembers } from "../../lib/members";
import { memberCategory } from "../../lib/memberCategory";
import { currentFiscalYear } from "../../lib/grade";
import { runV132Migrations } from "../../lib/migrations";

interface AdminSummary {
  activeMembers: number;
  pendingRoleApprovals: number;
  pendingBandApprovals: number;
  /** 幹部の確認待ちの新規登録(教員・OB。v1.4.0) */
  pendingMemberApprovals: number;
  unpaidDues: number;
}

export function useAdmin() {
  const [summary, setSummary] = useState<AdminSummary>({
    activeMembers: 0,
    pendingRoleApprovals: 0,
    pendingBandApprovals: 0,
    pendingMemberApprovals: 0,
    unpaidDues: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      // 既存データの移行(v1.3.2)。移行済みなら読むだけで何も書かない
      await runV132Migrations();
      try {
        // 在籍中メンバー
        const members = await fetchActiveMembers();
        const activeMembers = members.length;

        // 保留中のロール変更申請数
        const roleSnap = await getDocs(
          query(collection(db, "roleChangeRequests"), where("status", "==", "pending"))
        );
        const pendingRoleApprovals = roleSnap.size;

        // バンドの承認待ち(申請中 + 解散申請中)
        const bandSnap = await getDocs(collection(db, "bands"));
        const pendingBandApprovals = bandSnap.docs.filter((d) => {
          const s = (d.data() as { status: string }).status;
          return s === "申請中" || s === "解散申請中";
        }).length;

        // 今年度の未納者数
        // 会費は「レコードが無い = 未納」として扱う設計のため、
        // 納入済みの memberId を集めて、現役メンバーから引く
        const cy = currentFiscalYear();
        const duesSnap = await getDocs(
          query(collection(db, "dues"), where("fiscalYear", "==", cy))
        );
        const paidMemberIds = new Set<string>();
        duesSnap.docs.forEach((d) => {
          const data = d.data() as { memberId: string; paid: boolean };
          if (data.paid) paidMemberIds.add(data.memberId);
        });

        // 会費の対象は在学生だけ(OB・教員は対象外)
        const unpaidDues = members.filter(
          (m) => memberCategory(m) === "在学生" && !paidMemberIds.has(m.id)
        ).length;

        const pendingMemberApprovals = (await fetchPendingMembers()).length;

        setSummary({
          activeMembers,
          pendingRoleApprovals,
          pendingBandApprovals,
          pendingMemberApprovals,
          unpaidDues,
        });
      } catch (e) {
        console.error("サマリーの取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  return { summary, loading } as const;
}
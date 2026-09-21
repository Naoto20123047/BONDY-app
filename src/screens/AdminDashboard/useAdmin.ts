import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { currentFiscalYear } from "../../lib/grade";
import type { Member } from "../../Types/types";

interface AdminSummary {
  activeMembers: number;
  pendingRoleApprovals: number;
  pendingBandApprovals: number;
  unpaidDues: number;
}

export function useAdmin() {
  const [summary, setSummary] = useState<AdminSummary>({
    activeMembers: 0,
    pendingRoleApprovals: 0,
    pendingBandApprovals: 0,
    unpaidDues: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        // 在籍中メンバー
        const memSnap = await getDocs(
          query(collection(db, "members"), where("status", "==", "active"))
        );
        const members: Member[] = memSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Member, "id">),
        }));
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

        // OBは会費の対象外なので除外する
        const unpaidDues = members.filter(
          (m) => !m.isOB && !paidMemberIds.has(m.id)
        ).length;

        setSummary({
          activeMembers,
          pendingRoleApprovals,
          pendingBandApprovals,
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
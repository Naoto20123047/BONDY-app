import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

interface AdminSummary {
  activeMembers: number;
  pendingRoleApprovals: number;
  pendingBandApprovals: number;
  unpaidDues: number;
}

// 現在の年度(4月始まり)
const currentFiscalYear = () => {
  const now = new Date();
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
};

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
        // 在籍中メンバー数
        const memSnap = await getDocs(
          query(collection(db, "members"), where("status", "==", "active"))
        );
        const activeMembers = memSnap.size;

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
        const cy = currentFiscalYear();
        const duesSnap = await getDocs(
          query(collection(db, "dues"), where("fiscalYear", "==", cy))
        );
        const unpaidDues = duesSnap.docs.filter(
          (d) => (d.data() as { paid: boolean }).paid === false
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
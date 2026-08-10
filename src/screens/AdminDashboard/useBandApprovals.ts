import { useState, useEffect } from "react";
import { collection, getDocs, query, where, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Band } from "../../Types/types";
import { createNotifications } from "../../lib/notify";

export function useBandApprovals() {
  const [pendingFormation, setPendingFormation] = useState<Band[]>([]);
  const [pendingDissolution, setPendingDissolution] = useState<Band[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      // 結成申請(申請中)
      const formationQ = query(collection(db, "bands"), where("status", "==", "申請中"));
      const formationSnap = await getDocs(formationQ);
      setPendingFormation(
        formationSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Band, "id">) }))
      );

      // 解散申請(解散申請中)
      const dissolutionQ = query(collection(db, "bands"), where("status", "==", "解散申請中"));
      const dissolutionSnap = await getDocs(dissolutionQ);
      setPendingDissolution(
        dissolutionSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Band, "id">) }))
      );
    } catch (e) {
      console.error("バンド承認一覧の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const approveFormation = async (id: string) => {
    const band = pendingFormation.find((b) => b.id === id);
    try {
      await updateDoc(doc(db, "bands", id), { status: "承認済み" });
      // バンドメンバー全員に通知
      if (band) {
        await createNotifications(
          band.members.map((m) => m.memberId),
          "approval_result",
          `バンド「${band.name}」の結成が承認されました`,
          `/bands/${id}`
        );
      }
      setPendingFormation((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error("結成承認に失敗しました", e);
    }
  };

  const rejectFormation = async (id: string) => {
    const ok = window.confirm("この結成申請を却下します。よろしいですか?");
    if (!ok) return;
    try {
      // 却下は申請そのものを削除(まだ承認されていないバンドなので)
      await deleteDoc(doc(db, "bands", id));
      setPendingFormation((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error("結成却下に失敗しました", e);
    }
  };

  const approveDissolution = async (id: string) => {
    try {
      await updateDoc(doc(db, "bands", id), { status: "解散" });
      setPendingDissolution((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error("解散承認に失敗しました", e);
    }
  };

  const rejectDissolution = async (id: string) => {
    const ok = window.confirm("この解散申請を却下します(バンドは存続します)。よろしいですか?");
    if (!ok) return;
    try {
      // 却下したら承認済みに戻す(バンドは存続)
      await updateDoc(doc(db, "bands", id), { status: "承認済み" });
      setPendingDissolution((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error("解散却下に失敗しました", e);
    }
  };

  return {
    pendingFormation,
    pendingDissolution,
    loading,
    approveFormation,
    rejectFormation,
    approveDissolution,
    rejectDissolution,
  } as const;
}
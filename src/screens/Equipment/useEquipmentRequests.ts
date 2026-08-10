import { useState, useEffect } from "react";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { createNotification } from "../../lib/notify";
import type { EquipmentRequest } from "../../Types/types";

export interface RequestView extends EquipmentRequest {
  memberName: string;
  equipmentName: string;
  overdue: boolean;
}

export function useEquipmentRequests() {
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const reqSnap = await getDocs(collection(db, "equipmentRequests"));
      const raw: EquipmentRequest[] = reqSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<EquipmentRequest, "id">),
      }));

      // 氏名・機材名の解決
      const memSnap = await getDocs(collection(db, "members"));
      const nameMap: Record<string, string> = {};
      memSnap.docs.forEach((d) => {
        nameMap[d.id] = (d.data() as { name: string }).name;
      });
      const eqSnap = await getDocs(collection(db, "equipment"));
      const eqMap: Record<string, string> = {};
      eqSnap.docs.forEach((d) => {
        eqMap[d.id] = (d.data() as { name: string }).name;
      });

      const now = new Date();
      setRequests(
        raw.map((r) => ({
          ...r,
          memberName: nameMap[r.memberId] ?? "不明",
          equipmentName: eqMap[r.equipmentId] ?? "不明",
          overdue:
            (r.status === "貸出中" || r.status === "返却報告済み") &&
            new Date(r.dueDate) < now,
        }))
      );
    } catch (e) {
      console.error("貸出申請一覧の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const approve = async (id: string) => {
    const target = requests.find((r) => r.id === id);
    try {
      await updateDoc(doc(db, "equipmentRequests", id), {
        status: "貸出中",
        approvedAt: new Date().toISOString().slice(0, 10),
      });
      // 申請者に承認通知
      if (target) {
        await createNotification(
          target.memberId,
          "equipment_result",
          `「${target.equipmentName}」の貸出が承認されました`,
          "/mypage"
        );
      }
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "貸出中" } : r))
      );
    } catch (e) {
      console.error("承認に失敗しました", e);
    }
  };

  const reject = async (id: string) => {
    const target = requests.find((r) => r.id === id);
    const ok = window.confirm("この申請を却下します。よろしいですか?");
    if (!ok) return;
    try {
      await updateDoc(doc(db, "equipmentRequests", id), { status: "却下" });
      // 申請者に却下通知
      if (target) {
        await createNotification(
          target.memberId,
          "equipment_result",
          `「${target.equipmentName}」の貸出申請が却下されました`,
          "/equipment"
        );
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error("却下に失敗しました", e);
    }
  };

  const confirmReturn = async (id: string) => {
    const target = requests.find((r) => r.id === id);
    try {
      await updateDoc(doc(db, "equipmentRequests", id), {
        status: "返却完了",
        returnedAt: new Date().toISOString().slice(0, 10),
      });
      // 借りていた本人に返却完了通知
      if (target) {
        await createNotification(
          target.memberId,
          "equipment_result",
          `「${target.equipmentName}」の返却が確認されました`,
          "/mypage"
        );
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error("返却確認に失敗しました", e);
    }
  };

  const pending = requests.filter((r) => r.status === "申請中");
  const lent = requests.filter((r) => r.status === "貸出中");
  const reported = requests.filter((r) => r.status === "返却報告済み");

  return { pending, lent, reported, loading, approve, reject, confirmReturn } as const;
}
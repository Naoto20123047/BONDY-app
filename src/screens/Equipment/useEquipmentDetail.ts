import { useState, useEffect } from "react";
import { doc, getDoc, collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { createNotifications } from "../../lib/notify";
import { getEquipmentManagerIds } from "../../lib/equipmentManager";
import type { Equipment, EquipmentRequest } from "../../Types/types";

export interface BorrowerView {
  memberName: string;
  quantity: number;
  dueDate: string;
  overdue: boolean;
}

export function useEquipmentDetail(id: string | undefined) {
  const { member: currentMember } = useAuth();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [borrowers, setBorrowers] = useState<BorrowerView[]>([]);
  const [lentCount, setLentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [quantity, setQuantity] = useState(1);
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const ref = doc(db, "equipment", id);
        const snapshot = await getDoc(ref);
        if (!snapshot.exists()) {
          setEquipment(null);
          setLoading(false);
          return;
        }
        setEquipment({ id: snapshot.id, ...(snapshot.data() as Omit<Equipment, "id">) });

        // この機材の貸出中リクエスト
        const reqQ = query(
          collection(db, "equipmentRequests"),
          where("equipmentId", "==", id),
          where("status", "in", ["貸出中", "返却報告済み"])
        );
        const reqSnap = await getDocs(reqQ);
        const requests: EquipmentRequest[] = reqSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EquipmentRequest, "id">),
        }));

        const memSnap = await getDocs(collection(db, "members"));
        const nameMap: Record<string, string> = {};
        memSnap.docs.forEach((d) => {
          nameMap[d.id] = (d.data() as { name: string }).name;
        });

        const now = new Date();
        setLentCount(requests.reduce((sum, r) => sum + r.quantity, 0));
        setBorrowers(
          requests.map((r) => ({
            memberName: nameMap[r.memberId] ?? "不明",
            quantity: r.quantity,
            dueDate: r.dueDate,
            overdue: new Date(r.dueDate) < now,
          }))
        );
      } catch (e) {
        console.error("機材詳細の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const available = equipment ? equipment.totalQuantity - lentCount : 0;

  const submit = async (onDone: () => void) => {
    if (!equipment) return;
    if (!currentMember) {
      window.alert("ログイン情報が確認できません。");
      return;
    }
    if (quantity < 1 || quantity > available) {
      window.alert(`貸出可能な台数は ${available} 台です。`);
      return;
    }
    if (!dueDate) {
      window.alert("返却予定日を指定してください。");
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "equipmentRequests"), {
        equipmentId: equipment.id,
        quantity,
        memberId: currentMember.id,
        dueDate,
        status: "申請中",
        requestedAt: new Date().toISOString().slice(0, 10),
      });

      // 機材担当に貸出申請の通知
      const managerIds = await getEquipmentManagerIds();
      await createNotifications(
        managerIds.filter((mid) => mid !== currentMember.id),
        "equipment_request",
        `${currentMember.name}さんから「${equipment.name}」の貸出申請があります`,
        "/equipment/requests"
      );

      onDone();
    } catch (e) {
      console.error("貸出申請に失敗しました", e);
      window.alert("申請に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    equipment,
    borrowers,
    available,
    loading,
    quantity,
    setQuantity,
    dueDate,
    setDueDate,
    submitting,
    submit,
  } as const;
}
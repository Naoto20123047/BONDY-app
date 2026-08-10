import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { getEquipmentManagerIds } from "../../lib/equipmentManager";
import type { Equipment, EquipmentRequest } from "../../Types/types";

export interface EquipmentView extends Equipment {
  lentCount: number;
  available: number;
  borrowers: { memberName: string; quantity: number; dueDate: string; overdue: boolean }[];
}

export function useEquipment() {
  const { member } = useAuth();
  const [items, setItems] = useState<EquipmentView[]>([]);
  const [iAmManager, setIAmManager] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 機材台帳
        const eqSnap = await getDocs(collection(db, "equipment"));
        const equipment: Equipment[] = eqSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Equipment, "id">),
        }));

        // 貸出中・返却報告済みのリクエスト
        const reqQ = query(
          collection(db, "equipmentRequests"),
          where("status", "in", ["貸出中", "返却報告済み"])
        );
        const reqSnap = await getDocs(reqQ);
        const requests: EquipmentRequest[] = reqSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EquipmentRequest, "id">),
        }));

        // メンバー氏名の解決用
        const memSnap = await getDocs(collection(db, "members"));
        const nameMap: Record<string, string> = {};
        memSnap.docs.forEach((d) => {
          nameMap[d.id] = (d.data() as { name: string }).name;
        });

        const now = new Date();
        const views: EquipmentView[] = equipment.map((eq) => {
          const active = requests.filter((r) => r.equipmentId === eq.id);
          const lentCount = active.reduce((sum, r) => sum + r.quantity, 0);
          return {
            ...eq,
            lentCount,
            available: eq.totalQuantity - lentCount,
            borrowers: active.map((r) => ({
              memberName: nameMap[r.memberId] ?? "不明",
              quantity: r.quantity,
              dueDate: r.dueDate,
              overdue: new Date(r.dueDate) < now,
            })),
          };
        });

        setItems(views);

        // 自分が機材担当(不在時はサークル長が代行)か判定
        const managerIds = await getEquipmentManagerIds();
        setIAmManager(member ? managerIds.includes(member.id) : false);
      } catch (e) {
        console.error("機材一覧の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [member]);

  return { items, loading, iAmManager } as const;
}
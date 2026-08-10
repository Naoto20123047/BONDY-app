import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Equipment, EquipmentCategory } from "../../Types/types";

export const categories: EquipmentCategory[] = [
  "スピーカー",
  "アンプ",
  "ミキサー",
  "マイク",
  "ケーブル",
  "その他",
];

export function useEquipmentManage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const snapshot = await getDocs(collection(db, "equipment"));
      setItems(
        snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Equipment, "id">) }))
      );
    } catch (e) {
      console.error("機材台帳の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const addEquipment = async (data: Omit<Equipment, "id">) => {
    try {
      // undefinedのフィールドを除外する(Firestoreはundefinedを保存できない)
      const cleaned = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined)
      );
      await addDoc(collection(db, "equipment"), cleaned);
      await fetchItems();
    } catch (e) {
      console.error("機材の追加に失敗しました", e);
      window.alert("追加に失敗しました。");
    }
  };

  const updateEquipment = async (id: string, data: Omit<Equipment, "id">) => {
    try {
      const cleaned = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined)
      );
      await updateDoc(doc(db, "equipment", id), cleaned);
      await fetchItems();
    } catch (e) {
      console.error("機材の更新に失敗しました", e);
      window.alert("更新に失敗しました。");
    }
  };

  const toggleLendable = async (id: string) => {
    const target = items.find((e) => e.id === id);
    if (!target) return;
    try {
      await updateDoc(doc(db, "equipment", id), { lendable: !target.lendable });
      setItems((prev) =>
        prev.map((e) => (e.id === id ? { ...e, lendable: !e.lendable } : e))
      );
    } catch (e) {
      console.error("貸出可否の変更に失敗しました", e);
    }
  };

  const deleteEquipment = async (id: string) => {
    const target = items.find((e) => e.id === id);
    const ok = window.confirm(`「${target?.name}」を台帳から削除します。よろしいですか?`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "equipment", id));
      setItems((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      console.error("機材の削除に失敗しました", e);
    }
  };

  return { items, loading, addEquipment, updateEquipment, toggleLendable, deleteEquipment } as const;
}
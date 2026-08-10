import { useState, useEffect } from "react";
import { collection, getDocs, query, where, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Member } from "../../Types/types";
import { calcGrade } from "../../lib/grade";

export interface WithdrawnMemberView {
  id: string;
  name: string;
  faculty: string;
  gradeLabel: string;
  studentId: string;
  withdrawnAt: string;
}

export function useUserHistory() {
  const [members, setMembers] = useState<WithdrawnMemberView[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const q = query(collection(db, "members"), where("status", "==", "withdrawn"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => {
        const m = { id: d.id, ...(d.data() as Omit<Member, "id">) };
        return {
          id: m.id,
          name: m.name,
          faculty: m.faculty,
          gradeLabel: calcGrade(m.enrollmentYear, m.isOB),
          studentId: m.studentId,
          withdrawnAt: m.withdrawnAt ?? "",
        };
      });
      setMembers(list);
    } catch (e) {
      console.error("ユーザー履歴の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const deletePermanently = async (id: string) => {
    const target = members.find((m) => m.id === id);
    const ok = window.confirm(
      `${target?.name}さんのデータを完全に削除します。\nこの操作は取り消せません。\n本当によろしいですか?`
    );
    if (!ok) return;
    try {
      // TODO: 本来は関連データ(会費・バンド在籍・機材履歴など)も削除する
      await deleteDoc(doc(db, "members", id));
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error("完全削除に失敗しました", e);
      window.alert("削除に失敗しました。");
    }
  };

  return { members, loading, deletePermanently } as const;
}
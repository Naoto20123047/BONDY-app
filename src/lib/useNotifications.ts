import { useState, useEffect } from "react";
import { collection, getDocs, query, where, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthContext";
import type { AppNotification } from "../Types/types";

// 保持する既読通知の最大件数(これを超えた古い既読は削除)
const MAX_READ_KEEP = 5;

export function useNotifications() {
  const { member } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!member) {
        setLoading(false);
        return;
      }
      try {
        const q = query(
          collection(db, "notifications"),
          where("targetMemberId", "==", member.id)
        );
        const snap = await getDocs(q);
        const list: AppNotification[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AppNotification, "id">),
        }));
        // 新しい順に並べる
        list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setNotifications(list);
      } catch (e) {
        console.error("通知の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [member]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // 既読が上限を超えたら、古いものから削除して5件に保つ
  const pruneReadNotifications = async (current: AppNotification[]) => {
    // 既読のみを新しい順に取り出す
    const read = current
      .filter((n) => n.read)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (read.length <= MAX_READ_KEEP) return current;

    // 6件目以降(古い既読)を削除対象に
    const toDelete = read.slice(MAX_READ_KEEP);
    try {
      await Promise.all(
        toDelete.map((n) => deleteDoc(doc(db, "notifications", n.id)))
      );
    } catch (e) {
      console.error("古い通知の削除に失敗しました", e);
      return current; // 削除に失敗したら現状維持
    }
    // 削除したものを除外して返す
    const deletedIds = new Set(toDelete.map((n) => n.id));
    return current.filter((n) => !deletedIds.has(n.id));
  };

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
      // 状態を更新し、そのうえで古い既読を掃除
      const updated = notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      const pruned = await pruneReadNotifications(updated);
      setNotifications(pruned);
    } catch (e) {
      console.error("既読処理に失敗しました", e);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.read);
      await Promise.all(
        unread.map((n) => updateDoc(doc(db, "notifications", n.id), { read: true }))
      );
      const updated = notifications.map((n) => ({ ...n, read: true }));
      const pruned = await pruneReadNotifications(updated);
      setNotifications(pruned);
    } catch (e) {
      console.error("一括既読処理に失敗しました", e);
    }
  };

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead } as const;
}
import { useState, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { getEvent, listItems } from "../../lib/archive";
import type { ArchiveEvent, ArchiveItem, Band } from "../../Types/types";

/**
 * イベント1件の詳細(部員のみ)
 *
 * 映像・音源の一覧と、紐づいたバンド名を解決する。
 * 幹部には非表示にしたものも見せる(戻せなくなるのを避けるため)。
 */
export function useArchiveEvent(eventId: string | undefined) {
  const { member } = useAuth();
  const isOfficer = member?.role === "幹部" || member?.role === "管理者";

  const [event, setEvent] = useState<ArchiveEvent | null>(null);
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [bandNames, setBandNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    try {
      const [found, list, bandsSnap] = await Promise.all([
        getEvent(eventId),
        listItems(eventId, isOfficer),
        getDocs(collection(db, "bands")),
      ]);

      setEvent(found);
      setItems(list);

      const names: Record<string, string> = {};
      bandsSnap.docs.forEach((d) => {
        names[d.id] = (d.data() as Omit<Band, "id">).name;
      });
      setBandNames(names);
    } catch (e) {
      console.error("イベントの取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  }, [eventId, isOfficer]);

  useEffect(() => {
    void load();
  }, [load]);

  return { event, items, bandNames, isOfficer, loading, reload: load } as const;
}

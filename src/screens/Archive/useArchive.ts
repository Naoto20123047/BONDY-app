import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../lib/AuthContext";
import { hasOfficerRole } from "../../lib/roles";
import { listEvents, summarizeItemsByEvent, groupByFiscalYear } from "../../lib/archive";
import type { ArchiveYear, EventSummary } from "../../lib/archive";

/**
 * アーカイブの一覧(年度ごとのイベント)
 *
 * 幹部には非表示にしたイベントも見せる。隠したものが二度と辿れなくなると、
 * 戻したいときに困るため。一般メンバーには出さない。
 */
export function useArchive() {
  const { member } = useAuth();
  const isOfficer = hasOfficerRole(member);

  const [years, setYears] = useState<ArchiveYear[]>([]);
  const [summary, setSummary] = useState<Record<string, EventSummary>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [events, itemSummary] = await Promise.all([
        listEvents(isOfficer),
        summarizeItemsByEvent(),
      ]);
      setYears(groupByFiscalYear(events));
      setSummary(itemSummary);
    } catch (e) {
      console.error("アーカイブの取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  }, [isOfficer]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalEvents = years.reduce((sum, y) => sum + y.events.length, 0);

  return { years, summary, totalEvents, isOfficer, loading, reload: load } as const;
}

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { hasOfficerRole } from "../../lib/roles";
import { createNotifications } from "../../lib/notify";
import {
  fetchLive,
  fetchApprovedBands,
  fetchEntries,
  saveLineup,
  slotTimes,
  endTime,
  toMinutes,
  fromMinutes,
  formatDateShort,
  memberIdsOfBands,
} from "../../lib/live";
import type { Band, Live, LiveEntry, LiveSlot } from "../../Types/types";
import "./live.css";

/**
 * 出演バンドと順番(幹部)。
 * 出演を希望したバンドを並べ、順番と持ち時間を決めると開始時刻が自動で決まる。
 * 「保存して出演バンドに通知する」で出演バンドが提出できるようになる。
 */
export default function LiveLineupScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { member } = useAuth();

  const [live, setLive] = useState<Live | null>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [lineup, setLineup] = useState<LiveSlot[]>([]);
  const [adding, setAdding] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const [l, approved, ents] = await Promise.all([fetchLive(id), fetchApprovedBands(), fetchEntries(id)]);
        setLive(l);
        setBands(approved);
        setEntries(ents);
        if (l) {
          // 保存済みの順番があればそれを、無ければ出演を希望したバンドを申し込み順に並べる
          setLineup(
            l.lineup.length > 0
              ? l.lineup
              : ents
                  .filter((e) => e.participate)
                  .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))
                  .map((e) => ({ bandId: e.bandId, bandName: e.bandName, minutes: e.desiredMinutes || 20 }))
          );
        }
      } catch (e) {
        console.error("出演バンドの取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (!hasOfficerRole(member)) return <div className="live-content">この画面は幹部のみ利用できます。</div>;
  if (loading) return <div className="live-content">読み込み中...</div>;
  if (!live) return <div className="live-content">ライブが見つかりません。</div>;

  const times = slotTimes(live, lineup);
  const finish = endTime(live, lineup);
  const teardown = toMinutes(live.closeTime) - finish;

  const move = (index: number, delta: number) => {
    setLineup((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  };

  const changeMinutes = (index: number, delta: number) => {
    setLineup((prev) =>
      prev.map((s, i) => (i === index ? { ...s, minutes: Math.max(5, Math.min(90, s.minutes + delta)) } : s))
    );
  };

  const remove = (index: number) => setLineup((prev) => prev.filter((_, i) => i !== index));

  const addable = bands.filter((b) => !lineup.some((s) => s.bandId === b.id));

  const addBand = () => {
    const band = bands.find((b) => b.id === adding);
    if (!band) return;
    setLineup((prev) => [...prev, { bandId: band.id, bandName: band.name, minutes: 20 }]);
    setAdding("");
  };

  const handleSave = async (publish: boolean) => {
    if (lineup.length === 0) {
      window.alert("出演バンドを1つ以上並べてください。");
      return;
    }
    if (publish) {
      const ok = window.confirm(
        `この順番で保存し、出演する${lineup.length}バンドのメンバーに通知します。\n\n` +
          "通知のあとは、出演バンドがセットリストと編成・機材を提出できるようになります。よろしいですか?"
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      await saveLineup(live.id, lineup, publish && !live.lineupPublishedAt);
      if (publish) {
        const lineupBands = bands.filter((b) => lineup.some((s) => s.bandId === b.id));
        await createNotifications(
          memberIdsOfBands(lineupBands),
          "live_update",
          `「${live.title}」の出演が決まりました。セットリストと編成・機材を提出してください(締切 ${formatDateShort(live.submitDeadline)})`,
          `/live/${live.id}`
        );
      }
      navigate(`/live/${live.id}`, { replace: true });
    } catch (e) {
      console.error("出演順の保存に失敗しました", e);
      window.alert("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const entryOf = (bandId: string) => entries.find((e) => e.bandId === bandId);
  const unanswered = bands.filter((b) => !entryOf(b.id)).length;

  return (
    <div className="live-content">
      <button className="live-back" onClick={() => navigate(`/live/${live.id}`)}>
        <i className="ti ti-arrow-left" /> {live.title}に戻る
      </button>
      <h2 className="live-title">出演バンドと順番</h2>

      <div className="live-summary">
        <span>出演 <strong>{entries.filter((e) => e.participate).length}</strong></span>
        <span>不参加 <strong>{entries.filter((e) => !e.participate).length}</strong></span>
        <span>未回答 <strong>{unanswered}</strong></span>
        <span>申し込み締切 {formatDateShort(live.applyDeadline)}</span>
      </div>
      <p className="live-note">
        出演を希望したバンドを表示しています。矢印で順番を変えると、開始時刻が自動で決まります。
      </p>

      <div style={{ marginTop: 12 }}>
        {times.map((t, i) => {
          const entry = entryOf(t.bandId);
          const hints = [
            entry ? `希望 ${entry.desiredMinutes}分` : "未申し込み",
            entry?.unavailable,
            entry?.note ? "メモあり" : "",
          ].filter(Boolean);
          return (
            <div key={t.bandId} className="live-row">
              <div className="live-move">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === times.length - 1} aria-label="下へ">▼</button>
              </div>
              <span className="live-row-time">{fromMinutes(t.start)}</span>
              <div className="live-row-main">
                <p className="live-row-title">{t.bandName}</p>
                <p className="live-row-sub">{hints.join(" · ")}</p>
                {entry?.note && <p className="live-row-sub">メモ:{entry.note}</p>}
              </div>
              <div className="live-stepper">
                <button onClick={() => changeMinutes(i, -5)}>−</button>
                <span>{t.minutes}分</span>
                <button onClick={() => changeMinutes(i, 5)}>＋</button>
              </div>
              <button className="live-icon-btn" onClick={() => remove(i)} aria-label="外す">
                <i className="ti ti-x" />
              </button>
            </div>
          );
        })}
      </div>

      {addable.length > 0 && (
        <div className="live-row">
          <select className="live-input" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">未申し込みのバンドを追加</option>
            {addable.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button className="live-btn small outline" onClick={addBand} disabled={!adding}>追加</button>
        </div>
      )}

      <div className="live-summary">
        <span>終演予定 <strong>{fromMinutes(finish)}</strong></span>
        <span>撤収時間 <strong>{teardown}分</strong></span>
        <span className={teardown >= 0 ? "ok" : "ng"}>
          {teardown >= 0
            ? `退館時刻(${live.closeTime})に間に合います`
            : `退館時刻(${live.closeTime})を${-teardown}分過ぎます`}
        </span>
      </div>

      <div className="live-actions">
        <button className="live-btn wide" onClick={() => handleSave(true)} disabled={saving}>
          {saving ? "保存中..." : live.lineupPublishedAt ? "保存して出演バンドに通知する" : "保存して出演バンドに通知する"}
        </button>
        {!live.lineupPublishedAt && (
          <button className="live-btn ghost wide" onClick={() => handleSave(false)} disabled={saving}>
            通知せずに保存する(下書き)
          </button>
        )}
      </div>
    </div>
  );
}

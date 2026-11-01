import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { hasOfficerRole } from "../../lib/roles";
import { createNotifications } from "../../lib/notify";
import {
  fetchLive,
  fetchApprovedBands,
  fetchSetlists,
  fetchStagePlans,
  formatDateShort,
  daysUntil,
  memberIdsOfBands,
} from "../../lib/live";
import type { Band, Live, LiveSetlist, LiveStagePlan } from "../../Types/types";
import "./live.css";

/**
 * 提出状況(幹部)。出演バンドごとに、セットリストと編成・機材の提出を確かめる。
 * 未提出のバンドにはアプリ内通知でお願いを送れる(Teamsには送らない)。
 */
export default function LiveStatusScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { member } = useAuth();

  const [live, setLive] = useState<Live | null>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const [setlists, setSetlists] = useState<LiveSetlist[]>([]);
  const [plans, setPlans] = useState<LiveStagePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchLive(id), fetchApprovedBands(), fetchSetlists(id), fetchStagePlans(id)])
      .then(([l, b, s, p]) => {
        setLive(l);
        setBands(b);
        setSetlists(s);
        setPlans(p);
      })
      .catch((e) => console.error("提出状況の取得に失敗しました", e))
      .finally(() => setLoading(false));
  }, [id]);

  if (!hasOfficerRole(member)) return <div className="live-content">この画面は幹部のみ利用できます。</div>;
  if (loading) return <div className="live-content">読み込み中...</div>;
  if (!live) return <div className="live-content">ライブが見つかりません。</div>;

  const rows = live.lineup.map((slot) => ({
    slot,
    setlist: setlists.some((s) => s.bandId === slot.bandId),
    plan: plans.some((p) => p.bandId === slot.bandId),
  }));
  const pending = rows.filter((r) => !r.setlist || !r.plan);
  const days = daysUntil(live.submitDeadline);

  const remind = async () => {
    const targetBands = bands.filter((b) => pending.some((r) => r.slot.bandId === b.id));
    const ok = window.confirm(`未提出の${pending.length}バンドのメンバーに、提出のお願いを通知します。よろしいですか?`);
    if (!ok) return;
    setSending(true);
    try {
      await createNotifications(
        memberIdsOfBands(targetBands),
        "live_update",
        `「${live.title}」のセットリスト・編成と機材が未提出です(締切 ${formatDateShort(live.submitDeadline)})`,
        `/live/${live.id}`
      );
      window.alert("通知しました。");
    } catch (e) {
      console.error("通知に失敗しました", e);
      window.alert("通知に失敗しました。");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="live-content">
      <button className="live-back" onClick={() => navigate(`/live/${live.id}`)}>
        <i className="ti ti-arrow-left" /> {live.title}に戻る
      </button>
      <h2 className="live-title">提出状況</h2>
      <p className="live-sub">
        締切 {formatDateShort(live.submitDeadline)}
        {days >= 0 ? `(${days === 0 ? "今日" : `あと${days}日`})` : "(締切を過ぎました)"}
      </p>

      <div className="live-summary">
        <span>セットリスト <strong>{rows.filter((r) => r.setlist).length}</strong> / {rows.length}</span>
        <span>編成・機材 <strong>{rows.filter((r) => r.plan).length}</strong> / {rows.length}</span>
      </div>

      {rows.map((r) => (
        <div key={r.slot.bandId} className="live-row">
          <div className="live-row-main">
            <p className="live-row-title">{r.slot.bandName}</p>
          </div>
          <span className={`live-badge ${r.setlist ? "done" : "warn"}`}>セットリスト {r.setlist ? "✓" : "未提出"}</span>
          <span className={`live-badge ${r.plan ? "done" : "warn"}`}>編成・機材 {r.plan ? "✓" : "未提出"}</span>
        </div>
      ))}

      <div className="live-actions">
        {pending.length > 0 && (
          <button className="live-btn outline wide" onClick={remind} disabled={sending}>
            {sending ? "送信中..." : `未提出の${pending.length}バンドに通知する`}
          </button>
        )}
        <button className="live-btn wide" onClick={() => navigate(`/live/${live.id}/documents`)}>
          当日の資料を作成する
        </button>
      </div>
      <p className="live-note">通知はアプリ内通知で送信します(Teamsには送信しません)。</p>
    </div>
  );
}

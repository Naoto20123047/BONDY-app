import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { hasOfficerRole } from "../../lib/roles";
import {
  fetchLive,
  fetchApprovedBands,
  fetchEntries,
  fetchSetlists,
  fetchStagePlans,
  livePhase,
  slotTimes,
  buildTimetable,
  fromMinutes,
  formatDateShort,
  daysUntil,
  isMyBand,
  PHASE_LABEL,
} from "../../lib/live";
import type { Band, Live, LiveEntry, LiveSetlist, LiveStagePlan } from "../../Types/types";
import "./live.css";

/**
 * ライブ詳細。
 *  - 申し込み受付中: 自分のバンドの申し込み状況と、申し込みへの入口
 *  - 出演順の決定後: 自分のバンドの出演時刻と、セットリスト・編成と機材の2つの提出
 *  - 全員: タイムテーブルと出演バンド
 *  - 幹部: 編集・出演バンドと順番・提出状況・資料の発行
 */
export default function LiveDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { member } = useAuth();
  const isOfficer = hasOfficerRole(member);

  const [live, setLive] = useState<Live | null>(null);
  const [myBands, setMyBands] = useState<Band[]>([]);
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [setlists, setSetlists] = useState<LiveSetlist[]>([]);
  const [plans, setPlans] = useState<LiveStagePlan[]>([]);
  const [tab, setTab] = useState<"timetable" | "bands">("timetable");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!id || !member) return;
      try {
        const [l, bands, ents, sets, stage] = await Promise.all([
          fetchLive(id),
          fetchApprovedBands(),
          fetchEntries(id),
          fetchSetlists(id),
          fetchStagePlans(id),
        ]);
        setLive(l);
        setMyBands(bands.filter((b) => isMyBand(b, member.id)));
        setEntries(ents);
        setSetlists(sets);
        setPlans(stage);
      } catch (e) {
        console.error("ライブの取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, member]);

  if (loading) return <div className="live-content">読み込み中...</div>;
  if (!live) return <div className="live-content">ライブが見つかりません。</div>;

  const phase = livePhase(live);
  const times = slotTimes(live);
  const myBandIds = new Set(myBands.map((b) => b.id));
  const mySlots = times.filter((t) => myBandIds.has(t.bandId));
  const canSubmit = phase === "submitting";
  const daysLeft = daysUntil(live.submitDeadline);

  const participating = entries.filter((e) => e.participate).length;
  const declined = entries.filter((e) => !e.participate).length;

  return (
    <div className="live-content">
      <button className="live-back" onClick={() => navigate("/live")}>
        <i className="ti ti-arrow-left" /> ライブ一覧に戻る
      </button>

      <div className="live-header">
        <div>
          <h2 className="live-title">{live.title}</h2>
          <p className="live-sub">
            {formatDateShort(live.date)} 開場 {live.openTime} · 開演 {live.startTime} · {live.venue}
          </p>
          <div className="live-list-status">
            <span className="live-badge">{PHASE_LABEL[phase]}</span>
          </div>
        </div>
      </div>

      {isOfficer && (
        <div className="live-actions">
          <button className="live-btn ghost small" onClick={() => navigate(`/live/${live.id}/edit`)}>
            <i className="ti ti-pencil" /> 編集
          </button>
          <button className="live-btn ghost small" onClick={() => navigate(`/live/${live.id}/lineup`)}>
            <i className="ti ti-list-numbers" /> 出演バンドと順番
          </button>
          {live.lineupPublishedAt && (
            <button className="live-btn ghost small" onClick={() => navigate(`/live/${live.id}/status`)}>
              <i className="ti ti-checklist" /> 提出状況
            </button>
          )}
        </div>
      )}

      {/* 申し込み受付中: 自分のバンドの申し込み */}
      {phase === "accepting" && myBands.length > 0 && (
        <section className="live-card">
          <p className="live-card-title">出演の申し込み</p>
          <p className="live-sub">締切 {formatDateShort(live.applyDeadline)}。バンドで1つの回答です。</p>
          {myBands.map((b) => {
            const entry = entries.find((e) => e.bandId === b.id);
            return (
              <div key={b.id} className="live-row" style={{ marginTop: 10 }}>
                <div className="live-row-main">
                  <p className="live-row-title">{b.name}</p>
                  <p className="live-row-sub">
                    {entry ? (entry.participate ? `出演する · 希望 ${entry.desiredMinutes}分` : "出演しない") : "未回答"}
                  </p>
                </div>
                <button
                  className={`live-btn small ${entry ? "outline" : ""}`}
                  onClick={() => navigate(`/live/${live.id}/apply?band=${b.id}`)}
                >
                  {entry ? "回答を修正する" : "申し込む"}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {phase === "accepting" && isOfficer && (
        <div className="live-summary">
          <span>出演 <strong>{participating}</strong>バンド</span>
          <span>不参加 <strong>{declined}</strong>バンド</span>
        </div>
      )}

      {/* 出演順の決定後: 自分のバンドの提出 */}
      {live.lineupPublishedAt &&
        mySlots.map((slot) => {
          const setlist = setlists.find((s) => s.bandId === slot.bandId);
          const plan = plans.find((p) => p.bandId === slot.bandId);
          return (
            <section key={slot.bandId} className="live-card">
              <p className="live-card-title">{slot.bandName}</p>
              <p className="live-sub">
                {fromMinutes(slot.start)}〜{fromMinutes(slot.end)} · {slot.minutes}分
              </p>

              <div className="live-row" style={{ marginTop: 12 }}>
                <div className="live-row-main">
                  <p className="live-row-title">セットリスト</p>
                  <p className="live-row-sub">{setlist ? `提出済み · ${setlist.items.length}項目` : "未提出"}</p>
                </div>
                <button
                  className={`live-btn small ${setlist ? "outline" : ""}`}
                  onClick={() => navigate(`/live/${live.id}/setlist/${slot.bandId}`)}
                >
                  {canSubmit ? (setlist ? "修正する" : "提出する") : "見る"}
                </button>
              </div>

              <div className="live-row">
                <div className="live-row-main">
                  <p className="live-row-title">編成・機材</p>
                  <p className="live-row-sub">{plan ? `提出済み · ${plan.members.length}人` : "未提出"}</p>
                </div>
                <button
                  className={`live-btn small ${plan ? "outline" : ""}`}
                  onClick={() => navigate(`/live/${live.id}/stage/${slot.bandId}`)}
                >
                  {canSubmit ? (plan ? "修正する" : "提出する") : "見る"}
                </button>
              </div>

              <p className="live-note">
                {canSubmit
                  ? `締切 ${formatDateShort(live.submitDeadline)}(${daysLeft === 0 ? "今日" : `あと${daysLeft}日`})までは何度でも修正できます`
                  : "提出の締切を過ぎました。修正が必要なときは幹部に連絡してください。"}
              </p>
            </section>
          );
        })}

      {live.lineupPublishedAt && (
        <>
          <div className="live-tabs" style={{ marginTop: 24 }}>
            <button className={`live-tab ${tab === "timetable" ? "active" : ""}`} onClick={() => setTab("timetable")}>
              タイムテーブル
            </button>
            <button className={`live-tab ${tab === "bands" ? "active" : ""}`} onClick={() => setTab("bands")}>
              出演バンド
            </button>
          </div>

          {tab === "timetable" &&
            buildTimetable(live)
              .filter((r) => r.kind !== "changeover")
              .map((r, i) => (
                <div key={i} className={`live-row ${r.bandId && myBandIds.has(r.bandId) ? "mine" : ""}`}>
                  <span className="live-row-time">{fromMinutes(r.start)}</span>
                  <div className="live-row-main">
                    <p className="live-row-title">{r.label}</p>
                    {r.bandId && myBandIds.has(r.bandId) && <p className="live-row-sub">あなたのバンド</p>}
                  </div>
                </div>
              ))}

          {tab === "bands" &&
            times.map((t, i) => (
              <div key={t.bandId} className={`live-row ${myBandIds.has(t.bandId) ? "mine" : ""}`}>
                <span className="live-row-time">{i + 1}</span>
                <div className="live-row-main">
                  <p className="live-row-title">{t.bandName}</p>
                  <p className="live-row-sub">
                    {fromMinutes(t.start)}〜{fromMinutes(t.end)} · {t.minutes}分
                  </p>
                </div>
              </div>
            ))}

          <div className="live-actions">
            <button className="live-btn outline" onClick={() => navigate(`/live/${live.id}/documents`)}>
              <i className="ti ti-file-text" /> 当日の資料を見る
            </button>
          </div>
        </>
      )}

      {!live.lineupPublishedAt && phase !== "accepting" && (
        <p className="live-empty">出演バンドと順番は、幹部が決めたあとに表示されます。</p>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  fetchLive,
  fetchApprovedBands,
  fetchEntries,
  saveEntry,
  livePhase,
  formatDateShort,
  isMyBand,
} from "../../lib/live";
import type { Band, Live, LiveEntry } from "../../Types/types";
import "./live.css";

/**
 * 出演の申し込み。バンドで1つの回答で、メンバーの誰でも回答でき、締切までは修正できる。
 * ライブの出演確認はフォームではなくここで行う。
 */
export default function LiveApplyScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { member } = useAuth();

  const [live, setLive] = useState<Live | null>(null);
  const [myBands, setMyBands] = useState<Band[]>([]);
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [bandId, setBandId] = useState("");
  const [participate, setParticipate] = useState(true);
  const [desiredMinutes, setDesiredMinutes] = useState(20);
  const [unavailable, setUnavailable] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 選んだバンドの回答を入力欄に読み込む */
  const loadBand = (targetId: string, list: LiveEntry[]) => {
    setBandId(targetId);
    const entry = list.find((e) => e.bandId === targetId);
    setParticipate(entry ? entry.participate : true);
    setDesiredMinutes(entry?.desiredMinutes ?? 20);
    setUnavailable(entry?.unavailable ?? "");
    setNote(entry?.note ?? "");
  };

  useEffect(() => {
    const load = async () => {
      if (!id || !member) return;
      try {
        const [l, bands, ents] = await Promise.all([fetchLive(id), fetchApprovedBands(), fetchEntries(id)]);
        const mine = bands.filter((b) => isMyBand(b, member.id));
        setLive(l);
        setMyBands(mine);
        setEntries(ents);
        const initial = mine.find((b) => b.id === params.get("band")) ?? mine[0];
        if (initial) loadBand(initial.id, ents);
      } catch (e) {
        console.error("申し込みの取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, member]);

  if (loading) return <div className="live-content">読み込み中...</div>;
  if (!live || !member) return <div className="live-content">ライブが見つかりません。</div>;

  const accepting = livePhase(live) === "accepting";
  const band = myBands.find((b) => b.id === bandId);

  const handleSave = async () => {
    setError(null);
    if (!band) return;
    if (participate && (desiredMinutes < 5 || desiredMinutes > 90)) {
      setError("希望の持ち時間は5分から90分の間で入力してください。");
      return;
    }
    setSaving(true);
    try {
      await saveEntry(live.id, {
        bandId: band.id,
        bandName: band.name,
        participate,
        desiredMinutes: participate ? desiredMinutes : 0,
        unavailable: participate ? unavailable.trim() : "",
        note: note.trim(),
        updatedBy: member.id,
        updatedAt: new Date().toISOString(),
      });
      navigate(`/live/${live.id}`, { replace: true });
    } catch (e) {
      console.error("申し込みに失敗しました", e);
      setError("申し込みに失敗しました。締切を過ぎていないか確認してください。");
    } finally {
      setSaving(false);
    }
  };

  const answered = entries.length;
  const participating = entries.filter((e) => e.participate).length;

  return (
    <div className="live-content">
      <button className="live-back" onClick={() => navigate(`/live/${live.id}`)}>
        <i className="ti ti-arrow-left" /> ライブ詳細に戻る
      </button>
      <h2 className="live-title">{live.title}</h2>
      <p className="live-sub">
        {formatDateShort(live.date)} 開場 {live.openTime} · 開演 {live.startTime} · {live.venue}
      </p>
      <div className="live-list-status">
        <span className={`live-badge ${accepting ? "" : "muted"}`}>
          {accepting ? `出演の申し込み受付中 · 締切 ${formatDateShort(live.applyDeadline)}` : "申し込みの受付は終了しました"}
        </span>
      </div>

      {myBands.length === 0 ? (
        <p className="live-empty" style={{ marginTop: 20 }}>
          承認済みのバンドに所属していないため、申し込めません。
        </p>
      ) : (
        <div className="live-form" style={{ marginTop: 20 }}>
          {myBands.length > 1 && (
            <label className="live-field full">
              <span className="live-label">申し込むバンド</span>
              <select className="live-input" value={bandId} onChange={(e) => loadBand(e.target.value, entries)}>
                {myBands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="live-field full">
            <span className="live-label">{band?.name}として申し込む</span>
            <div className="live-segment">
              <button type="button" className={participate ? "selected" : ""} onClick={() => setParticipate(true)} disabled={!accepting}>
                出演する
              </button>
              <button type="button" className={!participate ? "selected" : ""} onClick={() => setParticipate(false)} disabled={!accepting}>
                出演しない
              </button>
            </div>
          </div>

          {participate && (
            <>
              <div className="live-field">
                <span className="live-label">希望の持ち時間</span>
                <div className="live-stepper">
                  <button type="button" onClick={() => setDesiredMinutes((m) => Math.max(5, m - 5))} disabled={!accepting}>−</button>
                  <span>{desiredMinutes}分</span>
                  <button type="button" onClick={() => setDesiredMinutes((m) => Math.min(90, m + 5))} disabled={!accepting}>＋</button>
                </div>
              </div>
              <label className="live-field">
                <span className="live-label">出演できない時間帯(任意)</span>
                <input
                  className="live-input"
                  value={unavailable}
                  onChange={(e) => setUnavailable(e.target.value)}
                  placeholder="例: 18時台は出演できない"
                  disabled={!accepting}
                />
              </label>
            </>
          )}

          <label className="live-field full">
            <span className="live-label">幹部へのメモ(任意)</span>
            <textarea className="live-input" value={note} onChange={(e) => setNote(e.target.value)} disabled={!accepting} />
          </label>

          <p className="live-note live-field full">
            バンドで1つの回答です。メンバーの誰でも回答でき、締切までは修正できます。
          </p>
        </div>
      )}

      <div className="live-summary">
        <span>出演 <strong>{participating}</strong>バンド</span>
        <span>不参加 <strong>{answered - participating}</strong>バンド</span>
      </div>

      {error && <p className="live-error">{error}</p>}

      {band && accepting && (
        <button className="live-btn wide" onClick={handleSave} disabled={saving}>
          {saving ? "送信中..." : "この内容で申し込む"}
        </button>
      )}
    </div>
  );
}

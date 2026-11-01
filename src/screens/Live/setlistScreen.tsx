import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { hasOfficerRole } from "../../lib/roles";
import {
  fetchLive,
  fetchSetlist,
  saveSetlist,
  livePhase,
  slotTimes,
  fromMinutes,
  formatSeconds,
} from "../../lib/live";
import type { Live, SetlistItem } from "../../Types/types";
import "./live.css";

const genId = () => Math.random().toString(36).slice(2, 9);

/** 曲・MCの追加と編集(ボトムシート) */
function ItemSheet({
  initial,
  onCancel,
  onSave,
}: {
  initial: SetlistItem;
  onCancel: () => void;
  onSave: (item: SetlistItem) => void;
}) {
  const [item, setItem] = useState<SetlistItem>(initial);
  const [min, setMin] = useState(String(Math.floor(initial.seconds / 60)));
  const [sec, setSec] = useState(String(initial.seconds % 60));
  const [error, setError] = useState<string | null>(null);
  const isSong = item.kind === "song";

  const handleSave = () => {
    const seconds = (Number(min) || 0) * 60 + (Number(sec) || 0);
    if (isSong && !item.title.trim()) {
      setError("曲名を入力してください。");
      return;
    }
    if (seconds <= 0) {
      setError("時間を入力してください。");
      return;
    }
    onSave({
      ...item,
      title: item.title.trim(),
      artist: isSong && item.songType === "コピー" ? (item.artist ?? "").trim() : undefined,
      note: (item.note ?? "").trim() || undefined,
      seconds,
    });
  };

  return (
    <div className="live-sheet-backdrop" onClick={onCancel}>
      <div className="live-sheet" onClick={(e) => e.stopPropagation()}>
        <h3 className="live-sheet-title">{isSong ? "曲" : "MC"}</h3>
        <div className="live-form">
          {isSong && (
            <>
              <label className="live-field full">
                <span className="live-label">曲名</span>
                <input className="live-input" value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} />
              </label>
              <div className="live-field full">
                <span className="live-label">種類</span>
                <div className="live-segment">
                  {(["オリジナル", "コピー"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={item.songType === t ? "selected" : ""}
                      onClick={() => setItem({ ...item, songType: t })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {item.songType === "コピー" && (
                <label className="live-field full">
                  <span className="live-label">原曲のアーティスト</span>
                  <input className="live-input" value={item.artist ?? ""} onChange={(e) => setItem({ ...item, artist: e.target.value })} />
                </label>
              )}
            </>
          )}
          <label className="live-field">
            <span className="live-label">{isSong ? "演奏時間(分)" : "時間(分)"}</span>
            <input className="live-input" type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label className="live-field">
            <span className="live-label">秒</span>
            <input className="live-input" type="number" min={0} max={59} value={sec} onChange={(e) => setSec(e.target.value)} />
          </label>
          {isSong && (
            <label className="live-field full">
              <span className="live-label">PA・照明へのメモ(任意)</span>
              <textarea
                className="live-input"
                value={item.note ?? ""}
                onChange={(e) => setItem({ ...item, note: e.target.value })}
                placeholder="例: 2番のサビ前でブレイク、照明を暗くする"
              />
            </label>
          )}
        </div>
        {error && <p className="live-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="live-sheet-actions">
          <button className="live-btn ghost" onClick={onCancel}>キャンセル</button>
          <button className="live-btn" onClick={handleSave}>決定する</button>
        </div>
      </div>
    </div>
  );
}

/**
 * セットリストの提出(出演バンド)。
 * 持ち時間から曲とMCの合計を引いた残り時間を表示する。転換の時間は持ち時間に含まない。
 */
export default function SetlistScreen() {
  const { id, bandId } = useParams();
  const navigate = useNavigate();
  const { member } = useAuth();

  const [live, setLive] = useState<Live | null>(null);
  const [items, setItems] = useState<SetlistItem[]>([]);
  const [editing, setEditing] = useState<{ item: SetlistItem; index: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id || !bandId) return;
      try {
        const [l, s] = await Promise.all([fetchLive(id), fetchSetlist(id, bandId)]);
        setLive(l);
        if (s) setItems(s.items);
      } catch (e) {
        console.error("セットリストの取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, bandId]);

  if (loading) return <div className="live-content">読み込み中...</div>;
  if (!live || !bandId || !member) return <div className="live-content">ライブが見つかりません。</div>;

  const slot = slotTimes(live).find((t) => t.bandId === bandId);
  if (!slot) return <div className="live-content">このバンドは出演予定に入っていません。</div>;

  const editable = livePhase(live) === "submitting" || hasOfficerRole(member);
  const total = items.reduce((sum, it) => sum + it.seconds, 0);
  const remaining = slot.minutes * 60 - total;

  const move = (index: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [it] = next.splice(index, 1);
      next.splice(index + delta, 0, it);
      return next;
    });
  };

  const saveItem = (item: SetlistItem) => {
    setItems((prev) => {
      if (editing?.index === null || editing?.index === undefined) return [...prev, item];
      return prev.map((it, i) => (i === editing.index ? item : it));
    });
    setEditing(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (items.filter((it) => it.kind === "song").length === 0) {
      setError("曲を1曲以上追加してください。");
      return;
    }
    setSaving(true);
    try {
      await saveSetlist(live.id, bandId, items, member.id);
      navigate(`/live/${live.id}/done/${bandId}?from=setlist`, { replace: true });
    } catch (e) {
      console.error("セットリストの提出に失敗しました", e);
      setError("提出に失敗しました。締切を過ぎていないか確認してください。");
    } finally {
      setSaving(false);
    }
  };

  // 曲の通し番号(MCは数えない)
  const songNumbers = items.reduce<number[]>((acc, it) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
    acc.push(it.kind === "song" ? prev + 1 : prev);
    return acc;
  }, []);

  return (
    <div className="live-content">
      <button className="live-back" onClick={() => navigate(`/live/${live.id}`)}>
        <i className="ti ti-arrow-left" /> {live.title}に戻る
      </button>
      <h2 className="live-title">セットリスト</h2>
      <p className="live-sub">
        {slot.bandName} · {fromMinutes(slot.start)}〜{fromMinutes(slot.end)}(持ち時間 {slot.minutes}分)
      </p>

      <div className="live-summary">
        <span>合計 <strong>{formatSeconds(total)}</strong> / {slot.minutes}:00</span>
        <span className={remaining >= 0 ? "ok" : "ng"}>
          {remaining >= 0 ? `残り ${formatSeconds(remaining)}` : `${formatSeconds(-remaining)} 超過しています`}
        </span>
        <span>転換{live.changeoverMinutes}分は持ち時間に含みません</span>
      </div>

      {items.length === 0 && <p className="live-empty">曲とMCを追加してください。</p>}

      {items.map((it, i) => {
        return (
          <div key={it.id} className="live-row">
            {editable && (
              <div className="live-move">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="下へ">▼</button>
              </div>
            )}
            <span className="live-row-time">{it.kind === "song" ? songNumbers[i] : "MC"}</span>
            <div className="live-row-main">
              <p className="live-row-title">{it.kind === "song" ? it.title : "MC"}</p>
              {it.kind === "song" && (
                <p className="live-row-sub">
                  {[it.songType, it.artist, it.note ? "PA・照明メモあり" : ""].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <span className="live-row-sub">{formatSeconds(it.seconds)}</span>
            {editable && (
              <>
                <button className="live-icon-btn" onClick={() => setEditing({ item: it, index: i })} aria-label="編集">
                  <i className="ti ti-pencil" />
                </button>
                <button
                  className="live-icon-btn"
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="削除"
                >
                  <i className="ti ti-trash" />
                </button>
              </>
            )}
          </div>
        );
      })}

      {editable && (
        <>
          <div className="live-actions">
            <button
              className="live-btn outline small"
              onClick={() =>
                setEditing({
                  item: { id: genId(), kind: "song", title: "", songType: "オリジナル", seconds: 240 },
                  index: null,
                })
              }
            >
              <i className="ti ti-plus" /> 曲を追加
            </button>
            <button
              className="live-btn outline small"
              onClick={() => setEditing({ item: { id: genId(), kind: "mc", title: "", seconds: 90 }, index: null })}
            >
              <i className="ti ti-plus" /> MCを追加
            </button>
          </div>

          {error && <p className="live-error">{error}</p>}
          <button className="live-btn wide" onClick={handleSubmit} disabled={saving}>
            {saving ? "提出中..." : "提出する"}
          </button>
        </>
      )}

      {editing && <ItemSheet initial={editing.item} onCancel={() => setEditing(null)} onSave={saveItem} />}
    </div>
  );
}

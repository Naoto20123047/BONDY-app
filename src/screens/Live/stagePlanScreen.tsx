import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { hasOfficerRole } from "../../lib/roles";
import {
  fetchLive,
  fetchStagePlan,
  saveStagePlan,
  livePhase,
  slotTimes,
  fromMinutes,
  gearSummary,
  partLabel,
} from "../../lib/live";
import type { Band, Live, StageMember } from "../../Types/types";
import "./live.css";

/** パートごとの初期の立ち位置(%)。下が客席側 */
const DEFAULT_POSITION: Record<string, { x: number; y: number }> = {
  dr: { x: 50, y: 24 },
  ba: { x: 26, y: 46 },
  gt: { x: 74, y: 46 },
  key: { x: 86, y: 64 },
  dtm: { x: 14, y: 64 },
  vo: { x: 50, y: 74 },
};

const normalize = (part: string) => part.replace(/[.．\s]/g, "").toLowerCase();

/** バンドのメンバーから、編成・機材の初期値を作る */
const initialMembers = (band: Band, names: Record<string, string>): StageMember[] =>
  band.members.map((m, i) => {
    const pos = DEFAULT_POSITION[normalize(m.part)] ?? { x: 20 + ((i * 17) % 60), y: 60 };
    return {
      memberId: m.memberId,
      name: names[m.memberId] ?? "",
      part: m.part,
      useVenueGear: true,
      stereo: normalize(m.part) === "key" || normalize(m.part) === "dtm",
      extras: "",
      x: pos.x,
      y: pos.y,
    };
  });

/**
 * 編成・機材とステージ配置の提出(出演バンド)。2段階に分けている。
 *  1. 編成・機材: メンバーとパートはバンド情報から自動で入る。使う機材を選ぶ
 *  2. ステージ配置: メンバーをドラッグして立ち位置を決める
 * 提出した内容から、外部のPAに渡すチャンネル表が自動で作られる。
 */
export default function StagePlanScreen() {
  const { id, bandId } = useParams();
  const navigate = useNavigate();
  const { member, memberMap } = useAuth();

  const [live, setLive] = useState<Live | null>(null);
  const [members, setMembers] = useState<StageMember[]>([]);
  const [monitorRequest, setMonitorRequest] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id || !bandId) return;
      try {
        const [l, plan, bandSnap] = await Promise.all([
          fetchLive(id),
          fetchStagePlan(id, bandId),
          getDoc(doc(db, "bands", bandId)),
        ]);
        setLive(l);
        const names: Record<string, string> = {};
        Object.entries(memberMap).forEach(([mid, brief]) => {
          names[mid] = brief.name;
        });
        if (plan) {
          setMembers(plan.members);
          setMonitorRequest(plan.monitorRequest);
        } else if (bandSnap.exists()) {
          setMembers(initialMembers({ id: bandSnap.id, ...(bandSnap.data() as Omit<Band, "id">) }, names));
        }
      } catch (e) {
        console.error("編成・機材の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, bandId, memberMap]);

  if (loading) return <div className="live-content">読み込み中...</div>;
  if (!live || !bandId || !member) return <div className="live-content">ライブが見つかりません。</div>;

  const slot = slotTimes(live).find((t) => t.bandId === bandId);
  if (!slot) return <div className="live-content">このバンドは出演予定に入っていません。</div>;

  const editable = livePhase(live) === "submitting" || hasOfficerRole(member);

  const update = (memberId: string, patch: Partial<StageMember>) =>
    setMembers((prev) => prev.map((m) => (m.memberId === memberId ? { ...m, ...patch } : m)));

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      await saveStagePlan(live.id, bandId, members, monitorRequest.trim(), member.id);
      navigate(`/live/${live.id}/done/${bandId}?from=stage`, { replace: true });
    } catch (e) {
      console.error("編成・機材の提出に失敗しました", e);
      setError("提出に失敗しました。締切を過ぎていないか確認してください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="live-content">
      <button
        className="live-back"
        onClick={() => (step === 2 ? setStep(1) : navigate(`/live/${live.id}`))}
      >
        <i className="ti ti-arrow-left" /> {step === 2 ? "編成・機材に戻る" : `${live.title}に戻る`}
      </button>
      <p className="live-note" style={{ margin: 0 }}>{step} / 2</p>
      <h2 className="live-title">{step === 1 ? "編成・機材" : "ステージ配置"}</h2>
      <p className="live-sub">
        {slot.bandName} · {fromMinutes(slot.start)}〜{fromMinutes(slot.end)}
      </p>

      {step === 1 && (
        <>
          <p className="live-note">メンバーとパートはバンド情報から自動で入力されます。使用する機材を選択してください。</p>
          <div style={{ marginTop: 12 }}>
            {members.map((m) => {
              const p = normalize(m.part);
              const open = openId === m.memberId;
              return (
                <div key={m.memberId} className="live-card" style={{ padding: 0 }}>
                  <button
                    className="live-row"
                    style={{ border: "none", margin: 0, width: "100%", background: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
                    onClick={() => setOpenId(open ? null : m.memberId)}
                  >
                    <span className="live-row-time">{partLabel(m.part)}</span>
                    <div className="live-row-main">
                      <p className="live-row-title">{m.name || "(名前未設定)"}</p>
                      <p className="live-row-sub">{gearSummary(m)}</p>
                    </div>
                    <i className={`ti ti-chevron-${open ? "up" : "down"}`} />
                  </button>
                  {open && (
                    <div className="live-form" style={{ padding: "0 14px 14px" }}>
                      <div className="live-field full">
                        <span className="live-label">
                          {p === "vo" ? "マイク" : p === "gt" || p === "ba" ? "アンプ" : p === "dr" ? "ドラムセット" : "楽器・機材"}
                        </span>
                        <div className="live-segment">
                          <button
                            type="button"
                            className={m.useVenueGear ? "selected" : ""}
                            onClick={() => update(m.memberId, { useVenueGear: true })}
                            disabled={!editable}
                          >
                            会場のもの
                          </button>
                          <button
                            type="button"
                            className={!m.useVenueGear ? "selected" : ""}
                            onClick={() => update(m.memberId, { useVenueGear: false })}
                            disabled={!editable}
                          >
                            持ち込み
                          </button>
                        </div>
                      </div>
                      {(p === "key" || p === "dtm") && (
                        <div className="live-field full">
                          <span className="live-label">出力</span>
                          <div className="live-segment">
                            <button type="button" className={m.stereo ? "selected" : ""} onClick={() => update(m.memberId, { stereo: true })} disabled={!editable}>
                              ステレオ(DI 2本)
                            </button>
                            <button type="button" className={!m.stereo ? "selected" : ""} onClick={() => update(m.memberId, { stereo: false })} disabled={!editable}>
                              モノラル(DI 1本)
                            </button>
                          </div>
                        </div>
                      )}
                      <label className="live-field full">
                        <span className="live-label">持ち込む機材・備考(任意)</span>
                        <input
                          className="live-input"
                          value={m.extras}
                          onChange={(e) => update(m.memberId, { extras: e.target.value })}
                          placeholder={p === "dr" ? "例: スネア持ち込み" : p === "gt" ? "例: エフェクター持ち込み" : ""}
                          disabled={!editable}
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <label className="live-field" style={{ marginTop: 12 }}>
            <span className="live-label">モニター(返し)の要望(任意)</span>
            <textarea
              className="live-input"
              value={monitorRequest}
              onChange={(e) => setMonitorRequest(e.target.value)}
              placeholder="例: Vo.の返しにKey.を多めに"
              disabled={!editable}
            />
          </label>

          <div className="live-actions">
            <button className="live-btn wide" onClick={() => setStep(2)}>次へ:ステージ配置</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="live-note">メンバーをドラッグして、立ち位置を決めてください。</p>
          <StageBoard members={members} editable={editable} onMove={(mid, x, y) => update(mid, { x, y })} />

          {error && <p className="live-error" style={{ marginTop: 12 }}>{error}</p>}
          {editable && (
            <div className="live-actions">
              <button className="live-btn wide" onClick={handleSubmit} disabled={saving}>
                {saving ? "提出中..." : "提出する"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** ステージの図。メンバーの丸をドラッグして動かす(タッチにも対応) */
function StageBoard({
  members,
  editable,
  onMove,
}: {
  members: StageMember[];
  editable: boolean;
  onMove: (memberId: string, x: number, y: number) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const handleMove = (e: React.PointerEvent) => {
    if (!dragging || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.min(94, Math.max(6, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(88, Math.max(12, ((e.clientY - rect.top) / rect.height) * 100));
    onMove(dragging, Math.round(x), Math.round(y));
  };

  return (
    <div
      ref={boardRef}
      className="live-stage"
      onPointerMove={handleMove}
      onPointerUp={() => setDragging(null)}
      onPointerLeave={() => setDragging(null)}
    >
      <span className="live-stage-label top">ステージ奥</span>
      <span className="live-stage-label bottom">客席</span>
      {members.map((m) => (
        <div
          key={m.memberId}
          className="live-stage-member"
          style={{ left: `${m.x}%`, top: `${m.y}%`, cursor: editable ? "grab" : "default" }}
          onPointerDown={(e) => {
            if (!editable) return;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setDragging(m.memberId);
          }}
        >
          <strong>{partLabel(m.part)}</strong>
          <span>{m.name.split(/\s/)[0]}</span>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fetchLive, fetchSetlist, fetchStagePlan, formatDateShort, slotTimes } from "../../lib/live";
import type { Live, LiveSetlist, LiveStagePlan } from "../../Types/types";
import "./live.css";

/**
 * 提出完了。セットリストと編成・機材のどちらを先に提出してもよいので、
 * もう一方が未提出ならここから続けて進める。
 */
export default function LiveSubmitDoneScreen() {
  const { id, bandId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const from = params.get("from") === "stage" ? "stage" : "setlist";

  const [live, setLive] = useState<Live | null>(null);
  const [setlist, setSetlist] = useState<LiveSetlist | null>(null);
  const [plan, setPlan] = useState<LiveStagePlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !bandId) return;
    Promise.all([fetchLive(id), fetchSetlist(id, bandId), fetchStagePlan(id, bandId)])
      .then(([l, s, p]) => {
        setLive(l);
        setSetlist(s);
        setPlan(p);
      })
      .finally(() => setLoading(false));
  }, [id, bandId]);

  if (loading) return <div className="live-content">読み込み中...</div>;
  if (!live || !bandId) return <div className="live-content">ライブが見つかりません。</div>;

  const bandName = slotTimes(live).find((t) => t.bandId === bandId)?.bandName ?? "";

  return (
    <div className="live-content">
      <div style={{ textAlign: "center", margin: "24px 0" }}>
        <i className="ti ti-circle-check" style={{ fontSize: 48, color: "var(--color-accent)" }} />
        <h2 className="live-title" style={{ marginTop: 8 }}>
          {from === "stage" ? "編成・機材を提出しました" : "セットリストを提出しました"}
        </h2>
        <p className="live-sub">{live.title} · {bandName}</p>
      </div>

      <div className="live-row">
        <div className="live-row-main">
          <p className="live-row-title">セットリスト</p>
        </div>
        <span className={`live-badge ${setlist ? "done" : "warn"}`}>
          {setlist ? `✓ ${setlist.items.filter((i) => i.kind === "song").length}曲` : "未提出"}
        </span>
      </div>
      <div className="live-row">
        <div className="live-row-main">
          <p className="live-row-title">編成・機材とステージ配置</p>
        </div>
        <span className={`live-badge ${plan ? "done" : "warn"}`}>{plan ? `✓ ${plan.members.length}人` : "未提出"}</span>
      </div>

      <p className="live-note">
        締切({formatDateShort(live.submitDeadline)})までは何度でも修正できます。
        提出した内容から、外部のPAに渡すチャンネル表が自動で作成されます。
      </p>

      <div className="live-actions">
        {!setlist && (
          <button className="live-btn wide" onClick={() => navigate(`/live/${live.id}/setlist/${bandId}`)}>
            セットリストを提出する
          </button>
        )}
        {!plan && (
          <button className="live-btn wide" onClick={() => navigate(`/live/${live.id}/stage/${bandId}`)}>
            編成・機材を提出する
          </button>
        )}
        <button className="live-btn ghost wide" onClick={() => navigate(`/live/${live.id}`)}>
          ライブ詳細に戻る
        </button>
      </div>
    </div>
  );
}

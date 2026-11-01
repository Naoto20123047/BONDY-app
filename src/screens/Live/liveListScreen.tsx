import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { hasOfficerRole } from "../../lib/roles";
import {
  fetchLives,
  fetchApprovedBands,
  fetchEntries,
  fetchSetlists,
  fetchStagePlans,
  livePhase,
  slotTimes,
  fromMinutes,
  isMyBand,
  PHASE_LABEL,
} from "../../lib/live";
import type { Band, Live } from "../../Types/types";
import "./live.css";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 一覧の各ライブに添える「自分のバンドの状況」 */
interface MyStatus {
  text: string;
  badges: { label: string; tone: "warn" | "done" | "muted" }[];
}

/**
 * ライブ一覧(メニューの「ライブ」)。
 * 開催予定と終了したライブを分けて並べ、自分のバンドの状況も添える。
 */
export default function LiveListScreen() {
  const navigate = useNavigate();
  const { member } = useAuth();
  const isOfficer = hasOfficerRole(member);
  const [lives, setLives] = useState<Live[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, MyStatus>>({});
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!member) return;
      try {
        const [list, bands] = await Promise.all([fetchLives(), fetchApprovedBands()]);
        setLives(list);

        const myBands = bands.filter((b) => isMyBand(b, member.id));
        const map: Record<string, MyStatus> = {};
        for (const live of list) {
          if (livePhase(live) === "ended" || myBands.length === 0) continue;
          map[live.id] = await buildMyStatus(live, myBands);
        }
        setStatusMap(map);
      } catch (e) {
        console.error("ライブの取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [member]);

  if (loading) return <div className="live-content">読み込み中...</div>;

  const upcoming = lives.filter((l) => livePhase(l) !== "ended");
  const past = lives.filter((l) => livePhase(l) === "ended").reverse();
  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <div className="live-content">
      <div className="live-header">
        <div>
          <h2 className="live-title">ライブ</h2>
          <p className="live-sub">出演の申し込み、セットリストと編成・機材の提出はここから行います。</p>
        </div>
        {isOfficer && (
          <button className="live-btn" onClick={() => navigate("/live/new")}>
            <i className="ti ti-plus" /> 作成
          </button>
        )}
      </div>

      <div className="live-tabs">
        <button className={`live-tab ${tab === "upcoming" ? "active" : ""}`} onClick={() => setTab("upcoming")}>
          開催予定
        </button>
        <button className={`live-tab ${tab === "past" ? "active" : ""}`} onClick={() => setTab("past")}>
          終了したライブ
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="live-empty">
          {tab === "upcoming" ? "開催予定のライブはありません" : "終了したライブはありません"}
        </p>
      ) : (
        shown.map((live) => {
          const d = new Date(`${live.date}T00:00:00+09:00`);
          const status = statusMap[live.id];
          return (
            <button key={live.id} className="live-list-item" onClick={() => navigate(`/live/${live.id}`)}>
              <div className="live-date">
                <span className="live-date-month">{d.getMonth() + 1}月</span>
                <span className="live-date-day">{d.getDate()}</span>
                <span className="live-date-week">{WEEKDAYS[d.getDay()]}</span>
              </div>
              <div className="live-list-body">
                <p className="live-card-title">{live.title}</p>
                <p className="live-sub">
                  {live.venue} · 開演 {live.startTime}
                  {live.lineup.length > 0 ? ` · ${live.lineup.length}バンド` : ""}
                </p>
                {status ? (
                  <>
                    <p className="live-sub">{status.text}</p>
                    <div className="live-list-status">
                      {status.badges.map((b) => (
                        <span key={b.label} className={`live-badge ${b.tone}`}>{b.label}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="live-list-status">
                    <span className="live-badge muted">{PHASE_LABEL[livePhase(live)]}</span>
                  </div>
                )}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

/** 自分のバンドについて、今すべきことをまとめる */
async function buildMyStatus(live: Live, myBands: Band[]): Promise<MyStatus> {
  const phase = livePhase(live);

  if (phase === "accepting" || phase === "preparing") {
    const entries = await fetchEntries(live.id);
    const unanswered = myBands.filter((b) => !entries.some((e) => e.bandId === b.id));
    return {
      text: phase === "accepting" ? `申し込み締切 ${live.applyDeadline.slice(5).replace("-", "/")}` : "出演バンドの決定待ち",
      badges:
        phase === "accepting" && unanswered.length > 0
          ? [{ label: `${unanswered.map((b) => b.name).join("・")}は未回答`, tone: "warn" }]
          : [{ label: PHASE_LABEL[phase], tone: "muted" }],
    };
  }

  // 出演順が決まったあと
  const times = slotTimes(live);
  const mySlots = times.filter((t) => myBands.some((b) => b.id === t.bandId));
  if (mySlots.length === 0) {
    return { text: "出演予定はありません", badges: [{ label: PHASE_LABEL[phase], tone: "muted" }] };
  }

  const [setlists, plans] = await Promise.all([fetchSetlists(live.id), fetchStagePlans(live.id)]);
  const badges: MyStatus["badges"] = [];
  for (const slot of mySlots) {
    const hasSetlist = setlists.some((s) => s.bandId === slot.bandId);
    const hasPlan = plans.some((p) => p.bandId === slot.bandId);
    const prefix = mySlots.length > 1 ? `${slot.bandName}:` : "";
    badges.push({ label: `${prefix}セットリスト${hasSetlist ? "提出済み" : "未提出"}`, tone: hasSetlist ? "done" : "warn" });
    badges.push({ label: `${prefix}編成・機材${hasPlan ? "提出済み" : "未提出"}`, tone: hasPlan ? "done" : "warn" });
  }
  return {
    text: mySlots.map((s) => `${s.bandName}が出演(${fromMinutes(s.start)}〜)`).join(" / "),
    badges,
  };
}

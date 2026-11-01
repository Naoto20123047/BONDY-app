import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  buildPaChannels,
  buildTimetable,
  fetchLive,
  fetchSetlists,
  fetchStagePlans,
  formatDateLong,
  formatSeconds,
  fromMinutes,
  gearSummary,
  partLabel,
  slotTimes,
} from "../../lib/live";
import type { Live, LiveSetlist, LiveStagePlan } from "../../Types/types";
import "./live.css";

type DocTab = "timetable" | "setlist" | "pa";

const TAB_LABEL: Record<DocTab, string> = {
  timetable: "タイムテーブル",
  setlist: "セットリスト",
  pa: "PAチャンネル表",
};

/**
 * 当日の資料(v1.4.0)
 *
 * 提出されたセットリストと編成・機材から、当日に配る資料を作る。
 *  - タイムテーブル:開場・各バンドの出番・転換・撤収
 *  - セットリスト:全バンド分(曲名・尺・MC・PA/照明へのメモ)
 *  - PAチャンネル表:外部のPA担当に渡す入力の一覧とステージ配置
 *
 * 「PDFで保存」はブラウザの印刷機能を使う(印刷用の CSS で資料だけを出す)。
 * PAはサークル外の人が担当する前提なので、PAチャンネル表はPDFで渡す想定。
 */
export default function LiveDocumentsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [live, setLive] = useState<Live | null>(null);
  const [setlists, setSetlists] = useState<LiveSetlist[]>([]);
  const [plans, setPlans] = useState<LiveStagePlan[]>([]);
  const [tab, setTab] = useState<DocTab>("timetable");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchLive(id), fetchSetlists(id), fetchStagePlans(id)])
      .then(([l, s, p]) => {
        setLive(l);
        setSetlists(s);
        setPlans(p);
      })
      .catch((e) => console.error("当日の資料の取得に失敗しました", e))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="live-content">読み込み中...</div>;
  if (!live) return <div className="live-content">ライブが見つかりません。</div>;

  const times = slotTimes(live);
  const meta = `${formatDateLong(live.date)} · ${live.venue} · 開場 ${live.openTime} / 開演 ${live.startTime}`;
  const missingSetlists = live.lineup.filter((s) => !setlists.some((x) => x.bandId === s.bandId));
  const missingPlans = live.lineup.filter((s) => !plans.some((x) => x.bandId === s.bandId));

  const renderTimetable = () => (
    <div className="live-doc">
      <p className="live-doc-kicker">TIMETABLE</p>
      <h3 className="live-doc-title">{live.title}</h3>
      <p className="live-doc-meta">{meta}</p>
      <table>
        <thead>
          <tr>
            <th>時刻</th>
            <th>内容</th>
            <th>時間</th>
          </tr>
        </thead>
        <tbody>
          {buildTimetable(live).map((row, i) => (
            <tr key={i} className={row.kind === "band" ? "" : "sub"}>
              <td>
                {fromMinutes(row.start)}
                {row.end > row.start ? ` – ${fromMinutes(row.end)}` : ""}
              </td>
              <td>{row.label}</td>
              <td>{row.end > row.start ? `${row.end - row.start}分` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSetlists = () => (
    <div className="live-doc">
      <p className="live-doc-kicker">SETLIST</p>
      <h3 className="live-doc-title">{live.title}</h3>
      <p className="live-doc-meta">{meta}</p>
      {times.map((slot, i) => {
        const setlist = setlists.find((s) => s.bandId === slot.bandId);
        const total = (setlist?.items ?? []).reduce((sum, it) => sum + (it.seconds || 0), 0);
        return (
          <div key={slot.bandId}>
            <p className="live-doc-band">
              {i + 1}. {slot.bandName}
              <span className="live-doc-memo">
                {"  "}
                {fromMinutes(slot.start)} – {fromMinutes(slot.end)}(持ち時間 {slot.minutes}分
                {setlist ? ` / 合計 ${formatSeconds(total)}` : ""})
              </span>
            </p>
            {!setlist ? (
              <p className="live-doc-memo">未提出</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>曲名</th>
                    <th>尺</th>
                    <th>メモ(PA・照明)</th>
                  </tr>
                </thead>
                <tbody>
                  {setlist.items.map((it, n) => (
                    <tr key={it.id} className={it.kind === "mc" ? "sub" : ""}>
                      <td>{n + 1}</td>
                      <td>
                        {it.kind === "mc"
                          ? "MC"
                          : `${it.title}${it.songType === "コピー" && it.artist ? ` / ${it.artist}` : ""}`}
                      </td>
                      <td>{formatSeconds(it.seconds || 0)}</td>
                      <td>{it.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderPa = () => (
    <>
      {times.map((slot, i) => {
        const plan = plans.find((p) => p.bandId === slot.bandId);
        return (
          <div key={slot.bandId} className="live-doc">
            <p className="live-doc-kicker">PA CHANNEL LIST · {i + 1}</p>
            <h3 className="live-doc-title">{slot.bandName}</h3>
            <p className="live-doc-meta">
              {live.title} · {fromMinutes(slot.start)} – {fromMinutes(slot.end)}
            </p>
            {!plan ? (
              <p className="live-doc-memo">編成・機材が未提出です。</p>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Ch</th>
                      <th>楽器</th>
                      <th>担当</th>
                      <th>入力</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildPaChannels(plan).map((c) => (
                      <tr key={c.ch}>
                        <td>{c.ch}</td>
                        <td>{c.instrument}</td>
                        <td>{c.player}</td>
                        <td>{c.input}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="live-doc-band">編成・機材</p>
                <table>
                  <tbody>
                    {plan.members.map((m) => (
                      <tr key={m.memberId}>
                        <td>{partLabel(m.part)}</td>
                        <td>{m.name}</td>
                        <td>{gearSummary(m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {plan.monitorRequest.trim() && (
                  <p className="live-doc-memo">モニター(返し)の要望:{plan.monitorRequest}</p>
                )}

                <div className="live-doc-stage" aria-label="ステージ配置">
                  {plan.members.map((m) => (
                    <span key={m.memberId} style={{ left: `${m.x}%`, top: `${m.y}%` }}>
                      {partLabel(m.part)} {m.name.split(/\s/)[0]}
                    </span>
                  ))}
                </div>
                <p className="live-doc-memo">ステージ配置(下が客席側)</p>
              </>
            )}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="live-content">
      <button className="live-back" onClick={() => navigate(`/live/${live.id}`)}>
        <i className="ti ti-arrow-left" /> {live.title}に戻る
      </button>

      <div className="live-header">
        <div>
          <h2 className="live-title">当日の資料</h2>
          <p className="live-sub">{meta}</p>
        </div>
        <button className="live-btn" onClick={() => window.print()} disabled={live.lineup.length === 0}>
          <i className="ti ti-download" /> PDFで保存
        </button>
      </div>

      {live.lineup.length === 0 ? (
        <p className="live-empty">出演順がまだ決まっていません。</p>
      ) : (
        <>
          {(missingSetlists.length > 0 || missingPlans.length > 0) && (
            <p className="live-note">
              未提出:
              {missingSetlists.length > 0 &&
                ` セットリスト(${missingSetlists.map((s) => s.bandName).join("、")})`}
              {missingPlans.length > 0 &&
                ` 編成・機材(${missingPlans.map((s) => s.bandName).join("、")})`}
            </p>
          )}

          <div className="live-tabs" role="tablist">
            {(Object.keys(TAB_LABEL) as DocTab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`live-tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {/* 印刷(PDFで保存)のときは、選んでいるタブの資料だけが出る */}
          <div className="live-print">
            {tab === "timetable" && renderTimetable()}
            {tab === "setlist" && renderSetlists()}
            {tab === "pa" && renderPa()}
          </div>
        </>
      )}
    </div>
  );
}

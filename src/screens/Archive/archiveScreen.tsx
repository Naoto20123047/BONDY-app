import { useNavigate } from "react-router-dom";
import "./archiveScreen.css";
import { useArchive } from "./useArchive";
import { youtubeThumbUrl } from "../../lib/archive";
import { formatShortDate } from "../../lib/date";

/**
 * アーカイブの一覧(部員のみ)
 *
 * 動画の記録なので、文字ではなくサムネイルを主役にする。
 * 年度ごとにまとめて、その年に何があったかがひと目で分かる形にしてある。
 */
export default function ArchiveScreen() {
  const navigate = useNavigate();
  const { years, summary, totalEvents, isOfficer, loading } = useArchive();

  if (loading) {
    return <div className="archive-content">読み込み中...</div>;
  }

  return (
    <div className="archive-content">
      <div className="archive-header">
        <div>
          <h2 className="archive-title">アーカイブ</h2>
          <p className="archive-desc">
            これまでのライブや行事の記録です。映像と音源はYouTubeの限定公開に置いてあります。
          </p>
        </div>
        {isOfficer && (
          <button
            className="archive-add-btn"
            onClick={() => navigate("/archive/new")}
          >
            <i className="ti ti-plus" /> イベントを追加
          </button>
        )}
      </div>

      {totalEvents === 0 && (
        <div className="archive-empty">
          <i className="ti ti-player-play archive-empty-icon" />
          <p className="archive-empty-text">
            まだ記録がありません。
            {isOfficer && (
              <>
                <br />
                「イベントを追加」から、最初のライブを登録してみてください。
              </>
            )}
          </p>
        </div>
      )}

      {years.map((year) => (
        <section className="archive-year" key={year.fiscalYear ?? "unknown"}>
          <div className="archive-year-head">
            <span className="archive-year-num">
              {year.fiscalYear === null ? "—" : year.fiscalYear}
            </span>
            <span className="archive-year-unit">
              {year.fiscalYear === null ? "日付なし" : "年度"}
            </span>
            <span className="archive-year-rule" />
            <span className="archive-year-count">{year.events.length}件</span>
          </div>

          <div className="archive-grid">
            {year.events.map((event) => {
              const info = summary[event.id];
              return (
                <button
                  key={event.id}
                  className={`archive-card ${event.hidden ? "is-hidden" : ""}`}
                  onClick={() => navigate(`/archive/${event.id}`)}
                >
                  <div className="archive-cover">
                    {info?.coverYoutubeId ? (
                      <img
                        className="archive-cover-img"
                        src={youtubeThumbUrl(info.coverYoutubeId)}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <div className="archive-cover-blank">
                        <i className="ti ti-music" />
                      </div>
                    )}

                    <span className="archive-cover-count">
                      <i className="ti ti-player-play-filled" />
                      {info?.count ?? 0}
                    </span>

                    {event.hidden && (
                      <span className="archive-cover-badge">非表示</span>
                    )}
                  </div>

                  <div className="archive-card-body">
                    <span className="archive-card-date">
                      {formatShortDate(event.date)}
                    </span>
                    <span className="archive-card-title">{event.title}</span>
                    {event.venue && (
                      <span className="archive-card-venue">
                        <i className="ti ti-map-pin" />
                        {event.venue}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

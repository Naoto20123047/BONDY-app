import { useNavigate, useParams } from "react-router-dom";
import "./eventDetailScreen.css";
import { useArchiveEvent } from "./useArchiveEvent";
import YouTubePlayer from "./YouTubePlayer";
import { formatFullDate } from "../../lib/date";

/**
 * イベント1件の詳細(部員のみ)
 *
 * セットリスト順に映像・音源を並べる。PCでは2列にして、
 * 1本ずつ縦に積んで延々スクロールする形にならないようにしている。
 */
export default function ArchiveEventDetailScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { event, items, bandNames, isOfficer, loading } = useArchiveEvent(id);

  if (loading) {
    return <div className="ae-content">読み込み中...</div>;
  }

  if (!event) {
    return (
      <div className="ae-content">
        <button className="ae-back" onClick={() => navigate("/archive")}>
          <i className="ti ti-arrow-left" /> アーカイブに戻る
        </button>
        <p className="ae-empty">このイベントは見つかりませんでした。</p>
      </div>
    );
  }

  return (
    <div className="ae-content">
      <button className="ae-back" onClick={() => navigate("/archive")}>
        <i className="ti ti-arrow-left" /> アーカイブに戻る
      </button>

      <header className="ae-hero">
        <div className="ae-hero-main">
          <h2 className="ae-title">
            {event.title}
            {event.hidden && <span className="ae-badge">非表示</span>}
          </h2>

          <div className="ae-chips">
            <span className="ae-chip">
              <i className="ti ti-calendar" />
              {formatFullDate(event.date)}
            </span>
            {event.venue && (
              <span className="ae-chip">
                <i className="ti ti-map-pin" />
                {event.venue}
              </span>
            )}
            {items.length > 0 && (
              <span className="ae-chip accent">
                <i className="ti ti-player-play-filled" />
                {items.length}本
              </span>
            )}
          </div>
        </div>

        {isOfficer && (
          <button
            className="ae-edit-btn"
            onClick={() => navigate(`/archive/${event.id}/edit`)}
          >
            <i className="ti ti-pencil" /> 編集
          </button>
        )}
      </header>

      {event.note && <p className="ae-note">{event.note}</p>}

      {items.length === 0 ? (
        <div className="ae-empty-box">
          <i className="ti ti-player-play ae-empty-icon" />
          <p className="ae-empty">
            まだ映像・音源が登録されていません。
            {isOfficer && (
              <>
                <br />
                「編集」から追加してください。
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="ae-items">
          {items.map((item, index) => (
            <article
              className={`ae-item ${item.hidden ? "is-hidden" : ""}`}
              key={item.id}
            >
              <YouTubePlayer youtubeId={item.youtubeId} title={item.title} />

              <div className="ae-item-body">
                <span className="ae-item-no">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="ae-item-text">
                  <h3 className="ae-item-title">
                    <i
                      className={`ti ${
                        item.kind === "audio" ? "ti-music" : "ti-video"
                      } ae-item-kind`}
                    />
                    {item.title}
                    {item.hidden && <span className="ae-badge">非表示</span>}
                  </h3>

                  {item.bandId && bandNames[item.bandId] && (
                    <button
                      className="ae-band-link"
                      onClick={() => navigate(`/bands/${item.bandId}`)}
                    >
                      <i className="ti ti-guitar-pick" />
                      {bandNames[item.bandId]}
                    </button>
                  )}

                  {item.note && <p className="ae-item-note">{item.note}</p>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

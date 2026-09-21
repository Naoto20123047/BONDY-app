import { useState } from "react";
import "./youTubePlayer.css";
import { youtubeEmbedUrl, youtubeThumbUrl, youtubeWatchUrl } from "../../lib/archive";

interface YouTubePlayerProps {
  youtubeId: string;
  title: string;
}

/**
 * YouTube の埋め込み再生。
 *
 * 最初はサムネイルだけを出し、押されたときに初めて iframe を作る。
 * 1ページに何本も並ぶため、最初から iframe を並べると YouTube の
 * スクリプトが本数分読み込まれて重くなる。
 *
 * 動画が消えている・限定公開の設定が変わっている場合は再生できないので、
 * YouTube で開くリンクも併せて出しておく。
 */
export default function YouTubePlayer({ youtubeId, title }: YouTubePlayerProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="yt">
      {playing ? (
        <iframe
          className="yt-frame"
          src={`${youtubeEmbedUrl(youtubeId)}&autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="yt-facade"
          onClick={() => setPlaying(true)}
          aria-label={`${title} を再生する`}
        >
          <img
            className="yt-thumb"
            src={youtubeThumbUrl(youtubeId)}
            alt=""
            loading="lazy"
          />
          <span className="yt-play">
            <i className="ti ti-player-play-filled" />
          </span>
        </button>
      )}

      <a
        className="yt-external"
        href={youtubeWatchUrl(youtubeId)}
        target="_blank"
        rel="noreferrer"
      >
        <i className="ti ti-external-link" /> YouTubeで開く
      </a>
    </div>
  );
}

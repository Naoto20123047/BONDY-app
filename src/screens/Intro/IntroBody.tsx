import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import "./introBody.css";
import { collectIntroFileIds, resolveIntroImageUrls } from "../../lib/introImages";
import type { IntroBlock, IntroImage, IntroPage, IntroTone } from "../../Types/types";

interface IntroBodyProps {
  page: IntroPage;
}

/** 画像のファイルID → 表示用の署名URL */
type UrlMap = Record<string, string>;

// ---------------------------------------------------------------------------
// スクロールで出す
// ---------------------------------------------------------------------------

/**
 * スクロールしてきたブロックを、指定された出方で見せる。
 *
 * 動きそのものは CSS が持っていて、ここは「見えたら is-in を付ける」だけ。
 * IntersectionObserver が無い環境や、OS で「視差効果を減らす」を
 * 有効にしている人には、最初から全部見えている状態にする。
 */
function useReveal(signature: string) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-effect]"));

    // 出方を変えたときに、編集画面のプレビューでもう一度再生されるよう戻す
    targets.forEach((el) => el.classList.remove("is-in"));

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // ブロックの増減や出方の変更で観測し直す(編集画面のプレビュー用)
  }, [signature]);

  return rootRef;
}

// ---------------------------------------------------------------------------
// 画像
// ---------------------------------------------------------------------------

/**
 * 保存してある写真を表示する。
 *
 * 署名URLがまだ取れていない間は同じ高さの箱を出しておく。
 * 後から画像が入ってもレイアウトが飛び跳ねないようにするため。
 */
function IntroFigure({
  image,
  urls,
  className,
  ratio,
}: {
  image?: IntroImage;
  urls: UrlMap;
  className?: string;
  /** 箱の縦横比。写真が入る前の高さを決める */
  ratio?: string;
}) {
  if (!image?.fileId) return null;

  const url = urls[image.fileId];
  const style = ratio ? ({ aspectRatio: ratio } as CSSProperties) : undefined;

  return (
    <figure className={`intro-lp-fig ${className ?? ""}`}>
      {url ? (
        <img
          className="intro-lp-img"
          src={url}
          alt={image.alt ?? ""}
          loading="lazy"
          style={style}
        />
      ) : (
        <div className="intro-lp-img-skeleton" style={style} />
      )}
      {image.caption && (
        <figcaption className="intro-lp-caption">{image.caption}</figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// ブロック
// ---------------------------------------------------------------------------

function BlockView({ block, urls }: { block: IntroBlock; urls: UrlMap }) {
  // 未指定は左寄せ。左は既定の見え方なのでクラスを付けない
  const alignClass =
    block.align === "center" ? "is-center" : block.align === "right" ? "is-right" : "";

  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h3 className={`intro-lp-h2 ${alignClass}`}>{block.heading}</h3>
      ) : (
        <h2 className={`intro-lp-h1 ${alignClass}`}>{block.heading}</h2>
      );

    case "text":
      return (
        <div className={alignClass}>
          {block.heading && <h2 className="intro-lp-heading">{block.heading}</h2>}
          {block.body && <p className="intro-lp-text">{block.body}</p>}
        </div>
      );

    case "image":
      return <IntroFigure image={block.image} urls={urls} />;

    case "imageText":
      return (
        <div className={`intro-lp-it ${block.flip ? "flip" : ""}`}>
          <IntroFigure image={block.image} urls={urls} className="intro-lp-it-fig" ratio="4 / 3" />
          <div className="intro-lp-it-body">
            {block.heading && <h2 className="intro-lp-heading">{block.heading}</h2>}
            {block.body && <p className="intro-lp-text">{block.body}</p>}
          </div>
        </div>
      );

    case "gallery":
      return (
        <div className="intro-lp-gallery">
          {(block.images ?? []).map((image, index) => (
            <IntroFigure
              key={`${image.fileId}-${index}`}
              image={image}
              urls={urls}
              className="intro-lp-gallery-item"
              ratio="4 / 3"
            />
          ))}
        </div>
      );

    case "cards":
      return (
        <div>
          {block.heading && <h2 className="intro-lp-heading">{block.heading}</h2>}
          <div className="intro-lp-cards">
            {(block.cards ?? []).map((card) => (
              <div className="intro-lp-card" key={card.id}>
                <h3 className="intro-lp-card-title">{card.title}</h3>
                {card.body && <p className="intro-lp-card-body">{card.body}</p>}
              </div>
            ))}
          </div>
        </div>
      );

    case "stats":
      return (
        <div>
          {block.heading && <h2 className="intro-lp-heading">{block.heading}</h2>}
          <div className="intro-lp-stats">
            {(block.stats ?? []).map((stat) => (
              <div className="intro-lp-stat" key={stat.id}>
                <span className="intro-lp-stat-value">{stat.value}</span>
                <span className="intro-lp-stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case "spacer":
      return <div style={{ height: block.height ?? 48 }} />;
  }
}

// ---------------------------------------------------------------------------
// 帯(背景色が同じブロックをまとめる)
// ---------------------------------------------------------------------------

interface Band {
  tone: IntroTone;
  blocks: IntroBlock[];
}

/**
 * 背景色が同じブロックが続く間を1つの帯にまとめる。
 *
 * ブロックごとに背景を塗ると細かく分断されて落ち着かないので、
 * 「同じ色が続いたら1枚の面」という見せ方にしている。
 */
function toBands(blocks: IntroBlock[]): Band[] {
  const bands: Band[] = [];
  for (const block of blocks) {
    const last = bands[bands.length - 1];
    if (last && last.tone === block.tone) {
      last.blocks.push(block);
    } else {
      bands.push({ tone: block.tone, blocks: [block] });
    }
  }
  return bands;
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

/**
 * 紹介ページの中身。
 *
 * アプリの画面ではなく**ランディングページ**として組んである。
 * 濃いグリーンのヒーロー → 背景色ごとの帯、の縦積み。
 * 各ブロックは、スクロールして見えたときの出方(フェード・スライドなど)を
 * 幹部が選べる。実際の動きは introBody.css の [data-effect] 側にある。
 * 帯の中は12列グリッドで、各ブロックが span 列分の幅を取る。
 * 768px以下では span を無視して必ず1列に積み直す。
 *
 * 同じ内容を3箇所で出すため共通化してある。
 *   - 加入フローの紹介画面(見学者向け。下に「加入する」が付く)
 *   - アプリ内の「サークル紹介」(在籍メンバー向け。全画面で表示する)
 *   - 幹部管理の編集画面のプレビュー
 */
export default function IntroBody({ page }: IntroBodyProps) {
  const [urls, setUrls] = useState<UrlMap>({});

  const fileIds = useMemo(() => collectIntroFileIds(page), [page]);
  const fileKey = fileIds.join(",");

  // 署名URLをまとめて取りに行く。失敗しても文章は表示できる
  useEffect(() => {
    if (fileKey === "") {
      setUrls({});
      return;
    }
    let cancelled = false;
    resolveIntroImageUrls(fileKey.split(",")).then((map) => {
      if (!cancelled) setUrls(map);
    });
    return () => {
      cancelled = true;
    };
  }, [fileKey]);

  const bands = useMemo(() => toBands(page.blocks), [page.blocks]);
  // 出方を変えたらプレビューで再生し直したいので、effect も署名に含める
  const rootRef = useReveal(
    page.blocks
      .map((b) => `${b.id}:${b.effect ?? "up"}:${b.effectDelay ?? 0}`)
      .join(",")
  );

  const heroUrl = page.heroImage?.fileId ? urls[page.heroImage.fileId] : undefined;
  const heroStyle = heroUrl
    ? ({ backgroundImage: `url("${heroUrl}")` } as CSSProperties)
    : undefined;

  return (
    <div className="intro-lp" ref={rootRef}>
      <header className={`intro-lp-hero ${heroUrl ? "has-photo" : ""}`}>
        {/* 写真は背景として敷く。文字を載せるので上から暗い膜をかける */}
        {heroUrl && <div className="intro-lp-hero-photo" style={heroStyle} aria-hidden="true" />}

        <div className="intro-lp-hero-inner">
          {/* ロゴを見出しそのものとして大きく置く。
              public/logo.png は白背景のままなので、背景を抜いた
              logo-mark.png を使う(白い丸で隠す必要がなくなる)。

              背景写真を敷くと絵柄にロゴが埋もれるため、ロゴの裏だけを
              ぼかす。縁はマスクで溶かしてあるので、四角い板には見えない */}
          <div className="intro-lp-mark">
            <span className="intro-lp-mark-blur" aria-hidden="true" />
            <img src="/logo-mark.png" alt="BONDY" className="intro-lp-logo" />
          </div>

          <h1 className="intro-lp-title">{page.title}</h1>
          {page.lead && <p className="intro-lp-lead">{page.lead}</p>}
        </div>

      </header>

      {bands.map((band, index) => (
        <section key={index} className={`intro-lp-band tone-${band.tone}`}>
          <div className="intro-lp-grid">
            {band.blocks.map((block) => (
              <div
                key={block.id}
                className="intro-lp-cell"
                style={
                  {
                    "--span": block.span,
                    "--delay": `${block.effectDelay ?? 0}ms`,
                  } as CSSProperties
                }
                // 出方は幹部が選ぶ。未設定の古いデータは "up" 扱い
                data-effect={block.effect ?? "up"}
              >
                <BlockView block={block} urls={urls} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

import IntroImagePicker from "./introImagePicker";
import type { IntroBlock, IntroEffect, IntroImage, IntroTone } from "../../Types/types";

interface IntroBlockEditorProps {
  block: IntroBlock;
  onUpdate: (patch: Partial<IntroBlock>) => void;
  onImage: (image: IntroImage | null) => void;
  onGalleryAdd: (image: IntroImage) => void;
  onGalleryRemove: (fileId: string) => void;
  onGalleryUpdate: (fileId: string, patch: Partial<IntroImage>) => void;
  onCardAdd: () => void;
  onCardUpdate: (cardId: string, field: "title" | "body", value: string) => void;
  onCardRemove: (cardId: string) => void;
  onStatAdd: () => void;
  onStatUpdate: (statId: string, field: "value" | "label", value: string) => void;
  onStatRemove: (statId: string) => void;
}

/** 横幅のプリセット。12列グリッドなので 12 が全幅 */
const WIDTHS: { label: string; span: number }[] = [
  { label: "全幅", span: 12 },
  { label: "2/3", span: 8 },
  { label: "1/2", span: 6 },
  { label: "1/3", span: 4 },
];

const TONES: { label: string; tone: IntroTone }[] = [
  { label: "白", tone: "plain" },
  { label: "うすい緑", tone: "tint" },
  { label: "濃い緑", tone: "dark" },
];

/** スクロールで見えたときの出方 */
const EFFECTS: { label: string; icon: string; effect: IntroEffect }[] = [
  { label: "なし", icon: "ti-minus", effect: "none" },
  { label: "フェード", icon: "ti-sun-high", effect: "fade" },
  { label: "下から", icon: "ti-arrow-up", effect: "up" },
  { label: "左から", icon: "ti-arrow-right", effect: "left" },
  { label: "右から", icon: "ti-arrow-left", effect: "right" },
  { label: "ズーム", icon: "ti-zoom-in", effect: "zoom" },
];

/** 出るまでの待ち時間。横に並べたブロックを順番に出すのに使う */
const DELAYS: { label: string; delay: number }[] = [
  { label: "すぐ", delay: 0 },
  { label: "少し待つ", delay: 150 },
  { label: "もっと待つ", delay: 300 },
];

/** 文字の寄せ方 */
const ALIGNS: { label: string; icon: string; align: "left" | "center" | "right" }[] = [
  { label: "左", icon: "ti-align-left", align: "left" },
  { label: "中央", icon: "ti-align-center", align: "center" },
  { label: "右", icon: "ti-align-right", align: "right" },
];

/**
 * ブロック1つ分の編集フォーム。
 *
 * 種類ごとに出す項目を変える。共通で出すのは「横幅」と「背景」の2つ。
 * 背景は同じ色が続くと1枚の帯にまとまるので、並んだブロックの色を
 * 揃えると全幅の面として見える(IntroBody の toBands)。
 */
export default function IntroBlockEditor({
  block,
  onUpdate,
  onImage,
  onGalleryAdd,
  onGalleryRemove,
  onGalleryUpdate,
  onCardAdd,
  onCardUpdate,
  onCardRemove,
  onStatAdd,
  onStatUpdate,
  onStatRemove,
}: IntroBlockEditorProps) {
  const heading = (placeholder: string) => (
    <input
      className="intro-edit-input"
      value={block.heading ?? ""}
      onChange={(e) => onUpdate({ heading: e.target.value })}
      placeholder={placeholder}
    />
  );

  const body = (placeholder: string, rows = 4) => (
    <textarea
      className="intro-edit-textarea"
      value={block.body ?? ""}
      onChange={(e) => onUpdate({ body: e.target.value })}
      rows={rows}
      placeholder={placeholder}
    />
  );

  return (
    <div className="intro-block-form">
      {/* ===== 種類ごとの項目 ===== */}

      {block.type === "text" && (
        <>
          {heading("見出し(例: 活動について)")}
          {body("本文。改行はそのまま表示されます")}
        </>
      )}

      {block.type === "heading" && (
        <>
          {heading("大きな見出し")}
          <div className="intro-block-row">
            <label className="intro-block-choice">
              <input
                type="radio"
                checked={block.level !== 2}
                onChange={() => onUpdate({ level: 1 })}
              />
              大きめ
            </label>
            <label className="intro-block-choice">
              <input
                type="radio"
                checked={block.level === 2}
                onChange={() => onUpdate({ level: 2 })}
              />
              小さめ
            </label>
          </div>
        </>
      )}

      {block.type === "image" && (
        <IntroImagePicker image={block.image} onChange={onImage} />
      )}

      {block.type === "imageText" && (
        <>
          <IntroImagePicker image={block.image} onChange={onImage} withCaption={false} />
          {heading("見出し")}
          {body("写真の横に入る文章")}
          <label className="intro-block-choice">
            <input
              type="checkbox"
              checked={block.flip === true}
              onChange={(e) => onUpdate({ flip: e.target.checked })}
            />
            写真を右に置く
          </label>
          <p className="intro-block-hint">
            スマホでは横に並べられないため、写真が上・文章が下になります。
          </p>
        </>
      )}

      {block.type === "gallery" && (
        <>
          <div className="intro-block-gallery">
            {(block.images ?? []).map((image) => (
              <div className="intro-block-gallery-item" key={image.fileId}>
                <IntroImagePicker
                  image={image}
                  onChange={(next) => {
                    if (next) onGalleryUpdate(image.fileId, next);
                    else onGalleryRemove(image.fileId);
                  }}
                />
              </div>
            ))}
          </div>
          <IntroImagePicker
            onChange={(next) => {
              if (next) onGalleryAdd(next);
            }}
            emptyLabel="写真を追加"
          />
        </>
      )}

      {block.type === "cards" && (
        <>
          {heading("見出し(任意)")}
          {(block.cards ?? []).map((card) => (
            <div className="intro-block-sub" key={card.id}>
              <div className="intro-block-sub-head">
                <input
                  className="intro-edit-input"
                  value={card.title}
                  onChange={(e) => onCardUpdate(card.id, "title", e.target.value)}
                  placeholder="カードの見出し(例: ギター)"
                />
                <button
                  type="button"
                  className="intro-edit-icon danger"
                  onClick={() => onCardRemove(card.id)}
                  aria-label="このカードを削除"
                  title="このカードを削除"
                >
                  <i className="ti ti-x" />
                </button>
              </div>
              <textarea
                className="intro-edit-textarea"
                value={card.body}
                onChange={(e) => onCardUpdate(card.id, "body", e.target.value)}
                rows={2}
                placeholder="短い説明"
              />
            </div>
          ))}
          <button type="button" className="intro-edit-add" onClick={onCardAdd}>
            <i className="ti ti-plus" /> カードを追加
          </button>
        </>
      )}

      {block.type === "stats" && (
        <>
          {heading("見出し(任意)")}
          {(block.stats ?? []).map((stat) => (
            <div className="intro-block-sub-head" key={stat.id}>
              <input
                className="intro-edit-input intro-block-stat-value"
                value={stat.value}
                onChange={(e) => onStatUpdate(stat.id, "value", e.target.value)}
                placeholder="40"
              />
              <input
                className="intro-edit-input"
                value={stat.label}
                onChange={(e) => onStatUpdate(stat.id, "label", e.target.value)}
                placeholder="部員数"
              />
              <button
                type="button"
                className="intro-edit-icon danger"
                onClick={() => onStatRemove(stat.id)}
                aria-label="この数字を削除"
                title="この数字を削除"
              >
                <i className="ti ti-x" />
              </button>
            </div>
          ))}
          <button type="button" className="intro-edit-add" onClick={onStatAdd}>
            <i className="ti ti-plus" /> 数字を追加
          </button>
        </>
      )}

      {block.type === "spacer" && (
        <label className="intro-block-slider">
          <span>余白の高さ {block.height ?? 48}px</span>
          <input
            type="range"
            min={8}
            max={160}
            step={8}
            value={block.height ?? 48}
            onChange={(e) => onUpdate({ height: Number(e.target.value) })}
          />
        </label>
      )}

      {/* ===== どの種類でも出す項目 ===== */}
      <div className="intro-block-common">
        <div className="intro-block-field">
          <span className="intro-block-field-label">横幅</span>
          <div className="intro-block-row">
            {WIDTHS.map((w) => (
              <button
                key={w.span}
                type="button"
                className={`intro-block-chip ${block.span === w.span ? "is-on" : ""}`}
                onClick={() => onUpdate({ span: w.span })}
              >
                {w.label}
              </button>
            ))}
          </div>
          <p className="intro-block-hint">
            半分にしたブロックを2つ並べると、横に並びます。スマホでは必ず縦1列になります。
          </p>
        </div>

        <div className="intro-block-field">
          <span className="intro-block-field-label">背景</span>
          <div className="intro-block-row">
            {TONES.map((t) => (
              <button
                key={t.tone}
                type="button"
                className={`intro-block-chip tone-${t.tone} ${
                  block.tone === t.tone ? "is-on" : ""
                }`}
                onClick={() => onUpdate({ tone: t.tone })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="intro-block-hint">
            同じ背景のブロックが続くと、1枚の帯としてつながって表示されます。
          </p>
        </div>

        <div className="intro-block-field">
          <span className="intro-block-field-label">出方</span>
          <div className="intro-block-row">
            {EFFECTS.map((e) => (
              <button
                key={e.effect}
                type="button"
                className={`intro-block-chip ${
                  (block.effect ?? "up") === e.effect ? "is-on" : ""
                }`}
                onClick={() => onUpdate({ effect: e.effect })}
              >
                <i className={`ti ${e.icon}`} /> {e.label}
              </button>
            ))}
          </div>
          <p className="intro-block-hint">
            スクロールしてこのブロックが見えたときの動きです。プレビューでも試せます。
            端末側で「視差効果を減らす」を有効にしている人には、動かさず最初から表示されます。
          </p>
        </div>

        {(block.effect ?? "up") !== "none" && (
          <div className="intro-block-field">
            <span className="intro-block-field-label">出るタイミング</span>
            <div className="intro-block-row">
              {DELAYS.map((d) => (
                <button
                  key={d.delay}
                  type="button"
                  className={`intro-block-chip ${
                    (block.effectDelay ?? 0) === d.delay ? "is-on" : ""
                  }`}
                  onClick={() => onUpdate({ effectDelay: d.delay })}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="intro-block-hint">
              横に並べたブロックの待ち時間をずらすと、左から順に出てくるように見せられます。
            </p>
          </div>
        )}

        {block.type !== "spacer" && (
          <div className="intro-block-field">
            <span className="intro-block-field-label">文字の位置</span>
            <div className="intro-block-row">
              {ALIGNS.map((a) => (
                <button
                  key={a.align}
                  type="button"
                  className={`intro-block-chip ${
                    (block.align ?? "left") === a.align ? "is-on" : ""
                  }`}
                  onClick={() => onUpdate({ align: a.align })}
                >
                  <i className={`ti ${a.icon}`} /> {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

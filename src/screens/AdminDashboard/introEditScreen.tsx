import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./introEditScreen.css";
import { useIntroEdit } from "./useIntroEdit";
import IntroBlockEditor from "./introBlockEditor";
import IntroImagePicker from "./introImagePicker";
import IntroBody from "../Intro/IntroBody";
import { BLOCK_LABELS } from "../../lib/introPage";
import type { IntroBlock, IntroBlockType } from "../../Types/types";

/** 種類ごとのアイコン(Tabler Icons) */
const BLOCK_ICONS: Record<IntroBlockType, string> = {
  text: "ti-align-left",
  heading: "ti-heading",
  image: "ti-photo",
  imageText: "ti-layout-columns",
  gallery: "ti-layout-grid",
  cards: "ti-cards",
  stats: "ti-chart-bar",
  spacer: "ti-arrows-vertical",
};

/** 追加メニューに並べる順番 */
const ADD_ORDER: IntroBlockType[] = [
  "text",
  "heading",
  "image",
  "imageText",
  "gallery",
  "cards",
  "stats",
  "spacer",
];

/** 一覧に出す1行ぶんの要約 */
function summarize(block: IntroBlock): string {
  switch (block.type) {
    case "spacer":
      return `${block.height ?? 48}px`;
    case "image":
      return block.image?.fileId ? block.image.caption || "写真1枚" : "写真が未設定";
    case "gallery":
      return `写真 ${(block.images ?? []).length}枚`;
    case "cards":
      return block.heading?.trim() || `カード ${(block.cards ?? []).length}枚`;
    case "stats":
      return block.heading?.trim() || `数字 ${(block.stats ?? []).length}個`;
    default:
      return block.heading?.trim() || block.body?.trim().slice(0, 32) || "(空)";
  }
}

/** 横幅のバッジ表示 */
function spanLabel(span: number): string {
  if (span >= 12) return "全幅";
  if (span === 8) return "2/3";
  if (span === 6) return "1/2";
  if (span === 4) return "1/3";
  return `${span}/12`;
}

/**
 * サークル紹介の編集(幹部のみ)
 *
 * ブロックを積んでページを組み立てる。コードを触らずに、写真も文章も
 * 幹部が差し替えられるようにするための画面。
 *
 * 並べ替えはドラッグ(PC)と上下ボタン(スマホでも使える)の両方を用意してある。
 * HTML標準のドラッグはタッチ端末では発火しないため、両方必要。
 */
export default function IntroEditScreen() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const edit = useIntroEdit();

  if (edit.loading) {
    return <div className="intro-edit-content">読み込み中...</div>;
  }

  const handleDrop = (targetId: string) => {
    if (dragId) edit.reorderBlock(dragId, targetId);
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="intro-edit-content">
      <button className="intro-edit-back" onClick={() => navigate("/admin")}>
        <i className="ti ti-arrow-left" /> 幹部管理に戻る
      </button>

      <div className="intro-edit-header">
        <div>
          <h2 className="intro-edit-title">サークル紹介の編集</h2>
          <p className="intro-edit-desc">
            アカウントを作ったばかりの人に最初に見せるページで、部員は「サークル紹介」から見られます。
            {edit.updatedAt && (
              <span className="intro-edit-updated">
                　最終更新:{edit.updatedAt.slice(0, 10)}
              </span>
            )}
          </p>
        </div>
        <button
          className="intro-edit-preview-toggle"
          onClick={() => setPreview((p) => !p)}
        >
          <i className={`ti ${preview ? "ti-pencil" : "ti-eye"}`} />
          {preview ? "編集に戻る" : "プレビュー"}
        </button>
      </div>

      {preview ? (
        <div className="intro-edit-preview">
          {/* 実際の紹介ページと同じ描画を使う(見た目がずれないように) */}
          <IntroBody
            page={{
              title: edit.title,
              lead: edit.lead,
              heroImage: edit.heroImage,
              blocks: edit.blocks,
            }}
          />
        </div>
      ) : (
        <>
          {/* ===== ページの先頭 ===== */}
          <div className="intro-edit-group">
            <p className="intro-edit-group-label">ページの先頭</p>

            <div className="intro-edit-field">
              <label className="intro-edit-label">タイトル</label>
              <input
                className="intro-edit-input"
                value={edit.title}
                onChange={(e) => edit.setTitle(e.target.value)}
                placeholder="例: BONDYへようこそ"
              />
            </div>

            <div className="intro-edit-field">
              <label className="intro-edit-label">
                リード文
                <span className="intro-edit-optional">任意</span>
              </label>
              <textarea
                className="intro-edit-textarea"
                value={edit.lead}
                onChange={(e) => edit.setLead(e.target.value)}
                rows={3}
                placeholder="サークルの一言説明"
              />
            </div>

            <div className="intro-edit-field">
              <label className="intro-edit-label">
                背景写真
                <span className="intro-edit-optional">任意</span>
              </label>
              <IntroImagePicker
                image={edit.heroImage}
                onChange={edit.changeHeroImage}
                withCaption={false}
                emptyLabel="先頭に敷く写真を選ぶ"
              />
              <p className="intro-block-hint">
                文字を載せるので、上から暗い膜がかかります。人の顔が中央に寄った写真は避けてください。
              </p>
            </div>
          </div>

          {/* ===== ブロック ===== */}
          <div className="intro-edit-group">
            <p className="intro-edit-group-label">
              ブロック
              <span className="intro-edit-group-hint">
                左の持ち手をドラッグすると並べ替えられます
              </span>
            </p>

            {edit.blocks.length === 0 && (
              <p className="intro-edit-empty">
                ブロックがありません。下から追加してください。
              </p>
            )}

            {edit.blocks.map((block, index) => {
              const open = edit.openId === block.id;
              return (
                <div
                  key={block.id}
                  className={`intro-block ${open ? "is-open" : ""} ${
                    overId === block.id ? "is-over" : ""
                  } ${dragId === block.id ? "is-dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverId(block.id);
                  }}
                  onDragLeave={() => setOverId((c) => (c === block.id ? null : c))}
                  onDrop={() => handleDrop(block.id)}
                >
                  <div className="intro-block-head">
                    {/* 持ち手だけをドラッグ対象にする。
                        行全体を draggable にすると、中の入力欄で
                        文字を選択できなくなるため */}
                    <span
                      className="intro-block-grip"
                      draggable
                      onDragStart={() => setDragId(block.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                      }}
                      title="ドラッグして並べ替え"
                    >
                      <i className="ti ti-grip-vertical" />
                    </span>

                    <button
                      type="button"
                      className="intro-block-summary"
                      onClick={() => edit.setOpenId(open ? null : block.id)}
                    >
                      <i className={`ti ${BLOCK_ICONS[block.type]} intro-block-icon`} />
                      <span className="intro-block-kind">{BLOCK_LABELS[block.type]}</span>
                      <span className="intro-block-text">{summarize(block)}</span>
                      <span className={`intro-block-badge tone-${block.tone}`}>
                        {spanLabel(block.span)}
                      </span>
                      <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"}`} />
                    </button>

                    <div className="intro-block-actions">
                      <button
                        className="intro-edit-icon"
                        onClick={() => edit.moveBlock(block.id, -1)}
                        disabled={index === 0}
                        aria-label="上へ"
                        title="上へ"
                      >
                        <i className="ti ti-arrow-up" />
                      </button>
                      <button
                        className="intro-edit-icon"
                        onClick={() => edit.moveBlock(block.id, 1)}
                        disabled={index === edit.blocks.length - 1}
                        aria-label="下へ"
                        title="下へ"
                      >
                        <i className="ti ti-arrow-down" />
                      </button>
                      <button
                        className="intro-edit-icon"
                        onClick={() => edit.duplicateBlock(block.id)}
                        aria-label="複製"
                        title="複製"
                      >
                        <i className="ti ti-copy" />
                      </button>
                      <button
                        className="intro-edit-icon danger"
                        onClick={() => edit.removeBlock(block.id)}
                        aria-label="削除"
                        title="削除"
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  </div>

                  {open && (
                    <IntroBlockEditor
                      block={block}
                      onUpdate={(patch) => edit.updateBlock(block.id, patch)}
                      onImage={(image) => void edit.setBlockImage(block.id, image)}
                      onGalleryAdd={(image) => edit.addGalleryImage(block.id, image)}
                      onGalleryRemove={(fileId) =>
                        void edit.removeGalleryImage(block.id, fileId)
                      }
                      onGalleryUpdate={(fileId, patch) =>
                        edit.updateGalleryImage(block.id, fileId, patch)
                      }
                      onCardAdd={() => edit.addCard(block.id)}
                      onCardUpdate={(cardId, field, value) =>
                        edit.updateCard(block.id, cardId, field, value)
                      }
                      onCardRemove={(cardId) => edit.removeCard(block.id, cardId)}
                      onStatAdd={() => edit.addStat(block.id)}
                      onStatUpdate={(statId, field, value) =>
                        edit.updateStat(block.id, statId, field, value)
                      }
                      onStatRemove={(statId) => edit.removeStat(block.id, statId)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* ===== 追加 ===== */}
          <div className="intro-edit-group">
            <p className="intro-edit-group-label">ブロックを追加</p>
            <div className="intro-add-grid">
              {ADD_ORDER.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="intro-add-btn"
                  onClick={() => edit.addBlock(type)}
                >
                  <i className={`ti ${BLOCK_ICONS[type]}`} />
                  {BLOCK_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="intro-edit-actions">
        <button
          className="intro-edit-save"
          onClick={() => void edit.save()}
          disabled={edit.saving}
        >
          {edit.saving ? "保存中..." : "保存する"}
        </button>
        <p className="intro-edit-note">
          保存するとすぐに反映されます。中身が空のブロックは保存されません。
          写真は選んだ時点でアップロードされるので、保存前でも差し替えは反映されています。
        </p>
      </div>
    </div>
  );
}

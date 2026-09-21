import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./archiveEditScreen.css";
import { useArchiveEdit } from "./useArchiveEdit";
import type { ItemForm } from "./useArchiveEdit";
import { youtubeThumbUrl } from "../../lib/archive";
import type { ArchiveItem } from "../../Types/types";

const EMPTY_FORM: ItemForm = {
  kind: "video",
  url: "",
  title: "",
  bandId: "",
  note: "",
};

/**
 * アーカイブの登録・編集(幹部のみ)
 *
 * 新規作成のときはイベントの情報だけを入力させる。映像はイベントが
 * 保存されてから追加する(イベントIDが無いと紐づけられないため)。
 */
export default function ArchiveEditScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const edit = useArchiveEdit(id);

  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (edit.loading) {
    return <div className="aedit-content">読み込み中...</div>;
  }

  const isNew = !edit.event;

  const patch = (change: Partial<ItemForm>) =>
    setForm((prev) => ({ ...prev, ...change }));

  const handleSaveEvent = async () => {
    const savedId = await edit.save();
    if (savedId && isNew) navigate(`/archive/${savedId}/edit`, { replace: true });
  };

  const handleDeleteEvent = async () => {
    const removed = await edit.removeEvent();
    if (removed) navigate("/archive", { replace: true });
  };

  const startEdit = (item: ArchiveItem) => {
    setEditingId(item.id);
    setForm({
      kind: item.kind,
      // 保存してあるのは動画IDだけ。そのまま貼り直せる形に戻す
      url: `https://www.youtube.com/watch?v=${item.youtubeId}`,
      title: item.title,
      bandId: item.bandId ?? "",
      note: item.note ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmitItem = async () => {
    const ok = editingId
      ? await edit.editItem(editingId, form)
      : await edit.addItem(form);
    if (ok) cancelEdit();
  };

  return (
    <div className="aedit-content">
      <button
        className="aedit-back"
        onClick={() => navigate(isNew ? "/archive" : `/archive/${id}`)}
      >
        <i className="ti ti-arrow-left" />
        {isNew ? "アーカイブに戻る" : "イベントに戻る"}
      </button>

      <h2 className="aedit-title">
        {isNew ? "イベントを追加" : "イベントの編集"}
      </h2>

      {/* ===== イベントの情報 ===== */}
      <div className="aedit-group">
        <div className="aedit-field">
          <label className="aedit-label">イベント名</label>
          <input
            className="aedit-input"
            value={edit.title}
            onChange={(e) => edit.setTitle(e.target.value)}
            placeholder="例: 2026年度 新歓ライブ"
          />
        </div>

        <div className="aedit-row">
          <div className="aedit-field">
            <label className="aedit-label">開催日</label>
            <input
              className="aedit-input"
              type="date"
              value={edit.date}
              onChange={(e) => edit.setDate(e.target.value)}
            />
          </div>

          <div className="aedit-field">
            <label className="aedit-label">
              会場<span className="aedit-optional">任意</span>
            </label>
            <input
              className="aedit-input"
              value={edit.venue}
              onChange={(e) => edit.setVenue(e.target.value)}
              placeholder="例: 学内ホール"
            />
          </div>
        </div>

        <div className="aedit-field">
          <label className="aedit-label">
            メモ<span className="aedit-optional">任意</span>
          </label>
          <textarea
            className="aedit-textarea"
            value={edit.note}
            onChange={(e) => edit.setNote(e.target.value)}
            rows={3}
            placeholder="当日の様子など。改行はそのまま表示されます"
          />
        </div>

        <div className="aedit-actions">
          <button
            className="aedit-save"
            onClick={() => void handleSaveEvent()}
            disabled={edit.saving}
          >
            {edit.saving ? "保存中..." : isNew ? "作成する" : "保存する"}
          </button>

          {edit.event && (
            <button
              className="aedit-ghost"
              onClick={() => void edit.toggleEventHidden()}
            >
              <i className={`ti ${edit.event.hidden ? "ti-eye" : "ti-eye-off"}`} />
              {edit.event.hidden ? "一覧に戻す" : "一覧から隠す"}
            </button>
          )}
        </div>
      </div>

      {/* ===== 映像・音源 ===== */}
      {isNew ? (
        <p className="aedit-hint">
          映像・音源は、イベントを作成したあとに追加できます。
        </p>
      ) : (
        <>
          <div className="aedit-group">
            <p className="aedit-group-label">
              映像・音源
              <span className="aedit-group-hint">
                上から順に表示されます（セットリスト順）
              </span>
            </p>

            {edit.items.length === 0 && (
              <p className="aedit-hint">まだ登録されていません。</p>
            )}

            {edit.items.map((item, index) => (
              <div
                className={`aedit-item ${item.hidden ? "is-hidden" : ""}`}
                key={item.id}
              >
                <img
                  className="aedit-item-thumb"
                  src={youtubeThumbUrl(item.youtubeId)}
                  alt=""
                  loading="lazy"
                />

                <div className="aedit-item-main">
                  <span className="aedit-item-title">
                    <i
                      className={`ti ${
                        item.kind === "audio" ? "ti-music" : "ti-video"
                      }`}
                    />
                    {item.title}
                    {item.hidden && <span className="aedit-badge">非表示</span>}
                  </span>
                  <span className="aedit-item-meta">
                    {item.bandId
                      ? edit.bands.find((b) => b.id === item.bandId)?.name ??
                        "（削除されたバンド）"
                      : "バンド紐づけなし"}
                  </span>
                </div>

                <div className="aedit-item-actions">
                  <button
                    className="aedit-icon"
                    onClick={() => void edit.moveItem(item.id, -1)}
                    disabled={index === 0}
                    aria-label="上へ"
                    title="上へ"
                  >
                    <i className="ti ti-arrow-up" />
                  </button>
                  <button
                    className="aedit-icon"
                    onClick={() => void edit.moveItem(item.id, 1)}
                    disabled={index === edit.items.length - 1}
                    aria-label="下へ"
                    title="下へ"
                  >
                    <i className="ti ti-arrow-down" />
                  </button>
                  <button
                    className="aedit-icon"
                    onClick={() => startEdit(item)}
                    aria-label="編集"
                    title="編集"
                  >
                    <i className="ti ti-pencil" />
                  </button>
                  <button
                    className="aedit-icon"
                    onClick={() => void edit.toggleItemHidden(item)}
                    aria-label={item.hidden ? "表示に戻す" : "非表示にする"}
                    title={item.hidden ? "表示に戻す" : "非表示にする"}
                  >
                    <i className={`ti ${item.hidden ? "ti-eye" : "ti-eye-off"}`} />
                  </button>
                  <button
                    className="aedit-icon danger"
                    onClick={() => void edit.removeItem(item)}
                    aria-label="削除"
                    title="削除"
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ===== 追加・編集フォーム ===== */}
          <div className="aedit-group">
            <p className="aedit-group-label">
              {editingId ? "映像・音源を編集" : "映像・音源を追加"}
            </p>

            <div className="aedit-field">
              <label className="aedit-label">YouTubeのURL</label>
              <input
                className="aedit-input"
                value={form.url}
                onChange={(e) => patch({ url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <p className="aedit-hint">
                <strong>限定公開</strong>にしてください。非公開だとアプリ内で再生できません。
                youtu.be の短縮URLや動画IDだけでも受け付けます。
              </p>
            </div>

            <div className="aedit-field">
              <label className="aedit-label">タイトル</label>
              <input
                className="aedit-input"
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="例: 1曲目 / バンド名 - 曲名"
              />
            </div>

            <div className="aedit-row">
              <div className="aedit-field">
                <label className="aedit-label">種類</label>
                <select
                  className="aedit-input"
                  value={form.kind}
                  onChange={(e) =>
                    patch({ kind: e.target.value === "audio" ? "audio" : "video" })
                  }
                >
                  <option value="video">映像</option>
                  <option value="audio">音源</option>
                </select>
              </div>

              <div className="aedit-field">
                <label className="aedit-label">
                  バンド<span className="aedit-optional">任意</span>
                </label>
                <select
                  className="aedit-input"
                  value={form.bandId}
                  onChange={(e) => patch({ bandId: e.target.value })}
                >
                  <option value="">紐づけない</option>
                  {edit.bands.map((band) => (
                    <option key={band.id} value={band.id}>
                      {band.name}
                      {band.dissolved ? "（解散）" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="aedit-field">
              <label className="aedit-label">
                メモ<span className="aedit-optional">任意</span>
              </label>
              <input
                className="aedit-input"
                value={form.note}
                onChange={(e) => patch({ note: e.target.value })}
                placeholder="補足があれば"
              />
            </div>

            <div className="aedit-actions">
              <button
                className="aedit-save"
                onClick={() => void handleSubmitItem()}
              >
                {editingId ? "更新する" : "追加する"}
              </button>
              {editingId && (
                <button className="aedit-ghost" onClick={cancelEdit}>
                  やめる
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <p className="aedit-note">
        バンドを紐づけると、そのバンドの詳細画面から過去の演奏を辿れるようになります。
        記録を残したまま一覧から外したいときは、削除ではなく「非表示」を使ってください。
      </p>

      {/* 作成し間違えたイベントを取り消すための操作。
          普段使うものではないので、保存から離して末尾に置く */}
      {edit.event && (
        <div className="aedit-danger">
          <div className="aedit-danger-text">
            <span className="aedit-danger-title">このイベントを削除</span>
            <span className="aedit-danger-desc">
              登録した映像・音源の記録も一緒に消えます。元に戻せません。
              YouTube上の動画そのものは消えません。
            </span>
          </div>
          <button
            className="aedit-danger-btn"
            onClick={() => void handleDeleteEvent()}
            disabled={edit.saving}
          >
            <i className="ti ti-trash" /> 削除する
          </button>
        </div>
      )}
    </div>
  );
}

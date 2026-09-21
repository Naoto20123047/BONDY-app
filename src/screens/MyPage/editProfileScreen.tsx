import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./editProfileScreen.css";
import { useEditProfile } from "./useEditProfile";
import { calcGrade } from "../../lib/grade";
import { PART_OPTIONS } from "../../lib/parts";
import { AVATAR_COLORS, avatarStyle } from "../../lib/avatarColors";

export default function EditProfileScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    member,
    parts,
    toggle,
    nickname,
    setNickname,
    avatarColor,
    setAvatarColor,
    imageDataUrl,
    pickImage,
    clearImage,
    imageError,
    processingImage,
    loading,
    saving,
    save,
  } = useEditProfile();

  if (loading || !member) {
    return <div className="edit-content">読み込み中...</div>;
  }

  return (
    <div className="edit-content">
      <button className="edit-back" onClick={() => navigate("/mypage")}>
        <i className="ti ti-arrow-left" /> マイページに戻る
      </button>

      <h2 className="edit-title">プロフィール編集</h2>

      {/* アイコン画像 */}
      <div className="edit-field">
        <label className="edit-label">アイコン</label>
        <div className="edit-avatar-row">
          <div
            className="edit-avatar-preview"
            style={imageDataUrl ? undefined : avatarStyle(avatarColor)}
          >
            {imageDataUrl ? (
              <img src={imageDataUrl} alt="" className="edit-avatar-img" />
            ) : (
              member.name.charAt(0)
            )}
          </div>

          <div className="edit-avatar-buttons">
            <button
              type="button"
              className="edit-image-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={processingImage}
            >
              <i className="ti ti-photo" />
              {processingImage ? "処理中..." : imageDataUrl ? "画像を変更" : "画像を設定"}
            </button>

            {imageDataUrl && (
              <button type="button" className="edit-image-btn" onClick={clearImage}>
                <i className="ti ti-trash" /> 画像を外す
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="edit-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) pickImage(file);
                // 同じファイルを選び直せるように値を戻す
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {imageError && <p className="edit-image-error">{imageError}</p>}

        <p className="edit-note">
          中央を正方形に切り出し、長辺256pxまで縮小して保存します。撮影日時や位置情報は保存時に取り除かれます。
        </p>
      </div>

      {/* アイコンの色(画像未設定時のフォールバック) */}
      <div className="edit-field">
        <label className="edit-label">アイコンの色</label>
        <div className="edit-colors">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`edit-color ${avatarColor === c.id ? "selected" : ""}`}
              style={{ background: c.bg, borderColor: avatarColor === c.id ? c.text : undefined }}
              onClick={() => setAvatarColor(c.id)}
              aria-label={c.label}
              title={c.label}
            >
              {avatarColor === c.id && (
                <i className="ti ti-check" style={{ color: c.text }} />
              )}
            </button>
          ))}
        </div>
        <p className="edit-note">画像を設定していないときに使われます。</p>
      </div>

      <div className="edit-field">
        <label className="edit-label">氏名</label>
        <input className="edit-input" value={member.name} disabled />
      </div>

      <div className="edit-field">
        <label className="edit-label">ニックネーム(任意)</label>
        <input
          className="edit-input editable"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="例: たろ"
          maxLength={20}
        />
      </div>

      <div className="edit-field">
        <label className="edit-label">学部</label>
        <input className="edit-input" value={member.faculty} disabled />
      </div>

      <div className="edit-field">
        <label className="edit-label">学籍番号</label>
        <input className="edit-input" value={member.studentId} disabled />
      </div>

      <div className="edit-field">
        <label className="edit-label">入学年度 / 学年</label>
        <input
          className="edit-input"
          value={`${member.enrollmentYear}年度入学(${calcGrade(member.enrollmentYear, member.isOB)})`}
          disabled
        />
      </div>

      <div className="edit-field">
        <label className="edit-label">パート(複数選択可)</label>
        <div className="edit-parts">
          {PART_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              className={`edit-part ${parts.includes(p) ? "selected" : ""}`}
              onClick={() => toggle(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="edit-note">
          担当が複数ある場合は、すべて選択してください。担当がない場合は「なし」を選んでください。
        </p>
      </div>

      <div className="edit-actions">
        <button
          className="edit-save"
          onClick={() => save(() => navigate("/mypage"))}
          disabled={saving || processingImage}
        >
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
}

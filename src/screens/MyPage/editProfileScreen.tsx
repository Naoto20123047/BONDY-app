import { useNavigate } from "react-router-dom";
import "./editProfileScreen.css";
import { useEditProfile } from "./useEditProfile";
import { calcGrade } from "../../lib/grade";
import { PART_OPTIONS } from "../../lib/parts";
import { AVATAR_COLORS, avatarStyle } from "../../lib/avatarColors";

export default function EditProfileScreen() {
  const navigate = useNavigate();
  const {
    member,
    parts,
    toggle,
    nickname,
    setNickname,
    avatarColor,
    setAvatarColor,
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

      {/* アイコンのプレビューと色選択 */}
      <div className="edit-field">
        <label className="edit-label">アイコンの色</label>
        <div className="edit-avatar-row">
          <div className="edit-avatar-preview" style={avatarStyle(avatarColor)}>
            {member.name.charAt(0)}
          </div>
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
        </div>
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
          disabled={saving}
        >
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
}
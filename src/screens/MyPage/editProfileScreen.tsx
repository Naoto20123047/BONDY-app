import { useNavigate } from "react-router-dom";
import "./editProfileScreen.css";
import { useEditProfile } from "./useEditProfile";
import { calcGrade } from "../../lib/grade";

export default function EditProfileScreen() {
  const navigate = useNavigate();
  const { member, part, setPart, nickname, setNickname, loading, saving, save } = useEditProfile();

  if (loading || !member) {
    return <div className="edit-content">読み込み中...</div>;
  }

  return (
    <div className="edit-content">
      <button className="edit-back" onClick={() => navigate("/mypage")}>
        <i className="ti ti-arrow-left" /> マイページに戻る
      </button>

      <h2 className="edit-title">プロフィール編集</h2>

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
        <label className="edit-label">パート</label>
        <input
          className="edit-input editable"
          value={part}
          onChange={(e) => setPart(e.target.value)}
          placeholder="例: Vo/Gt"
        />
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
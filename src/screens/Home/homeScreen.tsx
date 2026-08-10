import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./homeScreen.css";
import { useHome } from "./useHome";
import { useNotifications } from "../../lib/useNotifications";
import { calcGrade } from "../../lib/grade";

// ホームのあいさつ文言(開くたびにランダムで1つ表示)
const GREETINGS = [
  "チューニングは合ってますか？",
  "練習してますか？",
  "授業課題は終わってますか？",
  "単位は足りてますか？",
  "ちゃんと寝てますか？",
  "お疲れさまです！",
  "レポートの締切、大丈夫？",
  "次のライブの準備は順調？",
  "ようこそ",
  "出席は足りてますか？",
];

export default function HomeScreen() {
  const navigate = useNavigate();
  const {
    member,
    pendingForms,
    pendingApprovals,
    bandCount,
    duesPaid,
    isOfficer,
    loading,
  } = useHome();
  const { notifications, markAsRead } = useNotifications();

  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    []
  );

  if (loading || !member) {
    return <div className="home-content">読み込み中...</div>;
  }

  const unread = notifications.filter((n) => !n.read);

  const handleNotice = (id: string, link: string) => {
    markAsRead(id);
    navigate(link);
  };

  return (
    <div className="home-content">
      <p className="home-greeting">{member.name}さん、{greeting}</p>
      <p className="home-subtitle">
        {member.faculty}・{calcGrade(member.enrollmentYear, member.isOB)}
        {member.positions.length > 0 ? ` ・ ${member.positions.join(" ")}` : ""}
      </p>

      <div className="home-stats">
        <div className="home-stat">
          <p className="home-stat-label">会費状況</p>
          <p className="home-stat-value">{duesPaid ? "納入済み" : "未納"}</p>
        </div>
        <div className="home-stat">
          <p className="home-stat-label">所属バンド</p>
          <p className="home-stat-value">{bandCount}件</p>
        </div>
        {isOfficer && (
          <div className="home-stat">
            <p className="home-stat-label">承認待ちの申請</p>
            <p className="home-stat-value accent">{pendingApprovals}件</p>
          </div>
        )}
      </div>

      <div className="home-columns">
        <div className="home-col-main">
          <p className="home-section-label">未回答のフォーム</p>
          {pendingForms.length === 0 ? (
            <p className="home-empty">未回答のフォームはありません</p>
          ) : (
            <div className="home-form-list">
              {pendingForms.map((f) => (
                <button
                  key={f.id}
                  className="home-form-item"
                  onClick={() => navigate(`/forms/${f.id}`)}
                >
                  <span className="home-form-title">{f.title}</span>
                  <span className="home-form-deadline">
                    <i className="ti ti-clock" style={{ marginRight: 4 }} />
                    {f.deadline}締切
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="home-col-side">
          <p className="home-section-label">お知らせ</p>
          {unread.length === 0 ? (
            <p className="home-empty">新しいお知らせはありません</p>
          ) : (
            unread.map((n) => (
              <button
                key={n.id}
                className="home-notice"
                onClick={() => handleNotice(n.id, n.link)}
              >
                {n.message}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
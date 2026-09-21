import { useNavigate } from "react-router-dom";
import "./userHistoryScreen.css";
import { useUserHistory } from "./useUserHistory";

export default function UserHistoryScreen() {
  const navigate = useNavigate();
  const { members, loading, deletePermanently } = useUserHistory();

  if (loading) {
    return <div className="history-content">読み込み中...</div>;
  }

  return (
    <div className="history-content">
      <button className="history-back" onClick={() => navigate("/admin")}>
        <i className="ti ti-arrow-left" /> 幹部管理に戻る
      </button>

      <h2 className="history-title">ユーザー履歴</h2>
      <p className="history-desc">
        在籍していないメンバーの記録です。氏名をクリックすると部員詳細が開き、そこから在籍中に戻せます。
        完全削除すると元に戻せません。
      </p>

      {members.length === 0 ? (
        <p className="history-empty">退会・除籍したメンバーはいません</p>
      ) : (
        <div className="history-list">
          {members.map((m) => (
            <div key={m.id} className="history-item">
              <div className="history-avatar">{m.name.charAt(0)}</div>

              <button
                className="history-info"
                onClick={() => navigate(`/roster/${m.id}`)}
              >
                <span className="history-name">
                  {m.name}
                  <span
                    className={`history-badge ${
                      m.status === "expelled" ? "expelled" : "withdrawn"
                    }`}
                  >
                    {m.status === "expelled" ? "除籍" : "退会"}
                  </span>
                </span>
                <span className="history-meta">
                  {m.studentId} ・ {m.faculty} ・ {m.gradeLabel}
                </span>
                <span className="history-date">
                  {m.status === "expelled" ? "除籍日" : "退会日"}:
                  {m.leftAt || "不明"}
                </span>
              </button>

              <button
                className="history-delete"
                onClick={() => deletePermanently(m.id)}
              >
                <i className="ti ti-trash" /> 完全削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

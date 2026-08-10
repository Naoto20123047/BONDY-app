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

      <h2 className="history-title">ユーザー履歴(退会済み)</h2>
      <p className="history-desc">
        退会したメンバーの記録です。完全削除すると、関連データも含めて元に戻せません。
      </p>

      {members.length === 0 ? (
        <p className="history-empty">退会済みのメンバーはいません</p>
      ) : (
        <div className="history-list">
          {members.map((m) => (
            <div key={m.id} className="history-item">
              <div className="history-avatar">{m.name.charAt(0)}</div>
              <div className="history-info">
                <span className="history-name">{m.name}</span>
                <span className="history-meta">
                  {m.studentId} ・ {m.faculty} ・ {m.gradeLabel}
                </span>
                <span className="history-date">退会日:{m.withdrawnAt}</span>
              </div>
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
import { useNavigate } from "react-router-dom";
import "./equipmentRequestsScreen.css";
import { useEquipmentRequests, type RequestView } from "./useEquipmentRequests";

export default function EquipmentRequestsScreen() {
  const navigate = useNavigate();
  const { pending, lent, reported, loading, approve, reject, confirmReturn } =
    useEquipmentRequests();

  if (loading) {
    return <div className="eqr-content">読み込み中...</div>;
  }

  const renderInfo = (r: RequestView) => (
    <div className="eqr-info">
      <span className="eqr-equipment">
        {r.equipmentName} <span className="eqr-qty">×{r.quantity}</span>
      </span>
      <span className="eqr-meta">
        <i className="ti ti-user" /> {r.memberName} ・{" "}
        <span className={r.overdue ? "eqr-overdue" : ""}>
          {r.overdue ? "延滞中" : `返却予定 ${r.dueDate}`}
        </span>
      </span>
    </div>
  );

  return (
    <div className="eqr-content">
      <button className="eqr-back" onClick={() => navigate("/equipment")}>
        <i className="ti ti-arrow-left" /> 機材一覧に戻る
      </button>

      <h2 className="eqr-title">貸出申請の管理</h2>

      {/* 承認待ち */}
      <div className="eqr-section">
        <p className="eqr-section-label">承認待ち({pending.length})</p>
        {pending.length === 0 ? (
          <p className="eqr-empty">承認待ちの申請はありません</p>
        ) : (
          pending.map((r) => (
            <div key={r.id} className="eqr-card">
              {renderInfo(r)}
              <div className="eqr-actions">
                <button className="eqr-approve" onClick={() => approve(r.id)}>承認</button>
                <button className="eqr-reject" onClick={() => reject(r.id)}>却下</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 返却報告済み(確認待ち) */}
      <div className="eqr-section">
        <p className="eqr-section-label">返却確認待ち({reported.length})</p>
        {reported.length === 0 ? (
          <p className="eqr-empty">返却確認待ちはありません</p>
        ) : (
          reported.map((r) => (
            <div key={r.id} className="eqr-card">
              {renderInfo(r)}
              <div className="eqr-actions">
                <button className="eqr-approve" onClick={() => confirmReturn(r.id)}>
                  返却を確認
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 貸出中 */}
      <div className="eqr-section">
        <p className="eqr-section-label">貸出中({lent.length})</p>
        {lent.length === 0 ? (
          <p className="eqr-empty">貸出中の機材はありません</p>
        ) : (
          lent.map((r) => (
            <div key={r.id} className="eqr-card static">
              {renderInfo(r)}
              {r.overdue && <span className="eqr-badge-overdue">延滞</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
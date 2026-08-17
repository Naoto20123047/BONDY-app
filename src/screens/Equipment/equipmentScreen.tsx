import { useNavigate } from "react-router-dom";
import "./equipmentScreen.css";
import { useEquipment } from "./useEquipment";

export default function EquipmentScreen() {
  const navigate = useNavigate();
  const { items, loading, iAmManager } = useEquipment();

  if (loading) {
    return <div className="equip-content">読み込み中...</div>;
  }

  return (
    <div className="equip-content">
      {/* 上部:固定 */}
      <div className="equip-fixed">
        <div className="equip-header">
          <h2 className="equip-title">機材</h2>
          {iAmManager && (
            <div className="equip-header-actions">
              <button className="equip-manage-btn" onClick={() => navigate("/equipment/requests")}>
                <i className="ti ti-inbox" /> 申請管理
              </button>
              <button className="equip-manage-btn primary" onClick={() => navigate("/equipment/manage")}>
                <i className="ti ti-settings" /> 台帳管理
              </button>
            </div>
          )}
        </div>
      </div>

      {/* リスト:ここだけスクロール */}
      <div className="equip-list">
        {items.length === 0 ? (
          <p className="equip-empty">登録されている機材はありません</p>
        ) : (
          items.map((eq) => (
            <button
              key={eq.id}
              className="equip-card"
              onClick={() => navigate(`/equipment/${eq.id}`)}
            >
              <div className="equip-card-head">
                <div>
                  <span className="equip-name">{eq.name}</span>
                  <span className="equip-category">{eq.category}</span>
                </div>
                {eq.lendable ? (
                  <span className="equip-stock">
                    貸出可 {eq.available} / {eq.totalQuantity}
                  </span>
                ) : (
                  <span className="equip-nolend">貸出不可</span>
                )}
              </div>

              {eq.borrowers.length > 0 && (
                <div className="equip-borrowers">
                  {eq.borrowers.map((b, i) => (
                    <div key={i} className="equip-borrower">
                      <i className="ti ti-user" />
                      <span>{b.memberName}</span>
                      <span className="equip-borrower-qty">×{b.quantity}</span>
                      <span className={`equip-borrower-due ${b.overdue ? "overdue" : ""}`}>
                        {b.overdue ? "延滞中" : `〜${b.dueDate}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
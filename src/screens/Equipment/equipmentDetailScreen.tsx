import { useParams, useNavigate } from "react-router-dom";
import "./equipmentDetailScreen.css";
import { useEquipmentDetail } from "./useEquipmentDetail";

export default function EquipmentDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    equipment,
    borrowers,
    available,
    loading,
    quantity,
    setQuantity,
    dueDate,
    setDueDate,
    submitting,
    submit,
  } = useEquipmentDetail(id);

  if (loading) {
    return <div className="eqd-content">読み込み中...</div>;
  }

  if (!equipment) {
    return (
      <div className="eqd-content">
        <p>機材が見つかりませんでした。</p>
        <button className="eqd-back" onClick={() => navigate("/equipment")}>
          <i className="ti ti-arrow-left" /> 機材一覧に戻る
        </button>
      </div>
    );
  }

  return (
    <div className="eqd-content">
      <button className="eqd-back" onClick={() => navigate("/equipment")}>
        <i className="ti ti-arrow-left" /> 機材一覧に戻る
      </button>

      <div className="eqd-head">
        <h2 className="eqd-name">{equipment.name}</h2>
        <span className="eqd-category">{equipment.category}</span>
      </div>

      {equipment.note && <p className="eqd-note">{equipment.note}</p>}

      <div className="eqd-stock-box">
        <div className="eqd-stock-item">
          <span className="eqd-stock-label">総台数</span>
          <span className="eqd-stock-value">{equipment.totalQuantity}</span>
        </div>
        <div className="eqd-stock-item">
          <span className="eqd-stock-label">貸出可能</span>
          <span className="eqd-stock-value accent">{available}</span>
        </div>
      </div>

      {borrowers.length > 0 && (
        <div className="eqd-section">
          <p className="eqd-section-label">現在の貸出状況</p>
          {borrowers.map((b, i) => (
            <div key={i} className="eqd-borrower">
              <i className="ti ti-user" />
              <span className="eqd-borrower-name">{b.memberName}</span>
              <span className="eqd-borrower-qty">×{b.quantity}</span>
              <span className={`eqd-borrower-due ${b.overdue ? "overdue" : ""}`}>
                {b.overdue ? "延滞中" : `返却予定 ${b.dueDate}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 申請フォーム */}
      {equipment.lendable ? (
        available > 0 ? (
          <div className="eqd-form">
            <p className="eqd-section-label">貸出を申請</p>
            <div className="eqd-field">
              <label className="eqd-label">台数</label>
              <input
                className="eqd-input"
                type="number"
                min={1}
                max={available}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>
            <div className="eqd-field">
              <label className="eqd-label">返却予定日</label>
              <input
                className="eqd-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <button
              className="eqd-submit"
              onClick={() => submit(() => navigate("/equipment"))}
              disabled={submitting}
            >
              {submitting ? "申請中..." : "貸出を申請する"}
            </button>
          </div>
        ) : (
          <div className="eqd-unavailable">現在すべて貸出中のため、申請できません。</div>
        )
      ) : (
        <div className="eqd-unavailable">この機材は貸出対象外です。</div>
      )}
    </div>
  );
}
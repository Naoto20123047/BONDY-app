import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./bandApprovalsScreen.css";
import { useBandApprovals } from "./useBandApprovals";

export default function BandApprovalsScreen() {
  const navigate = useNavigate();
  const {
    pendingFormation,
    pendingDissolution,
    loading,
    approveFormation,
    rejectFormation,
    approveDissolution,
    rejectDissolution,
  } = useBandApprovals();

  const [tab, setTab] = useState<"formation" | "dissolution">("formation");

  if (loading) {
    return <div className="band-approvals-content">読み込み中...</div>;
  }

  return (
    <div className="band-approvals-content">
      <button className="band-approvals-back" onClick={() => navigate("/admin")}>
        <i className="ti ti-arrow-left" /> 幹部管理に戻る
      </button>

      <h2 className="band-approvals-title">バンド承認</h2>

      <div className="band-approvals-tabs">
        <button
          className={`band-approvals-tab ${tab === "formation" ? "active" : ""}`}
          onClick={() => setTab("formation")}
        >
          結成申請({pendingFormation.length})
        </button>
        <button
          className={`band-approvals-tab ${tab === "dissolution" ? "active" : ""}`}
          onClick={() => setTab("dissolution")}
        >
          解散申請({pendingDissolution.length})
        </button>
      </div>

      {tab === "formation" && (
        <div className="band-approvals-list">
          {pendingFormation.length === 0 ? (
            <p className="band-approvals-empty">結成申請はありません</p>
          ) : (
            pendingFormation.map((b) => (
              <div key={b.id} className="band-approval-card">
                <div className="band-approval-info">
                  <span className="band-approval-name">{b.name}</span>
                  <span className="band-approval-count">{b.members.length}名</span>
                </div>
                <div className="band-approval-actions">
                  <button
                    className="band-approval-approve"
                    onClick={() => approveFormation(b.id)}
                  >
                    承認
                  </button>
                  <button
                    className="band-approval-reject"
                    onClick={() => rejectFormation(b.id)}
                  >
                    却下
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "dissolution" && (
        <div className="band-approvals-list">
          {pendingDissolution.length === 0 ? (
            <p className="band-approvals-empty">解散申請はありません</p>
          ) : (
            pendingDissolution.map((b) => (
              <div key={b.id} className="band-approval-card">
                <div className="band-approval-info">
                  <span className="band-approval-name">{b.name}</span>
                  <span className="band-approval-count">{b.members.length}名</span>
                </div>
                <div className="band-approval-actions">
                  <button
                    className="band-approval-approve danger"
                    onClick={() => approveDissolution(b.id)}
                  >
                    解散を承認
                  </button>
                  <button
                    className="band-approval-reject"
                    onClick={() => rejectDissolution(b.id)}
                  >
                    却下
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
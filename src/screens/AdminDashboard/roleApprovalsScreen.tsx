import { useNavigate } from "react-router-dom";
import "./roleApprovalsScreen.css";
import { useRoleApprovals } from "./useRoleApprovals";

export default function RoleApprovalsScreen() {
  const navigate = useNavigate();
  const { requests, loading, approve, reject, hasApproved, isProposer, isTarget, waitNote } =
    useRoleApprovals();

  if (loading) {
    return <div className="role-approvals-content">読み込み中...</div>;
  }

  return (
    <div className="role-approvals-content">
      <button className="role-approvals-back" onClick={() => navigate("/admin")}>
        <i className="ti ti-arrow-left" /> 幹部管理に戻る
      </button>

      <h2 className="role-approvals-title">ロール承認</h2>

      {waitNote && <p className="role-approval-note">{waitNote}</p>}

      {requests.length === 0 ? (
        <p className="role-approvals-empty">承認待ちの申請はありません</p>
      ) : (
        <div className="role-approvals-list">
          {requests.map((r) => (
            <div key={r.id} className="role-approval-card">
              <div className="role-approval-head">
                <span className="role-approval-type">{r.typeLabel}</span>
                <span className="role-approval-progress">
                  {r.approvals.length} / {r.requiredApprovals} 承認
                </span>
              </div>

              <p className="role-approval-target">
                対象:{r.targetName}
              </p>
              <p className="role-approval-proposer">
                提案者:{r.proposerName}
              </p>

              <div className="role-approval-actions">
                {hasApproved(r) ? (
                  <span className="role-approval-done">
                    <i className="ti ti-check" /> 承認済み
                  </span>
                ) : isProposer(r) ? (
                  <span className="role-approval-note">提案者は承認済みです</span>
                ) : (
                  <button
                    className="role-approval-approve"
                    onClick={() => approve(r.id)}
                    disabled={waitNote !== null}
                  >
                    承認する
                  </button>
                )}
                {/* 申請の対象者は却下できない(v1.4.1) */}
                {isTarget(r) ? (
                  <span className="role-approval-note">あなたが対象の申請です</span>
                ) : (
                  <button
                    className="role-approval-reject"
                    onClick={() => reject(r.id)}
                    disabled={waitNote !== null}
                  >
                    却下
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
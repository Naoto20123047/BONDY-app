import { useNavigate } from "react-router-dom";
import "./bandApprovalsScreen.css";
import "./memberApprovalsScreen.css";
import { useMemberApprovals } from "./useMemberApprovals";
import { memberSubtitle } from "../../lib/grade";
import { formatParts } from "../../lib/parts";

/** 幹部管理 → 新規登録の承認(教員・OB) */
export default function MemberApprovalsScreen() {
  const navigate = useNavigate();
  const { pending, loading, approve, decline } = useMemberApprovals();

  if (loading) {
    return <div className="band-approvals-content">読み込み中...</div>;
  }

  return (
    <div className="band-approvals-content">
      <button className="band-approvals-back" onClick={() => navigate("/admin")}>
        <i className="ti ti-arrow-left" /> 幹部管理に戻る
      </button>

      <h2 className="band-approvals-title">新規登録の承認</h2>
      <p className="member-approvals-lead">
        新しく登録した教員・OB({pending.length}件)
      </p>

      <div className="band-approvals-list">
        {pending.length === 0 ? (
          <p className="band-approvals-empty">確認待ちの登録はありません</p>
        ) : (
          pending.map((m) => (
            <div key={m.id} className="band-approval-card member-approval-card">
              <div className="member-approval-info">
                <span className="band-approval-name">{m.name}</span>
                <span className="member-approval-meta">
                  {memberSubtitle(m)}
                  {m.parts?.length ? ` · ${formatParts(m.parts)}` : ""}
                </span>
                <span className="member-approval-meta">{m.email}</span>
                <span className="member-approval-meta">
                  <i className="ti ti-check" /> メール確認済み
                  {m.joinedAt ? ` · ${m.joinedAt} 登録` : ""}
                </span>
              </div>
              <div className="band-approval-actions">
                <button className="band-approval-approve" onClick={() => approve(m)}>
                  承認する
                </button>
                <button className="band-approval-reject" onClick={() => decline(m)}>
                  見送る
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="member-approvals-note">
        承認すると本人に通知が届き、名簿・チャット・掲示板・アーカイブが使えるようになります。
      </p>
    </div>
  );
}

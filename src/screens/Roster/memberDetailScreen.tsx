import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./memberDetailScreen.css";
import { useMemberDetail, assignablePositions } from "./useMemberDetail";
import { useAuth } from "../../lib/AuthContext";
import { calcGrade } from "../../lib/grade";
import type { Position } from "../../Types/types";

interface MemberDetailProps {
  isOfficer: boolean;
}

export default function MemberDetailScreen({ isOfficer }: MemberDetailProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { member: currentMember } = useAuth();
  const {
    member,
    loading,
    withdrawMember,
    registerOB,
    promoteToOfficer,
    proposeDismissOfficer,
    proposeAssignPosition,
    isOfficerMember,
  } = useMemberDetail(id);

  const [selectedPosition, setSelectedPosition] = useState<Position>(assignablePositions[0]);

  if (loading) {
    return <div className="detail-content">読み込み中...</div>;
  }

  if (!member) {
    return (
      <div className="detail-content">
        <p>部員が見つかりませんでした。</p>
        <button className="detail-back" onClick={() => navigate("/roster")}>
          <i className="ti ti-arrow-left" /> 名簿に戻る
        </button>
      </div>
    );
  }

  // 自分自身を見ているか
  const isSelf = currentMember?.id === member.id;
  // ログイン中の自分がサークル長か(降格申請の権限判定)
  const iAmLeader = currentMember?.positions.includes("サークル長") ?? false;

  return (
    <div className="detail-content">
      <button className="detail-back" onClick={() => navigate("/roster")}>
        <i className="ti ti-arrow-left" /> 名簿に戻る
      </button>

      <div className="detail-head">
        <div className="detail-avatar">{member.name.charAt(0)}</div>
        <div>
          <p className="detail-name">
            {member.name}
            {member.nickname && <span className="detail-nickname">（{member.nickname}）</span>}
          </p>
          <p className="detail-sub">
            {member.faculty}・{calcGrade(member.enrollmentYear, member.isOB)}
          </p>
        </div>
      </div>

      {member.positions.length > 0 && (
        <div className="detail-badges">
          {member.positions.map((p) => (
            <span key={p} className="detail-badge">{p}</span>
          ))}
        </div>
      )}

      <div className="detail-fields">
        <div className="detail-field">
          <span className="detail-field-label">学籍番号</span>
          <span className="detail-field-value">{member.studentId}</span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">パート</span>
          <span className="detail-field-value">{member.part}</span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">メール</span>
          <span className="detail-field-value">{member.email}</span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">権限</span>
          <span className="detail-field-value">{member.role}</span>
        </div>
      </div>

      {/* 権限・役職の管理(幹部が、自分以外・非OBを見ているときのみ) */}
      {isOfficer && !member.isOB && !isSelf && (
        <div className="detail-manage">
          <p className="detail-manage-label">権限・役職の管理</p>

          {member.role === "一般メンバー" && (
            <button className="detail-manage-btn" onClick={promoteToOfficer}>
              <i className="ti ti-arrow-up" /> 幹部に昇格(即時)
            </button>
          )}

          {/* 降格申請はサークル長のみ */}
          {isOfficerMember && iAmLeader && (
            <button className="detail-manage-btn" onClick={proposeDismissOfficer}>
              <i className="ti ti-arrow-down" /> 幹部からの降格を申請
            </button>
          )}

          {isOfficerMember && (
            <div className="detail-assign">
              <select
                className="detail-assign-select"
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value as Position)}
              >
                {assignablePositions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button
                className="detail-assign-btn"
                onClick={() => proposeAssignPosition(selectedPosition)}
              >
                役職を付与申請
              </button>
            </div>
          )}
        </div>
      )}

      {/* OB登録・退会(幹部が、自分以外を見ているときのみ) */}
      {isOfficer && !isSelf && (
        <div className="detail-actions">
          {!member.isOB && (
            <button className="detail-action" onClick={registerOB}>
              <i className="ti ti-user-check" /> OB登録
            </button>
          )}
          <button className="detail-action danger" onClick={withdrawMember}>
            <i className="ti ti-user-x" /> 退会処理
          </button>
        </div>
      )}
    </div>
  );
}
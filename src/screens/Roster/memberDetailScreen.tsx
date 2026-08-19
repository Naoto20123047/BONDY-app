import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./memberDetailScreen.css";
import { useMemberDetail, assignablePositions } from "./useMemberDetail";
import { useAuth } from "../../lib/AuthContext";
import { calcGrade } from "../../lib/grade";
import { avatarStyle } from "../../lib/avatarColors";
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

  const isSelf = currentMember?.id === member.id;
  const iAmLeader = currentMember?.positions.includes("サークル長") ?? false;
  const memberParts = member.parts ?? [];
  const hasActions = isOfficer && !isSelf;

  return (
    <div className="detail-content">
      <button className="detail-back" onClick={() => navigate("/roster")}>
        <i className="ti ti-arrow-left" /> 名簿に戻る
      </button>

      {/* プロフィールヘッダー(横並び) */}
      <header className="detail-hero">
        <div className="detail-avatar" style={avatarStyle(member.avatarColor)}>
          {member.name.charAt(0)}
        </div>

        <div className="detail-identity">
          <h1 className="detail-name">
            {member.name}
            {member.nickname && <span className="detail-nickname">（{member.nickname}）</span>}
          </h1>
          <p className="detail-sub">
            {member.faculty}・{calcGrade(member.enrollmentYear, member.isOB)}・{member.studentId}
          </p>
          <div className="detail-tags">
            {member.isOB && <span className="detail-tag ob">OB・OG</span>}
            {member.positions.map((p) => (
              <span key={p} className="detail-tag position">{p}</span>
            ))}
            {memberParts.map((p) => (
              <span key={p} className="detail-tag part">{p}</span>
            ))}
          </div>
        </div>
      </header>

      <div className={`detail-columns ${hasActions ? "" : "single"}`}>
        {/* 左:基本情報 */}
        <section className="detail-section">
          <h2 className="detail-section-title">基本情報</h2>
          <dl className="detail-fields">
            <div className="detail-field">
              <dt>学籍番号</dt>
              <dd>{member.studentId}</dd>
            </div>
            <div className="detail-field">
              <dt>学部</dt>
              <dd>{member.faculty}</dd>
            </div>
            <div className="detail-field">
              <dt>入学年度</dt>
              <dd>{member.enrollmentYear}年度</dd>
            </div>
            <div className="detail-field">
              <dt>パート</dt>
              <dd>
                {memberParts.length === 0 ? (
                  <span className="detail-none">未設定</span>
                ) : (
                  memberParts.join("・")
                )}
              </dd>
            </div>
            <div className="detail-field">
              <dt>メール</dt>
              <dd className="detail-email">{member.email}</dd>
            </div>
            <div className="detail-field">
              <dt>権限</dt>
              <dd>{member.role}</dd>
            </div>
            <div className="detail-field">
              <dt>役職</dt>
              <dd>
                {member.positions.length === 0 ? (
                  <span className="detail-none">なし</span>
                ) : (
                  member.positions.join("・")
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* 右:管理操作 */}
        {hasActions && (
          <section className="detail-section">
            <h2 className="detail-section-title">管理</h2>

            {/* 権限・役職(OBは対象外) */}
            {!member.isOB && (
              <div className="detail-manage-block">
                <p className="detail-block-label">権限・役職</p>

                {member.role === "一般メンバー" && (
                  <button className="detail-btn" onClick={promoteToOfficer}>
                    <i className="ti ti-arrow-up" />
                    幹部に昇格
                    <span className="detail-btn-note">即時反映</span>
                  </button>
                )}

                {isOfficerMember && iAmLeader && (
                  <button className="detail-btn" onClick={proposeDismissOfficer}>
                    <i className="ti ti-arrow-down" />
                    降格を申請
                    <span className="detail-btn-note">3名の承認</span>
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
                      付与申請
                    </button>
                  </div>
                )}

                {isOfficerMember && !iAmLeader && (
                  <p className="detail-note">降格の発議はサークル長のみ可能です</p>
                )}
              </div>
            )}

            {/* 在籍 */}
            <div className="detail-manage-block">
              <p className="detail-block-label">在籍</p>

              {!member.isOB && (
                <button className="detail-btn" onClick={registerOB}>
                  <i className="ti ti-user-check" />
                  OB登録
                </button>
              )}

              <button className="detail-btn danger" onClick={withdrawMember}>
                <i className="ti ti-user-x" />
                退会処理
              </button>

              <p className="detail-note">
                退会してもデータは残ります。完全な削除はユーザー履歴から
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
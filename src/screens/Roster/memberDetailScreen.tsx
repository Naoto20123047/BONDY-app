import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./memberDetailScreen.css";
import { useMemberDetail, assignablePositions } from "./useMemberDetail";
import { useAuth } from "../../lib/AuthContext";
import { calcGrade, isNewMember } from "../../lib/grade";
import MemberAvatar from "../Layout/MemberAvatar";
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
    expelMember,
    restoreMember,
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
        <MemberAvatar
          name={member.name}
          avatarColor={member.avatarColor}
          avatarThumb={member.avatarThumb}
          avatarImageId={member.avatarImageId}
          className="detail-avatar"
        />

        <div className="detail-identity">
          <h1 className="detail-name">
            {member.name}
            {member.nickname && <span className="detail-nickname">（{member.nickname}）</span>}
          </h1>
          <p className="detail-sub">
            {member.faculty}・{calcGrade(member.enrollmentYear, member.isOB)}・{member.studentId}
          </p>
          <div className="detail-tags">
            {/* 今年度に加入したメンバー */}
            {isNewMember(member.joinedAt) && (
              <span className="detail-tag new">NEW</span>
            )}
            {member.status === "withdrawn" && (
              <span className="detail-tag left">退会済み</span>
            )}
            {member.status === "expelled" && (
              <span className="detail-tag expelled">除籍済み</span>
            )}
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
              <dt>加入日</dt>
              <dd>
                {member.joinedAt ?? (
                  <span className="detail-none">未記録</span>
                )}
              </dd>
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

              {member.status === "active" ? (
                <>
                  {!member.isOB && (
                    <button className="detail-btn" onClick={registerOB}>
                      <i className="ti ti-user-check" />
                      OB登録
                    </button>
                  )}

                  <button className="detail-btn" onClick={withdrawMember}>
                    <i className="ti ti-door-exit" />
                    退会処理
                    <span className="detail-btn-note">本人が復帰可</span>
                  </button>

                  <button className="detail-btn danger" onClick={expelMember}>
                    <i className="ti ti-user-x" />
                    除籍
                    <span className="detail-btn-note">ログイン不可</span>
                  </button>

                  <p className="detail-note">
                    退会は本人が再ログインすれば戻れます。除籍はアカウントを無効化するため、戻すには幹部の操作が必要です
                  </p>
                </>
              ) : (
                <>
                  <p className="detail-status-note">
                    {member.status === "withdrawn"
                      ? `退会済み(${member.withdrawnAt ?? "日付不明"})`
                      : `除籍済み(${member.expelledAt ?? "日付不明"})`}
                  </p>

                  <button className="detail-btn" onClick={restoreMember}>
                    <i className="ti ti-user-plus" />
                    在籍に戻す
                    {member.status === "expelled" && (
                      <span className="detail-btn-note">アカウントも有効化</span>
                    )}
                  </button>

                  <p className="detail-note">
                    データの完全な削除はユーザー履歴から
                  </p>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
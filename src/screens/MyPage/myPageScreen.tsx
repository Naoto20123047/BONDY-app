import { useNavigate } from "react-router-dom";
import "./myPageScreen.css";
import { useMyPage } from "./useMyPage";
import { calcGrade } from "../../lib/grade";
import { formatParts } from "../../lib/parts";
import { formTypeLabel } from "../../lib/formLabel";
import MemberAvatar from "../Layout/MemberAvatar";

export default function MyPageScreen() {
  const navigate = useNavigate();
  const { member, bands, answeredForms, myEquipment, duesPaid, loading, leaveBand, reportReturn, withdraw } =
    useMyPage();

  if (loading || !member) {
    return <div className="mypage-content">読み込み中...</div>;
  }

  const memberParts = member.parts ?? [];

  return (
    <div className="mypage-content">
      <h2 className="mypage-title">マイページ</h2>

      <div className="mypage-columns">
        {/* 左カラム */}
        <div className="mypage-col-left">
          <div className="mypage-head">
            <MemberAvatar
              name={member.name}
              avatarColor={member.avatarColor}
              avatarThumb={member.avatarThumb}
              avatarImageId={member.avatarImageId}
              className="mypage-avatar"
            />
            <div>
              <p className="mypage-name">
                {member.name}
                {member.nickname && (
                  <span className="mypage-nickname">（{member.nickname}）</span>
                )}
              </p>
              <p className="mypage-sub">
                {member.faculty}・{calcGrade(member.enrollmentYear, member.isOB)}・
                {formatParts(member.parts)}
              </p>
            </div>
          </div>

          <div className="mypage-stats">
            <div className="mypage-stat">
              <p className="mypage-stat-label">会費状況</p>
              <p className="mypage-stat-value">{duesPaid ? "納入済み" : "未納"}</p>
            </div>
            <div className="mypage-stat">
              <p className="mypage-stat-label">所属バンド</p>
              <p className="mypage-stat-value">{bands.length}件</p>
            </div>
          </div>

          {/* 基本情報(PCのみ表示) */}
          <div className="mypage-profile">
            <p className="mypage-profile-label">基本情報</p>
            <dl className="mypage-info">
              <div className="mypage-info-row">
                <dt>ニックネーム</dt>
                <dd>
                  {member.nickname ? (
                    member.nickname
                  ) : (
                    <span className="mypage-info-none">未設定</span>
                  )}
                </dd>
              </div>
              <div className="mypage-info-row">
                <dt>学部</dt>
                <dd>{member.faculty}</dd>
              </div>
              <div className="mypage-info-row">
                <dt>学籍番号</dt>
                <dd>{member.studentId}</dd>
              </div>
              <div className="mypage-info-row">
                <dt>入学年度</dt>
                <dd>{member.enrollmentYear}年度</dd>
              </div>
              <div className="mypage-info-row">
                <dt>加入日</dt>
                <dd>
                  {member.joinedAt ?? (
                    <span className="mypage-info-none">未記録</span>
                  )}
                </dd>
              </div>
              <div className="mypage-info-row">
                <dt>パート</dt>
                <dd>
                  {memberParts.length === 0 ? (
                    <span className="mypage-info-none">未設定</span>
                  ) : (
                    <span className="mypage-tags">
                      {memberParts.map((p) => (
                        <span key={p} className="mypage-part-tag">{p}</span>
                      ))}
                    </span>
                  )}
                </dd>
              </div>
              <div className="mypage-info-row">
                <dt>メール</dt>
                <dd className="mypage-info-email">{member.email}</dd>
              </div>
              <div className="mypage-info-row">
                <dt>権限</dt>
                <dd>{member.role}</dd>
              </div>
              <div className="mypage-info-row">
                <dt>役職</dt>
                <dd>
                  {member.positions.length === 0 ? (
                    <span className="mypage-info-none">なし</span>
                  ) : (
                    member.positions.join("・")
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* 右カラム */}
        <div className="mypage-col-right">
          <div className="mypage-section">
            <p className="mypage-section-label">所属バンド</p>
            {bands.length === 0 ? (
              <p className="mypage-empty">所属しているバンドはありません</p>
            ) : (
              bands.map((b) => (
                <div key={b.id} className="mypage-band">
                  <div>
                    <span className="mypage-band-name">{b.name}</span>
                    <span className="mypage-band-status">{b.status}</span>
                  </div>
                  <button className="mypage-band-leave" onClick={() => leaveBand(b.id)}>
                    脱退
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mypage-section">
            <p className="mypage-section-label">貸出中の機材</p>
            {myEquipment.length === 0 ? (
              <p className="mypage-empty">貸出中の機材はありません</p>
            ) : (
              myEquipment.map((e) => (
                <div key={e.requestId} className="mypage-equip">
                  <div>
                    <span className="mypage-equip-name">
                      {e.equipmentName} <span className="mypage-equip-qty">×{e.quantity}</span>
                    </span>
                    <span className={`mypage-equip-due ${e.overdue ? "overdue" : ""}`}>
                      {e.overdue ? "延滞中" : `返却予定 ${e.dueDate}`}
                    </span>
                  </div>
                  {e.status === "返却報告済み" ? (
                    <span className="mypage-equip-reported">確認待ち</span>
                  ) : (
                    <button className="mypage-equip-return" onClick={() => reportReturn(e.requestId)}>
                      返却報告
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mypage-section">
            <p className="mypage-section-label">回答済みフォーム</p>
            {answeredForms.length === 0 ? (
              <p className="mypage-empty">回答済みのフォームはありません</p>
            ) : (
              answeredForms.map((f) => (
                // タップするとそのフォームの回答画面へ。
                // 締切後は入力が無効化されるため、回答内容の確認として使える。
                <button
                  key={f.id}
                  className="mypage-form"
                  onClick={() => navigate(`/forms/${f.id}`)}
                >
                  <span className="mypage-form-info">
                    <span
                      className={`mypage-form-tag ${f.type === "イベント" ? "event" : "survey"}`}
                    >
                      {formTypeLabel(f.type)}
                    </span>
                    <span className="mypage-form-title">{f.title}</span>
                  </span>
                  <span className="mypage-form-right">
                    <span className="mypage-form-date">{f.answeredAt} 回答</span>
                    <i className="ti ti-chevron-right mypage-form-chevron" />
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="mypage-actions">
            <button className="mypage-action" onClick={() => navigate("/mypage/edit")}>
              <i className="ti ti-edit" /> プロフィール編集
            </button>
            <button className="mypage-action danger" onClick={withdraw}>
              <i className="ti ti-door-exit" /> 退会する
            </button>
          </div>
        </div>
      </div>

      {/* クレジット */}
      <div className="mypage-credit">
        <p className="mypage-credit-app">BONDYアプリ　v1.2.0</p>
        <div className="mypage-credit-block">
          <p className="mypage-credit-role">開発</p>
          <p className="mypage-credit-name">2023年度情報学部生　吉田 直人</p>
        </div>
        <div className="mypage-credit-block">
          <p className="mypage-credit-role">スタンプデザイン</p>
          <p className="mypage-credit-name">2023年度アニメ・マンガ学部生　茂木 美祐</p>
        </div>
      </div>
    </div>
  );
}

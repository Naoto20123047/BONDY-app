import { useNavigate } from "react-router-dom";
import "./adminScreen.css";
import { useAdmin } from "./useAdmin";

export default function AdminScreen() {
  const navigate = useNavigate();
  const { summary, loading } = useAdmin();

  if (loading) {
    return <div className="admin-content">読み込み中...</div>;
  }

  const menus = [
    {
      key: "roles",
      icon: "ti-user-cog",
      title: "ロール承認",
      desc: "役職の付与・降格・交代の申請を承認",
      badge: summary.pendingRoleApprovals,
      path: "/admin/approvals/roles",
    },
    {
      key: "bands",
      icon: "ti-guitar-pick",
      title: "バンド承認",
      desc: "結成申請・解散申請を承認",
      badge: summary.pendingBandApprovals,
      path: "/admin/approvals/bands",
    },
    {
      key: "dues",
      icon: "ti-cash",
      title: "会費管理",
      desc: "部員ごとの納入状況を管理",
      badge: summary.unpaidDues,
      badgeLabel: "未納",
      path: "/admin/dues",
    },
    {
      key: "history",
      icon: "ti-history",
      title: "ユーザー履歴",
      desc: "退会済みメンバーの管理・完全削除",
      badge: 0,
      path: "/admin/history",
    },
  ];

  return (
    <div className="admin-content">
      <h2 className="admin-title">幹部管理</h2>

      <div className="admin-stats">
        <div className="admin-stat">
          <p className="admin-stat-label">在籍部員数</p>
          <p className="admin-stat-value">{summary.activeMembers}名</p>
        </div>
        <div className="admin-stat">
          <p className="admin-stat-label">承認待ち</p>
          <p className="admin-stat-value accent">
            {summary.pendingRoleApprovals + summary.pendingBandApprovals}件
          </p>
        </div>
        <div className="admin-stat">
          <p className="admin-stat-label">未納会費</p>
          <p className="admin-stat-value">{summary.unpaidDues}名</p>
        </div>
      </div>

      <div className="admin-menus">
        {menus.map((m) => (
          <button
            key={m.key}
            className="admin-menu"
            onClick={() => navigate(m.path)}
          >
            <div className="admin-menu-icon">
              <i className={`ti ${m.icon}`} />
            </div>
            <div className="admin-menu-text">
              <span className="admin-menu-title">{m.title}</span>
              <span className="admin-menu-desc">{m.desc}</span>
            </div>
            {m.badge > 0 && (
              <span className="admin-menu-badge">
                {m.badge}
                {m.badgeLabel ?? ""}
              </span>
            )}
            <i className="ti ti-chevron-right admin-menu-chevron" />
          </button>
        ))}
      </div>
    </div>
  );
}
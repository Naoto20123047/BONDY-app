import { useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./layout.css";
import NotificationBell from "./NotificationBell";
import InstallPrompt from "./InstallPrompt";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";

interface NavItem {
  path: string;
  label: string;
  icon: string;
  officerOnly: boolean;
}

const navItems: NavItem[] = [
  { path: "/home", label: "ホーム", icon: "ti-home", officerOnly: false },
  { path: "/bands", label: "バンド", icon: "ti-guitar-pick", officerOnly: false },
  { path: "/chat", label: "チャット", icon: "ti-message-circle", officerOnly: false },
  { path: "/board", label: "掲示板", icon: "ti-clipboard-text", officerOnly: false },
  { path: "/roster", label: "名簿", icon: "ti-users", officerOnly: false },
  { path: "/forms", label: "フォーム", icon: "ti-clipboard-list", officerOnly: false },
  { path: "/equipment", label: "機材", icon: "ti-speakerphone", officerOnly: false },
  { path: "/mypage", label: "マイページ", icon: "ti-user-circle", officerOnly: false },
  { path: "/admin", label: "幹部管理", icon: "ti-shield-check", officerOnly: true },
  { path: "/todo", label: "幹部TODO", icon: "ti-checklist", officerOnly: true },
];

const bottomNavPaths = ["/home", "/bands", "/chat", "/board"];

interface LayoutProps {
  isOfficer: boolean;
  children: ReactNode;
}

export default function Layout({ isOfficer, children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = navItems.filter((item) => !item.officerOnly || isOfficer);
  const bottomItems = items.filter((i) => bottomNavPaths.includes(i.path));
  const sheetItems = items.filter((i) => !bottomNavPaths.includes(i.path));

  const isActive = (path: string) => location.pathname === path;

  const go = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  const handleLogout = async () => {
    const ok = window.confirm("ログアウトしますか?");
    if (!ok) return;
    setMenuOpen(false);
    try {
      await signOut(auth);
      // signOut すると AuthContext の onAuthStateChanged が発火し、
      // App.tsx が自動的にログイン画面に切り替える
    } catch (e) {
      console.error("ログアウトに失敗しました", e);
    }
  };

return (
    <div className="layout">
      <aside className="layout-sidebar">
        <div className="layout-logo">
          <img src="/logo.png" alt="BONDY" className="layout-logo-img" />
          <span className="layout-logo-text">BONDYアプリ</span>
        </div>
        <div className="layout-nav">
          {items.map((item) => (
            <button
              key={item.path}
              className={`layout-nav-item ${isActive(item.path) ? "active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              <i className={`ti ${item.icon}`} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <button className="layout-logout" onClick={handleLogout}>
          <i className="ti ti-logout" />
          <span>ログアウト</span>
        </button>
      </aside>
 {/* スマホ用 上部ヘッダー */}
      <header className="layout-mobile-header">
        <img src="/logo.png" alt="BONDY" className="layout-mobile-logo" />
        <span className="layout-mobile-title">BONDYアプリ</span>
        <div className="layout-mobile-spacer" />
        <NotificationBell variant="bell" />
      </header>

      {/* PC用フローティング通知(スマホでは非表示) */}
      <div className="layout-float-notif">
        <NotificationBell variant="bell" />
      </div>

      <main className="layout-main">{children}</main>

      {menuOpen && (
        <>
          <div className="layout-sheet-overlay" onClick={() => setMenuOpen(false)} />
          <div className="layout-sheet">
            <div className="layout-sheet-handle" />
            {sheetItems.map((item) => (
              <button
                key={item.path}
                className={`layout-sheet-item ${isActive(item.path) ? "active" : ""}`}
                onClick={() => go(item.path)}
              >
                <i className={`ti ${item.icon}`} />
                <span>{item.label}</span>
              </button>
            ))}
            <button className="layout-sheet-item logout" onClick={handleLogout}>
              <i className="ti ti-logout" />
              <span>ログアウト</span>
            </button>
          </div>
        </>
      )}

      <nav className="layout-bottom-nav">
        {bottomItems.map((item) => (
          <button
            key={item.path}
            className={`layout-bottom-item ${isActive(item.path) ? "active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            <i className={`ti ${item.icon}`} />
            <span>{item.label}</span>
          </button>
        ))}
        <button
          className={`layout-bottom-item ${menuOpen ? "active" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <i className="ti ti-menu-2" />
          <span>メニュー</span>
        </button>
      </nav>

      <InstallPrompt />
    </div>
  );
}
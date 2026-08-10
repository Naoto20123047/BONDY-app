import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../lib/useNotifications";
import "./notificationBell.css";

interface NotificationBellProps {
  variant?: "bell" | "sidebar"; // bell=スマホヘッダー用、sidebar=PCサイドバー用
}

export default function NotificationBell({ variant = "bell" }: NotificationBellProps) {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleClick = (id: string, link: string) => {
    markAsRead(id);
    setOpen(false);
    navigate(link);
  };

  return (
    <div className={`notif notif-${variant}`} ref={ref}>
      {variant === "bell" ? (
        <button className="notif-bell" onClick={() => setOpen((v) => !v)}>
          <i className="ti ti-bell" />
          {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
        </button>
      ) : (
        <button
          className={`notif-sidebar-item ${open ? "active" : ""}`}
          onClick={() => setOpen((v) => !v)}
        >
          <i className="ti ti-bell" />
          <span>通知</span>
          {unreadCount > 0 && <span className="notif-side-badge">{unreadCount}</span>}
        </button>
      )}

      {open && (
        <div className={`notif-panel notif-panel-${variant}`}>
          <div className="notif-panel-head">
            <span className="notif-panel-title">通知</span>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={markAllAsRead}>
                すべて既読
              </button>
            )}
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <p className="notif-empty">通知はありません</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  className={`notif-item ${n.read ? "" : "unread"}`}
                  onClick={() => handleClick(n.id, n.link)}
                >
                  {!n.read && <span className="notif-dot" />}
                  <div className="notif-item-body">
                    <span className="notif-item-msg">{n.message}</span>
                    <span className="notif-item-date">{n.createdAt}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
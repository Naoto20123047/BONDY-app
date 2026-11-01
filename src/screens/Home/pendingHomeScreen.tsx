import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { memberSubtitle } from "../../lib/grade";
import "./pendingHomeScreen.css";

/**
 * 幹部の確認待ちのホーム。
 *
 * 教員・OBとして登録した人は、幹部の確認が済むまでこの画面だけを使う
 * (名簿・チャット・掲示板・アーカイブ・フォームは、ルールでも読めない)。
 * 確認が済むと、画面に戻ってきたときに自動で通常のホームに切り替わる。
 */
export default function PendingHomeScreen() {
  const navigate = useNavigate();
  const { member, refreshMember } = useAuth();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 画面に戻ってきたときに確認状況を取り直す
  const refreshRef = useRef(refreshMember);
  useEffect(() => {
    refreshRef.current = refreshMember;
  });
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (!member) return null;

  const handleCheck = async () => {
    setMessage(null);
    setChecking(true);
    await refreshMember();
    setChecking(false);
    // 確認が済んでいれば、この画面ごと通常のホームに切り替わる
    setMessage("まだ確認が済んでいません。");
  };

  return (
    <div className="pending-page">
      <header className="pending-header">
        <img src="/logo.png" alt="BONDY" className="pending-logo" />
        <span className="pending-brand">BONDYアプリ</span>
      </header>

      <main className="pending-main">
        <section className="pending-notice">
          <i className="ti ti-hourglass" />
          <div>
            <p className="pending-notice-title">幹部の確認待ちです</p>
            <p className="pending-notice-text">
              確認が終わると、名簿・チャット・掲示板・アーカイブ・フォームが使えるようになります。
            </p>
          </div>
        </section>

        <h1 className="pending-greeting">{member.name}さん、こんにちは</h1>
        <p className="pending-sub">{memberSubtitle(member)}</p>

        <button className="pending-primary" onClick={() => navigate("/intro")}>
          サークル紹介を見る
        </button>

        <section className="pending-card">
          <p className="pending-card-title">確認後に使える機能</p>
          <p className="pending-card-text">名簿 · チャット · 掲示板 · アーカイブ · フォーム · バンド · 機材</p>
        </section>

        {message && <p className="pending-message">{message}</p>}

        <div className="pending-links">
          <button className="pending-link" onClick={handleCheck} disabled={checking}>
            {checking ? "確認しています..." : "確認状況を更新する"}
          </button>
          <button className="pending-link muted" onClick={() => signOut(auth)}>
            ログアウト
          </button>
        </div>
      </main>
    </div>
  );
}

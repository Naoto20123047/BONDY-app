import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { sendVerificationMail } from "../../lib/emailVerification";
import "./loginScreen.css";

/** 開いている間に確認状況を取り直す間隔 */
const POLL_INTERVAL_MS = 4000;

/** 確認メールを送り直せるまでの待ち時間(連打で送信制限にかかるのを防ぐ) */
const RESEND_COOLDOWN_SEC = 60;

/**
 * メール確認待ち(v1.3.2)
 *
 * 新規登録の直後、確認メールのリンクを開くまで表示する。
 * 既にメンバーの人には出さない(App.tsx で分岐している)。
 *
 * リンクは別のタブやスマホのメールアプリで開かれることが多いため、
 * タブに戻ったときと、開いている間は数秒おきに確認状況を取り直し、
 * 確認できたら自動でサークル紹介に進む。
 */
export default function VerifyEmailScreen() {
  const { firebaseUser, reloadUser } = useAuth();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadUser();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") reloadUser();
    }, POLL_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, [reloadUser]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    if (!firebaseUser || cooldown > 0) return;
    setError(null);
    setMessage(null);
    const ok = await sendVerificationMail(firebaseUser);
    if (ok) {
      setMessage("確認メールを再送しました。届くまで数分かかることがあります。");
      setCooldown(RESEND_COOLDOWN_SEC);
    } else {
      setError("送信できませんでした。しばらく時間をおいてから再度お試しください。");
    }
  };

  const checkNow = async () => {
    setChecking(true);
    setError(null);
    const verified = await reloadUser();
    setChecking(false);
    if (!verified) {
      setError("まだ確認が完了していません。メールのリンクを開いてから、もう一度お試しください。");
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-glow" />
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo.png" alt="BONDY" className="login-logo-img" />
          <span className="login-brand-name">BONDYアプリ</span>
        </div>

        <h1 className="login-heading">メールアドレスの確認</h1>
        <p className="login-sub">
          <strong>{firebaseUser?.email}</strong> に確認メールを送信しました。
          メール内のリンクを開くと、登録の続きに進みます。
        </p>
        <p className="login-sub">
          リンクを開いた後は、この画面に戻ると自動で次に進みます。
          メールが見つからない場合は、迷惑メールフォルダも確認してください。
        </p>

        {message && <p className="login-info">{message}</p>}
        {error && <p className="login-error">{error}</p>}

        <button className="login-submit" onClick={resend} disabled={cooldown > 0}>
          {cooldown > 0 ? `確認メールを再送（${cooldown}秒後に再送可能）` : "確認メールを再送"}
        </button>

        <div className="login-switch">
          <button className="login-switch-link" onClick={checkNow} disabled={checking}>
            {checking ? "確認中..." : "確認状況を更新する"}
          </button>
        </div>
        <div className="login-switch">
          <button className="login-switch-link" onClick={() => signOut(auth)}>
            別のメールアドレスで登録する（ログアウト）
          </button>
        </div>
      </div>
    </div>
  );
}

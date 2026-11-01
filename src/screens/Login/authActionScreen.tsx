import { useEffect, useState } from "react";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import "./loginScreen.css";

/**
 * メールのリンクを開いたときの画面(/auth/action)
 *
 * Firebase コンソールの「Authentication → テンプレート → アクション URL」を
 * ここ(https://bondy-app-66ca4.web.app/auth/action)に向けると、
 * 確認メール・パスワード再設定・メールアドレス変更のリンクがすべてここに来る。
 * アクション URL は全テンプレートで共通のため、mode で中身を切り替えている。
 *
 *   verifyEmail          … 新規登録時のメール確認
 *   verifyAndChangeEmail … メールアドレスの変更(新しいアドレスの確認)
 *   recoverEmail         … メールアドレス変更の取り消し(元のアドレスに届く)
 *   resetPassword        … パスワード再設定
 *
 * ログインしていてもいなくても開ける(スマホのメールアプリから開かれることが多いため)。
 */

type Phase = "working" | "done" | "error" | "password";

export default function AuthActionScreen() {
  const { reloadUser, firebaseUser } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") ?? "";
  const oobCode = params.get("oobCode") ?? "";

  const [phase, setPhase] = useState<Phase>("working");
  const [title, setTitle] = useState("確認しています");
  const [message, setMessage] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!oobCode) {
        setPhase("error");
        setTitle("リンクが正しくありません");
        setMessage("メールに記載されたリンクを、もう一度開いてください。");
        return;
      }
      try {
        if (mode === "verifyEmail") {
          await applyActionCode(auth, oobCode);
          await reloadUser();
          setPhase("done");
          setTitle("メールアドレスを確認しました");
          setMessage(
            firebaseUser
              ? "登録の続きに進めます。"
              : "登録を始めた画面（タブ）に戻ると、自動で次に進みます。この画面は閉じてかまいません。"
          );
        } else if (mode === "verifyAndChangeEmail") {
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          setPhase("done");
          setTitle("メールアドレスを変更しました");
          setMessage(
            `ログインに使うメールアドレスが ${info.data.email ?? "新しいアドレス"} になりました。` +
              "変更後のアドレスで、もう一度ログインしてください。"
          );
        } else if (mode === "recoverEmail") {
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          setPhase("done");
          setTitle("メールアドレスを元に戻しました");
          setMessage(
            `ログインに使うメールアドレスを ${info.data.email ?? "元のアドレス"} に戻しました。` +
              "心当たりのない変更だった場合は、パスワードも変更してください。"
          );
        } else if (mode === "resetPassword") {
          const email = await verifyPasswordResetCode(auth, oobCode);
          setResetEmail(email);
          setPhase("password");
          setTitle("新しいパスワードの設定");
        } else {
          setPhase("error");
          setTitle("リンクが正しくありません");
          setMessage("メールに記載されたリンクを、もう一度開いてください。");
        }
      } catch (e) {
        console.error("メールのリンクの処理に失敗しました", e);
        setPhase("error");
        setTitle("リンクの有効期限が切れているか、既に使用されています");
        setMessage(
          mode === "verifyEmail"
            ? "確認が済んでいる場合は、そのまま登録の続きに進めます。済んでいない場合は、確認待ちの画面から確認メールを再送してください。"
            : "お手数ですが、もう一度最初から操作してください。"
        );
      }
    };
    run();
    // リンクの処理は1回だけ行う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitPassword = async () => {
    if (newPassword.length < 6) {
      setMessage("パスワードは6文字以上で設定してください。");
      return;
    }
    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setPhase("done");
      setTitle("パスワードを変更しました");
      setMessage("新しいパスワードでログインしてください。");
    } catch (e) {
      console.error("パスワードの変更に失敗しました", e);
      setMessage("変更できませんでした。もう一度最初から操作してください。");
    } finally {
      setSaving(false);
    }
  };

  const goHome = () => {
    // クエリ(oobCode)を残さずにアプリの最初の画面へ
    window.location.replace("/");
  };

  return (
    <div className="login-page">
      <div className="login-bg-glow" />
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo.png" alt="BONDY" className="login-logo-img" />
          <span className="login-brand-name">BONDYアプリ</span>
        </div>

        <h1 className="login-heading">{title}</h1>
        {phase === "working" && <p className="login-sub">しばらくお待ちください。</p>}

        {phase === "password" && (
          <>
            <p className="login-sub">{resetEmail} のパスワードを再設定します。</p>
            <div className="login-field">
              <label className="login-label">新しいパスワード</label>
              <input
                className="login-input"
                type="password"
                placeholder="6文字以上"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {message && <p className="login-error">{message}</p>}
            <button className="login-submit" onClick={submitPassword} disabled={saving}>
              {saving ? "処理中..." : "パスワードを変更する"}
            </button>
          </>
        )}

        {(phase === "done" || phase === "error") && (
          <>
            <p className={phase === "done" ? "login-info" : "login-error"}>{message}</p>
            <button className="login-submit" onClick={goHome}>
              アプリを開く
            </button>
          </>
        )}
      </div>
    </div>
  );
}

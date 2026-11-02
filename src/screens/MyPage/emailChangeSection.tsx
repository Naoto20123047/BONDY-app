import { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { auth } from "../../lib/firebase";
import "./emailChangeSection.css";

/**
 * ログイン用メールアドレスの変更(プロフィール編集の一番下)。
 *
 * いつでも変更できる。大学のメールは卒業すると使えなくなるので、卒業前に変えておくと
 * 卒業後も同じアカウントで使い続けられる。
 *
 *  1. 今のパスワードを入れてもらい、本人か確かめる
 *     (開きっぱなしの画面から他人に勝手に変えられるのを防ぐ)
 *  2. 新しいアドレスに確認メールを送る。リンクを開いた時点で切り替わる
 *     (それまでは今のアドレスでログインできる)
 *  3. 切り替わると、元のアドレスにも「メールアドレスが変更されました」が届き、
 *     身に覚えがなければそこから元に戻せる(Firebase の標準の仕組み)
 *
 * 名簿に表示するメールは、次にログインしたときに自動で新しいアドレスに合わせる(AuthContext)。
 */
export default function EmailChangeSection() {
  const user = auth.currentUser;
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!user || !user.email) return null;
  const currentEmail = user.email;

  const send = async (target: string) => {
    setError(null);
    const trimmed = target.trim();
    if (!trimmed || !password) {
      setError("新しいメールアドレスと、今のパスワードを入力してください。");
      return;
    }
    if (trimmed.toLowerCase() === currentEmail.toLowerCase()) {
      setError("今と同じメールアドレスです。");
      return;
    }

    setSending(true);
    try {
      // 本人か確かめる
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(currentEmail, password)
      );
      // 新しいアドレスに確認メールを送る。リンクを開くまでは切り替わらない
      await verifyBeforeUpdateEmail(user, trimmed, { url: `${window.location.origin}/` });
      setSentTo(trimmed);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("今のパスワードが正しくありません。");
      } else if (code === "auth/invalid-email") {
        setError("新しいメールアドレスの形式が正しくありません。");
      } else if (code === "auth/email-already-in-use") {
        setError("このメールアドレスは、別のアカウントで使われています。");
      } else if (code === "auth/too-many-requests") {
        setError("短時間に何度も操作されたため、しばらく送信できません。時間をおいて再度お試しください。");
      } else {
        setError("確認メールの送信に失敗しました。時間をおいて再度お試しください。");
      }
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setSentTo(null);
    setNewEmail("");
    setPassword("");
    setError(null);
  };

  return (
    <section className="email-change">
      <h3 className="email-change-title">ログイン用メールアドレスの変更</h3>

      {sentTo ? (
        <>
          <div className="email-change-sent">
            <i className="ti ti-mail-forward" />
            <div>
              <p className="email-change-sent-title">確認メールを送りました</p>
              <p className="email-change-sent-text">
                {sentTo} に届いたリンクを開くと、ログイン用のメールが切り替わります。
              </p>
              <p className="email-change-sent-text">
                リンクを開くまでは、今のアドレス({currentEmail})でログインできます。
              </p>
            </div>
          </div>
          {error && <p className="email-change-error">{error}</p>}
          <div className="email-change-actions">
            <button className="email-change-secondary" onClick={() => send(sentTo)} disabled={sending}>
              {sending ? "送信中..." : "確認メールを再送する"}
            </button>
            <button className="email-change-secondary muted" onClick={reset}>
              別のアドレスを入力する
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="email-change-desc">
            いつでも変更できます。大学のメールは卒業すると使えなくなるので、卒業前に変えておくと安心です。
          </p>
          {/* v1.4.1: 名簿のアドレスもこのアドレスに変わり、部員から見えることを先に伝える */}
          <p className="email-change-desc">
            変更すると、名簿に表示されるメールアドレスも新しいアドレスに変わり、サークルの部員から見えるようになります。
            個人のアドレスを部員に見せたくない場合は、そのつもりで選んでください。
          </p>

          <div className="edit-field">
            <label className="edit-label">今のログイン用メール</label>
            <input className="edit-input" value={currentEmail} disabled />
          </div>

          <div className="edit-field">
            <label className="edit-label">新しいメールアドレス</label>
            <input
              className="edit-input editable"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </div>

          <div className="edit-field">
            <label className="edit-label">今のパスワード</label>
            <input
              className="edit-input editable"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <p className="email-change-error">{error}</p>}

          <button className="email-change-submit" onClick={() => send(newEmail)} disabled={sending}>
            {sending ? "送信中..." : "確認メールを送る"}
          </button>
        </>
      )}
    </section>
  );
}

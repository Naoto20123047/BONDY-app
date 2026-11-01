import "./loginScreen.css";
import { useLogin } from "./useLogin";

export default function LoginScreen() {
  const {
    mode,
    email,
    setEmail,
    password,
    setPassword,
    error,
    info,
    loading,
    handleSubmit,
    changeMode,
    expelledBlocked,
    signupType,
    setSignupType,
  } = useLogin();

  const titleMap = {
    login: "ログイン",
    signup: "新規登録",
    reset: "パスワード再設定",
  };

  const buttonMap = {
    login: "ログイン",
    signup: "登録する",
    reset: "再設定メールを送信",
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="login-page">
      <div className="login-bg-glow" />
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo.png" alt="BONDY" className="login-logo-img" />
          <span className="login-brand-name">BONDYアプリ</span>
        </div>

        <h1 className="login-heading">{titleMap[mode]}</h1>
        <p className="login-sub">
          {mode === "reset"
            ? "登録済みのメールアドレスに再設定用のリンクを送ります。"
            : mode === "signup"
              ? signupType === "student"
                ? "在学生は大学のメールアドレスで登録してください。"
                : "教員・OBの方は、どのメールアドレスでも登録できます。幹部の確認が済むまでは、一部の機能が制限されます。"
              : "登録済みのメールアドレスでログインしてください。"}
        </p>

        {/* A-3: 除籍済みのアカウントでサインインが通ってしまった場合、
            AuthContext 側でサインアウトしたうえでここに理由を出す。
            退会(本人の意思)の場合は締め出さず、復帰画面へ進む */}
        {expelledBlocked && (
          <p className="login-error">
            このアカウントは現在ご利用いただけません。心当たりがない場合は幹部に連絡してください。
          </p>
        )}

        {mode === "signup" && (
          <div className="login-field">
            <label className="login-label">区分</label>
            <div className="login-segment" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={signupType === "student"}
                className={`login-segment-item ${signupType === "student" ? "active" : ""}`}
                onClick={() => setSignupType("student")}
              >
                在学生
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={signupType === "guest"}
                className={`login-segment-item ${signupType === "guest" ? "active" : ""}`}
                onClick={() => setSignupType("guest")}
              >
                教員・OB
              </button>
            </div>
          </div>
        )}

        <div className="login-field">
          <label className="login-label">メールアドレス</label>
          <input
            className="login-input"
            type="email"
            placeholder={mode === "signup" && signupType === "guest" ? "name@example.com" : "name@kaishi-pu.ac.jp"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {mode !== "reset" && (
          <div className="login-field">
            <label className="login-label">パスワード</label>
            <input
              className="login-input"
              type="password"
              placeholder="6文字以上"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {mode === "login" && (
              <button className="login-forgot" onClick={() => changeMode("reset")}>
                パスワードをお忘れですか?
              </button>
            )}
          </div>
        )}

        {error && <p className="login-error">{error}</p>}
        {info && <p className="login-info">{info}</p>}

        <button className="login-submit" onClick={handleSubmit} disabled={loading}>
          {loading ? "処理中..." : buttonMap[mode]}
        </button>

        <div className="login-switch">
          {mode === "login" && (
            <>
              アカウントをお持ちでない方は{" "}
              <button className="login-switch-link" onClick={() => changeMode("signup")}>
                新規登録
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              すでにアカウントをお持ちの方は{" "}
              <button className="login-switch-link" onClick={() => changeMode("login")}>
                ログイン
              </button>
            </>
          )}
          {mode === "reset" && (
            <button className="login-switch-link" onClick={() => changeMode("login")}>
              ← ログインに戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

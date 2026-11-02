import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { sendVerificationMail } from "../../lib/emailVerification";
import { isUniversityEmail } from "../../lib/memberCategory";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";


/** 新規登録のパスワードの最低文字数(v1.4.1) */
const MIN_PASSWORD_LENGTH = 8;

export function useLogin() {
  const { expelledBlocked, clearExpelledBlocked } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  // 新規登録の区分(v1.4.0)。在学生は大学のアドレスのみ、教員・OBはどのアドレスでも可
  const [signupType, setSignupType] = useState<"student" | "guest">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * v1.4.0: ログインとパスワード再設定はどのアドレスでもできる
   * (卒業後に外部のアドレスへ切り替えた人と、教員・OBのため)。
   * 大学のアドレスに限るのは「在学生の新規登録」だけ。
   * 守りの本体は Firestore のルール(在学生としての登録は、確認済みの大学アドレスのみ)。
   */
  const validate = () => {
    if (mode === "reset") {
      if (!email) {
        setError("メールアドレスを入力してください。");
        return false;
      }
      return true;
    }
    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください。");
      return false;
    }
    if (mode === "signup" && signupType === "student" && !isUniversityEmail(email.trim())) {
      setError(
        "在学生は大学のメールアドレス(@kaishi-pu.ac.jp)で登録してください。教員・OBの方は「教員・OB」を選んでください。"
      );
      return false;
    }
    // v1.4.1: 6文字から8文字に引き上げた(Firebase の最低は6文字)。
    // 既存のアカウントのログインには影響しない
    if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で設定してください。`);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    // 前回の「除籍済みで弾かれた」表示を消してから再試行する
    clearExpelledBlocked();
    if (!validate()) return;

    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        // 確認メールを送る。リンクを開くまではプロフィール登録に進めない
        // (ルールも確認済みの大学アドレスでなければ Member を作らせない)
        await sendVerificationMail(credential.user);
      } else if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setInfo("入力したアドレスが登録されていれば、パスワード再設定用のメールを送信しました。");
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (mode === "login") {
        // A-3: 除籍で Auth アカウントを無効化したアカウント。
        // 退会(本人の意思)は無効化していないので、ここには来ない
        if (code === "auth/user-disabled") {
          setError("このアカウントは現在ご利用いただけません。心当たりがない場合は幹部に連絡してください。");
        } else if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
          setError("メールアドレスまたはパスワードが正しくありません。");
        } else {
          setError("ログインに失敗しました。時間をおいて再度お試しください。");
        }
      } else if (mode === "signup") {
        // v1.4.1: 「このアドレスは登録済み」とは出さない。
        // あるアドレスが BONDY にアカウントを持っているかを、外から調べられてしまうため
        if (code === "auth/email-already-in-use") {
          setError(
            "登録できませんでした。すでにアカウントをお持ちの場合は、ログインかパスワードの再設定をお試しください。"
          );
        } else if (code === "auth/weak-password" || code === "auth/password-does-not-meet-requirements") {
          setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で、推測されにくいものを設定してください。`);
        } else {
          setError("登録に失敗しました。時間をおいて再度お試しください。");
        }
      } else {
        // v1.4.1: 登録の有無が分からないよう、見つからない場合も送信済みと同じ表示にする
        if (code === "auth/user-not-found") {
          setInfo("入力したアドレスが登録されていれば、パスワード再設定用のメールを送信しました。");
        } else {
          setError("メールの送信に失敗しました。時間をおいて再度お試しください。");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const changeMode = (newMode: "login" | "signup" | "reset") => {
    setError(null);
    setInfo(null);
    clearExpelledBlocked();
    setMode(newMode);
  };

  return {
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
  } as const;
}

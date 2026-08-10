import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../../lib/firebase";

export function useLogin() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validateDomain = (mail: string) => mail.endsWith("@kaishi-pu.ac.jp");

  const validate = () => {
    if (mode === "reset") {
      if (!email) {
        setError("メールアドレスを入力してください。");
        return false;
      }
      if (!validateDomain(email)) {
        setError("大学のメールアドレス(@kaishi-pu.ac.jp)を入力してください。");
        return false;
      }
      return true;
    }
    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください。");
      return false;
    }
    if (!validateDomain(email)) {
      setError("大学のメールアドレス(@kaishi-pu.ac.jp)で登録してください。");
      return false;
    }
    if (mode === "signup" && password.length < 6) {
      setError("パスワードは6文字以上で設定してください。");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    if (!validate()) return;

    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setInfo("パスワード再設定用のメールを送信しました。メールをご確認ください。");
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (mode === "login") {
        if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
          setError("メールアドレスまたはパスワードが正しくありません。");
        } else {
          setError("ログインに失敗しました。時間をおいて再度お試しください。");
        }
      } else if (mode === "signup") {
        if (code === "auth/email-already-in-use") {
          setError("このメールアドレスはすでに登録されています。");
        } else if (code === "auth/weak-password") {
          setError("パスワードは6文字以上で設定してください。");
        } else {
          setError("登録に失敗しました。時間をおいて再度お試しください。");
        }
      } else {
        if (code === "auth/user-not-found") {
          setError("このメールアドレスは登録されていません。");
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
  } as const;
}
import { useState } from "react";
import IntroScreen from "./introScreen";
import ProfileSetupScreen from "./profileSetupScreen";

/**
 * 加入までの流れをまとめたもの。
 *
 * アカウントはあるが Member ドキュメントが無い人(見学者)に表示する。
 *   紹介画面 →「加入する」→ プロフィール登録 → Member 作成でアプリ本体へ
 *
 * 既にメンバーの人はここを通らない。
 * 幹部に完全削除された人も Member が無いのでここに来る(新規メンバー扱い)。
 */
export default function JoinFlow() {
  const [step, setStep] = useState<"intro" | "profile">("intro");

  if (step === "profile") {
    return <ProfileSetupScreen onBack={() => setStep("intro")} />;
  }

  return <IntroScreen onJoin={() => setStep("profile")} />;
}

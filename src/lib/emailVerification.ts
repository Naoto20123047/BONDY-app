/**
 * メールアドレスの本人確認(v1.3.2)
 *
 * 以前は大学アドレスかどうかを登録画面で見ているだけで、確認メールを送っていなかった。
 * そのため実在しない大学アドレスでもアカウントが作れ、プロフィール登録まで進めば
 * 部員として名簿・チャット・掲示板が見えていた。
 *
 * 今は新規登録の直後に確認メールを送り、リンクを開くまでプロフィール登録に進ませない。
 * 守りの本体は Firestore のルール(members の create は確認済みの大学アドレスだけ)。
 *
 * ■ リンクの開き先
 * /auth/action に確認完了の画面がある(screens/Login/authActionScreen.tsx)。
 * Firebase コンソールの「Authentication → テンプレート → アクション URL」を
 * https://bondy-app-66ca4.web.app/auth/action に変えると、リンクから直接この画面が開く。
 * 変えていない間も、Firebase 既定の画面の「続行」からアプリに戻るので動作はする。
 */

import { sendEmailVerification, type User } from "firebase/auth";

/** 確認メールのリンクを開いた後に戻ってくる先 */
export const actionCodeSettings = () => ({
  url: `${window.location.origin}/auth/action`,
  handleCodeInApp: true,
});

/**
 * 確認メールを送る。失敗しても例外は投げず false を返す
 * (登録そのものは成立しているので、確認待ちの画面から送り直せる)。
 */
export async function sendVerificationMail(user: User): Promise<boolean> {
  try {
    await sendEmailVerification(user, actionCodeSettings());
    return true;
  } catch (e) {
    console.error("確認メールの送信に失敗しました", e);
    return false;
  }
}

/**
 * Cloudflare Worker の呼び出し
 *
 * Spark プランでは Cloud Functions が使えないため、サーバーでしかできない処理を
 * Worker に置いている。認証は Firebase の ID トークンで、Worker 側で署名を検証し、
 * Firestore の Member(status / role)を見て権限を判定する。
 *
 * Worker の URL は .env の VITE_WORKER_URL に置く。
 * 未設定でもアプリが壊れないよう、呼び出し側で isWorkerConfigured() を見て分岐すること。
 */

import { auth } from "./firebase";

const WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? "").replace(/\/$/, "");

/** Worker の URL が設定されているか */
export function isWorkerConfigured(): boolean {
  return WORKER_URL !== "";
}

/**
 * Worker にリクエストを送る。
 * 失敗した場合は例外を投げるので、呼び出し側で握りつぶすか通知するかを決めること。
 */
export async function callWorker<T>(path: string, body: unknown): Promise<T> {
  if (!WORKER_URL) {
    throw new Error("VITE_WORKER_URL が設定されていません");
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("認証情報が見つかりません");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as { error?: string };
      detail = data.error ?? "";
    } catch {
      // ボディが JSON でない場合は無視する
    }
    throw new Error(`Workerの呼び出しに失敗しました (${response.status} ${detail})`);
  }

  return (await response.json()) as T;
}

/**
 * A-3: Auth アカウントを無効化する(除籍時)
 *
 * members のドキュメントID = Firebase Auth の UID なので、memberId をそのまま渡す。
 * 幹部のみ実行できる。
 *
 * 退会(本人の意思)では呼ばない。退会者は再ログインで復帰できる仕様のため、
 * アカウントを生かしておく必要がある。
 */
export async function disableAuthAccount(targetUid: string): Promise<void> {
  await callWorker("/admin/disable-user", { targetUid, disabled: true });
}

/**
 * 無効化したアカウントを戻す(除籍者を在籍に戻すとき)
 * 幹部のみ実行できる。
 */
export async function enableAuthAccount(targetUid: string): Promise<void> {
  await callWorker("/admin/disable-user", { targetUid, disabled: false });
}

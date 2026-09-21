/**
 * Teams への通知(C-2)
 *
 * Spark プランでは Cloud Functions が使えないため、**通知はクライアント発火**になる。
 * 投稿した人のブラウザから Worker にリクエストを送り、Worker が Teams の
 * Workflows Webhook へ転送する。Webhook URL は Worker の Secrets にあり、
 * アプリ側(public リポジトリ)には存在しない。
 *
 * 重要な前提が2つある。
 *
 *  1. **通知の失敗でアプリ本体の操作を失敗させない。**
 *     投稿そのものは成立させ、通知のエラーは握りつぶす。
 *     このファイルの関数は例外を投げない。
 *
 *  2. **投稿直後にタブを閉じられると通知は飛ばない。**
 *     サーバーが無い以上どうにもならないため、確実性が落ちる点は許容する。
 *
 * 全体チャットの発言は対象外。「チャットは通知のない交流の場」という方針は維持する。
 */

import { callWorker, isWorkerConfigured } from "./workerClient";

/** アプリ内のパスから、Teams に貼る絶対URLを作る */
const linkTo = (path: string): string => `${window.location.origin}${path}`;

/**
 * Teams にテキストを送る。失敗しても例外は投げない。
 * Worker が未設定の間は何もしない(ローカル開発やデプロイ前でも動くように)。
 */
export async function notifyTeams(text: string): Promise<void> {
  if (!isWorkerConfigured()) return;
  try {
    await callWorker("/notify/teams", { text });
  } catch (e) {
    console.error("Teamsへの通知に失敗しました", e);
  }
}

/**
 * 掲示板の新規投稿
 *
 * 本文の抜粋は載せない。
 *
 * **匿名投稿は通知しない。**
 * Teams の Workflows は投稿の差出人として「フローの所有者」の氏名を必ず表示し、
 * これを消す設定が存在しない。カード本文を「匿名のメンバー」にしても、
 * 差出人欄にフロー所有者の氏名が並ぶため、その人が投稿したと誤読される。
 * 匿名で書いた人が目立ちたくないことを踏まえ、全体チャネルには流さない。
 * (v1.2.0 で通知経由の実名漏れを塞いだ方針の延長)
 *
 * この判断は通知側で閉じる。呼び出し側が忘れても漏れないよう、ここで弾く。
 */
export async function notifyNewPost(params: {
  postId: string;
  category: string;
  title: string;
  authorName: string;
  isAnonymous: boolean;
}): Promise<void> {
  if (params.isAnonymous) return;

  await notifyTeams(
    [
      `【掲示板】${params.category}`,
      `「${params.title}」`,
      `投稿者: ${params.authorName}さん`,
      linkTo(`/board/${params.postId}`),
    ].join("\n")
  );
}

/** フォームの新規作成 */
export async function notifyNewForm(params: {
  formId: string;
  typeLabel: string;
  title: string;
  deadline: string;
}): Promise<void> {
  await notifyTeams(
    [
      `【フォーム】${params.typeLabel}`,
      `「${params.title}」`,
      `締切: ${params.deadline}`,
      linkTo(`/forms/${params.formId}`),
    ].join("\n")
  );
}

/** バンドの結成申請 */
export async function notifyNewBand(params: {
  bandName: string;
  memberNames: string[];
}): Promise<void> {
  await notifyTeams(
    [
      "【バンド】結成が申請されました",
      `「${params.bandName}」`,
      `メンバー: ${params.memberNames.join("、")}`,
      linkTo("/bands"),
    ].join("\n")
  );
}

/** 機材の新規登録 */
export async function notifyNewEquipment(params: {
  name: string;
  category: string;
  quantity: number;
}): Promise<void> {
  await notifyTeams(
    [
      "【機材】新しい機材が登録されました",
      `「${params.name}」${params.quantity}点`,
      `分類: ${params.category}`,
      linkTo("/equipment"),
    ].join("\n")
  );
}

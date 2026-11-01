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
 *
 * **v1.3.2: アプリからは本文を送らない。**
 * 以前は本文をそのまま Worker に渡していたため、在籍者なら誰でも
 * アプリの公式通知に見える形で任意の文章をサークル全体に流せた。
 * 今は「種類と対象のID」だけを送り、Worker がその ID で Firestore を読んで
 * 文面を組み立てる。読み取りは呼び出した人の権限で行うので、その人が
 * 読めないものは送れない。同じ対象への通知は1回だけ(Worker が記録する)。
 */

import { callWorker, isWorkerConfigured } from "./workerClient";

/** Teams に流せる通知の種類。文面は Worker 側(worker/src/teams.ts)にある */
export type TeamsNotifyType = "post" | "form" | "band" | "equipment";

/**
 * Teams への通知を Worker に頼む。失敗しても例外は投げない。
 * Worker が未設定の間は何もしない(ローカル開発やデプロイ前でも動くように)。
 */
async function requestTeamsNotify(type: TeamsNotifyType, id: string): Promise<void> {
  if (!isWorkerConfigured()) return;
  try {
    await callWorker("/notify/teams", { type, id });
  } catch (e) {
    console.error("Teamsへの通知に失敗しました", e);
  }
}

/**
 * 掲示板の新規投稿。
 *
 * **匿名投稿は通知しない。**
 * Teams の Workflows は投稿の差出人として「フローの所有者」の氏名を必ず表示し、
 * これを消す設定が存在しない。カード本文を「匿名のメンバー」にしても、
 * 差出人欄にフロー所有者の氏名が並ぶため、その人が投稿したと誤読される。
 * Worker 側でも匿名投稿は弾いている。
 */
export const notifyNewPost = (postId: string) => requestTeamsNotify("post", postId);

/** フォームの新規作成(幹部のみ) */
export const notifyNewForm = (formId: string) => requestTeamsNotify("form", formId);

/** バンドの結成申請(そのバンドのメンバーのみ) */
export const notifyNewBand = (bandId: string) => requestTeamsNotify("band", bandId);

/** 機材の新規登録(幹部のみ) */
export const notifyNewEquipment = (equipmentId: string) =>
  requestTeamsNotify("equipment", equipmentId);

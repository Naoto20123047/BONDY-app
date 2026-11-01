/**
 * Teams への通知の文面(v1.3.2)
 *
 * 以前はアプリから受け取った本文をそのまま流していたため、在籍者なら誰でも
 * アプリの公式通知に見える形で、任意の文章をサークル全体に送れた。
 *
 * 今はアプリから「種類と対象のID」だけを受け取り、ここで Firestore から
 * 対象を読んで文面を組み立てる。読み取りは呼び出した人の ID トークンで行うので、
 * その人が読めないものは送れない。種類ごとに「誰が送ってよいか」も確かめる。
 *
 *   post      … 掲示板の投稿。投稿者本人だけ。匿名投稿は送らない
 *   form      … フォーム。幹部だけ
 *   band      … バンドの結成申請。そのバンドのメンバーだけ
 *   equipment … 機材の登録。幹部だけ
 *
 * 同じ対象への通知は1回だけにする(KV に送信済みの印を残す)。
 */

import { fetchDocAsCaller, isOfficer, type MemberInfo } from "./firestore";

export type TeamsNotifyType = "post" | "form" | "band" | "equipment";

export const TEAMS_NOTIFY_TYPES: TeamsNotifyType[] = ["post", "form", "band", "equipment"];

/** 送信済みの印を残す期間。これより前の対象は、そもそも新規作成の通知にならない */
export const SENT_MARK_TTL = 60 * 60 * 24 * 90;

/** 新規作成から何分以内なら通知してよいか(古い投稿を掘り起こして流すのを防ぐ) */
const FRESH_MINUTES = 30;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** フォーム種別の表示名(アプリの lib/formLabel.ts と同じ) */
const formTypeLabel = (type: string): string =>
  type === "イベント" ? "バンドフォーム" : "個別アンケート";

export interface ComposeContext {
  idToken: string;
  projectId: string;
  appOrigin: string;
  caller: { uid: string; member: MemberInfo | null };
}

export type ComposeResult =
  | { ok: true; text: string }
  | { ok: false; status: number; error: string };

const deny = (status: number, error: string): ComposeResult => ({ ok: false, status, error });

function isFresh(iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= FRESH_MINUTES * 60 * 1000;
}

/** 種類と ID から、Teams に流す文面を組み立てる */
export async function composeTeamsText(
  type: TeamsNotifyType,
  id: string,
  ctx: ComposeContext
): Promise<ComposeResult> {
  const read = (collection: string, docId: string) =>
    fetchDocAsCaller(ctx.idToken, ctx.projectId, collection, docId);

  if (type === "post") {
    const post = await read("posts", id);
    if (!post) return deny(404, "not_found");
    // 匿名投稿は送らない(差出人欄にフロー所有者の氏名が出て、誤読されるため)
    if (post.isAnonymous === true) return deny(400, "anonymous_post");
    if (str(post.authorId) !== ctx.caller.uid) return deny(403, "forbidden");
    if (!isFresh(str(post.createdAt))) return deny(400, "too_old");
    const author = await read("members", ctx.caller.uid);
    return {
      ok: true,
      text: [
        `【掲示板】${str(post.category)}`,
        `「${str(post.title)}」`,
        `投稿者: ${str(author?.name) || "メンバー"}さん`,
        `${ctx.appOrigin}/board/${id}`,
      ].join("\n"),
    };
  }

  if (type === "form") {
    if (!isOfficer(ctx.caller.member)) return deny(403, "forbidden");
    const form = await read("forms", id);
    if (!form) return deny(404, "not_found");
    return {
      ok: true,
      text: [
        `【フォーム】${formTypeLabel(str(form.type))}`,
        `「${str(form.title)}」`,
        `締切: ${str(form.deadline)}`,
        `${ctx.appOrigin}/forms/${id}`,
      ].join("\n"),
    };
  }

  if (type === "band") {
    const band = await read("bands", id);
    if (!band) return deny(404, "not_found");
    const memberIds = Array.isArray(band.memberIds) ? (band.memberIds as unknown[]).map(str) : [];
    if (!memberIds.includes(ctx.caller.uid)) return deny(403, "forbidden");
    if (str(band.status) !== "申請中") return deny(400, "not_pending");
    const names: string[] = [];
    for (const memberId of memberIds.slice(0, 12)) {
      const m = await read("members", memberId);
      names.push(str(m?.name) || "メンバー");
    }
    return {
      ok: true,
      text: [
        "【バンド】結成が申請されました",
        `「${str(band.name)}」`,
        `メンバー: ${names.join("、")}`,
        `${ctx.appOrigin}/bands`,
      ].join("\n"),
    };
  }

  // equipment
  if (!isOfficer(ctx.caller.member)) return deny(403, "forbidden");
  const equipment = await read("equipment", id);
  if (!equipment) return deny(404, "not_found");
  return {
    ok: true,
    text: [
      "【機材】新しい機材が登録されました",
      `「${str(equipment.name)}」${Number(equipment.totalQuantity) || 0}点`,
      `分類: ${str(equipment.category)}`,
      `${ctx.appOrigin}/equipment`,
    ].join("\n"),
  };
}

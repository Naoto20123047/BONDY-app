/**
 * BONDY Worker
 *
 * Firebase Spark プランでは Cloud Functions が使えないため、サーバー側の処理を
 * まとめて引き受ける中継役。秘匿情報(Teamsのwebhook URL、サービスアカウント鍵)は
 * すべて Worker の Secrets に置き、public リポジトリには含めない。
 *
 * 実装済みのエンドポイント
 *   GET  /health              疎通確認(認証不要)
 *   POST /notify/teams        Teams への通知中継。本文は Worker が組み立てる(v1.3.2)
 *   POST /admin/disable-user  Auth アカウントの無効化/有効化  … A-3(除籍)
 *   POST /images/upload       紹介ページ用の画像を保存する(幹部のみ)
 *   POST /images/sign         画像の署名付きURLを発行する(在籍者か、メール確認済みの人)
 *   POST /images/delete       画像を消す(幹部のみ)
 *   GET  /images/file         画像の本体を返す(署名で保護。IDトークンは使わない)
 *   POST /admin/backup/latest いちばん新しい定期バックアップを返す(幹部のみ。v1.4.1)
 *
 * 定期実行(Cron。v1.4.1)
 *   週に1回、主要なコレクションを KV にバックアップする(backup.ts)
 *
 * 認証は /images/file を除き Firebase ID トークン。
 * 権限判定は Firestore の Member(status / role)を参照し、メールアドレスは使わない。
 * /images/file だけは <img> タグから読まれるためヘッダを付けられず、
 * 期限付きの HMAC 署名で守っている(imageStore.ts のコメント参照)。
 */

import { verifyIdToken, extractBearerToken } from "./auth";
import {
  fetchDocAsCaller,
  fetchMyMember,
  isActiveMember,
  isOfficer,
  type MemberInfo,
} from "./firestore";
import { getLatestBackup, runBackup } from "./backup";
import { composeTeamsText, SENT_MARK_TTL, TEAMS_NOTIFY_TYPES, type TeamsNotifyType } from "./teams";
import { parseServiceAccount, getAccessToken } from "./google";
import {
  SIGNATURE_TTL,
  isValidImageId,
  buildSignedUrl,
  verifySignedUrl,
  putImage,
  getImage,
  deleteImage,
} from "./imageStore";

export interface Env {
  // wrangler.toml の vars
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  /** Teams の通知に載せるアプリのURL(v1.3.2) */
  APP_ORIGIN: string;

  // wrangler.toml の kv_namespaces
  IMAGES: KVNamespace;

  // wrangler secret put で設定する
  TEAMS_WEBHOOK_URL: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  IMAGE_SIGNING_KEY: string;
  /**
   * 定期バックアップ用のサービスアカウント(v1.4.1。任意)。
   * 「Cloud Datastore 閲覧者」だけを付けたものにすること。未設定ならバックアップしない
   */
  BACKUP_SERVICE_ACCOUNT?: string;

  // wrangler.toml の ratelimits(v1.4.1)。未設定なら回数の制限はかけない
  TEAMS_RATE_LIMITER?: RateLimiter;
  UPLOAD_RATE_LIMITER?: RateLimiter;
}

/** Cloudflare のレート制限のバインディング(使う部分だけ) */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * 呼び出した人ごとの回数の制限(v1.4.1)。
 * Teams への通知と画像のアップロードは、KV の書き込み(無料枠で1日1,000回)を使う。
 * 部員1人が呼び続けて、その日の通知やアップロードを止めてしまわないようにする。
 * バインディングが無い(古い wrangler.toml の)ときは制限しない
 */
async function withinRateLimit(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch (e) {
    // 制限の仕組みが落ちていても、本来の機能は止めない
    console.error("回数の制限の確認に失敗しました", e);
    return true;
  }
}

// Identity Toolkit の管理操作に必要なスコープ
const IDENTITY_TOOLKIT_SCOPE = "https://www.googleapis.com/auth/identitytoolkit";

/** アップロードを受け付ける上限(デコード後)。アプリ側で圧縮済みの想定 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 1回の署名発行で受け付ける枚数 */
const MAX_SIGN_BATCH = 60;

/**
 * 紹介ページの画像として受け付ける形式(v1.3.2)。
 * 以前は image/* をすべて受け付けており、スクリプトを含められる SVG も通った
 */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = allowedOrigins(env);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Firebase-AppCheck",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, request: Request, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
    },
  });
}

// ---------------------------------------------------------------------------
// 認証: ID トークンを検証し、Member 情報まで引く
// ---------------------------------------------------------------------------

interface Caller {
  uid: string;
  idToken: string;
  /** App Check のトークン(v1.4.1。アプリが送ってきたときだけ)。Firestore にそのまま渡す */
  appCheckToken: string | null;
  member: MemberInfo | null;
  email: string | null;
  emailVerified: boolean;
}

async function authenticate(request: Request, env: Env): Promise<Caller | null> {
  const idToken = extractBearerToken(request);
  if (!idToken) return null;

  const verified = await verifyIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!verified) return null;

  const appCheckToken = request.headers.get("X-Firebase-AppCheck");
  const member = await fetchMyMember(idToken, verified.uid, env.FIREBASE_PROJECT_ID, appCheckToken);
  return {
    uid: verified.uid,
    idToken,
    appCheckToken,
    member,
    email: verified.email,
    emailVerified: verified.emailVerified,
  };
}

// ---------------------------------------------------------------------------
// POST /notify/teams
// ---------------------------------------------------------------------------

interface TeamsNotifyBody {
  type?: unknown;
  id?: unknown;
}

/**
 * Teams の Workflows(Power Automate)は、既定で Adaptive Card を期待する。
 * 旧 Incoming Webhook の { "text": "..." } はそのままでは表示されないため、
 * 受け取った文字列をカードに包んで渡す。
 *
 * 改行の扱いはレンダラごとに差があるので、1行ずつ TextBlock に分ける。
 * 先頭行だけ太字にして見出しに見せる。
 */
function buildAdaptiveCard(text: string) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: lines.map((line, index) => ({
            type: "TextBlock",
            text: line,
            wrap: true,
            weight: index === 0 ? "Bolder" : "Default",
            spacing: index === 0 ? "None" : "Small",
          })),
        },
      },
    ],
  };
}

async function handleNotifyTeams(
  request: Request,
  env: Env,
  caller: Caller
): Promise<Response> {
  // 在籍者のみ。退会者やプロフィール未登録は弾く
  if (!isActiveMember(caller.member)) {
    return json({ error: "forbidden" }, 403, request, env);
  }

  let body: TeamsNotifyBody;
  try {
    body = (await request.json()) as TeamsNotifyBody;
  } catch {
    return json({ error: "invalid_json" }, 400, request, env);
  }

  // v1.3.2: 本文は受け取らない。種類と対象のIDだけ
  const type = body.type as TeamsNotifyType;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!TEAMS_NOTIFY_TYPES.includes(type) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return json({ error: "invalid_target" }, 400, request, env);
  }

  // 1人あたりの回数の制限(v1.4.1)
  if (!(await withinRateLimit(env.TEAMS_RATE_LIMITER, `teams:${caller.uid}`))) {
    return json({ error: "rate_limited" }, 429, request, env);
  }

  // 同じ対象への通知は1回だけ
  const sentKey = `teams-sent:${type}:${id}`;
  if (env.IMAGES && (await env.IMAGES.get(sentKey)) !== null) {
    return json({ ok: true, skipped: "already_sent" }, 200, request, env);
  }

  const composed = await composeTeamsText(type, id, {
    idToken: caller.idToken,
    appCheckToken: caller.appCheckToken,
    projectId: env.FIREBASE_PROJECT_ID,
    appOrigin: (env.APP_ORIGIN || "").replace(/\/$/, ""),
    caller: { uid: caller.uid, member: caller.member },
  });
  if (!composed.ok) {
    return json({ error: composed.error }, composed.status, request, env);
  }

  // 先に印を付けてから送る(同時に2回呼ばれても、二重に流れにくくする)
  if (env.IMAGES) {
    await env.IMAGES.put(sentKey, new Date().toISOString(), { expirationTtl: SENT_MARK_TTL });
  }

  const upstream = await fetch(env.TEAMS_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildAdaptiveCard(composed.text)),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error("Teamsへの送信に失敗しました", upstream.status, detail);
    // 送れなかったので印を外し、やり直せるようにする
    if (env.IMAGES) await env.IMAGES.delete(sentKey);
    // アプリ側は握りつぶす実装にすること(通知の失敗で投稿そのものを失敗させない)
    return json({ error: "upstream_failed" }, 502, request, env);
  }

  return json({ ok: true }, 200, request, env);
}

// ---------------------------------------------------------------------------
// POST /admin/disable-user   … A-3
// ---------------------------------------------------------------------------

interface DisableUserBody {
  targetUid?: string;
  disabled?: boolean;
}

async function handleDisableUser(
  request: Request,
  env: Env,
  caller: Caller
): Promise<Response> {
  let body: DisableUserBody;
  try {
    body = (await request.json()) as DisableUserBody;
  } catch {
    return json({ error: "invalid_json" }, 400, request, env);
  }

  const targetUid = (body.targetUid ?? "").trim();
  if (!targetUid) {
    return json({ error: "target_required" }, 400, request, env);
  }

  // 無効化するのか、復帰させるのか
  const disabled = body.disabled !== false;

  const isSelf = targetUid === caller.uid;

  // 無効化も復帰も幹部のみ。自分自身は対象にできない(締め出し事故を防ぐ)
  if (!isOfficer(caller.member) || isSelf) {
    return json({ error: "forbidden" }, 403, request, env);
  }

  // v1.4.1: 対象者の今の状態を確かめる。
  // 以前は幹部1人で、在籍中の部員や他の幹部のログインを黙って止められた。
  //  - 幹部は対象にできない(幹部を外すときは、先に3名の承認で降格する)
  //  - 無効化は、名簿で除籍(expelled)になっている人だけ
  //  - 有効化(復帰)は、名簿で在籍中(active)に戻っている人だけ
  // 名簿は呼び出した幹部の ID トークンで読む(ルールがそのまま効く)
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) {
    return json({ error: "invalid_target" }, 400, request, env);
  }
  const target = await fetchDocAsCaller(
    caller.idToken,
    env.FIREBASE_PROJECT_ID,
    "members",
    targetUid,
    caller.appCheckToken
  );
  if (!target) {
    return json({ error: "target_not_found" }, 404, request, env);
  }
  if (target.role === "幹部") {
    return json({ error: "target_is_officer" }, 403, request, env);
  }
  const expectedStatus = disabled ? "expelled" : "active";
  if (target.status !== expectedStatus) {
    return json({ error: "target_status_mismatch" }, 409, request, env);
  }

  let accessToken: string;
  try {
    const serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    accessToken = await getAccessToken(serviceAccount, IDENTITY_TOOLKIT_SCOPE);
  } catch (e) {
    console.error("サービスアカウントの処理に失敗しました", e);
    return json({ error: "server_misconfigured" }, 500, request, env);
  }

  const endpoint =
    `https://identitytoolkit.googleapis.com/v1/projects/` +
    `${env.FIREBASE_PROJECT_ID}/accounts:update`;

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ localId: targetUid, disableUser: disabled }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error("アカウントの無効化に失敗しました", upstream.status, detail);
    return json({ error: "upstream_failed" }, 502, request, env);
  }

  return json({ ok: true, targetUid, disabled }, 200, request, env);
}

// ---------------------------------------------------------------------------
// POST /images/upload   … 紹介ページの画像(幹部のみ)
// ---------------------------------------------------------------------------

interface UploadBody {
  dataUrl?: string;
  name?: string;
}

/** data URL をバイト列に戻す。画像以外は受け付けない */
function decodeDataUrl(
  dataUrl: string
): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) return null;

  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, mimeType };
}

async function handleImageUpload(
  request: Request,
  env: Env,
  caller: Caller
): Promise<Response> {
  if (!isOfficer(caller.member)) {
    return json({ error: "forbidden" }, 403, request, env);
  }
  if (!env.IMAGES || !env.IMAGE_SIGNING_KEY) {
    return json({ error: "images_not_configured" }, 500, request, env);
  }
  if (!(await withinRateLimit(env.UPLOAD_RATE_LIMITER, `upload:${caller.uid}`))) {
    return json({ error: "rate_limited" }, 429, request, env);
  }

  let body: UploadBody;
  try {
    body = (await request.json()) as UploadBody;
  } catch {
    return json({ error: "invalid_json" }, 400, request, env);
  }

  const decoded = decodeDataUrl((body.dataUrl ?? "").trim());
  if (!decoded) {
    return json({ error: "invalid_image" }, 400, request, env);
  }
  if (decoded.bytes.byteLength > MAX_UPLOAD_BYTES) {
    return json({ error: "image_too_large" }, 413, request, env);
  }

  // 名前は後から中身を見分けるためだけのもの。記号は落とす
  const safeName =
    (body.name ?? "").replace(/[^\w.\-ぁ-んァ-ヶ一-龠]/g, "").slice(0, 60) || "intro";

  const imageId = await putImage(env.IMAGES, decoded.bytes, decoded.mimeType, {
    name: safeName,
    uploadedBy: caller.uid,
  });

  // アップロードした本人がすぐ表示できるよう、署名付きURLも一緒に返す
  const url = await buildSignedUrl(
    new URL(request.url).origin,
    imageId,
    env.IMAGE_SIGNING_KEY
  );

  return json(
    { ok: true, fileId: imageId, url, expiresIn: SIGNATURE_TTL },
    200,
    request,
    env
  );
}

// ---------------------------------------------------------------------------
// POST /images/sign   … 画像を表示するための署名付きURLを発行する
// ---------------------------------------------------------------------------

interface SignBody {
  fileIds?: unknown;
}

async function handleImageSign(
  request: Request,
  env: Env,
  caller: Caller
): Promise<Response> {
  // 見学者(Member ドキュメントを持たない人)にも紹介ページを見せるため、
  // 在籍者に加えて「メールアドレスの確認が済んだ人」も通す。
  // v1.3.2: 以前は「ログイン済み」だけを条件にしていた。
  // v1.4.0: 教員・OBは大学以外のアドレスで登録するため、アドレスの種類は問わない。
  // pages/intro の読み取り条件(Firestore ルール)と揃えてある。
  if (!isActiveMember(caller.member) && !caller.emailVerified) {
    return json({ error: "forbidden" }, 403, request, env);
  }
  if (!env.IMAGE_SIGNING_KEY) {
    return json({ error: "images_not_configured" }, 500, request, env);
  }

  let body: SignBody;
  try {
    body = (await request.json()) as SignBody;
  } catch {
    return json({ error: "invalid_json" }, 400, request, env);
  }

  if (!Array.isArray(body.fileIds)) {
    return json({ error: "file_ids_required" }, 400, request, env);
  }

  const imageIds = body.fileIds
    .filter((id): id is string => typeof id === "string")
    .filter(isValidImageId)
    .slice(0, MAX_SIGN_BATCH);

  const origin = new URL(request.url).origin;
  const urls: Record<string, string> = {};
  for (const imageId of imageIds) {
    urls[imageId] = await buildSignedUrl(origin, imageId, env.IMAGE_SIGNING_KEY);
  }

  return json({ ok: true, urls, expiresIn: SIGNATURE_TTL }, 200, request, env);
}

// ---------------------------------------------------------------------------
// POST /images/delete   … 幹部のみ
// ---------------------------------------------------------------------------

interface DeleteBody {
  fileId?: string;
}

async function handleImageDelete(
  request: Request,
  env: Env,
  caller: Caller
): Promise<Response> {
  if (!isOfficer(caller.member)) {
    return json({ error: "forbidden" }, 403, request, env);
  }
  if (!env.IMAGES) {
    return json({ error: "images_not_configured" }, 500, request, env);
  }

  let body: DeleteBody;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return json({ error: "invalid_json" }, 400, request, env);
  }

  const imageId = (body.fileId ?? "").trim();
  if (!isValidImageId(imageId)) {
    return json({ error: "invalid_file_id" }, 400, request, env);
  }

  await deleteImage(env.IMAGES, imageId);

  // v1.4.1: 配信用のキャッシュも消す。消さないと、署名付きURLを持っている人には
  // 最大6時間、消したはずの写真が見え続けた。
  // Cache API はデータセンターごとなので、ここで消せるのはこの Worker が動いた場所の分だけ。
  // ほかの場所の分は、URL の署名の期限(6時間)で読めなくなる
  const cacheKey = new Request(
    `${new URL(request.url).origin}/images/file?id=${encodeURIComponent(imageId)}`
  );
  try {
    await caches.default.delete(cacheKey);
  } catch (e) {
    console.error("画像のキャッシュの削除に失敗しました", imageId, e);
  }

  return json({ ok: true, fileId: imageId }, 200, request, env);
}

// ---------------------------------------------------------------------------
// GET /images/file   … 画像の本体。ID トークンではなく署名で守る
// ---------------------------------------------------------------------------

async function handleImageFile(
  env: Env,
  ctx: ExecutionContext,
  url: URL
): Promise<Response> {
  const imageId = url.searchParams.get("id") ?? "";
  const exp = url.searchParams.get("exp") ?? "";
  const signature = url.searchParams.get("sig") ?? "";

  if (!env.IMAGES || !env.IMAGE_SIGNING_KEY) {
    return new Response("not configured", { status: 500 });
  }

  const valid = await verifySignedUrl(imageId, exp, signature, env.IMAGE_SIGNING_KEY);
  if (!valid) {
    // 期限切れか改ざん。アプリ側は署名を取り直して読み込み直す
    return new Response("forbidden", { status: 403 });
  }

  // キャッシュのキーには署名を含めない。署名は毎回変わるため、
  // 含めると同じ画像が何度も KV から読み直されてしまう(読み取り回数を消費する)。
  // 署名の検証はこの手前で済ませているので、キャッシュに当てても素通りにはならない。
  const cacheKey = new Request(`${url.origin}/images/file?id=${encodeURIComponent(imageId)}`);
  const cache = caches.default;

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const stored = await getImage(env.IMAGES, imageId);
  if (!stored) {
    return new Response("not found", { status: 404 });
  }

  const response = new Response(stored.body, {
    status: 200,
    headers: {
      "content-type": stored.contentType,
      // 中身から形式を推測させない(画像以外として解釈されるのを防ぐ)
      "x-content-type-options": "nosniff",
      // 署名の有効期間より長く持たせない
      "cache-control": `public, max-age=${SIGNATURE_TTL}`,
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// ---------------------------------------------------------------------------
// POST /admin/backup/latest   … いちばん新しい定期バックアップ(幹部のみ。v1.4.1)
// ---------------------------------------------------------------------------

async function handleLatestBackup(
  request: Request,
  env: Env,
  caller: Caller
): Promise<Response> {
  if (!isOfficer(caller.member)) {
    return json({ error: "forbidden" }, 403, request, env);
  }
  if (!env.IMAGES) {
    return json({ error: "backup_not_configured" }, 500, request, env);
  }
  const latest = await getLatestBackup(env.IMAGES);
  if (!latest) {
    return json({ error: "no_backup" }, 404, request, env);
  }
  return new Response(latest.body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="bondy-${latest.key.replace(/[^0-9A-Za-z-]/g, "")}.json"`,
      "cache-control": "no-store",
      ...corsHeaders(request, env),
    },
  });
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // プリフライト
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // 疎通確認(認証不要)。Phase 0 の検証に使う
    if (url.pathname === "/health") {
      return json({ ok: true }, 200, request, env);
    }

    // 画像の本体だけは <img> から直接読まれるので、ID トークンを付けられない。
    // 代わりに期限付きの署名で守っている
    if (url.pathname === "/images/file") {
      if (request.method !== "GET") {
        return new Response("method not allowed", { status: 405 });
      }
      try {
        return await handleImageFile(env, ctx, url);
      } catch (e) {
        console.error("画像の配信に失敗しました", url.searchParams.get("id"), e);
        return new Response("internal error", { status: 500 });
      }
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, request, env);
    }

    const caller = await authenticate(request, env);
    if (!caller) {
      return json({ error: "unauthorized" }, 401, request, env);
    }

    try {
      switch (url.pathname) {
        case "/notify/teams":
          return await handleNotifyTeams(request, env, caller);
        case "/admin/disable-user":
          return await handleDisableUser(request, env, caller);
        case "/images/upload":
          return await handleImageUpload(request, env, caller);
        case "/images/sign":
          return await handleImageSign(request, env, caller);
        case "/images/delete":
          return await handleImageDelete(request, env, caller);
        case "/admin/backup/latest":
          return await handleLatestBackup(request, env, caller);
        default:
          return json({ error: "not_found" }, 404, request, env);
      }
    } catch (e) {
      console.error("処理中に想定外のエラーが発生しました", url.pathname, e);
      return json({ error: "internal_error" }, 500, request, env);
    }
  },

  /** 定期実行(wrangler.toml の [triggers])。週に1回のバックアップ(v1.4.1) */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.BACKUP_SERVICE_ACCOUNT || !env.IMAGES) {
      console.info("BACKUP_SERVICE_ACCOUNT が未設定のため、バックアップを取りませんでした");
      return;
    }
    ctx.waitUntil(
      runBackup(env.IMAGES, env.FIREBASE_PROJECT_ID, env.BACKUP_SERVICE_ACCOUNT)
        .then((key) => console.info("バックアップを取りました", key))
        .catch((e) => console.error("バックアップに失敗しました", e))
    );
  },
};

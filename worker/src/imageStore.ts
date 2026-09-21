/**
 * 紹介ページに載せる写真の保管と配信(Cloudflare Workers KV)
 *
 * ■ なぜ KV なのか
 * 最初は Google Drive に置こうとしたが、サービスアカウントは自分の保存容量を
 * 持たない。共有フォルダに入れても作成者がサービスアカウントになるため、
 * 403 storageQuotaExceeded で必ず弾かれる。回避策として Google が案内している
 * 共有ドライブと OAuth 委任は、どちらも Google Workspace 契約が前提で、
 * 個人の Google アカウントでは成立しない。
 *
 * KV は Workers の無料枠に含まれていて、支払い情報の登録も要らない。
 *   保存容量   1GB
 *   読み取り   10万回/日(エッジキャッシュに当たった分は数えない)
 *   書き込み   1000回/日
 *   1件の上限  25MB
 * 紹介ページの写真(1枚400KB程度)には十分すぎる。
 *
 * ■ なぜ署名付きURLなのか
 * <img src="..."> には Authorization ヘッダを付けられないため、画像の配信URLだけは
 * Firebase の ID トークンで守れない。かといって誰でも叩ける URL にすると、
 * IDさえ漏れれば部員の写真が外から見えてしまう。
 * そこで「ログイン済みの人にだけ、期限付きの署名を発行する」形にしている。
 *   1. アプリが /images/sign を ID トークン付きで叩く
 *   2. Worker が id と期限に HMAC 署名を付けた URL を返す
 *   3. <img> はその URL を読む。期限が切れたら再発行する
 */

/** 署名付きURLの有効期間(秒)。長すぎると流出時に効き続けるので6時間 */
export const SIGNATURE_TTL = 6 * 60 * 60;

/** 画像IDとして妥当な形か。KVのキーに使うので細工を弾く */
const IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;

export function isValidImageId(imageId: string): boolean {
  return IMAGE_ID_PATTERN.test(imageId);
}

/** 新しい画像IDを作る */
export function newImageId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** KV に一緒に入れておく情報 */
interface ImageMetadata {
  contentType: string;
  name?: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

// ---------------------------------------------------------------------------
// 署名
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(imageId: string, expiresAt: number, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${imageId}.${expiresAt}`)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

/** 長さと内容の比較にかかる時間を入力に依存させない */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 画像1枚分の署名付きURLを作る。
 * origin は Worker 自身の URL(リクエストから取る)。
 */
export async function buildSignedUrl(
  origin: string,
  imageId: string,
  secret: string
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SIGNATURE_TTL;
  const signature = await sign(imageId, expiresAt, secret);
  const params = new URLSearchParams({
    id: imageId,
    exp: String(expiresAt),
    sig: signature,
  });
  return `${origin}/images/file?${params.toString()}`;
}

/** 署名を検証する。期限切れ・改ざんはここで落ちる */
export async function verifySignedUrl(
  imageId: string,
  exp: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!isValidImageId(imageId)) return false;

  const expiresAt = Number(exp);
  if (!Number.isSafeInteger(expiresAt)) return false;
  if (expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = await sign(imageId, expiresAt, secret);
  return safeEqual(expected, signature);
}

// ---------------------------------------------------------------------------
// KV の読み書き
// ---------------------------------------------------------------------------

/** 画像を保存して、そのIDを返す */
export async function putImage(
  kv: KVNamespace,
  bytes: Uint8Array,
  contentType: string,
  meta: { name?: string; uploadedBy?: string }
): Promise<string> {
  const imageId = newImageId();

  const metadata: ImageMetadata = {
    contentType,
    name: meta.name,
    uploadedBy: meta.uploadedBy,
    uploadedAt: new Date().toISOString(),
  };

  // Uint8Array をそのまま渡すと型が合わないことがあるため ArrayBuffer にする
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  await kv.put(imageId, buffer, { metadata });
  return imageId;
}

/** 画像の中身を取り出す。無ければ null */
export async function getImage(
  kv: KVNamespace,
  imageId: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const found = await kv.getWithMetadata<ImageMetadata>(imageId, {
    type: "arrayBuffer",
  });
  if (!found.value) return null;

  return {
    body: found.value,
    contentType: found.metadata?.contentType ?? "image/jpeg",
  };
}

/**
 * 画像を消す。
 *
 * 既に無い場合も KV は成功を返すので、二重削除でエラーにはならない。
 */
export async function deleteImage(kv: KVNamespace, imageId: string): Promise<void> {
  await kv.delete(imageId);
}

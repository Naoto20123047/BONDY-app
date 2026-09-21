/**
 * Firebase ID トークンの検証
 *
 * クライアントは getIdToken() で取得したトークンを Authorization ヘッダに付ける。
 * Worker 側は Google の公開鍵(JWKS)で署名を検証し、aud がこのプロジェクトで
 * あることを確認する。公開鍵は Cache API にキャッシュして毎回取りに行かない。
 */

// Firebase の ID トークンはこの鍵で署名されている
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// キャッシュのキー(Cache API はリクエストURLをキーにするため、実在するURLを使う)
const JWKS_CACHE_KEY = "https://bondy-worker.internal/jwks";

export interface VerifiedToken {
  uid: string;
  email: string | null;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

/** base64url をバイト列に戻す */
function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** base64url の JSON をオブジェクトに戻す */
function decodeJsonSegment<T>(segment: string): T {
  const bytes = base64UrlToBytes(segment);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/**
 * 公開鍵を取得する。Cache API に入っていればそれを使う。
 * レスポンスの Cache-Control をそのまま利用するので、鍵のローテーションにも追従する。
 */
async function fetchJwks(): Promise<Jwk[]> {
  const cache = caches.default;
  const cacheKey = new Request(JWKS_CACHE_KEY);

  let response = await cache.match(cacheKey);
  if (!response) {
    const upstream = await fetch(JWKS_URL);
    if (!upstream.ok) {
      throw new Error(`公開鍵の取得に失敗しました (${upstream.status})`);
    }
    // Cache API に入れるためにボディを複製する
    const body = await upstream.text();
    const cacheControl = upstream.headers.get("cache-control") ?? "max-age=3600";
    response = new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": cacheControl,
      },
    });
    await cache.put(cacheKey, response.clone());
  }

  const data = (await response.json()) as { keys?: Jwk[] };
  if (!data.keys || data.keys.length === 0) {
    throw new Error("公開鍵が空です");
  }
  return data.keys;
}

/**
 * ID トークンを検証して uid を返す。
 * 検証に失敗した場合は null を返す(理由はログにのみ出し、呼び出し元には返さない)。
 */
export async function verifyIdToken(
  token: string,
  projectId: string
): Promise<VerifiedToken | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerSegment, payloadSegment, signatureSegment] = parts;

    const header = decodeJsonSegment<{ alg?: string; kid?: string }>(headerSegment);
    if (header.alg !== "RS256" || !header.kid) return null;

    const payload = decodeJsonSegment<{
      iss?: string;
      aud?: string;
      sub?: string;
      exp?: number;
      iat?: number;
      auth_time?: number;
      email?: string;
    }>(payloadSegment);

    // 発行者と対象プロジェクトの確認
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (payload.aud !== projectId) return null;
    if (!payload.sub) return null;

    // 有効期限(多少の時計ずれを許容する)
    const now = Math.floor(Date.now() / 1000);
    const skew = 60;
    if (typeof payload.exp !== "number" || payload.exp + skew < now) return null;
    if (typeof payload.iat !== "number" || payload.iat - skew > now) return null;

    // 署名の検証
    const keys = await fetchJwks();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signed = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
    const signature = base64UrlToBytes(signatureSegment);

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signature,
      signed
    );
    if (!valid) return null;

    return { uid: payload.sub, email: payload.email ?? null };
  } catch (e) {
    console.error("IDトークンの検証中にエラーが発生しました", e);
    return null;
  }
}

/** Authorization ヘッダから Bearer トークンを取り出す */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

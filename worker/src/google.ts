/**
 * サービスアカウントから Google API 用のアクセストークンを取得する
 *
 * JWT Bearer フロー(RFC 7523)を自前で組む。サービスアカウントの秘密鍵で JWT を
 * 署名し、oauth2.googleapis.com と交換してアクセストークンを得る。
 * 取得したトークンは有効期限まで Worker のメモリに保持して使い回す。
 *
 * キャッシュはスコープごとに分けている。Identity Toolkit 用のトークンを
 * Drive の呼び出しに使い回してしまうと、権限不足で落ちるため。
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number; // エポック秒
}

// Worker のインスタンスが生きている間だけ保持する。キーはスコープ
const cache = new Map<string, CachedToken>();

/** バイト列を base64url にする */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 文字列を base64url にする */
function stringToBase64Url(input: string): string {
  return bytesToBase64Url(new TextEncoder().encode(input));
}

/** PEM 形式の秘密鍵を WebCrypto のキーに変換する */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    // 環境変数に入れる都合で \n がエスケープされている場合がある
    .replace(/\\n/g, "")
    .replace(/\s/g, "");

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/** サービスアカウントの JSON をパースする */
export function parseServiceAccount(raw: string): ServiceAccount {
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("サービスアカウントの形式が不正です");
  }
  // wrangler secret put でそのまま貼ると \n が文字列として入ることがある
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

/**
 * アクセストークンを取得する。有効なものがキャッシュにあればそれを返す。
 */
export async function getAccessToken(
  serviceAccount: ServiceAccount,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // 期限の60秒前で切り替える
  const cached = cache.get(scope);
  if (cached && cached.expiresAt - 60 > now) {
    return cached.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${stringToBase64Url(JSON.stringify(header))}.${stringToBase64Url(
    JSON.stringify(claims)
  )}`;

  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );

  const assertion = `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("アクセストークンの取得に失敗しました", response.status, detail);
    throw new Error("アクセストークンの取得に失敗しました");
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cache.set(scope, {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  });
  return data.access_token;
}

/**
 * 定期バックアップ(v1.4.1)
 *
 * Spark プランには Firestore の自動バックアップ(エクスポート)が無い。
 * 幹部のアカウントが乗っ取られると、フォーム・回答・バンド・機材・投稿などを
 * 消されても戻せなかったため、週に1回、主要なコレクションを JSON にして KV に置く。
 *
 *  - 実行は Cron(wrangler.toml の [triggers])。無料枠に含まれる
 *  - 読み取りには専用のサービスアカウント(BACKUP_SERVICE_ACCOUNT)を使う。
 *    権限は「Cloud Datastore 閲覧者」だけにすること(書き込みはできない)。
 *    アカウントの無効化に使う FIREBASE_SERVICE_ACCOUNT とは分ける
 *    (あちらは「Firebase Authentication 管理者」だけに絞るため)
 *  - BACKUP_SERVICE_ACCOUNT を設定していなければ何もしない
 *  - 保管期間は BACKUP_TTL(約2か月。8回分)。古いものは KV が自動で消す
 *  - アバター画像(images)は量が多く、本人が登録し直せるので含めない
 *
 * 取り出しは幹部が /admin/backup/latest を呼ぶ(README の手順を参照)。
 * 戻すときは、取り出した JSON を見ながら Firebase コンソールで直す想定。
 */

import { getAccessToken, parseServiceAccount } from "./google";
import { fromFirestoreValue, type FirestoreValue } from "./firestore";

const DATASTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

/** バックアップするコレクション */
const COLLECTIONS = [
  "members",
  "blockedUids",
  "auditLogs",
  "roleChangeRequests",
  "bands",
  "forms",
  "formResponses",
  "dues",
  "equipment",
  "equipmentRequests",
  "posts",
  "comments",
  "anonymousAuthors",
  "messages",
  "todos",
  "pages",
  "archiveEvents",
  "archiveItems",
  "lives",
];

/** lives の下にあるコレクション */
const LIVE_SUBCOLLECTIONS = ["entries", "setlists", "stagePlans"];

/** KV に置いておく期間(秒) */
export const BACKUP_TTL = 60 * 60 * 24 * 62;

/** KV のキーの先頭。画像ID(英数字)とぶつからないよう記号を含める */
export const BACKUP_KEY_PREFIX = "backup:";

interface ListResponse {
  documents?: { name: string; fields?: Record<string, FirestoreValue> }[];
  nextPageToken?: string;
}

/** 1つのコレクションを全件読む(サービスアカウントの権限で読む。ルールは効かない) */
async function listAll(
  projectId: string,
  accessToken: string,
  collectionPath: string
): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  let pageToken = "";
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`
    );
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`${collectionPath} の読み取りに失敗しました (${response.status})`);
    }
    const data = (await response.json()) as ListResponse;
    for (const d of data.documents ?? []) {
      const id = d.name.split("/").pop() ?? d.name;
      const fields: Record<string, unknown> = {};
      Object.entries(d.fields ?? {}).forEach(([k, v]) => {
        fields[k] = fromFirestoreValue(v);
      });
      out[id] = fields;
    }
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

/** バックアップを1回取り、KV に置く。置いたキーを返す */
export async function runBackup(
  kv: KVNamespace,
  projectId: string,
  serviceAccountJson: string
): Promise<string> {
  const serviceAccount = parseServiceAccount(serviceAccountJson);
  const accessToken = await getAccessToken(serviceAccount, DATASTORE_SCOPE);

  const collections: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const name of COLLECTIONS) {
    collections[name] = await listAll(projectId, accessToken, name);
  }
  for (const liveId of Object.keys(collections.lives ?? {})) {
    for (const sub of LIVE_SUBCOLLECTIONS) {
      collections[`lives/${liveId}/${sub}`] = await listAll(
        projectId,
        accessToken,
        `lives/${encodeURIComponent(liveId)}/${sub}`
      );
    }
  }

  const takenAt = new Date().toISOString();
  const key = `${BACKUP_KEY_PREFIX}${takenAt}`;
  await kv.put(key, JSON.stringify({ takenAt, projectId, collections }), {
    expirationTtl: BACKUP_TTL,
  });
  return key;
}

/** いちばん新しいバックアップを取り出す。無ければ null */
export async function getLatestBackup(kv: KVNamespace): Promise<{ key: string; body: string } | null> {
  const listed = await kv.list({ prefix: BACKUP_KEY_PREFIX });
  if (listed.keys.length === 0) return null;
  // キーは日時(ISO 形式)なので、文字列の並びがそのまま新しさの順になる
  const latest = listed.keys.map((k) => k.name).sort().pop()!;
  const body = await kv.get(latest);
  return body === null ? null : { key: latest, body };
}

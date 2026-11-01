/**
 * Firestore REST API 経由で Member ドキュメントを読む
 *
 * 権限判定にメールアドレスは使わない(v1.4.0 で外部メール連携を入れると
 * ドメイン判定が破綻するため)。Member の status / role / isOB / positions を
 * 正とする。
 *
 * 読み取りは「呼び出し元の ID トークン」で行う。サービスアカウントを使わないので、
 * Worker が Firestore を素通しで読める状態にはならず、セキュリティルールがそのまま効く。
 */

export interface MemberInfo {
  uid: string;
  status: string;
  role: string;
  isOB: boolean;
  positions: string[];
  name: string;
  /** 幹部の確認が済んでいるか(v1.4.0)。未設定は確認済み扱い */
  approved: boolean;
}

/** Firestore REST のフィールド表現 */
export interface FirestoreValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}

/**
 * 自分の Member ドキュメントを取得する。
 * 存在しない、または読めない場合は null。
 */
export async function fetchMyMember(
  idToken: string,
  uid: string,
  projectId: string
): Promise<MemberInfo | null> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/members/${encodeURIComponent(uid)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!response.ok) {
    // 404(未登録) と 403(ルールで拒否) のどちらもここに来る
    return null;
  }

  const doc = (await response.json()) as FirestoreDocument;
  const fields = doc.fields ?? {};

  return {
    uid,
    status: fields.status?.stringValue ?? "",
    role: fields.role?.stringValue ?? "",
    isOB: fields.isOB?.booleanValue ?? false,
    positions: (fields.positions?.arrayValue?.values ?? [])
      .map((v) => v.stringValue ?? "")
      .filter((v) => v !== ""),
    name: fields.name?.stringValue ?? "",
    approved: fields.approved?.booleanValue !== false,
  };
}

/**
 * 在籍中か。
 * v1.4.0: 幹部の確認待ち(教員・OB)の人は含めない(Firestore ルールの isActive() と同じ)
 */
export function isActiveMember(member: MemberInfo | null): boolean {
  return member !== null && member.status === "active" && member.approved;
}

/**
 * 幹部か。
 *
 * この判定は Firestore のセキュリティルール(isOfficer())と
 * フロントの lib/roles.ts(OFFICER_ROLES)にも同じものがある。
 * **権限を持つ役職を変えるときは3箇所すべてを合わせること。**
 */
export function isOfficer(member: MemberInfo | null): boolean {
  return isActiveMember(member) && member!.role === "幹部";
}

/** Firestore REST の値を、普通の JavaScript の値に戻す */
export function fromFirestoreValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values ?? []).map((v) => fromFirestoreValue(v));
  }
  if (value.mapValue !== undefined) {
    const out: Record<string, unknown> = {};
    Object.entries(value.mapValue.fields ?? {}).forEach(([k, v]) => {
      out[k] = fromFirestoreValue(v);
    });
    return out;
  }
  return null;
}

/**
 * 任意のドキュメントを、呼び出した人の ID トークンで読む(v1.3.2)。
 * ルールがそのまま効くので、その人が読めないものは null になる。
 */
export async function fetchDocAsCaller(
  idToken: string,
  projectId: string,
  collection: string,
  id: string
): Promise<Record<string, unknown> | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!response.ok) return null;
  const doc = (await response.json()) as FirestoreDocument;
  const out: Record<string, unknown> = {};
  Object.entries(doc.fields ?? {}).forEach(([k, v]) => {
    out[k] = fromFirestoreValue(v);
  });
  return out;
}

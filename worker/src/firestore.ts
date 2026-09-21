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
}

/** Firestore REST のフィールド表現 */
interface FirestoreValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
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
  };
}

/** 在籍中か */
export function isActiveMember(member: MemberInfo | null): boolean {
  return member !== null && member.status === "active";
}

/** 幹部または管理者か */
export function isOfficer(member: MemberInfo | null): boolean {
  return isActiveMember(member) && (member!.role === "幹部" || member!.role === "管理者");
}

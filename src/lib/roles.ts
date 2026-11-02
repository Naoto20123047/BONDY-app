/**
 * 役職まわりの判定をここに集約する。
 *
 * 「幹部か」という判定が、同じ形で10箇所に複製されていた。
 * currentFiscalYear() が5箇所に散っていたのと同じ構図(技術的負債 D-1)なので、
 * 同様にここへまとめた。
 *
 * 権限を持つ役職を増やす・減らすときは OFFICER_ROLES だけを直せば、
 * 画面側を触らずに全体へ反映される。
 *
 * なお、Firestore のセキュリティルールにも同じ判定がある(isOfficer())。
 * **役職を変えるときはルール側も必ず合わせること。**
 * こちらだけ直してもサーバー側は弾き続ける。
 */

import type { Member, Role } from "../Types/types";

/**
 * 幹部の権限を持つ役職。
 *
 * 今は1つだけだが、配列のままにしてある。権限を持つ役職を増やすときに
 * ここへ足すだけで済み、呼び出し側の書き方が変わらないため。
 */
export const OFFICER_ROLES: Role[] = ["幹部"];

/**
 * 役職の文字列が幹部権限を持つか。
 *
 * Firestore から取り出した生のデータ(型が string のもの)も渡せるよう、
 * 引数を広めに取ってある。
 */
export function isOfficerRole(role: string | undefined | null): boolean {
  if (!role) return false;
  return OFFICER_ROLES.includes(role as Role);
}

/**
 * そのメンバーが幹部権限を持つか。
 *
 * 呼び出し側では `const isOfficer = hasOfficerRole(member)` のように使う。
 * 画面側の変数名が isOfficer で定着しているため、関数名を別にしてある。
 */
export function hasOfficerRole(
  member: Pick<Member, "role"> | null | undefined
): boolean {
  return isOfficerRole(member?.role);
}

/**
 * 幹部に昇格してから、役職変更の申請・承認・却下に加われるまでの日数(v1.4.1)。
 *
 * 昇格は幹部1人で即時に反映できる。そのままでは、味方を2人昇格させて
 * その場で「3名の承認」をそろえ、解任や役職の付与を自由に通せてしまう。
 * 昇格は即時のまま、昇格直後の一定期間は承認に加われないようにした。
 *
 * **firestore.rules の canJoinRoleDecisions() と必ず揃えること。**
 * ここは画面の案内に使うだけで、守りはルール側にある。
 */
export const ROLE_DECISION_WAIT_DAYS = 14;

/**
 * 役職変更の申請・承認・却下に加われるようになる時刻(ミリ秒)。
 * 昇格の記録が無い(v1.4.1 より前からの)幹部は 0 を返す(すぐ加われる)。
 */
export function roleDecisionAvailableAt(
  member: Pick<Member, "promotedAt"> | null | undefined
): number {
  const promotedAt = member?.promotedAt;
  if (!promotedAt || typeof promotedAt.toMillis !== "function") return 0;
  return promotedAt.toMillis() + ROLE_DECISION_WAIT_DAYS * 24 * 60 * 60 * 1000;
}

/** 今、役職変更の申請・承認・却下に加われるか(画面の案内用) */
export function canJoinRoleDecisions(
  member: Pick<Member, "role" | "promotedAt"> | null | undefined
): boolean {
  return hasOfficerRole(member) && Date.now() > roleDecisionAvailableAt(member);
}

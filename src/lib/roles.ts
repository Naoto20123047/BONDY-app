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

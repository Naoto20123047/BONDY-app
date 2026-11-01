/**
 * 区分(在学生・教員・OB)と、幹部の確認待ちの判定(v1.4.0)
 *
 * category は v1.4.0 で足したフィールドで、それより前のメンバーは持っていない。
 * 直接 member.category を見ず、ここを通すこと。
 */

import type { Member, MemberCategory } from "../Types/types";

/** 在学生として新規登録できる大学のアドレス(firestore.rules と揃える) */
export const UNIVERSITY_DOMAIN = "@kaishi-pu.ac.jp";

export const isUniversityEmail = (email: string | null | undefined): boolean =>
  (email ?? "").toLowerCase().endsWith(UNIVERSITY_DOMAIN);

export function memberCategory(
  member: Pick<Member, "category" | "isOB"> | null | undefined
): MemberCategory {
  if (member?.category) return member.category;
  return member?.isOB ? "OB" : "在学生";
}

/** 幹部の確認待ちか(未設定は確認済み扱い) */
export function isPendingApproval(member: Pick<Member, "approved"> | null | undefined): boolean {
  return member?.approved === false;
}

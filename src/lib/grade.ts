/**
 * 年度まわりの計算をここに集約する。
 *
 * 年度は4月始まり。1〜3月はまだ前年度として扱う。
 * かつて currentFiscalYear() が5箇所(useDues / useMyPage / useHome / useAdmin /
 * useFormAnswer)に同じ内容で複製されていたため、ここへまとめた(技術的負債 D-1)。
 */

import type { Member, MemberCategory } from "../Types/types";
import { memberCategory } from "./memberCategory";

/** 現在の年度(4月始まり) */
export function currentFiscalYear(): number {
  const now = new Date();
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * 日付文字列(YYYY-MM-DD)が属する年度を返す。
 * 解釈できない文字列は null。
 */
export function fiscalYearOf(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return date.getMonth() + 1 >= 4 ? date.getFullYear() : date.getFullYear() - 1;
}

/**
 * 「新入り」として扱うか。基準は**今年度内に加入したか**。
 *
 * joinedAt はサムネイルと同様に後から追加したフィールドなので、
 * それ以前から在籍している人は未設定になっている。その場合は false を返し、
 * バッジを出さない(既存メンバーに一斉にバッジが付くのを避けるため)。
 */
export function isNewMember(joinedAt: string | undefined): boolean {
  const joined = fiscalYearOf(joinedAt);
  if (joined === null) return false;
  return joined === currentFiscalYear();
}

/**
 * 入学年度と現在日から学年を算出する(4月始まり)。
 * v1.4.0 から教員も登録できるため、区分を渡すと「教員」を返す。
 */
export function calcGrade(
  enrollmentYear: number,
  isOB: boolean,
  category?: MemberCategory
): string {
  if (category === "教員") return "教員";
  if (isOB || category === "OB") return "OB";
  if (!enrollmentYear) return "—";

  const grade = currentFiscalYear() - enrollmentYear + 1;
  return `${grade}年生`;
}

/**
 * 名前の下に出す1行の説明(v1.4.0)。区分によって中身が変わる。
 *   在学生: 情報学部・3年生
 *   教員:   教員
 *   OB:     OB(2023年度卒)
 */
export function memberSubtitle(
  member: Pick<Member, "faculty" | "enrollmentYear" | "isOB" | "category" | "graduationYear">
): string {
  const category = memberCategory(member);
  if (category === "教員") return "教員";
  if (category === "OB") {
    return member.graduationYear ? `OB(${member.graduationYear}年度卒)` : "OB";
  }
  return `${member.faculty}・${calcGrade(member.enrollmentYear, member.isOB, member.category)}`;
}

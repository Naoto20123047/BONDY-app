// 入学年度と現在日から学年を算出する(4月始まり)
export function calcGrade(enrollmentYear: number, isOB: boolean): string {
  if (isOB) return "OB";

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 4月始まりなので、1〜3月はまだ前年度扱い
  const fiscalYear = month >= 4 ? year : year - 1;
  const grade = fiscalYear - enrollmentYear + 1;

  return `${grade}年生`;
}
/**
 * 日付の生成と表示をここに集約する。
 *
 * ■ なぜ todayString() が要るか
 * もともと `new Date().toISOString().slice(0, 10)` が8ファイル14箇所に
 * 複製されていたが、この書き方には**不具合がある**。
 *
 * toISOString() は UTC を返すため、日本時間(UTC+9)の 0:00〜9:00 に実行すると
 * **前日の日付**になる。会費の入金日・加入日・返却日などが1日ずれ、
 * 4月1日の朝であれば年度まで前年度に倒れてしまう。
 *
 * ここで端末のローカル時刻から組み立てることで、全箇所がまとめて直る。
 *
 * 年度の計算は lib/grade.ts にある(currentFiscalYear / fiscalYearOf)。
 * 日付の「作り方・見せ方」はこちら、「年度への変換」はあちら、で分けている。
 */

/** 2桁に揃える */
const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * 今日の日付を YYYY-MM-DD で返す。
 * 端末のローカル時刻で組み立てるので、日付がずれない。
 */
export function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 曜日の1文字表記 */
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * YYYY-MM-DD → 2026年7月18日（土）
 * 解釈できない文字列はそのまま返す(画面が壊れるより、生の値が見えたほうがよい)。
 */
export function formatFullDate(date: string | undefined): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return (
    `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日` +
    `（${WEEKDAYS[parsed.getDay()]}）`
  );
}

/** YYYY-MM-DD → 7/18（土）。一覧など、年が文脈から分かる場所で使う */
export function formatShortDate(date: string | undefined): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getMonth() + 1}/${parsed.getDate()}（${WEEKDAYS[parsed.getDay()]}）`;
}

/** YYYY-MM-DD → 7月18日。チャットの日付区切りなど、曜日が邪魔な場所で使う */
export function formatMonthDay(date: string | Date | undefined): string {
  if (!date) return "";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return typeof date === "string" ? date : "";
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日`;
}

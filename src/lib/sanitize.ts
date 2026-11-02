/**
 * Firestore から読んだ値の型をそろえる(v1.4.1)
 *
 * ルールで型を確かめるようにしたが、それより前に書かれたデータや、
 * ルールで中身まで確かめきれない配列の要素(セットリストの各曲など)には、
 * 想定と違う型が入っている可能性がある。
 * 文字列のはずの項目にオブジェクトが入っていると、表示した瞬間に React が例外を出し、
 * その画面を開いた全員の画面が止まる。
 *
 * 画面に渡す前にここを通して、想定外の値は空の値に置き換える。
 */

/** 文字列ならそのまま、数値なら文字にし、それ以外は空文字にする */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** 文字列の配列にそろえる。配列でなければ空の配列、文字列以外の要素は捨てる */
export function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** 数値にそろえる。数値でなければ fallback */
export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** 「文字列 → 文字列」のオブジェクトにそろえる(フォームの回答など) */
export function asTextRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
    out[k] = asText(v);
  });
  return out;
}

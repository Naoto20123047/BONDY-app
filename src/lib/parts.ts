// パートの選択肢
export const PART_OPTIONS = ["Vo", "Gt", "Ba", "Dr", "Key", "DTM", "なし"] as const;

export type PartOption = (typeof PART_OPTIONS)[number];

// 「なし」は他のパートと排他
export const NO_PART = "なし";

/**
 * パートの選択をトグルする。
 * - 「なし」を選ぶと他は全解除
 * - 他を選ぶと「なし」は解除
 */
export const togglePart = (current: string[], part: string): string[] => {
  if (part === NO_PART) {
    return current.includes(NO_PART) ? [] : [NO_PART];
  }
  const without = current.filter((p) => p !== NO_PART);
  return without.includes(part)
    ? without.filter((p) => p !== part)
    : [...without, part];
};

/** 表示用の文字列に変換(例: "Vo・Gt") */
export const formatParts = (parts: string[] | undefined): string => {
  if (!parts || parts.length === 0) return "—";
  return parts.join("・");
};
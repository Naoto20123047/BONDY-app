// 匿名掲示板用のラベル生成
// スプレッドシートの列名と同じ方式で A, B, ... Z, AA, AB, ... と割り振る
export const indexToLetters = (index: number): string => {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};

export const anonLabel = (index: number): string => `匿名${indexToLetters(index)}`;

// 匿名スレッドのコメント一覧から「authorId → 匿名ラベル(出現順)」のマップを作る
export const buildAnonLabelMap = <T extends { authorId: string }>(
  items: T[]
): Record<string, string> => {
  const map: Record<string, string> = {};
  let next = 0;
  items.forEach((item) => {
    if (!(item.authorId in map)) {
      map[item.authorId] = anonLabel(next);
      next += 1;
    }
  });
  return map;
};

// 匿名アバター用の色(実際のavatarColorとは無関係に、匿名ラベルの文字から決定的に選ぶ)
const ANON_AVATAR_COLORS = ["gray", "blue", "green", "purple", "orange"];

export const anonAvatarColorId = (label: string): string => {
  const code = label.charCodeAt(label.length - 1) || 0;
  return ANON_AVATAR_COLORS[code % ANON_AVATAR_COLORS.length];
};

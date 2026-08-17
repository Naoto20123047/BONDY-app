// アバターの色の選択肢
export interface AvatarColor {
  id: string;
  label: string;
  bg: string;    // 背景色
  text: string;  // 文字色
}

export const AVATAR_COLORS: AvatarColor[] = [
  { id: "green",  label: "グリーン", bg: "#DCEDE8", text: "#0F7B6C" },
  { id: "blue",   label: "ブルー",   bg: "#DEE8F7", text: "#2C5AA0" },
  { id: "purple", label: "パープル", bg: "#E7E1F5", text: "#5B4593" },
  { id: "pink",   label: "ピンク",   bg: "#F8E1EC", text: "#A63D6B" },
  { id: "red",    label: "レッド",   bg: "#F8E0DE", text: "#B03B32" },
  { id: "orange", label: "オレンジ", bg: "#FAE9DA", text: "#B5651D" },
  { id: "yellow", label: "イエロー", bg: "#F7EFD4", text: "#8A6D1C" },
  { id: "gray",   label: "グレー",   bg: "#E6E9E7", text: "#52605A" },
];

// 未設定時のデフォルト
export const DEFAULT_AVATAR_COLOR = "gray";

/** 色IDから配色を取得(未設定・不正な値はデフォルト) */
export const getAvatarColor = (id: string | undefined): AvatarColor => {
  const found = AVATAR_COLORS.find((c) => c.id === id);
  return found ?? AVATAR_COLORS.find((c) => c.id === DEFAULT_AVATAR_COLOR)!;
};

/** インラインstyleに渡す用 */
export const avatarStyle = (id: string | undefined) => {
  const c = getAvatarColor(id);
  return { background: c.bg, color: c.text };
};
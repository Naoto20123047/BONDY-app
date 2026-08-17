import type { FormType } from "../Types/types";

// フォーム種別の表示名(保存値は変えず、表示だけ変える)
export const formTypeLabel = (type: FormType): string =>
  type === "イベント" ? "バンドフォーム" : "個別アンケート";
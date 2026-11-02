import type { FormDef, FormType } from "../Types/types";
import { endOfDayJstMillis } from "./date";

// フォーム種別の表示名(保存値は変えず、表示だけ変える)
export const formTypeLabel = (type: FormType): string =>
  type === "イベント" ? "バンドフォーム" : "個別アンケート";

/**
 * フォームの締切(ミリ秒)。締切日の 23:59:59(日本時間)。
 *
 * v1.4.1 からはフォームに closesAt を持たせ、ルールでも締切後の回答を弾いている。
 * closesAt を持たない古いフォームは deadline から求める。
 */
export const formClosesAt = (form: Pick<FormDef, "deadline" | "closesAt">): number =>
  typeof form.closesAt === "number" ? form.closesAt : endOfDayJstMillis(form.deadline);

/** 締切を過ぎたか */
export const isFormClosed = (form: Pick<FormDef, "deadline" | "closesAt">, now = Date.now()): boolean =>
  now > formClosesAt(form);

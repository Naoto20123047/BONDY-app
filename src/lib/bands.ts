/**
 * バンドのメンバーの追加・脱退(v1.4.1)
 *
 * バンドの members(画面に出す)と memberIds(ルールの判定に使う)は、
 * 必ず同じ並び・同じ人数でそろえる。ルール(firestore.rules の bandShapeOk)が
 * 1件ずつ一致していることを確かめているので、ずれた書き込みは弾かれる。
 *
 * 追加・脱退はトランザクションで「今のメンバーを読み直してから書く」。
 * 以前は画面が持っている一覧から作り直して丸ごと書いていたため、
 * 2人が同時に操作すると片方の変更が消えることがあった。
 */

import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import type { Band, BandMember } from "../Types/types";

/**
 * 1つのバンドに入れられる人数の上限。
 * **firestore.rules の bandShapeOk() と必ず揃えること**(ルールは15人分を書き並べている)
 */
export const MAX_BAND_MEMBERS = 15;

/** パートの文字数の上限(ルールと揃える) */
export const MAX_PART_LENGTH = 30;

export class BandUpdateError extends Error {}

/**
 * バンドのメンバーを読み直して書き換える。
 * mutate には今のメンバーが渡る。新しいメンバーを返すと、それを members と memberIds に書く。
 * null を返すと何も書かない。
 */
async function updateBandMembers(
  bandId: string,
  mutate: (current: BandMember[], band: Omit<Band, "id">) => BandMember[] | null
): Promise<BandMember[] | null> {
  const ref = doc(db, "bands", bandId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new BandUpdateError("バンドが見つかりません。");
    const band = snap.data() as Omit<Band, "id">;
    const next = mutate(band.members ?? [], band);
    if (next === null) return null;
    if (next.length > MAX_BAND_MEMBERS) {
      throw new BandUpdateError(`1つのバンドに入れるのは${MAX_BAND_MEMBERS}人までです。`);
    }
    tx.update(ref, {
      members: next.map((m) => ({ memberId: m.memberId, part: m.part })),
      memberIds: next.map((m) => m.memberId),
    });
    return next;
  });
}

/** メンバーを1人足す。すでにいれば何もしない(null を返す) */
export function addBandMember(bandId: string, memberId: string, part: string) {
  return updateBandMembers(bandId, (current) =>
    current.some((m) => m.memberId === memberId)
      ? null
      : [...current, { memberId, part: part.trim().slice(0, MAX_PART_LENGTH) }]
  );
}

/**
 * メンバーを1人外す。いなければ何もしない(null を返す)。
 * 最後の1人は外せない(解散の申請にする)ので、その場合は例外を投げる
 */
export function removeBandMember(bandId: string, memberId: string) {
  return updateBandMembers(bandId, (current) => {
    if (!current.some((m) => m.memberId === memberId)) return null;
    const next = current.filter((m) => m.memberId !== memberId);
    if (next.length === 0) {
      throw new BandUpdateError("最後のメンバーは脱退できません。解散を申請してください。");
    }
    return next;
  });
}

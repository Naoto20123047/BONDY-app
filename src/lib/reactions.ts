/**
 * リアクションの付け外し(チャット・掲示板のコメント共通)
 *
 * v1.3.2 から、Firestore のルールで「自分のIDを1つ足す/外す」以外の変更を
 * 弾いている。以前は画面が持っているリアクション全体を丸ごと書き戻していたため、
 * 他人のIDを入れて「その人が押した」ことにできた。
 *
 * ここでは押した絵文字のキーだけを arrayUnion / arrayRemove で書き換え、
 * 同時に lastReactionKey に押した絵文字を書く。ルールはこのキー以外が
 * 変わっていないことを確かめる(ルールからは「変わったキー」を取り出せないため)。
 *
 * 外した結果、誰も押していない絵文字は空配列のまま残る。表示側で空配列は無視すること。
 */

import { doc, updateDoc, arrayUnion, arrayRemove, FieldPath } from "firebase/firestore";
import { db } from "./firebase";

export async function toggleReaction(
  collectionName: "messages" | "comments",
  docId: string,
  emoji: string,
  memberId: string,
  alreadyReacted: boolean
): Promise<void> {
  await updateDoc(
    doc(db, collectionName, docId),
    new FieldPath("reactions", emoji),
    alreadyReacted ? arrayRemove(memberId) : arrayUnion(memberId),
    "lastReactionKey",
    emoji
  );
}

/** 空になった絵文字を取り除いて返す(表示用) */
export function cleanReactions(
  reactions: Record<string, string[]> | undefined
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  Object.entries(reactions ?? {}).forEach(([key, ids]) => {
    if (Array.isArray(ids) && ids.length > 0) result[key] = ids;
  });
  return result;
}

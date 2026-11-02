import { collection, addDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { NotificationType } from "../Types/types";
import { todayString } from "./date";

/**
 * アプリ内通知を作る。
 *
 * v1.4.1: 差出人(createdBy)を必ず書く。ルールが「自分が作った通知か」を確かめ、
 * 通知の一覧には「○○さんから」と出す。以前は差出人が無く、
 * 部員が「幹部より：〜」のような文面の通知を作ると本物と見分けがつかなかった。
 *
 * 一般メンバーが作れる通知は、種類ごとに宛先が決まっている(firestore.rules の notifications)。
 *  - equipment_request   … 機材担当かサークル長
 *  - band_member_changed … 幹部
 *  - post_comment        … 誰でも
 * それ以外の種類は幹部しか作れない。
 */
export async function createNotification(
  targetMemberId: string,
  type: NotificationType,
  message: string,
  link: string
) {
  const me = auth.currentUser?.uid;
  if (!me) return;
  try {
    await addDoc(collection(db, "notifications"), {
      targetMemberId,
      type,
      // ルールの上限(200文字)を超えると作れないので、ここで切る
      message: message.slice(0, 200),
      link,
      read: false,
      createdAt: todayString(),
      createdBy: me,
    });
  } catch (e) {
    console.error("通知の作成に失敗しました", e);
  }
}

// 複数人に同じ通知を作成
export async function createNotifications(
  targetMemberIds: string[],
  type: NotificationType,
  message: string,
  link: string
) {
  await Promise.all(
    targetMemberIds.map((id) => createNotification(id, type, message, link))
  );
}

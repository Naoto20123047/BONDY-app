import { collection, addDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { NotificationType } from "../Types/types";
import { todayString } from "./date";

// 1人に通知を作成
export async function createNotification(
  targetMemberId: string,
  type: NotificationType,
  message: string,
  link: string
) {
  try {
    await addDoc(collection(db, "notifications"), {
      targetMemberId,
      type,
      message,
      link,
      read: false,
      createdAt: todayString(),
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
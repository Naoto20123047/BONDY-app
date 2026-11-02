/**
 * 幹部の操作の記録(v1.4.1)
 *
 * 除籍・復帰・登録の承認と見送り・完全削除・昇格・チャットの非表示のときに、
 * 「誰が・いつ・誰に・何を」を auditLogs に残す。
 * 問題が起きたときに、誰の操作だったかを後から追えるようにするため。
 *
 * ルールで、書けるのは幹部の自分の操作だけ、書き換え・削除はできないようにしてある。
 * 時刻はサーバーの時刻(ルールで request.time と一致することを確かめている)。
 *
 * 記録の失敗で本来の操作を止めないよう、ここでは例外を投げない。
 * 同じバッチで書きたいときは auditLogEntry() で中身だけを作って batch.set に渡す。
 */

import { collection, doc, serverTimestamp, setDoc, type FieldValue } from "firebase/firestore";
import { auth, db } from "./firebase";

export type AuditAction =
  | "expel"            // 除籍
  | "restore"          // 在籍に戻す
  | "withdraw"         // 幹部による退会処理
  | "approve_member"   // 教員・OBの登録を承認
  | "decline_member"   // 教員・OBの登録を見送り
  | "delete_member"    // 完全削除
  | "promote"          // 幹部に昇格
  | "hide_message"     // チャットのメッセージを非表示
  | "unhide_message";  // 非表示を解除

export interface AuditLogEntry {
  actorId: string;
  action: AuditAction;
  targetId: string;
  detail: string;
  at: FieldValue;
}

/** 記録の中身を作る(バッチに入れるとき用) */
export function auditLogEntry(action: AuditAction, targetId: string, detail = ""): AuditLogEntry {
  return {
    actorId: auth.currentUser?.uid ?? "",
    action,
    targetId,
    detail: detail.slice(0, 200),
    at: serverTimestamp(),
  };
}

/** 新しい記録のドキュメント参照(バッチに入れるとき用) */
export function newAuditLogRef() {
  return doc(collection(db, "auditLogs"));
}

/** 記録を1件書く。失敗してもログに出すだけ */
export async function writeAuditLog(action: AuditAction, targetId: string, detail = ""): Promise<void> {
  try {
    await setDoc(newAuditLogRef(), auditLogEntry(action, targetId, detail));
  } catch (e) {
    console.error("操作の記録に失敗しました", e);
  }
}

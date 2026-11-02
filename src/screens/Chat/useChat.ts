import { useState, useEffect } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteField,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { FORMER_MEMBER_LABEL } from "../../lib/members";
import { useAuth } from "../../lib/AuthContext";
import { toggleReaction as writeReaction, cleanReactions } from "../../lib/reactions";
import { asText } from "../../lib/sanitize";
import { hasOfficerRole } from "../../lib/roles";
import { auditLogEntry, newAuditLogRef } from "../../lib/auditLog";

export type MessageType = "text" | "stamp";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  text: string;
  stamp: string;
  reactions: Record<string, string[]>;
  createdAt: string;
  isMine: boolean;
  /** 本人が取り消したメッセージ。本文は空になっており、吹き出しだけが残る */
  deleted: boolean;
  /**
   * 幹部が非表示にしたメッセージ(v1.4.1)。
   * 一般メンバーには本文を出さず「幹部により非表示」とだけ出す。データは消さない
   */
  hidden: boolean;
}

interface RawMessage {
  id: string;
  senderId: string;
  type?: MessageType;
  text?: string;
  stamp?: string;
  reactions?: Record<string, string[]>;
  createdAt: string;
  deleted?: boolean;
  hiddenBy?: string;
}

/** チャット1件の上限(firestore.rules と揃える) */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * 送信に失敗したときの案内。
 * v1.4.1 から、ルールが「送信時刻がサーバーの時刻と15分以内」を確かめるため、
 * 端末の時計が大きくずれていると送れない
 */
const sendFailedMessage = (length: number): string =>
  length > MAX_MESSAGE_LENGTH
    ? `送信できるのは${MAX_MESSAGE_LENGTH}文字までです。`
    : "送信に失敗しました。通信状態と、端末の日付・時刻の設定が正しいかを確認してください。";

export function useChat() {
  const { member, memberMap } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!member) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "messages"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const raw: RawMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RawMessage, "id">),
        }));
        const ordered = raw.reverse().map((m) => {
          const brief = memberMap[m.senderId];
          const senderName = brief
            ? brief.nickname
              ? `${brief.name}(${brief.nickname})`
              : brief.name
            : FORMER_MEMBER_LABEL;
          const type: MessageType = m.type === "stamp" ? "stamp" : "text";
          // 型が想定と違う値で画面が止まらないよう、文字列にそろえる(v1.4.1)。
          // 以前はチャットに文字列以外の値を1件送るだけで、開いた全員の画面が止まった
          return {
            id: m.id,
            senderId: asText(m.senderId),
            senderName,
            type,
            text: asText(m.text),
            stamp: asText(m.stamp),
            reactions: cleanReactions(m.reactions),
            createdAt: asText(m.createdAt),
            isMine: m.senderId === member.id,
            deleted: m.deleted === true,
            hidden: typeof m.hiddenBy === "string" && m.hiddenBy !== "",
          };
        });
        setMessages(ordered);
        setLoading(false);
      },
      (err) => {
        console.error("チャットの監視に失敗しました", err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [member, memberMap]);

  const sendMessage = async (text: string) => {
    if (!member) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    setSending(true);
    try {
      await addDoc(collection(db, "messages"), {
        senderId: member.id,
        type: "text",
        text: trimmed,
        createdAt: new Date().toISOString(),
      });
      return true;
    } catch (e) {
      console.error("メッセージの送信に失敗しました", e);
      window.alert(sendFailedMessage(trimmed.length));
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendStamp = async (stamp: string) => {
    if (!member) return false;
    if (!stamp) return false;
    setSending(true);
    try {
      await addDoc(collection(db, "messages"), {
        senderId: member.id,
        type: "stamp",
        stamp,
        createdAt: new Date().toISOString(),
      });
      return true;
    } catch (e) {
      console.error("スタンプの送信に失敗しました", e);
      window.alert(sendFailedMessage(0));
      return false;
    } finally {
      setSending(false);
    }
  };

  /**
   * 自分のメッセージを取り消す。
   * ドキュメント自体は消さず、本文だけを空にして deleted を立てる。
   * 「誰がいつ発言したか」は残るので、後から会話を追えなくなることはない。
   */
  const deleteMessage = async (messageId: string) => {
    if (!member) return false;
    const target = messages.find((m) => m.id === messageId);
    if (!target) return false;
    if (target.senderId !== member.id || target.deleted) return false;

    const patch: Record<string, unknown> = {
      deleted: true,
      deletedAt: new Date().toISOString(),
    };
    // 元から存在しないフィールドを増やさないよう、種別に応じて片方だけ空にする
    if (target.type === "stamp") {
      patch.stamp = "";
    } else {
      patch.text = "";
    }

    try {
      await updateDoc(doc(db, "messages", messageId), patch);
      return true;
    } catch (e) {
      console.error("メッセージの取り消しに失敗しました", e);
      window.alert("取り消しに失敗しました。");
      return false;
    }
  };

  /**
   * 幹部がメッセージを非表示にする・戻す(v1.4.1)。
   * 嫌がらせの発言に対応できるようにするため。本文は消さずに hiddenBy / hiddenAt を付けるだけなので、
   * 「データは削除しない」方針は守られる。操作は auditLogs に残す
   */
  const setMessageHidden = async (messageId: string, hidden: boolean) => {
    if (!member || !hasOfficerRole(member)) return false;
    try {
      const batch = writeBatch(db);
      batch.update(
        doc(db, "messages", messageId),
        hidden
          ? { hiddenBy: member.id, hiddenAt: serverTimestamp() }
          : { hiddenBy: deleteField(), hiddenAt: deleteField() }
      );
      batch.set(
        newAuditLogRef(),
        auditLogEntry(hidden ? "hide_message" : "unhide_message", messageId)
      );
      await batch.commit();
      return true;
    } catch (e) {
      console.error("メッセージの非表示の切り替えに失敗しました", e);
      window.alert("操作に失敗しました。");
      return false;
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!member) return;
    const target = messages.find((m) => m.id === messageId);
    if (!target || target.deleted) return;

    const already = (target.reactions[emoji] ?? []).includes(member.id);
    try {
      // 押した絵文字のキーだけを書き換える(lib/reactions.ts を参照)
      await writeReaction("messages", messageId, emoji, member.id, already);
    } catch (e) {
      console.error("リアクションの更新に失敗しました", e);
    }
  };

  return {
    messages,
    loading,
    sending,
    sendMessage,
    sendStamp,
    deleteMessage,
    setMessageHidden,
    toggleReaction,
  } as const;
}

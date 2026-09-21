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
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";

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
}

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
        console.log("[snapshot]", new Date().toISOString());
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
            : "不明";
          const type: MessageType = m.type === "stamp" ? "stamp" : "text";
          return {
            id: m.id,
            senderId: m.senderId,
            senderName,
            type,
            text: m.text ?? "",
            stamp: m.stamp ?? "",
            reactions: m.reactions ?? {},
            createdAt: m.createdAt,
            isMine: m.senderId === member.id,
            deleted: m.deleted === true,
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
      window.alert("送信に失敗しました。");
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
      window.alert("送信に失敗しました。");
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

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!member) return;
    const target = messages.find((m) => m.id === messageId);
    if (!target || target.deleted) return;

    const reactions: Record<string, string[]> = {};
    Object.entries(target.reactions).forEach(([key, ids]) => {
      reactions[key] = [...ids];
    });

    const current = reactions[emoji] ?? [];
    if (current.includes(member.id)) {
      const next = current.filter((id) => id !== member.id);
      if (next.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = next;
      }
    } else {
      reactions[emoji] = [...current, member.id];
    }

    try {
      await updateDoc(doc(db, "messages", messageId), { reactions });
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
    toggleReaction,
  } as const;
}
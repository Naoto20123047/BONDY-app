import { useState, useEffect } from "react";
import { doc, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { addBlockToBatch, fetchPendingMembers } from "../../lib/members";
import { auditLogEntry, newAuditLogRef } from "../../lib/auditLog";
import { useAuth } from "../../lib/AuthContext";
import { createNotification } from "../../lib/notify";
import { disableAuthAccount, isWorkerConfigured } from "../../lib/workerClient";
import { todayString } from "../../lib/date";
import type { Member } from "../../Types/types";

/**
 * 新規登録の承認(教員・OB)。
 *
 * 教員・OBは大学以外のアドレスで登録できるため、幹部が本人か確かめてから
 * 名簿・チャットなどを使えるようにする。
 *  - 承認する: approved を true にする。本人に通知が届く
 *  - 見送る:   除籍と同じ扱い(アカウントを無効化する)。ユーザー履歴から戻せる
 */
export function useMemberApprovals() {
  const { member: me } = useAuth();
  const [pending, setPending] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const list = await fetchPendingMembers();
        list.sort((a, b) => ((a.joinedAt ?? "") < (b.joinedAt ?? "") ? -1 : 1));
        setPending(list);
      } catch (e) {
        console.error("新規登録の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const approve = async (target: Member) => {
    if (!me) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "members", target.id), {
        approved: true,
        approvedAt: todayString(),
        approvedBy: me.id,
      });
      batch.set(newAuditLogRef(), auditLogEntry("approve_member", target.id, target.name));
      await batch.commit();
      await createNotification(
        target.id,
        "approval_result",
        "幹部の確認が終わりました。すべての機能が使えるようになりました",
        "/home"
      );
      setPending((prev) => prev.filter((m) => m.id !== target.id));
    } catch (e) {
      console.error("承認に失敗しました", e);
      window.alert("承認に失敗しました。");
    }
  };

  const decline = async (target: Member) => {
    const ok = window.confirm(
      `${target.name}さんの登録を見送ります。\n\n` +
        "アカウントは無効化され、本人はログインできなくなります。" +
        "誤って見送った場合は、ユーザー履歴から戻せます。\n\nよろしいですか?"
    );
    if (!ok) return;
    try {
      // 除籍と同じく、再登録を止める記録と操作の記録を同じバッチで書く(v1.4.1)
      const batch = writeBatch(db);
      batch.update(doc(db, "members", target.id), {
        status: "expelled",
        expelledAt: todayString(),
      });
      addBlockToBatch(batch, target.id);
      batch.set(newAuditLogRef(), auditLogEntry("decline_member", target.id, target.name));
      await batch.commit();
      if (isWorkerConfigured()) {
        try {
          await disableAuthAccount(target.id);
        } catch (e) {
          // アカウントの無効化に失敗しても、アプリには入れない状態になっている
          console.error("アカウントの無効化に失敗しました", e);
        }
      }
      setPending((prev) => prev.filter((m) => m.id !== target.id));
    } catch (e) {
      console.error("見送りに失敗しました", e);
      window.alert("処理に失敗しました。");
    }
  };

  return { pending, loading, approve, decline } as const;
}

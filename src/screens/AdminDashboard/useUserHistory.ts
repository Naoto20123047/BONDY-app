import { useState, useEffect } from "react";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { fetchFormerMembers } from "../../lib/members";
import { writeAuditLog } from "../../lib/auditLog";
import type { MemberStatus } from "../../Types/types";
import { calcGrade } from "../../lib/grade";

export interface LeftMemberView {
  id: string;
  name: string;
  faculty: string;
  gradeLabel: string;
  studentId: string;
  status: MemberStatus; // withdrawn(退会) か expelled(除籍)
  leftAt: string;       // 退会日または除籍日
}

export function useUserHistory() {
  const [members, setMembers] = useState<LeftMemberView[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      // 退会と除籍の両方を出す。表示上は区別する
      const list = (await fetchFormerMembers()).map((m) => {
        return {
          id: m.id,
          name: m.name,
          faculty: m.faculty,
          gradeLabel: calcGrade(m.enrollmentYear, m.isOB, m.category),
          studentId: m.studentId,
          status: m.status,
          leftAt: (m.status === "expelled" ? m.expelledAt : m.withdrawnAt) ?? "",
        };
      });
      // 新しい順
      list.sort((a, b) => (a.leftAt < b.leftAt ? 1 : -1));
      setMembers(list);
    } catch (e) {
      console.error("ユーザー履歴の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /**
   * 完全削除。
   *
   * Member ドキュメントを消すため、この人が再ログインしてもプロフィール登録から
   * やり直すことになり、会費記録やバンド履歴とは切り離された別人扱いになる。
   * Firebase Auth のアカウント自体は Admin SDK 無しでは消せないため残る。
   */
  const deletePermanently = async (id: string) => {
    const target = members.find((m) => m.id === id);
    const ok = window.confirm(
      `${target?.name}さんのデータを完全に削除します。\n` +
        `この操作は取り消せません。\n\n` +
        (target?.status === "expelled"
          ? `除籍した人は、削除後も登録し直すことはできません。\n\n`
          : `削除後は、本人がログインしても新規メンバーとして登録し直すことになります。\n\n`) +
        `本当によろしいですか?`
    );
    if (!ok) return;
    try {
      // TODO: 本来は関連データ(会費・バンド在籍・機材履歴など)も削除する
      // 除籍した人の再登録を止める記録(blockedUids)は消さない(v1.4.1)。
      // 消すと、アカウントの無効化に失敗していた場合に、本人が入り直せてしまう
      await deleteDoc(doc(db, "members", id));
      await writeAuditLog("delete_member", id, target?.name ?? "");
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error("完全削除に失敗しました", e);
      window.alert("削除に失敗しました。");
    }
  };

  return { members, loading, deletePermanently } as const;
}

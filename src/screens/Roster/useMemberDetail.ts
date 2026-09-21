import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, deleteField, collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { createNotifications } from "../../lib/notify";
import { disableAuthAccount, enableAuthAccount, isWorkerConfigured } from "../../lib/workerClient";
import type { Position, Member } from "../../Types/types";

export const assignablePositions: Position[] = [
  "サークル長",
  "副サークル長",
  "会計担当",
  "機材担当",
  "広報担当",
];

export function useMemberDetail(id: string | undefined) {
  const { member: currentMember } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMember = async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const snapshot = await getDoc(doc(db, "members", id));
      if (snapshot.exists()) {
        setMember({ id: snapshot.id, ...(snapshot.data() as Omit<Member, "id">) });
      } else {
        setMember(null);
      }
    } catch (e) {
      console.error("部員情報の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMember();
  }, [id]);

  // 他の幹部のIDを取得(提案者・対象者を除く)。承認依頼通知の宛先に使う
  const getOtherOfficerIds = async (excludeIds: string[]) => {
    const snap = await getDocs(query(collection(db, "members"), where("status", "==", "active")));
    return snap.docs
      .filter((d) => {
        const r = (d.data() as { role: string }).role;
        return r === "幹部" || r === "管理者";
      })
      .map((d) => d.id)
      .filter((oid) => !excludeIds.includes(oid));
  };

  /**
   * 退会処理(円満な離脱を幹部が代行する)
   *
   * 本人が自分で退会した場合と同じ状態にする。Auth アカウントは無効化しないので、
   * 本人が再ログインすれば復帰画面から戻れる。
   * 問題があって締め出したい場合は expelMember() を使うこと。
   */
  const withdrawMember = async () => {
    if (!member) return;
    const ok = window.confirm(
      `${member.name}さんを退会処理します。\n\n` +
        `本人が再ログインすれば復帰できる状態になります。` +
        `戻れないようにする場合は「除籍」を使ってください。\n\nよろしいですか?`
    );
    if (!ok) return;
    try {
      // ソフト削除(Member ドキュメントは残す)
      await updateDoc(doc(db, "members", member.id), {
        status: "withdrawn",
        withdrawnAt: new Date().toISOString().slice(0, 10),
      });
      window.alert(`${member.name}さんを退会処理しました。`);
      await fetchMember();
    } catch (e) {
      console.error("退会処理に失敗しました", e);
      window.alert("退会処理に失敗しました。");
    }
  };

  /**
   * 除籍(問題があって外す)
   *
   * A-3: Worker 経由で Auth アカウントを無効化し、再ログインを阻止する。
   * Member ドキュメントは「データは削除しない」方針に従って残す。
   * 復帰は幹部操作でのみ行う。
   */
  const expelMember = async () => {
    if (!member) return;
    const ok = window.confirm(
      `${member.name}さんを除籍します。\n\n` +
        `アカウントが無効化され、本人はログインできなくなります。` +
        `戻す場合は幹部の操作が必要です。\n\n本当によろしいですか?`
    );
    if (!ok) return;
    try {
      await updateDoc(doc(db, "members", member.id), {
        status: "expelled",
        expelledAt: new Date().toISOString().slice(0, 10),
      });

      // members のドキュメントID = Firebase Auth の UID なので、そのまま渡せる
      if (!isWorkerConfigured()) {
        // Worker 未デプロイでも除籍自体は成立させる。
        // この場合も AuthContext 側の status チェックでアプリには入れない。
        console.warn("Workerが未設定のため、Authアカウントの無効化をスキップしました");
        window.alert(
          `${member.name}さんを除籍しました。\n\n` +
            `ただしアカウントの無効化は行われていません(Worker未設定)。アプリには入れません。`
        );
      } else {
        try {
          await disableAuthAccount(member.id);
          window.alert(`${member.name}さんを除籍しました。`);
        } catch (e) {
          console.error("Authアカウントの無効化に失敗しました", e);
          window.alert(
            `${member.name}さんを除籍しましたが、アカウントの無効化に失敗しました。\n\n` +
              `アプリには入れない状態になっていますが、念のため時間をおいて同じ操作をもう一度行ってください。`
          );
        }
      }

      await fetchMember();
    } catch (e) {
      console.error("除籍に失敗しました", e);
      window.alert("除籍に失敗しました。");
    }
  };

  /**
   * 在籍状態に戻す(幹部操作)
   *
   * 除籍された人を戻す場合は、Auth アカウントの無効化も解除する。
   * 退会者は本人が復帰できるが、幹部がここから戻すこともできる。
   */
  const restoreMember = async () => {
    if (!member) return;
    const wasExpelled = member.status === "expelled";
    const ok = window.confirm(
      `${member.name}さんを在籍中に戻します。よろしいですか?`
    );
    if (!ok) return;
    try {
      await updateDoc(doc(db, "members", member.id), {
        status: "active",
        withdrawnAt: deleteField(),
        expelledAt: deleteField(),
      });

      if (wasExpelled && isWorkerConfigured()) {
        try {
          await enableAuthAccount(member.id);
        } catch (e) {
          console.error("Authアカウントの有効化に失敗しました", e);
          window.alert(
            `${member.name}さんを在籍中に戻しましたが、アカウントの有効化に失敗しました。\n\n` +
              `本人がログインできない状態のため、時間をおいて同じ操作をもう一度行ってください。`
          );
          await fetchMember();
          return;
        }
      }

      window.alert(`${member.name}さんを在籍中に戻しました。`);
      await fetchMember();
    } catch (e) {
      console.error("復帰処理に失敗しました", e);
      window.alert("復帰処理に失敗しました。");
    }
  };

  const registerOB = async () => {
    if (!member) return;
    const ok = window.confirm(`${member.name}さんをOB登録します。よろしいですか?`);
    if (!ok) return;
    try {
      await updateDoc(doc(db, "members", member.id), { isOB: true });
      await fetchMember();
    } catch (e) {
      console.error("OB登録に失敗しました", e);
      window.alert("OB登録に失敗しました。");
    }
  };

  const promoteToOfficer = async () => {
    if (!member) return;
    const ok = window.confirm(`${member.name}さんを幹部に昇格させます。よろしいですか?`);
    if (!ok) return;
    try {
      await updateDoc(doc(db, "members", member.id), { role: "幹部" });
      await fetchMember();
    } catch (e) {
      console.error("昇格に失敗しました", e);
      window.alert("昇格に失敗しました。");
    }
  };

  const proposeDismissOfficer = async () => {
    if (!member || !currentMember) return;
    const ok = window.confirm(`${member.name}さんの幹部からの降格を申請します。他の幹部2名の承認で成立します。よろしいですか?`);
    if (!ok) return;
    try {
      await addDoc(collection(db, "roleChangeRequests"), {
        type: "dismiss_officer",
        targetMemberId: member.id,
        proposedBy: currentMember.id,
        approvals: [currentMember.id],
        requiredApprovals: 3,
        status: "pending",
      });

      // 他の幹部に承認依頼を通知
      const officerIds = await getOtherOfficerIds([currentMember.id, member.id]);
      await createNotifications(
        officerIds,
        "approval_needed",
        `${member.name}さんの降格の承認依頼が届いています`,
        "/admin/approvals/roles"
      );

      window.alert("降格を申請しました。");
    } catch (e) {
      console.error("降格申請に失敗しました", e);
      window.alert("降格申請に失敗しました。");
    }
  };

  const proposeAssignPosition = async (position: Position) => {
    if (!member || !currentMember) return;
    try {
      await addDoc(collection(db, "roleChangeRequests"), {
        type: "assign_position",
        targetMemberId: member.id,
        proposedBy: currentMember.id,
        approvals: [currentMember.id],
        requiredApprovals: 3,
        status: "pending",
        position,
      });

      // 他の幹部に承認依頼を通知
      const officerIds = await getOtherOfficerIds([currentMember.id, member.id]);
      await createNotifications(
        officerIds,
        "approval_needed",
        `${member.name}さんへの「${position}」付与の承認依頼が届いています`,
        "/admin/approvals/roles"
      );

      window.alert(`「${position}」の付与を申請しました。幹部3名以上の承認で成立します。`);
    } catch (e) {
      console.error("役職付与申請に失敗しました", e);
      window.alert("役職付与申請に失敗しました。");
    }
  };

  const isOfficerMember = member?.role === "幹部";

  return {
    member,
    loading,
    withdrawMember,
    expelMember,
    restoreMember,
    registerOB,
    promoteToOfficer,
    proposeDismissOfficer,
    proposeAssignPosition,
    isOfficerMember,
  } as const;
}

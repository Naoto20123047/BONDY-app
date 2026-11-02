import { useState, useEffect } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { addBlockToBatch, fetchOfficerIds, removeBlock } from "../../lib/members";
import { canJoinRoleDecisions, hasOfficerRole, roleDecisionAvailableAt } from "../../lib/roles";
import { auditLogEntry, newAuditLogRef, writeAuditLog } from "../../lib/auditLog";
import { asText, asTextList } from "../../lib/sanitize";
import { useAuth } from "../../lib/AuthContext";
import { createNotifications } from "../../lib/notify";
import { disableAuthAccount, enableAuthAccount, isWorkerConfigured } from "../../lib/workerClient";
import type { Member, Position } from "../../Types/types";
import { todayString } from "../../lib/date";

export const assignablePositions: Position[] = [
  "サークル長",
  "副サークル長",
  "会計担当",
  "機材担当",
  "広報担当",
];

/** 「昇格から14日間は〜」の案内文。加われる日を添える */
function roleDecisionWaitMessage(availableAt: number): string {
  const d = new Date(availableAt);
  return (
    `幹部に昇格してから14日間は、役職の変更を申請・承認できません。` +
    `${d.getMonth() + 1}月${d.getDate()}日から行えます。`
  );
}

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
        const raw = snapshot.data() as Omit<Member, "id">;
        // 型が想定と違う値で画面が止まらないよう、そろえてから渡す(v1.4.1)
        setMember({
          ...raw,
          id: snapshot.id,
          name: asText(raw.name),
          nickname: raw.nickname === undefined ? undefined : asText(raw.nickname),
          parts: asTextList(raw.parts),
          positions: asTextList(raw.positions) as Member["positions"],
        });
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

  // 他の幹部のIDを取得(提案者・対象者を除く)。承認依頼通知の宛先に使う。
  // 中身は lib/members.ts に集約してある
  const getOtherOfficerIds = (excludeIds: string[]) => fetchOfficerIds(excludeIds);

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
        withdrawnAt: todayString(),
      });
      await writeAuditLog("withdraw", member.id, member.name);
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
      // v1.4.1: 除籍・再登録を止める記録・操作の記録を1回のバッチで書く。
      // blockedUids は名簿を完全削除しても残るので、アカウントの無効化が失敗していても
      // 本人がプロフィール登録からやり直して入り直すことはできない
      const batch = writeBatch(db);
      batch.update(doc(db, "members", member.id), {
        status: "expelled",
        expelledAt: todayString(),
      });
      addBlockToBatch(batch, member.id);
      batch.set(newAuditLogRef(), auditLogEntry("expel", member.id, member.name));
      await batch.commit();

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
      await writeAuditLog("restore", member.id, member.name);
      if (wasExpelled) await removeBlock(member.id);

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

  /**
   * 幹部に昇格させる(即時反映)。
   *
   * v1.4.1: 昇格した時刻(サーバーの時刻)と昇格させた人を残し、幹部全員に通知する。
   * 昇格した人は、昇格から14日間は役職変更の申請・承認・却下に加われない
   * (幹部1人が味方を昇格させて、その場で「3名の承認」をそろえることを防ぐため)。
   */
  const promoteToOfficer = async () => {
    if (!member || !currentMember) return;
    const ok = window.confirm(
      `${member.name}さんを幹部に昇格させます。\n\n` +
        `すぐに幹部の権限が使えるようになり、幹部全員に通知されます。` +
        `役職の変更の申請・承認に加われるのは、昇格から14日後です。\n\nよろしいですか?`
    );
    if (!ok) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "members", member.id), {
        role: "幹部",
        promotedAt: serverTimestamp(),
        promotedBy: currentMember.id,
      });
      batch.set(newAuditLogRef(), auditLogEntry("promote", member.id, member.name));
      await batch.commit();

      // 幹部全員(昇格させた本人を除く。昇格した人を含む)に知らせる
      const officerIds = await fetchOfficerIds([currentMember.id]);
      await createNotifications(
        officerIds,
        "officer_promoted",
        `${currentMember.name}さんが${member.name}さんを幹部に昇格させました`,
        `/roster/${member.id}`
      );
      await fetchMember();
    } catch (e) {
      console.error("昇格に失敗しました", e);
      window.alert("昇格に失敗しました。");
    }
  };

  const proposeDismissOfficer = async () => {
    if (!member || !currentMember) return;
    if (!canJoinRoleDecisions(currentMember)) {
      window.alert(roleDecisionWaitMessage(roleDecisionAvailableAt(currentMember)));
      return;
    }
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
        createdAt: new Date().toISOString(),
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
    if (!canJoinRoleDecisions(currentMember)) {
      window.alert(roleDecisionWaitMessage(roleDecisionAvailableAt(currentMember)));
      return;
    }
    try {
      await addDoc(collection(db, "roleChangeRequests"), {
        type: "assign_position",
        targetMemberId: member.id,
        proposedBy: currentMember.id,
        approvals: [currentMember.id],
        requiredApprovals: 3,
        status: "pending",
        position,
        createdAt: new Date().toISOString(),
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

  // 表示中のメンバーが幹部か。降格申請と役職付与のボタンを出す条件に使う。
  // (操作する側ではなく、操作される側の役職を見ている)
  const isOfficerMember = hasOfficerRole(member);

  // 操作する幹部が、役職変更の申請に加われるか(昇格から14日間は加われない)
  const roleDecisionWaitNote = canJoinRoleDecisions(currentMember)
    ? null
    : roleDecisionWaitMessage(roleDecisionAvailableAt(currentMember));

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
    roleDecisionWaitNote,
  } as const;
}

import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { createNotifications } from "../../lib/notify";
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

  const withdrawMember = async () => {
    if (!member) return;
    const ok = window.confirm(`${member.name}さんを退会させます。データはユーザー履歴に残ります。よろしいですか?`);
    if (!ok) return;
    try {
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
    registerOB,
    promoteToOfficer,
    proposeDismissOfficer,
    proposeAssignPosition,
    isOfficerMember,
  } as const;
}
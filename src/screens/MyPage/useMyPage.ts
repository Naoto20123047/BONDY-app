import { useState, useEffect } from "react";
import { collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { createNotifications } from "../../lib/notify";
import { getEquipmentManagerIds } from "../../lib/equipmentManager";
import type { Band, EquipmentRequest } from "../../Types/types";


interface AnsweredForm {
  id: string;
  title: string;
  answeredAt: string;
}

interface MyEquipment {
  requestId: string;
  equipmentName: string;
  quantity: number;
  dueDate: string;
  status: "貸出中" | "返却報告済み";
  overdue: boolean;
}

// 現在の年度(4月始まり)
const currentFiscalYear = () => {
  const now = new Date();
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
};

export function useMyPage() {
  const { member, refreshMember } = useAuth();
  const [bands, setBands] = useState<Band[]>([]);
  const [answeredForms, setAnsweredForms] = useState<AnsweredForm[]>([]);
  const [myEquipment, setMyEquipment] = useState<MyEquipment[]>([]);
  const [duesPaid, setDuesPaid] = useState(false); // 今年度の会費納入状況
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!member) {
      setLoading(false);
      return;
    }
    try {
      // 今年度の自分の会費状況(dues コレクションを正とする)
      const cy = currentFiscalYear();
      const duesQ = query(
        collection(db, "dues"),
        where("memberId", "==", member.id),
        where("fiscalYear", "==", cy)
      );
      const duesSnap = await getDocs(duesQ);
      // 今年度のレコードがあり、paid が true なら納入済み
      const paid = duesSnap.docs.some((d) => (d.data() as { paid: boolean }).paid === true);
      setDuesPaid(paid);

      // 自分が借りている機材(貸出中・返却報告済み)
      const reqQ = query(
        collection(db, "equipmentRequests"),
        where("memberId", "==", member.id),
        where("status", "in", ["貸出中", "返却報告済み"])
      );
      const reqSnap = await getDocs(reqQ);
      const requests: EquipmentRequest[] = reqSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<EquipmentRequest, "id">),
      }));

      // 機材名の解決
      const eqSnap = await getDocs(collection(db, "equipment"));
      const eqMap: Record<string, string> = {};
      eqSnap.docs.forEach((d) => {
        eqMap[d.id] = (d.data() as { name: string }).name;
      });

      const now = new Date();
      setMyEquipment(
        requests.map((r) => ({
          requestId: r.id,
          equipmentName: eqMap[r.equipmentId] ?? "不明",
          quantity: r.quantity,
          dueDate: r.dueDate,
          status: r.status as "貸出中" | "返却報告済み",
          overdue: new Date(r.dueDate) < now,
        }))
      );

      // 所属バンド(解散以外で、自分がメンバーに含まれるもの)
      const bandsSnap = await getDocs(collection(db, "bands"));
      const myBands: Band[] = bandsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Band, "id">) }))
        .filter(
          (b) =>
            b.status !== "解散" &&
            b.members.some((m) => m.memberId === member.id)
        );
      setBands(myBands);

      // 回答済みフォームは後で接続(今は空)
      setAnsweredForms([]);
    } catch (e) {
      console.error("マイページ情報の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [member]);

  // 幹部全員のIDを取得(通知用)
  const getOfficerIds = async (): Promise<string[]> => {
    const snap = await getDocs(query(collection(db, "members"), where("status", "==", "active")));
    return snap.docs
      .filter((d) => {
        const r = (d.data() as { role: string }).role;
        return r === "幹部" || r === "管理者";
      })
      .map((d) => d.id);
  };

  const leaveBand = async (bandId: string) => {
    if (!member) return;
    const target = bands.find((b) => b.id === bandId);
    if (!target) return;
    // 最後の1人は脱退できない
    if (target.members.length <= 1) {
      window.alert("あなたはこのバンドの最後のメンバーです。脱退する場合は、バンド詳細から「解散を申請」してください。");
      return;
    }
    const ok = window.confirm(`「${target.name}」から脱退します。よろしいですか?`);
    if (!ok) return;
    try {
      const updatedMembers = target.members.filter((m) => m.memberId !== member.id);
      await updateDoc(doc(db, "bands", bandId), { members: updatedMembers });

      // 幹部全員に通知
      const officerIds = await getOfficerIds();
      await createNotifications(
        officerIds,
        "band_member_changed",
        `バンド「${target.name}」から${member.name}さんが脱退しました`,
        `/bands/${bandId}`
      );

      await fetchData();
    } catch (e) {
      console.error("バンド脱退に失敗しました", e);
      window.alert("脱退に失敗しました。");
    }
  };

  const reportReturn = async (requestId: string) => {
    const ok = window.confirm("この機材の返却を報告します。機材担当の確認後に返却完了となります。よろしいですか?");
    if (!ok) return;
    try {
      await updateDoc(doc(db, "equipmentRequests", requestId), {
        status: "返却報告済み",
        reportedAt: new Date().toISOString().slice(0, 10),
      });

      // 機材担当に返却報告の通知
      const target = myEquipment.find((e) => e.requestId === requestId);
      const managerIds = await getEquipmentManagerIds();
      await createNotifications(
        managerIds.filter((mid) => mid !== member?.id),
        "equipment_request",
        `${member?.name}さんが「${target?.equipmentName}」の返却を報告しました`,
        "/equipment/requests"
      );

      setMyEquipment((prev) =>
        prev.map((e) => (e.requestId === requestId ? { ...e, status: "返却報告済み" } : e))
      );
    } catch (e) {
      console.error("返却報告に失敗しました", e);
      window.alert("返却報告に失敗しました。");
    }
  };

  const withdraw = async () => {
    if (!member) return;
    const lockedPositions = ["サークル長", "副サークル長", "会計担当"];
    const hasLocked = member.positions.some((p) => lockedPositions.includes(p));
    if (hasLocked) {
      window.alert("サークル長・副サークル長・会計担当のいずれかを担当している間は退会できません。先に役職を交代してください。");
      return;
    }
    if (myEquipment.length > 0) {
      window.alert("貸出中の機材があります。返却が完了してから退会してください。");
      return;
    }
    const ok = window.confirm("退会します。この操作は取り消せません。よろしいですか?");
    if (!ok) return;
    try {
      // ソフト削除(status を withdrawn に)
      await updateDoc(doc(db, "members", member.id), {
        status: "withdrawn",
        withdrawnAt: new Date().toISOString().slice(0, 10),
      });

      // 自分が所属しているバンドから自分を外す(最後の1人だったバンドは解散扱い)
      for (const b of bands) {
        const remaining = b.members.filter((m) => m.memberId !== member.id);
        if (remaining.length === 0) {
          await updateDoc(doc(db, "bands", b.id), { status: "解散" });
        } else {
          await updateDoc(doc(db, "bands", b.id), { members: remaining });
        }
      }

      // 幹部に退会を通知
      const officerIds = await getOfficerIds();
      await createNotifications(
        officerIds.filter((oid) => oid !== member.id),
        "band_member_changed",
        `${member.name}さんが退会しました`,
        "/roster"
      );

      window.alert("退会しました。ご利用ありがとうございました。");
      await refreshMember(); // member が null になり、ログイン/登録画面へ
    } catch (e) {
      console.error("退会に失敗しました", e);
      window.alert("退会処理に失敗しました。");
    }
  };

  return { member, bands, answeredForms, myEquipment, duesPaid, loading, leaveBand, reportReturn, withdraw } as const;
}
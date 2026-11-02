import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { fetchAllMembers, fetchMemberNameMap, FORMER_MEMBER_LABEL } from "../../lib/members";
import { canJoinRoleDecisions, roleDecisionAvailableAt } from "../../lib/roles";
import { useAuth } from "../../lib/AuthContext";
import type { Position, RoleChangeRequest } from "../../Types/types";
import { createNotification } from "../../lib/notify";

export interface RoleRequestView extends RoleChangeRequest {
  targetName: string;
  proposerName: string;
  typeLabel: string;
  position?: Position; // 役職付与のとき
}

const typeLabelMap: Record<RoleChangeRequest["type"], string> = {
  assign_position: "役職の付与",
  dismiss_officer: "幹部からの降格",
  dismiss_leader: "サークル長の解任",
  assign_vice_leader: "副サークル長の指名",
};

export function useRoleApprovals() {
  const { member: currentMember } = useAuth();
  const [requests, setRequests] = useState<RoleRequestView[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      // 保留中の申請
      const q = query(collection(db, "roleChangeRequests"), where("status", "==", "pending"));
      const snap = await getDocs(q);
      const raw = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RoleChangeRequest, "id"> & { position?: Position }),
      }));

      // 氏名解決
      const nameMap = await fetchMemberNameMap();

      setRequests(
        raw.map((r) => ({
          ...r,
          targetName: nameMap[r.targetMemberId] ?? FORMER_MEMBER_LABEL,
          proposerName: nameMap[r.proposedBy] ?? FORMER_MEMBER_LABEL,
          typeLabel:
            r.type === "assign_position" && r.position
              ? `「${r.position}」の付与`
              : typeLabelMap[r.type],
        }))
      );
    } catch (e) {
      console.error("ロール承認一覧の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /**
   * 最後の承認と、役職変更の反映を1回のバッチで行う(v1.4.1)。
   *
   * 以前は「申請を approved にする → 別の書き込みで反映する」の2段階で、
   * approved の申請がそのまま残ったため、同じ申請を何度でも反映し直せた
   * (外された人を、昔の申請でもう一度サークル長に戻す、など)。
   *
   * 今は次をまとめて書き、ルールが「同じバッチで申請が applied になっていること」を確かめる。
   *  - 申請: 自分の承認を足し、status を applied にする
   *  - 対象者: 役職を変え、appliedRequestId にこの申請のIDを書く
   *  - 排他の役職なら、前の担当者から外す
   * どれか1つでもルールに弾かれると、全部が書かれない(承認も残らない)。
   */
  const approveAndApply = async (req: RoleRequestView, approverId: string) => {
    const batch = writeBatch(db);
    const targetRef = doc(db, "members", req.targetMemberId);

    batch.update(doc(db, "roleChangeRequests", req.id), {
      approvals: arrayUnion(approverId),
      status: "applied",
      appliedAt: serverTimestamp(),
    });

    if (req.type === "assign_position" && req.position) {
      // 役職付与:排他の役職なら、前の担当者から外す
      const exclusive: Position[] = ["サークル長", "副サークル長", "会計担当"];
      if (exclusive.includes(req.position)) {
        for (const m of await fetchAllMembers()) {
          const positions: Position[] = m.positions ?? [];
          if (m.id !== req.targetMemberId && positions.includes(req.position)) {
            batch.update(doc(db, "members", m.id), {
              positions: positions.filter((p) => p !== req.position),
              appliedRequestId: req.id,
            });
          }
        }
      }
      // 対象者に役職を付与。すでに持っていれば、申請の記録(appliedRequestId)だけを書く
      const targetSnap = await getDoc(targetRef);
      const current: Position[] = (targetSnap.data() as { positions?: Position[] }).positions ?? [];
      batch.update(targetRef, {
        positions: current.includes(req.position) ? current : [...current, req.position],
        appliedRequestId: req.id,
      });
    } else if (req.type === "dismiss_officer") {
      // 幹部→一般に降格
      batch.update(targetRef, {
        role: "一般メンバー",
        positions: [],
        appliedRequestId: req.id,
      });
    } else {
      // dismiss_leader / assign_vice_leader は今のUIでは発議していない
      throw new Error(`反映できない種類の申請です: ${req.type}`);
    }

    await batch.commit();
  };

  /** 昇格から14日間は承認・却下できない旨の案内(v1.4.1) */
  const waitMessage = (): string => {
    const d = new Date(roleDecisionAvailableAt(currentMember));
    return (
      "幹部に昇格してから14日間は、役職の変更を承認・却下できません。" +
      `${d.getMonth() + 1}月${d.getDate()}日から行えます。`
    );
  };

  const approve = async (id: string) => {
    if (!currentMember) return;
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    if (req.approvals.includes(currentMember.id)) return;
    if (!canJoinRoleDecisions(currentMember)) {
      window.alert(waitMessage());
      return;
    }

    const newApprovals = [...req.approvals, currentMember.id];
    const completes = newApprovals.length >= req.requiredApprovals;

    if (!completes) {
      try {
        // 承認(自分のIDを1つ足す)。まだ必要数に届かないので pending のまま
        await updateDoc(doc(db, "roleChangeRequests", id), {
          approvals: arrayUnion(currentMember.id),
        });
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, approvals: newApprovals } : r))
        );
      } catch (e) {
        console.error("承認に失敗しました", e);
        window.alert("承認に失敗しました。");
      }
      return;
    }

    try {
      await approveAndApply(req, currentMember.id);
    } catch (e) {
      // バッチなので、失敗したときは承認も残っていない。やり直せば済む
      console.error("承認と反映に失敗しました", e);
      window.alert(
        "承認に失敗しました。役職は変わっていません。\n\n" +
          "対象者の役職がすでに変わっている場合があります。名簿で確認してから、もう一度お試しください。"
      );
      return;
    }

    // 申請者に結果を通知
    await createNotification(
      req.proposedBy,
      "approval_result",
      `${req.targetName}さんへの「${req.typeLabel}」が承認されました`,
      "/roster"
    );
    setRequests((prev) => prev.filter((r) => r.id !== id));
    window.alert("承認され、変更が反映されました。");
  };

  const reject = async (id: string) => {
    if (!currentMember) return;
    const req = requests.find((r) => r.id === id);
    // v1.4.1: 申請の対象者は却下できない(解任される本人が止められないように)
    if (req && req.targetMemberId === currentMember.id) return;
    if (!canJoinRoleDecisions(currentMember)) {
      window.alert(waitMessage());
      return;
    }
    const ok = window.confirm("この申請を却下します。よろしいですか?");
    if (!ok) return;
    try {
      await updateDoc(doc(db, "roleChangeRequests", id), {
        status: "rejected",
        rejectedBy: currentMember.id,
      });
      // 申請者に結果を通知
      if (req) {
        await createNotification(
          req.proposedBy,
          "approval_result",
          `${req.targetName}さんへの「${req.typeLabel}」の申請が却下されました`,
          "/roster"
        );
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error("却下に失敗しました", e);
      window.alert("却下に失敗しました。");
    }
  };

  const hasApproved = (r: RoleRequestView) =>
    currentMember ? r.approvals.includes(currentMember.id) : false;

  const isProposer = (r: RoleRequestView) =>
    currentMember ? r.proposedBy === currentMember.id : false;

  /** 申請の対象者か。対象者には「却下」を出さない(v1.4.1) */
  const isTarget = (r: RoleRequestView) =>
    currentMember ? r.targetMemberId === currentMember.id : false;

  /** 昇格から14日間で、承認・却下に加われない間の案内。加われるなら null */
  const waitNote = canJoinRoleDecisions(currentMember) ? null : waitMessage();

  return { requests, loading, approve, reject, hasApproved, isProposer, isTarget, waitNote } as const;
}
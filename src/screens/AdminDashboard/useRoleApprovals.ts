import { useState, useEffect } from "react";
import { collection, getDocs, query, where, doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import type { RoleChangeRequest, Position } from "../../Types/types";
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
      const memSnap = await getDocs(collection(db, "members"));
      const nameMap: Record<string, string> = {};
      memSnap.docs.forEach((d) => {
        nameMap[d.id] = (d.data() as { name: string }).name;
      });

      setRequests(
        raw.map((r) => ({
          ...r,
          targetName: nameMap[r.targetMemberId] ?? "不明",
          proposerName: nameMap[r.proposedBy] ?? "不明",
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

  // 申請が成立したときに、実際のロール変更を実行する
  const executeChange = async (req: RoleRequestView) => {
    const targetRef = doc(db, "members", req.targetMemberId);
    if (req.type === "assign_position" && req.position) {
      // 役職付与:排他ロールなら既存保持者から外す
      const exclusive = ["サークル長", "副サークル長", "会計担当"];
      if (exclusive.includes(req.position)) {
        // 同じ役職を持つ他メンバーから外す
        const memSnap = await getDocs(collection(db, "members"));
        for (const d of memSnap.docs) {
          const positions: Position[] = (d.data() as { positions?: Position[] }).positions ?? [];
          if (d.id !== req.targetMemberId && positions.includes(req.position)) {
            await updateDoc(doc(db, "members", d.id), {
              positions: positions.filter((p) => p !== req.position),
            });
          }
        }
      }
      // 対象者に役職を付与
      const targetSnap = await getDoc(targetRef);
      const current: Position[] = (targetSnap.data() as { positions?: Position[] }).positions ?? [];
      if (!current.includes(req.position)) {
        await updateDoc(targetRef, { positions: [...current, req.position] });
      }
    } else if (req.type === "dismiss_officer") {
      // 幹部→一般に降格
      await updateDoc(targetRef, { role: "一般メンバー", positions: [] });
    }
    // dismiss_leader / assign_vice_leader は今回のUIでは発議していないため省略
  };

  const approve = async (id: string) => {
    if (!currentMember) return;
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    if (req.approvals.includes(currentMember.id)) return;

    const newApprovals = [...req.approvals, currentMember.id];
    try {
      if (newApprovals.length >= req.requiredApprovals) {
        await executeChange(req);
        await updateDoc(doc(db, "roleChangeRequests", id), {
          approvals: arrayUnion(currentMember.id),
          status: "approved",
        });
        // 申請者に結果を通知
        await createNotification(
          req.proposedBy,
          "approval_result",
          `${req.targetName}さんへの「${req.typeLabel}」が承認されました`,
          "/roster"
        );
        setRequests((prev) => prev.filter((r) => r.id !== id));
        window.alert("承認され、変更が反映されました。");
      } else {
        await updateDoc(doc(db, "roleChangeRequests", id), {
          approvals: arrayUnion(currentMember.id),
        });
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, approvals: newApprovals } : r))
        );
      }
    } catch (e) {
      console.error("承認に失敗しました", e);
      window.alert("承認に失敗しました。");
    }
  };

  const reject = async (id: string) => {
    const req = requests.find((r) => r.id === id);
    const ok = window.confirm("この申請を却下します。よろしいですか?");
    if (!ok) return;
    try {
      await updateDoc(doc(db, "roleChangeRequests", id), { status: "rejected" });
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
    }
  };

  const hasApproved = (r: RoleRequestView) =>
    currentMember ? r.approvals.includes(currentMember.id) : false;

  const isProposer = (r: RoleRequestView) =>
    currentMember ? r.proposedBy === currentMember.id : false;

  return { requests, loading, approve, reject, hasApproved, isProposer } as const;
}
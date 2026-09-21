import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { createNotifications } from "../../lib/notify";
import { calcGrade } from "../../lib/grade";
import { listItemsByBand } from "../../lib/archive";
import type { Band, Member, ArchiveItem } from "../../Types/types";

export interface BandMemberView {
  memberId: string;
  name: string;
  part: string;
}

export interface AddableMember {
  id: string;
  name: string;
  studentId: string;
  gradeLabel: string;
  faculty: string;
}

export function useBandDetail(id: string | undefined) {
  const { member: currentMember } = useAuth();
  const [band, setBand] = useState<Band | null>(null);
  const [memberViews, setMemberViews] = useState<BandMemberView[]>([]);
  const [addableMembers, setAddableMembers] = useState<AddableMember[]>([]);
  const [addKeyword, setAddKeyword] = useState("");
  /** このバンドが過去に出演した記録(アーカイブからの逆引き) */
  const [performances, setPerformances] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBand = async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const ref = doc(db, "bands", id);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        setBand(null);
        setLoading(false);
        return;
      }
      const bandData = { id: snapshot.id, ...(snapshot.data() as Omit<Band, "id">) };
      setBand(bandData);

      // 在籍メンバーを取得(氏名解決+追加候補の算出に使う)
      const membersSnap = await getDocs(
        query(collection(db, "members"), where("status", "==", "active"))
      );
      const allActive: Member[] = membersSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Member, "id">),
      }));

      const nameMap: Record<string, string> = {};
      allActive.forEach((m) => (nameMap[m.id] = m.name));

      setMemberViews(
        bandData.members.map((m) => ({
          memberId: m.memberId,
          name: nameMap[m.memberId] ?? "不明",
          part: m.part,
        }))
      );

      // 追加候補:在籍中・OBでない・まだこのバンドにいない人
      const currentIds = new Set(bandData.members.map((m) => m.memberId));
      setAddableMembers(
        allActive
          .filter((m) => !m.isOB && !currentIds.has(m.id))
          .map((m) => ({
            id: m.id,
            name: m.name,
            studentId: m.studentId,
            gradeLabel: calcGrade(m.enrollmentYear, m.isOB),
            faculty: m.faculty,
          }))
      );
      // 過去の演奏。アーカイブが空でもバンド画面は成立するので、
      // ここが失敗しても全体を止めない
      try {
        setPerformances(await listItemsByBand(bandData.id));
      } catch (e) {
        console.error("過去の演奏の取得に失敗しました", e);
        setPerformances([]);
      }
    } catch (e) {
      console.error("バンド情報の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBand();
  }, [id]);

  const isMyBand = band?.members.some((m) => m.memberId === currentMember?.id) ?? false;

  // 追加候補を検索キーワードで絞り込む(名前・学籍番号)
  const filteredAddable = addKeyword.trim()
    ? addableMembers.filter((m) => {
        const kw = addKeyword.trim().toLowerCase();
        return (
          m.name.toLowerCase().includes(kw) ||
          m.studentId.toLowerCase().includes(kw)
        );
      })
    : addableMembers;

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

  const addMember = async (newMemberId: string, part: string) => {
    if (!band || !currentMember) return;
    if (!newMemberId) {
      window.alert("追加するメンバーを選択してください。");
      return;
    }
    if (!part.trim()) {
      window.alert("パートを入力してください。");
      return;
    }
    // すでにいる場合は弾く
    if (band.members.some((m) => m.memberId === newMemberId)) {
      window.alert("すでにこのバンドのメンバーです。");
      return;
    }
    try {
      const updatedMembers = [...band.members, { memberId: newMemberId, part: part.trim() }];
      await updateDoc(doc(db, "bands", band.id), { members: updatedMembers });

      // 幹部全員に通知
      const addedName = addableMembers.find((m) => m.id === newMemberId)?.name ?? "メンバー";
      const officerIds = await getOfficerIds();
      await createNotifications(
        officerIds,
        "band_member_changed",
        `バンド「${band.name}」に${addedName}さんが加入しました`,
        `/bands/${band.id}`
      );

      await fetchBand();
    } catch (e) {
      console.error("メンバー追加に失敗しました", e);
      window.alert("メンバーの追加に失敗しました。");
    }
  };

  const removeMember = async (targetMemberId: string) => {
    if (!band || !currentMember) return;
    // 最後の1人は脱退させない
    if (band.members.length <= 1) {
      window.alert("最後のメンバーは脱退できません。バンドを解散する場合は「解散を申請」してください。");
      return;
    }
    const targetName = memberViews.find((m) => m.memberId === targetMemberId)?.name ?? "メンバー";
    const isSelf = targetMemberId === currentMember.id;
    const message = isSelf
      ? `「${band.name}」から脱退します。よろしいですか?`
      : `${targetName}さんを「${band.name}」から外します。よろしいですか?`;
    const ok = window.confirm(message);
    if (!ok) return;
    try {
      const updatedMembers = band.members.filter((m) => m.memberId !== targetMemberId);
      await updateDoc(doc(db, "bands", band.id), { members: updatedMembers });

      // 幹部全員に通知
      const officerIds = await getOfficerIds();
      await createNotifications(
        officerIds,
        "band_member_changed",
        `バンド「${band.name}」から${targetName}さんが脱退しました`,
        `/bands/${band.id}`
      );

      await fetchBand();
    } catch (e) {
      console.error("メンバー脱退に失敗しました", e);
      window.alert("脱退処理に失敗しました。");
    }
  };

  const requestDissolve = async () => {
    if (!band) return;
    const ok = window.confirm(`「${band.name}」の解散を申請します。幹部の承認後に解散が確定します。よろしいですか?`);
    if (!ok) return;
    try {
      await updateDoc(doc(db, "bands", band.id), { status: "解散申請中" });
      await fetchBand();
    } catch (e) {
      console.error("解散申請に失敗しました", e);
      window.alert("解散申請に失敗しました。時間をおいて再度お試しください。");
    }
  };

  return {
    band,
    memberViews,
    addableMembers,
    filteredAddable,
    addKeyword,
    setAddKeyword,
    isMyBand,
    performances,
    loading,
    addMember,
    removeMember,
    requestDissolve,
  } as const;
}
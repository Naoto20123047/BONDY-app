import { useState, useEffect } from "react";
import { collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import type { Member } from "../../Types/types";

export interface BandMemberInput {
  memberId: string;
  name: string;
  part: string;
}

/** プロフィールのパート(配列)を、バンド内パートの初期値に変換する */
const defaultPart = (parts: string[] | undefined): string => {
  if (!parts || parts.length === 0) return "";
  // 「なし」しか選んでいない場合は空にする
  const valid = parts.filter((p) => p !== "なし");
  return valid.join("・");
};

export function useCreateBand() {
  const { member: currentMember } = useAuth();
  const [name, setName] = useState("");
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<BandMemberInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        // 在籍中(active)かつOBでないメンバーを取得
        const q = query(collection(db, "members"), where("status", "==", "active"));
        const snapshot = await getDocs(q);
        const list: Member[] = snapshot.docs
          .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Member, "id">) }))
          .filter((m) => !m.isOB); // OBはバンド加入不可
        setAllMembers(list);

        // 申請者自身を初期メンバーに追加
        if (currentMember) {
          setSelected([
            {
              memberId: currentMember.id,
              name: currentMember.name,
              part: defaultPart(currentMember.parts),
            },
          ]);
        }
      } catch (e) {
        console.error("メンバー一覧の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, [currentMember]);

  const availableMembers = allMembers.filter(
    (m) => !selected.some((s) => s.memberId === m.id)
  );

  const addMember = (memberId: string) => {
    const m = allMembers.find((mm) => mm.id === memberId);
    if (!m) return;
    setSelected((prev) => [
      ...prev,
      { memberId: m.id, name: m.name, part: defaultPart(m.parts) },
    ]);
  };

  const removeMember = (memberId: string) => {
    if (memberId === currentMember?.id) return; // 申請者自身は外せない
    setSelected((prev) => prev.filter((s) => s.memberId !== memberId));
  };

  const updatePart = (memberId: string, part: string) => {
    setSelected((prev) =>
      prev.map((s) => (s.memberId === memberId ? { ...s, part } : s))
    );
  };

  const save = async (onDone: () => void) => {
    if (!name.trim()) {
      window.alert("バンド名を入力してください。");
      return;
    }
    if (selected.some((s) => !s.part.trim())) {
      window.alert("パートが未入力のメンバーがいます。");
      return;
    }
    setSaving(true);
    try {
      // bandsコレクションに status「申請中」で新規作成
      await addDoc(collection(db, "bands"), {
        name: name.trim(),
        members: selected.map((s) => ({ memberId: s.memberId, part: s.part.trim() })),
        status: "申請中",
      });
      onDone();
    } catch (e) {
      console.error("バンド結成申請に失敗しました", e);
      window.alert("申請に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return {
    name,
    setName,
    selected,
    availableMembers,
    addMember,
    removeMember,
    updatePart,
    loading,
    saving,
    save,
    currentMemberId: currentMember?.id ?? "",
  } as const;
}
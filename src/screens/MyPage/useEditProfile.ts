import { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { togglePart } from "../../lib/parts";
import { DEFAULT_AVATAR_COLOR } from "../../lib/avatarColors";

export function useEditProfile() {
  const { member, refreshMember, refreshMemberMap } = useAuth();
  const [parts, setParts] = useState<string[]>([]);
  const [nickname, setNickname] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(DEFAULT_AVATAR_COLOR);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setParts(member.parts ?? []);
      setNickname(member.nickname ?? "");
      setAvatarColor(member.avatarColor ?? DEFAULT_AVATAR_COLOR);
    }
    setLoading(false);
  }, [member]);

  // パートの選択をトグル(「なし」は他と排他)
  const toggle = (part: string) => {
    setParts((prev) => togglePart(prev, part));
  };

  const save = async (onDone: () => void) => {
    if (!member) return;
    if (parts.length === 0) {
      window.alert("パートを選択してください。担当がない場合は「なし」を選んでください。");
      return;
    }
    if (nickname.trim().length > 20) {
      window.alert("ニックネームは20文字以内で入力してください。");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "members", member.id), {
        parts,
        nickname: nickname.trim(),
        avatarColor,
      });
      await refreshMember();     // 自分の情報を更新
      await refreshMemberMap();  // 他画面のアバター表示にも反映
      onDone();
    } catch (e) {
      console.error("プロフィールの更新に失敗しました", e);
      window.alert("更新に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return {
    member,
    parts,
    toggle,
    nickname,
    setNickname,
    avatarColor,
    setAvatarColor,
    loading,
    saving,
    save,
  } as const;
}
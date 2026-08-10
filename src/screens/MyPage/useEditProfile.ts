import { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";

export function useEditProfile() {
  const { member, refreshMember } = useAuth();
  const [part, setPart] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setPart(member.part);
      setNickname(member.nickname ?? "");
    }
    setLoading(false);
  }, [member]);

  const save = async (onDone: () => void) => {
    if (!member) return;
    if (!part.trim()) {
      window.alert("パートを入力してください。");
      return;
    }
    setSaving(true);
    try {
      // ニックネームは任意。空なら nickname フィールドを空文字で保存
      await updateDoc(doc(db, "members", member.id), {
        part: part.trim(),
        nickname: nickname.trim(),
      });
      await refreshMember(); // AuthContextのmemberを更新(他画面にも反映)
      onDone();
    } catch (e) {
      console.error("プロフィールの更新に失敗しました", e);
      window.alert("更新に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return { member, part, setPart, nickname, setNickname, loading, saving, save } as const;
}
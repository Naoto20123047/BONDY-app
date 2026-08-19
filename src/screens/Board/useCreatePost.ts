import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import type { PostCategory } from "../../Types/types";

export function useCreatePost() {
  const { member } = useAuth();
  const [category, setCategory] = useState<PostCategory>("メンバー募集");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (onDone: () => void) => {
    if (!member) return;
    if (!title.trim()) {
      window.alert("タイトルを入力してください。");
      return;
    }
    if (!body.trim()) {
      window.alert("本文を入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "posts"), {
        authorId: member.id,
        category,
        title: title.trim(),
        body: body.trim(),
        createdAt: new Date().toISOString(),
        resolved: false,
        isAnonymous,
      });
      onDone();
    } catch (e) {
      console.error("投稿の作成に失敗しました", e);
      window.alert("投稿に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    category,
    setCategory,
    title,
    setTitle,
    body,
    setBody,
    isAnonymous,
    setIsAnonymous,
    submitting,
    submit,
  } as const;
}
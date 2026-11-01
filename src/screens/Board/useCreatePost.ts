import { useState } from "react";
import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { notifyNewPost } from "../../lib/teamsNotify";
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
      // 匿名投稿は本体に投稿者を持たせず、anonymousAuthors(幹部と本人しか
      // 読めない)に分けて書く。2つは1回のバッチで書き、片方だけ残らないようにする
      const postRef = doc(collection(db, "posts"));
      const batch = writeBatch(db);
      const base = {
        category,
        title: title.trim(),
        body: body.trim(),
        createdAt: new Date().toISOString(),
        resolved: false,
        isAnonymous,
      };
      if (isAnonymous) {
        batch.set(postRef, base);
        batch.set(doc(db, "anonymousAuthors", postRef.id), {
          authorId: member.id,
          kind: "post",
          postId: postRef.id,
          seenCommentCount: 0,
        });
      } else {
        batch.set(postRef, { ...base, authorId: member.id });
      }
      await batch.commit();

      // Teams に通知(失敗しても投稿は成立させる)。
      // 匿名投稿は通知しない(Worker 側でも弾いている)
      if (!isAnonymous) await notifyNewPost(postRef.id);

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

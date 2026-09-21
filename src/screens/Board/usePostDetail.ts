import { useState, useEffect } from "react";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { fetchMemberNameMap } from "../../lib/members";
import { useAuth } from "../../lib/AuthContext";
import { createNotification } from "../../lib/notify";
import type { Comment, Post } from "../../Types/types";

export type CommentType = "text" | "stamp";

export interface CommentView extends Comment {
  authorName: string;
  isMine: boolean;
  reactions: Record<string, string[]>;
  type: CommentType;
  stamp: string;
}

export function usePostDetail(id: string | undefined) {
  const { member } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [comments, setComments] = useState<CommentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 投稿本体の取得(一度だけ)
  const fetchPost = async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const ref = doc(db, "posts", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setPost(null);
        setLoading(false);
        return;
      }
      const postData = { id: snap.id, ...(snap.data() as Omit<Post, "id">) };
      setPost(postData);

      if (postData.isAnonymous) {
        setAuthorName(postData.authorId === member?.id ? "匿名（あなた）" : "匿名");
      } else {
        const nameMap = await fetchMemberNameMap();
        setAuthorName(nameMap[postData.authorId] ?? "不明");
      }
    } catch (e) {
      console.error("投稿の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, member]);

  // コメントをリアルタイム監視
  useEffect(() => {
    if (!id) return;

    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      const nameMap = await fetchMemberNameMap();

      const q = query(
        collection(db, "comments"),
        where("postId", "==", id),
        orderBy("createdAt", "asc")
      );

      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const list: CommentView[] = snap.docs.map((d) => {
            const raw = d.data() as Comment & {
              reactions?: Record<string, string[]>;
              type?: CommentType;
              stamp?: string;
            };
            const type: CommentType = raw.type === "stamp" ? "stamp" : "text";
            return {
              id: d.id,
              postId: raw.postId,
              authorId: raw.authorId,
              body: raw.body ?? "",
              createdAt: raw.createdAt,
              authorName: nameMap[raw.authorId] ?? "不明",
              isMine: raw.authorId === member?.id,
              reactions: raw.reactions ?? {},
              type,
              stamp: raw.stamp ?? "",
            };
          });
          setComments(list);
        },
        (err) => {
          console.error("コメントの監視に失敗しました", err);
        }
      );
    };

    setup();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [id, member]);

  const isMyPost = post?.authorId === member?.id;

  // テキストコメント投稿
  const addComment = async (body: string) => {
    if (!member || !post) return false;
    const trimmed = body.trim();
    if (!trimmed) return false;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "comments"), {
        postId: post.id,
        authorId: member.id,
        type: "text",
        body: trimmed,
        createdAt: new Date().toISOString(),
      });

      if (post.authorId !== member.id) {
        await createNotification(
          post.authorId,
          "post_comment",
          post.isAnonymous
            ? `匿名のメンバーがあなたの投稿「${post.title}」にコメントしました`
            : `${member.name}さんがあなたの投稿「${post.title}」にコメントしました`,
          `/board/${post.id}`
        );
      }
      return true;
    } catch (e) {
      console.error("コメントの投稿に失敗しました", e);
      window.alert("コメントの投稿に失敗しました。");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // スタンプコメント投稿
  const addStampComment = async (stamp: string) => {
    if (!member || !post) return false;
    if (!stamp) return false;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "comments"), {
        postId: post.id,
        authorId: member.id,
        type: "stamp",
        stamp,
        createdAt: new Date().toISOString(),
      });

      if (post.authorId !== member.id) {
        await createNotification(
          post.authorId,
          "post_comment",
          post.isAnonymous
            ? `匿名のメンバーがあなたの投稿「${post.title}」にスタンプを送りました`
            : `${member.name}さんがあなたの投稿「${post.title}」にスタンプを送りました`,
          `/board/${post.id}`
        );
      }
      return true;
    } catch (e) {
      console.error("スタンプの投稿に失敗しました", e);
      window.alert("スタンプの投稿に失敗しました。");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // コメントのリアクション トグル
  const toggleCommentReaction = async (commentId: string, emoji: string) => {
    if (!member) return;
    const target = comments.find((c) => c.id === commentId);
    if (!target) return;

    const reactions: Record<string, string[]> = {};
    Object.entries(target.reactions).forEach(([key, ids]) => {
      reactions[key] = [...ids];
    });

    const current = reactions[emoji] ?? [];
    if (current.includes(member.id)) {
      const next = current.filter((mid) => mid !== member.id);
      if (next.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = next;
      }
    } else {
      reactions[emoji] = [...current, member.id];
    }

    try {
      await updateDoc(doc(db, "comments", commentId), { reactions });
    } catch (e) {
      console.error("リアクションの更新に失敗しました", e);
    }
  };

  // 解決フラグの切り替え(投稿者のみ)
  const toggleResolved = async () => {
    if (!post || !isMyPost) return;
    try {
      const newResolved = !post.resolved;
      await updateDoc(doc(db, "posts", post.id), {
        resolved: newResolved,
        resolvedAt: newResolved ? new Date().toISOString() : null,
      });
      setPost({ ...post, resolved: newResolved, resolvedAt: newResolved ? new Date().toISOString() : undefined });
    } catch (e) {
      console.error("解決状態の更新に失敗しました", e);
      window.alert("更新に失敗しました。");
    }
  };

  // 投稿削除(投稿者のみ)。コメントも一緒に削除
  const deletePost = async (onDone: () => void) => {
    if (!post || !isMyPost) return;
    const ok = window.confirm("この投稿を削除します。よろしいですか?");
    if (!ok) return;
    try {
      const cSnap = await getDocs(
        query(collection(db, "comments"), where("postId", "==", post.id))
      );
      await Promise.all(cSnap.docs.map((c) => deleteDoc(doc(db, "comments", c.id))));
      await deleteDoc(doc(db, "posts", post.id));
      onDone();
    } catch (e) {
      console.error("投稿の削除に失敗しました", e);
      window.alert("削除に失敗しました。");
    }
  };

  // コメント削除(自分のコメントのみ)
  const deleteComment = async (commentId: string) => {
    const target = comments.find((c) => c.id === commentId);
    if (!target || !target.isMine) return;
    const ok = window.confirm("このコメントを削除します。よろしいですか?");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "comments", commentId));
    } catch (e) {
      console.error("コメントの削除に失敗しました", e);
      window.alert("削除に失敗しました。");
    }
  };

  return {
    post,
    authorName,
    comments,
    isMyPost,
    loading,
    submitting,
    addComment,
    addStampComment,
    toggleCommentReaction,
    toggleResolved,
    deletePost,
    deleteComment,
  } as const;
}

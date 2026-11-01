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
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { fetchMemberNameMap } from "../../lib/members";
import { useAuth } from "../../lib/AuthContext";
import { createNotification } from "../../lib/notify";
import { fetchMyAnonymousEntries, markAnonymousPostSeen, nextAnonLabel } from "../../lib/anon";
import { toggleReaction, cleanReactions } from "../../lib/reactions";
import type { Comment, Post } from "../../Types/types";

export type CommentType = "text" | "stamp";

export interface CommentView extends Comment {
  /** 表示名。匿名スレッドでは「匿名A」などの表示名 */
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
  // このスレッドで自分が匿名で書いたもの(投稿・コメントのID)。
  // 匿名の投稿・コメントは本体に投稿者を持たないため、ここで「自分のもの」を判定する
  const [myAnonIds, setMyAnonIds] = useState<Set<string>>(new Set());

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
        const mine = member
          ? new Set((await fetchMyAnonymousEntries(member.id, postData.id)).map((a) => a.id))
          : new Set<string>();
        setMyAnonIds(mine);
        setAuthorName(mine.has(postData.id) ? "匿名（あなた）" : "匿名");
      } else {
        const nameMap = await fetchMemberNameMap();
        setAuthorName(nameMap[postData.authorId ?? ""] ?? "不明");
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
              anonLabel: raw.anonLabel,
              body: raw.body ?? "",
              createdAt: raw.createdAt,
              authorName: raw.anonLabel ?? nameMap[raw.authorId ?? ""] ?? "不明",
              // 匿名コメントは authorId を持たないので、isMine は表示時に myAnonIds で補う
              isMine: raw.authorId !== undefined && raw.authorId === member?.id,
              reactions: cleanReactions(raw.reactions),
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

  // 匿名コメントの「自分のもの」を反映した一覧
  const commentViews: CommentView[] = comments.map((c) =>
    c.isMine || !myAnonIds.has(c.id) ? c : { ...c, isMine: true }
  );

  const isMyPost = post
    ? post.isAnonymous
      ? myAnonIds.has(post.id)
      : post.authorId === member?.id
    : false;

  // 匿名で投稿した本人がスレッドを開いたら、コメントのお知らせ済みの位置を進める
  useEffect(() => {
    if (post?.isAnonymous && isMyPost) {
      markAnonymousPostSeen(post.id, comments.length);
    }
  }, [post, isMyPost, comments.length]);

  /**
   * コメントを書く。匿名スレッドでは本体に投稿者を持たせず、
   * anonymousAuthors に分けて同じバッチで書く
   */
  const writeComment = async (fields: Record<string, string>) => {
    if (!member || !post) return;
    const ref = doc(collection(db, "comments"));
    const base = { postId: post.id, ...fields, createdAt: new Date().toISOString() };
    if (post.isAnonymous) {
      const label = nextAnonLabel(comments, myAnonIds);
      const batch = writeBatch(db);
      batch.set(ref, { ...base, anonLabel: label });
      batch.set(doc(db, "anonymousAuthors", ref.id), {
        authorId: member.id,
        kind: "comment",
        postId: post.id,
      });
      await batch.commit();
      setMyAnonIds((prev) => new Set(prev).add(ref.id));
    } else {
      const batch = writeBatch(db);
      batch.set(ref, { ...base, authorId: member.id });
      await batch.commit();
    }
  };

  // 実名スレッドの投稿者にお知らせする。
  // 匿名スレッドは投稿者が分からないため、投稿者がアプリを開いたときに
  // 本人の側で作る(lib/anon.ts の checkAnonymousPostComments)
  const notifyPostAuthor = async (what: string) => {
    if (!member || !post || post.isAnonymous) return;
    if (!post.authorId || post.authorId === member.id) return;
    await createNotification(
      post.authorId,
      "post_comment",
      `${member.name}さんがあなたの投稿「${post.title}」に${what}`,
      `/board/${post.id}`
    );
  };

  // テキストコメント投稿
  const addComment = async (body: string) => {
    if (!member || !post) return false;
    const trimmed = body.trim();
    if (!trimmed) return false;
    setSubmitting(true);
    try {
      await writeComment({ type: "text", body: trimmed });
      await notifyPostAuthor("コメントしました");
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
      await writeComment({ type: "stamp", stamp });
      await notifyPostAuthor("スタンプを送りました");
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
    const already = (target.reactions[emoji] ?? []).includes(member.id);
    try {
      // 押した絵文字のキーだけを書き換える(lib/reactions.ts を参照)
      await toggleReaction("comments", commentId, emoji, member.id, already);
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
    const target = commentViews.find((c) => c.id === commentId);
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
    comments: commentViews,
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

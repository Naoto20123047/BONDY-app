import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import type { Post, PostCategory } from "../../Types/types";

export interface PostView extends Post {
  authorName: string;
  commentCount: number;
}

// 解決済みからの自動削除までの日数
const AUTO_DELETE_DAYS = 7;

export function useBoard() {
  const { member } = useAuth();
  const [posts, setPosts] = useState<PostView[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<PostCategory | "all">("all");

  const fetchData = async () => {
    try {
      // 投稿を全取得
      const postSnap = await getDocs(collection(db, "posts"));
      let rawPosts: Post[] = postSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Post, "id">),
      }));

      // 解決済み+1週間経過の投稿を削除(方式A:開いたときに掃除)
      const now = Date.now();
      const expiredIds: string[] = [];
      for (const p of rawPosts) {
        if (p.resolved && p.resolvedAt) {
          const resolvedTime = new Date(p.resolvedAt).getTime();
          const daysPassed = (now - resolvedTime) / (1000 * 60 * 60 * 24);
          if (daysPassed >= AUTO_DELETE_DAYS) {
            expiredIds.push(p.id);
          }
        }
      }

      if (expiredIds.length > 0) {
        // 対象投稿と、そのコメントを削除
        await Promise.all(
          expiredIds.map(async (postId) => {
            // 投稿本体
            await deleteDoc(doc(db, "posts", postId));
            // その投稿のコメント
            const cSnap = await getDocs(
              query(collection(db, "comments"), where("postId", "==", postId))
            );
            await Promise.all(cSnap.docs.map((c) => deleteDoc(doc(db, "comments", c.id))));
          })
        );
        // 削除したものを一覧から除外
        rawPosts = rawPosts.filter((p) => !expiredIds.includes(p.id));
      }

      // 氏名解決
      const memSnap = await getDocs(collection(db, "members"));
      const nameMap: Record<string, string> = {};
      memSnap.docs.forEach((d) => {
        nameMap[d.id] = (d.data() as { name: string }).name;
      });

      // コメント数を数える
      const commentSnap = await getDocs(collection(db, "comments"));
      const commentCountMap: Record<string, number> = {};
      commentSnap.docs.forEach((d) => {
        const postId = (d.data() as { postId: string }).postId;
        commentCountMap[postId] = (commentCountMap[postId] ?? 0) + 1;
      });

      // ビューに変換(新しい順)
      const views: PostView[] = rawPosts
        .map((p) => ({
          ...p,
          authorName: p.isAnonymous
            ? p.authorId === member?.id
              ? "匿名（あなた）"
              : "匿名"
            : nameMap[p.authorId] ?? "不明",
          commentCount: commentCountMap[p.id] ?? 0,
        }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      setPosts(views);
    } catch (e) {
      console.error("掲示板の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // カテゴリで絞り込む
  const filteredPosts =
    categoryFilter === "all"
      ? posts
      : posts.filter((p) => p.category === categoryFilter);

  return {
    posts: filteredPosts,
    loading,
    categoryFilter,
    setCategoryFilter,
  } as const;
}
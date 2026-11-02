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
import { fetchMemberNameMap, FORMER_MEMBER_LABEL } from "../../lib/members";
import { useAuth } from "../../lib/AuthContext";
import { fetchMyAnonymousEntries } from "../../lib/anon";
import { asText } from "../../lib/sanitize";
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
      let rawPosts: Post[] = postSnap.docs.map((d) => {
        const raw = d.data() as Omit<Post, "id">;
        // 型が想定と違う値で画面が止まらないよう、文字列にそろえる(v1.4.1)
        return {
          ...raw,
          id: d.id,
          title: asText(raw.title),
          body: asText(raw.body),
          category: asText(raw.category) as PostCategory,
          createdAt: asText(raw.createdAt),
        };
      });

      // 解決済み+1週間経過の投稿を削除(方式A:開いたときに掃除)。
      // v1.4.1: 起点はサーバーの時刻(resolvedTs)。ルールも同じ条件でしか消させない。
      // resolvedTs を持たない古い解決済み投稿は、投稿者か幹部が消すまで残る
      const now = Date.now();
      const expiredIds: string[] = [];
      for (const p of rawPosts) {
        const resolvedMs =
          p.resolvedTs && typeof p.resolvedTs.toMillis === "function" ? p.resolvedTs.toMillis() : null;
        if (p.resolved && resolvedMs !== null) {
          const daysPassed = (now - resolvedMs) / (1000 * 60 * 60 * 24);
          // サーバーと端末の時計のずれで弾かれないよう、少し余裕を持たせる
          if (daysPassed >= AUTO_DELETE_DAYS + 0.1) {
            expiredIds.push(p.id);
          }
        }
      }

      if (expiredIds.length > 0) {
        // 対象投稿と、そのコメントを削除。1件の失敗で一覧の表示を止めない
        const deleted = new Set<string>();
        await Promise.all(
          expiredIds.map(async (postId) => {
            try {
              // 投稿本体
              await deleteDoc(doc(db, "posts", postId));
              deleted.add(postId);
              // その投稿のコメント
              const cSnap = await getDocs(
                query(collection(db, "comments"), where("postId", "==", postId))
              );
              await Promise.all(cSnap.docs.map((c) => deleteDoc(doc(db, "comments", c.id))));
            } catch (e) {
              console.error("解決済み投稿の自動削除に失敗しました", postId, e);
            }
          })
        );
        // 削除したものを一覧から除外
        rawPosts = rawPosts.filter((p) => !deleted.has(p.id));
      }

      // 氏名解決
      const nameMap = await fetchMemberNameMap();

      // 自分が匿名で書いた投稿(「匿名（あなた）」の表示に使う)
      const myAnonPostIds = new Set(
        member
          ? (await fetchMyAnonymousEntries(member.id))
              .filter((a) => a.kind === "post")
              .map((a) => a.postId)
          : []
      );

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
            ? myAnonPostIds.has(p.id)
              ? "匿名（あなた）"
              : "匿名"
            : nameMap[p.authorId ?? ""] ?? FORMER_MEMBER_LABEL,
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

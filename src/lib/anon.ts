/**
 * 匿名掲示板まわり
 *
 * v1.3.2 から、匿名の投稿・コメントは本体に投稿者(authorId)を持たず、
 * anonymousAuthors(幹部と本人しか読めない)に分けて残している。
 * このファイルには次のものをまとめてある。
 *   - 表示名(匿名A, 匿名B ...)の割り振り
 *   - 自分が書いた匿名の投稿・コメントの取得(「（あなた）」の表示に使う)
 *   - 匿名投稿へのコメントのお知らせ(投稿者がアプリを開いたときに作る)
 */

import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { createNotification } from "./notify";
import type { AnonymousAuthor, Post } from "../Types/types";

// スプレッドシートの列名と同じ方式で A, B, ... Z, AA, AB, ... と割り振る
export const indexToLetters = (index: number): string => {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};

export const anonLabel = (index: number): string => `匿名${indexToLetters(index)}`;

/**
 * 既存の匿名スレッドのコメントから「authorId → 表示名(出現順)」のマップを作る。
 * v1.3.2 のデータ移行でだけ使う(移行後のコメントは表示名を自分で持つ)。
 */
export const buildAnonLabelMap = <T extends { authorId?: string }>(
  items: T[]
): Record<string, string> => {
  const map: Record<string, string> = {};
  let next = 0;
  items.forEach((item) => {
    if (!item.authorId) return;
    if (!(item.authorId in map)) {
      map[item.authorId] = anonLabel(next);
      next += 1;
    }
  });
  return map;
};

/**
 * 匿名スレッドで新しくコメントする人の表示名を決める。
 * 既にこのスレッドでコメントしていればその名前を引き継ぎ、
 * 初めてなら、まだ使われていない次の名前にする。
 */
export const nextAnonLabel = (
  comments: { id: string; anonLabel?: string }[],
  myCommentIds: Set<string>
): string => {
  const mine = comments.find((c) => myCommentIds.has(c.id) && c.anonLabel);
  if (mine?.anonLabel) return mine.anonLabel;
  const used = new Set(comments.map((c) => c.anonLabel).filter(Boolean));
  let i = 0;
  while (used.has(anonLabel(i))) i += 1;
  return anonLabel(i);
};

// 匿名アバター用の色(実際のavatarColorとは無関係に、匿名ラベルの文字から決定的に選ぶ)
const ANON_AVATAR_COLORS = ["gray", "blue", "green", "purple", "orange"];

export const anonAvatarColorId = (label: string): string => {
  const code = label.charCodeAt(label.length - 1) || 0;
  return ANON_AVATAR_COLORS[code % ANON_AVATAR_COLORS.length];
};

/** 自分が書いた匿名の投稿・コメント(postId を渡すとそのスレッドに絞る) */
export async function fetchMyAnonymousEntries(
  memberId: string,
  postId?: string
): Promise<AnonymousAuthor[]> {
  const constraints = [where("authorId", "==", memberId)];
  if (postId) constraints.push(where("postId", "==", postId));
  const snap = await getDocs(query(collection(db, "anonymousAuthors"), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AnonymousAuthor, "id">) }));
}

/**
 * 匿名で投稿したスレッドに付いたコメントを、投稿者本人にお知らせする。
 *
 * コメントした人は投稿者が分からないため、相手宛ての通知を作れない。
 * 代わりに投稿者がアプリを開いたときに、前回以降のコメントを数えて
 * 自分宛てにお知らせを作る。お知らせが届くのは次にアプリを開いたとき。
 * 失敗してもアプリの動作は止めない。
 */
// 1回の起動で1度だけ確認する。ホームと通知ベルの両方から呼ばれるため、
// 同時に走ってお知らせが2件できるのを防ぐ
const checked = new Map<string, Promise<void>>();

export function checkAnonymousPostComments(memberId: string): Promise<void> {
  if (!checked.has(memberId)) {
    checked.set(memberId, runAnonymousPostCommentCheck(memberId));
  }
  return checked.get(memberId)!;
}

async function runAnonymousPostCommentCheck(memberId: string): Promise<void> {
  try {
    const mine = (await fetchMyAnonymousEntries(memberId)).filter((a) => a.kind === "post");
    for (const entry of mine) {
      const postSnap = await getDoc(doc(db, "posts", entry.postId));
      if (!postSnap.exists()) continue;
      const post = postSnap.data() as Omit<Post, "id">;

      const countSnap = await getCountFromServer(
        query(collection(db, "comments"), where("postId", "==", entry.postId))
      );
      const count = countSnap.data().count;
      const seen = entry.seenCommentCount ?? 0;
      if (count <= seen) continue;

      await createNotification(
        memberId,
        "post_comment",
        `匿名で投稿した「${post.title}」に新しいコメントが${count - seen}件あります`,
        `/board/${entry.postId}`
      );
      await markAnonymousPostSeen(entry.id, count);
    }
  } catch (e) {
    console.error("匿名投稿のコメント確認に失敗しました", e);
  }
}

/** 匿名投稿のスレッドを開いたときに、お知らせ済みの位置を進める */
export async function markAnonymousPostSeen(postId: string, commentCount: number): Promise<void> {
  try {
    await updateDoc(doc(db, "anonymousAuthors", postId), { seenCommentCount: commentCount });
  } catch (e) {
    console.error("既読位置の更新に失敗しました", e);
  }
}

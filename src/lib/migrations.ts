/**
 * 既存データの移行(v1.3.2)
 *
 * 幹部が管理画面を開いたときに自動で実行する。何度実行しても結果は同じ
 * (移行済みのものは飛ばす)ので、開くたびに走っても問題ない。
 * 移行が済めば、読むだけで何も書かない。
 *
 *  1. バンドに memberIds(IDだけの配列)を書き足す
 *     ルールで「そのバンドのメンバーか」を判定するのに使う。
 *     これが無いバンドは、メンバーでも加入・脱退やバンド回答ができない。
 *
 *  2. 既存の匿名投稿・匿名スレッドのコメントの投稿者を anonymousAuthors に移す
 *     投稿者の記録は anonymousAuthors に残るので、削除にはあたらない。
 *     コメントには、これまで画面で付けていたのと同じ順番で表示名(匿名A など)を入れる。
 *
 * 失敗しても管理画面の表示は止めない。次に開いたときにやり直される。
 */

import {
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { buildAnonLabelMap } from "./anon";
import type { Band, Comment, Post } from "../Types/types";

/** 1回のバッチに入れる書き込みの上限(Firestore の上限は500) */
const BATCH_LIMIT = 400;

async function migrateBandMemberIds(): Promise<number> {
  const snap = await getDocs(collection(db, "bands"));
  let batch = writeBatch(db);
  let pending = 0;
  let migrated = 0;

  for (const d of snap.docs) {
    const band = d.data() as Omit<Band, "id">;
    const ids = (band.members ?? []).map((m) => m.memberId);
    const current = band.memberIds ?? null;
    const same =
      current !== null &&
      current.length === ids.length &&
      current.every((id, i) => id === ids[i]);
    if (same) continue;

    batch.update(doc(db, "bands", d.id), { memberIds: ids });
    pending += 1;
    migrated += 1;
    if (pending >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  return migrated;
}

async function migrateAnonymousPosts(): Promise<number> {
  const postSnap = await getDocs(
    query(collection(db, "posts"), where("isAnonymous", "==", true))
  );
  let migrated = 0;

  for (const p of postSnap.docs) {
    const post = p.data() as Omit<Post, "id">;
    const commentSnap = await getDocs(
      query(collection(db, "comments"), where("postId", "==", p.id))
    );
    const comments = commentSnap.docs
      .map((c) => ({ id: c.id, ...(c.data() as Omit<Comment, "id">) }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

    const legacyComments = comments.filter((c) => c.authorId);
    if (!post.authorId && legacyComments.length === 0) continue;

    // 1つの投稿ぶんを1回のバッチで移す(途中で止まっても投稿単位で揃う)
    const batch = writeBatch(db);

    if (post.authorId) {
      batch.set(doc(db, "anonymousAuthors", p.id), {
        authorId: post.authorId,
        kind: "post",
        postId: p.id,
        // 移行前のコメントはお知らせ済みとして扱う
        seenCommentCount: comments.length,
      });
      batch.update(doc(db, "posts", p.id), { authorId: deleteField() });
    }

    // 表示名は、これまで画面で付けていた「コメントの出現順」と同じにする
    const labelMap = buildAnonLabelMap(comments);
    for (const c of legacyComments) {
      batch.set(doc(db, "anonymousAuthors", c.id), {
        authorId: c.authorId,
        kind: "comment",
        postId: p.id,
      });
      batch.update(doc(db, "comments", c.id), {
        anonLabel: labelMap[c.authorId!] ?? "匿名A",
        authorId: deleteField(),
      });
    }

    await batch.commit();
    migrated += 1;
  }
  return migrated;
}

/** v1.3.2 の移行をまとめて実行する(幹部のみ) */
export async function runV132Migrations(): Promise<void> {
  try {
    const bands = await migrateBandMemberIds();
    if (bands > 0) console.info(`バンド ${bands} 件に memberIds を書き足しました`);
  } catch (e) {
    console.error("バンドの移行に失敗しました", e);
  }
  try {
    const posts = await migrateAnonymousPosts();
    if (posts > 0) console.info(`匿名投稿 ${posts} 件の投稿者を移しました`);
  } catch (e) {
    console.error("匿名投稿の移行に失敗しました", e);
  }
}

/**
 * members コレクションの読み取りをここに集約する。
 *
 * 同じクエリが20ファイル以上に散らばっていた。特に多かったのは次の2つ。
 *   - 「在籍者を全件読む」        … 名簿・会費・バンドなど
 *   - 「ID → 氏名のマップを作る」 … 投稿者名・申請者名の解決。同じ5行が9箇所に複製
 * 通知の宛先を作る getOfficerIds() も3画面に丸ごとコピーされていた。
 *
 * 読み取り条件を変えたいとき(例: OBを含める/含めない)に探し回らずに済むよう、
 * 入り口をここに一本化している。
 *
 * ■ 在籍者だけか、全員かの使い分け
 * **氏名の解決には退会者も含めた全員が要る。** 過去の投稿・申請の作成者が
 * 退会していると、在籍者だけでは名前を引けず「不明」になってしまう。
 * 一方、名簿や会費の対象は在籍者だけ。取り違えると表示が壊れるので関数を分けてある。
 *
 * ■ 退会・除籍した人を読めるのは幹部だけ(v1.4.1)
 * 一般メンバーが読めるのは在籍中(status が active)の人だけになった。
 * 誰が除籍されたかが部員全員に分かってしまうため。
 * 一般メンバーが条件なしで members を読むとルールに弾かれるので、
 * ログインした人が幹部かどうかを AuthContext から setFormerMembersVisible() で受け取り、
 * 読み方を切り替えている。一般メンバーの画面では、退会した人の名前は引けない
 * (表示は FORMER_MEMBER_LABEL になる)。
 *
 * ■ 読み取り回数について
 * Firestore の無料枠は1日5万読み取り。ここを通る関数は members を全件読むため、
 * 1回あたり人数ぶんを消費する。**1つの画面で何度も呼ばないこと。**
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  type WriteBatch,
} from "firebase/firestore";
import { auth } from "./firebase";
import { asText, asTextList } from "./sanitize";
import { db } from "./firebase";
import { isOfficerRole } from "./roles";
import type { Member } from "../Types/types";

/**
 * 読んだデータを Member にする。
 * 名前・パート・役職など、各画面がそのまま表示する項目は型をそろえる(v1.4.1)。
 * 想定外の型の値が1件あるだけで、名簿などを開いた全員の画面が止まっていたため
 */
const toMember = (id: string, data: unknown): Member => {
  const raw = data as Omit<Member, "id">;
  return {
    ...raw,
    id,
    name: asText(raw.name),
    nickname: raw.nickname === undefined ? undefined : asText(raw.nickname),
    faculty: asText(raw.faculty),
    studentId: asText(raw.studentId),
    parts: asTextList(raw.parts),
    positions: asTextList(raw.positions) as Member["positions"],
  };
};

/** 一般メンバーの画面で、名前を引けない(退会した)人の表示 */
export const FORMER_MEMBER_LABEL = "退会したメンバー";

let formerMembersVisible = false;

/**
 * 退会・除籍した人も読めるか(幹部か)を設定する。
 * AuthContext がログインした人の情報を読んだときに呼ぶ。
 */
export function setFormerMembersVisible(visible: boolean): void {
  formerMembersVisible = visible;
}

/**
 * メンバーを全件取得する。
 * 幹部は退会者・除籍者も含む。一般メンバーは在籍中の人だけ(ルールの制限)。
 * 氏名の解決など、過去の記録を辿る用途で使う。
 */
export async function fetchAllMembers(): Promise<Member[]> {
  const snapshot = await getDocs(
    formerMembersVisible
      ? collection(db, "members")
      : query(collection(db, "members"), where("status", "==", "active"))
  );
  return snapshot.docs.map((d) => toMember(d.id, d.data()));
}

/**
 * 在籍中(status が active)のメンバーを全件取得する。
 *
 * v1.4.0: 幹部の確認待ち(教員・OBで approved が false)の人は含めない。
 * 名簿・会費・バンドの候補・通知の宛先に、まだ確認していない人が混ざらないようにするため。
 * 確認待ちの人は fetchPendingMembers() で取る。
 */
export async function fetchActiveMembers(): Promise<Member[]> {
  const snapshot = await getDocs(
    query(collection(db, "members"), where("status", "==", "active"))
  );
  return snapshot.docs
    .map((d) => toMember(d.id, d.data()))
    .filter((m) => m.approved !== false);
}

/** 幹部の確認待ちのメンバー(教員・OB)。幹部管理の「新規登録の承認」で使う(v1.4.0) */
export async function fetchPendingMembers(): Promise<Member[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "members"),
      where("status", "==", "active"),
      where("approved", "==", false)
    )
  );
  return snapshot.docs.map((d) => toMember(d.id, d.data()));
}

/** 退会・除籍したメンバー。幹部管理のユーザー履歴で使う */
export async function fetchFormerMembers(): Promise<Member[]> {
  const snapshot = await getDocs(
    query(collection(db, "members"), where("status", "in", ["withdrawn", "expelled"]))
  );
  return snapshot.docs.map((d) => toMember(d.id, d.data()));
}

/**
 * 「ID → 氏名」のマップ。**幹部は退会者も含む。**
 *
 * 過去の投稿・申請の作成者が退会していることがあるため、
 * 在籍者だけで作ると名前が引けなくなる。一般メンバーは在籍者だけ(上の説明を参照)。
 */
export async function fetchMemberNameMap(): Promise<Record<string, string>> {
  const members = await fetchAllMembers();
  const map: Record<string, string> = {};
  members.forEach((m) => {
    map[m.id] = m.name;
  });
  return map;
}

/**
 * 在籍中の幹部のIDを集める。通知の宛先に使う。
 *
 * excludeIds に渡したIDは結果から外す。提案者や対象者本人に
 * 「承認してください」と通知が飛ぶのを防ぐため。
 */
export async function fetchOfficerIds(excludeIds: string[] = []): Promise<string[]> {
  const members = await fetchActiveMembers();
  return members
    .filter((m) => isOfficerRole(m.role))
    .map((m) => m.id)
    .filter((id) => !excludeIds.includes(id));
}

// ---------------------------------------------------------------------------
// 再登録を止める記録(v1.4.1)
//
// 除籍したときに blockedUids/{uid} を作る。名簿のドキュメントを完全削除しても
// この記録は残るので、除籍された人がプロフィール登録からやり直して入り直すことはできない
// (ルールの members の create で確かめている)。
// アカウントの無効化(Worker)が失敗していても、これで再登録は止まる。
// ---------------------------------------------------------------------------

/** 除籍の記録をバッチに足す */
export function addBlockToBatch(batch: WriteBatch, uid: string): void {
  batch.set(doc(db, "blockedUids", uid), {
    blockedBy: auth.currentUser?.uid ?? "",
    blockedAt: serverTimestamp(),
  });
}

/** 除籍から戻したときに記録を消す。失敗しても復帰は止めない */
export async function removeBlock(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "blockedUids", uid));
  } catch (e) {
    console.error("再登録の制限の解除に失敗しました", e);
  }
}

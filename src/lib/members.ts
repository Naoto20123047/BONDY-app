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
 * ■ 読み取り回数について
 * Firestore の無料枠は1日5万読み取り。ここを通る関数は members を全件読むため、
 * 1回あたり人数ぶんを消費する。**1つの画面で何度も呼ばないこと。**
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { isOfficerRole } from "./roles";
import type { Member } from "../Types/types";

const toMember = (id: string, data: unknown): Member => ({
  id,
  ...(data as Omit<Member, "id">),
});

/**
 * メンバーを全件取得する(退会者・除籍者も含む)。
 * 氏名の解決など、過去の記録を辿る用途で使う。
 */
export async function fetchAllMembers(): Promise<Member[]> {
  const snapshot = await getDocs(collection(db, "members"));
  return snapshot.docs.map((d) => toMember(d.id, d.data()));
}

/** 在籍中(status が active)のメンバーを全件取得する */
export async function fetchActiveMembers(): Promise<Member[]> {
  const snapshot = await getDocs(
    query(collection(db, "members"), where("status", "==", "active"))
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
 * 「ID → 氏名」のマップ。**退会者も含む。**
 *
 * 過去の投稿・申請の作成者が退会していることがあるため、
 * 在籍者だけで作ると名前が引けなくなる。
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

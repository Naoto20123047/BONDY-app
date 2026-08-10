import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { Member } from "../Types/types";

// 機材管理の権限を持つ人のIDリストを返す。
// 機材担当(positionsに「機材担当」)がいればその全員、いなければサークル長が代行。
export async function getEquipmentManagerIds(): Promise<string[]> {
  const snap = await getDocs(query(collection(db, "members"), where("status", "==", "active")));
  const members: Member[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Member, "id">) }));

  const managers = members.filter((m) => m.positions.includes("機材担当"));
  if (managers.length > 0) {
    return managers.map((m) => m.id);
  }
  // 機材担当が不在ならサークル長が代行
  const leaders = members.filter((m) => m.positions.includes("サークル長"));
  return leaders.map((m) => m.id);
}

// 指定したメンバーが機材管理の権限を持つか判定する
export function isEquipmentManager(member: Member | null, allManagerIds: string[]): boolean {
  if (!member) return false;
  return allManagerIds.includes(member.id);
}
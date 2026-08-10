import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Member } from "../../Types/types";
import { calcGrade } from "../../lib/grade";

export function useRoster() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [partFilter, setPartFilter] = useState("");

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        // status が "active" のメンバーだけ取得(退会者は名簿に出さない)
        const q = query(collection(db, "members"), where("status", "==", "active"));
        const snapshot = await getDocs(q);
        const list: Member[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Member, "id">),
        }));
        setMembers(list);
      } catch (e) {
        console.error("名簿の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, []);

  const filtered = members.filter((m) => {
    if (keyword) {
      const kw = keyword.toLowerCase();
      const matchName = m.name.toLowerCase().includes(kw);
      const matchNickname = (m.nickname ?? "").toLowerCase().includes(kw);
      const matchStudentId = m.studentId.toLowerCase().includes(kw);
      if (!matchName && !matchNickname && !matchStudentId) return false;
    }
    if (gradeFilter) {
      if (calcGrade(m.enrollmentYear, m.isOB) !== gradeFilter) return false;
    }
    if (partFilter && m.part !== partFilter) return false;
    return true;
  });

  const parts = Array.from(new Set(members.map((m) => m.part)));
  const grades = Array.from(
    new Set(members.map((m) => calcGrade(m.enrollmentYear, m.isOB)))
  );

  return {
    members: filtered,
    loading,
    keyword,
    setKeyword,
    gradeFilter,
    setGradeFilter,
    partFilter,
    setPartFilter,
    parts,
    grades,
  } as const;
}
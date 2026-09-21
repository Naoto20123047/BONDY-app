import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../lib/firebase";
import { fetchActiveMembers } from "../../lib/members";
import { useAuth } from "../../lib/AuthContext";
import { calcGrade, currentFiscalYear } from "../../lib/grade";
import type { Member } from "../../Types/types";
import { todayString } from "../../lib/date";

export interface DuesRow {
  memberId: string;
  duesDocId: string | null; // dues ドキュメントのID(未作成ならnull)
  name: string;
  studentId: string;
  faculty: string;
  gradeLabel: string;
  isOB: boolean;
  paid: boolean;
  avatarColor?: string;
  avatarThumb?: string;
}

interface DuesRecord {
  id: string;
  memberId: string;
  fiscalYear: number;
  paid: boolean;
}

export function useDues() {
  const { member: currentMember } = useAuth();
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [duesRecords, setDuesRecords] = useState<DuesRecord[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(currentFiscalYear());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unpaid">("all");
  const [keyword, setKeyword] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [facultyFilter, setFacultyFilter] = useState("");

  const fetchData = async () => {
    try {
      // 在籍中メンバー
      setAllMembers(await fetchActiveMembers());

      // dues 全レコード
      const duesSnap = await getDocs(collection(db, "dues"));
      const records: DuesRecord[] = duesSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DuesRecord, "id">),
      }));
      setDuesRecords(records);

      // 年度の選択肢:レコードのある年度 + 過去2年 + 現年度 + 翌年度(前払い用)
      const cy = currentFiscalYear();
      const yearSet = new Set<number>(records.map((r) => r.fiscalYear));
      yearSet.add(cy - 1);
      yearSet.add(cy);
      yearSet.add(cy + 1); // 翌年度(前払い登録用)
      const years = Array.from(yearSet).sort((a, b) => b - a);
      setAvailableYears(years);
    } catch (e) {
      console.error("会費情報の取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleDues = async (row: DuesRow) => {
    try {
      if (row.duesDocId) {
        // 既存レコードを更新(納入⇔未納をトグル)
        await updateDoc(doc(db, "dues", row.duesDocId), {
          paid: !row.paid,
          paidAt: !row.paid ? todayString() : null,
          recordedBy: currentMember?.id ?? "",
        });
      } else {
        // レコードが無ければ作成(納入済みにする)
        await addDoc(collection(db, "dues"), {
          memberId: row.memberId,
          fiscalYear: selectedYear,
          paid: true,
          paidAt: todayString(),
          recordedBy: currentMember?.id ?? "",
        });
      }
      await fetchData();
    } catch (e) {
      console.error("会費状況の更新に失敗しました", e);
      window.alert("更新に失敗しました。");
    }
  };

  // 選択年度のレコードをマップ化
  const yearRecords = duesRecords.filter((r) => r.fiscalYear === selectedYear);
  const recordMap: Record<string, DuesRecord> = {};
  yearRecords.forEach((r) => (recordMap[r.memberId] = r));

  // 在籍者を全員表示(OBも含む)。その年度のレコードが無ければ未納扱い
  const allRows: DuesRow[] = allMembers
    .map((m) => {
      const record = recordMap[m.id];
      return {
        memberId: m.id,
        duesDocId: record ? record.id : null,
        name: m.name,
        studentId: m.studentId,
        faculty: m.faculty,
        gradeLabel: calcGrade(m.enrollmentYear, m.isOB),
        isOB: m.isOB,
        paid: record ? record.paid : false,
        avatarColor: m.avatarColor,
        avatarThumb: m.avatarThumb,
      };
    })
    // 現役を先に、OBを後に並べる
    .sort((a, b) => Number(a.isOB) - Number(b.isOB));

  const filteredRows = allRows.filter((r) => {
    if (keyword) {
      const kw = keyword.toLowerCase();
      if (!r.name.toLowerCase().includes(kw) && !r.studentId.toLowerCase().includes(kw)) return false;
    }
    if (gradeFilter && r.gradeLabel !== gradeFilter) return false;
    if (facultyFilter && r.faculty !== facultyFilter) return false;
    if (filter === "unpaid" && r.paid) return false;
    return true;
  });

  // カウントは現役のみ(OBは会費対象外)
  const activeRows = allRows.filter((r) => !r.isOB);
  const unpaidCount = activeRows.filter((r) => !r.paid).length;
  const paidCount = activeRows.filter((r) => r.paid).length;
  const totalActiveCount = activeRows.length;
  const grades = Array.from(new Set(allRows.map((r) => r.gradeLabel)));
  const faculties = Array.from(new Set(allRows.map((r) => r.faculty)));

  // 表示中の一覧(フィルタ適用後)をExcelで出力する
  const exportExcel = () => {
    if (filteredRows.length === 0) {
      window.alert("出力できるデータがありません。");
      return;
    }
    const data = filteredRows.map((r) => ({
      氏名: r.name,
      学籍番号: r.studentId,
      学年: r.gradeLabel,
      学部: r.faculty,
      納入状況: r.paid ? "納入済み" : "未納",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet["!cols"] = [
      { wch: 16 }, // 氏名
      { wch: 12 }, // 学籍番号
      { wch: 8 },  // 学年
      { wch: 16 }, // 学部
      { wch: 10 }, // 納入状況
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${selectedYear}年度`);
    XLSX.writeFile(workbook, `会費_${selectedYear}年度.xlsx`);
  };

  return {
    rows: filteredRows,
    loading,
    filter,
    setFilter,
    toggleDues,
    unpaidCount,
    paidCount,
    totalCount: totalActiveCount,
    availableYears,
    selectedYear,
    setSelectedYear,
    keyword,
    setKeyword,
    gradeFilter,
    setGradeFilter,
    facultyFilter,
    setFacultyFilter,
    grades,
    faculties,
    exportExcel,
  } as const;
}

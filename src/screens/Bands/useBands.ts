import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../../lib/firebase";
import { fetchAllMembers } from "../../lib/members";
import { calcGrade } from "../../lib/grade";
import type { Band, Member } from "../../Types/types";
import { todayString } from "../../lib/date";

export function useBands() {
  const [bands, setBands] = useState<Band[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBands = async () => {
      try {
        // 解散済み("解散")は一覧に出さない
        const q = query(collection(db, "bands"), where("status", "!=", "解散"));
        const snapshot = await getDocs(q);
        const list: Band[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Band, "id">),
        }));
        setBands(list);

        // メンバー情報(氏名・学籍番号・学年の解決用)
        setMembers(await fetchAllMembers());
      } catch (e) {
        console.error("バンド一覧の取得に失敗しました", e);
      } finally {
        setLoading(false);
      }
    };
    fetchBands();
  }, []);

  // 選択したバンドをExcel出力(バンドごとに見出し+メンバー表のブロック形式)
  const exportBands = (selectedIds: string[]) => {
    const targets = bands.filter((b) => selectedIds.includes(b.id));
    if (targets.length === 0) {
      window.alert("出力するバンドを選択してください。");
      return;
    }

    const memberMap: Record<string, Member> = {};
    members.forEach((m) => (memberMap[m.id] = m));

    // シートに書き込む2次元配列を組み立てる
    const rows: (string | number)[][] = [];
    targets.forEach((band, index) => {
      // バンドの見出し行
      rows.push([band.name, band.status]);
      // メンバー表のヘッダー
      rows.push(["氏名", "学籍番号", "学年", "パート"]);
      // メンバー各行
      band.members.forEach((bm) => {
        const m = memberMap[bm.memberId];
        if (m) {
          rows.push([m.name, m.studentId, calcGrade(m.enrollmentYear, m.isOB), bm.part]);
        } else {
          rows.push(["不明", "", "", bm.part]);
        }
      });
      // バンド間に空行を1行(最後のバンドの後には入れない)
      if (index < targets.length - 1) {
        rows.push([]);
      }
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 16 }, // 氏名 / バンド名
      { wch: 12 }, // 学籍番号 / ステータス
      { wch: 8 },  // 学年
      { wch: 10 }, // パート
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "バンド一覧");

    const today = todayString();
    XLSX.writeFile(workbook, `バンド一覧_${today}.xlsx`);
  };

  return { bands, loading, exportBands } as const;
}
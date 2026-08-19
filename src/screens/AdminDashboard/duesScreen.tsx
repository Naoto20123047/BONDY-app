import { useNavigate } from "react-router-dom";
import "./duesScreen.css";
import { useDues } from "./useDues";
import { avatarStyle } from "../../lib/avatarColors";

export default function DuesScreen() {
  const navigate = useNavigate();
  const {
    rows,
    loading,
    filter,
    setFilter,
    toggleDues,
    paidCount,
    totalCount,
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
  } = useDues();

  if (loading) {
    return <div className="dues-content">読み込み中...</div>;
  }

  return (
    <div className="dues-content">
      {/* 上部:固定 */}
      <div className="dues-fixed">
        <button className="dues-back" onClick={() => navigate("/admin")}>
          <i className="ti ti-arrow-left" /> 幹部管理に戻る
        </button>

        <div className="dues-header">
          <h2 className="dues-title">会費管理</h2>
          <div className="dues-header-right">
            <span className="dues-unpaid-count">
              納入 {paidCount} / {totalCount}名
            </span>
            <button className="dues-export" onClick={exportExcel}>
              <i className="ti ti-file-spreadsheet" /> Excel出力
            </button>
          </div>
        </div>

        <div className="dues-toolbar">
          <select
            className="dues-year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}年度</option>
            ))}
          </select>
          <span className="dues-year-hint">
            <i className="ti ti-info-circle" /> 翌年度を選ぶと前払いも登録できます
          </span>
        </div>

        <div className="dues-search-row">
          <input
            className="dues-search"
            placeholder="名前・学籍番号で検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select
            className="dues-select"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            <option value="">学年</option>
            {grades.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select
            className="dues-select"
            value={facultyFilter}
            onChange={(e) => setFacultyFilter(e.target.value)}
          >
            <option value="">学部</option>
            {faculties.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="dues-filter">
          <button
            className={`dues-filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            すべて
          </button>
          <button
            className={`dues-filter-btn ${filter === "unpaid" ? "active" : ""}`}
            onClick={() => setFilter("unpaid")}
          >
            未納のみ
          </button>
        </div>
      </div>

      {/* リスト:ここだけスクロール */}
      <div className="dues-list">
        {rows.length === 0 ? (
          <p className="dues-empty">該当するメンバーがいません</p>
        ) : (
          rows.map((r) => (
            <div key={r.memberId} className="dues-row">
              <div className="dues-avatar" style={avatarStyle(r.avatarColor)}>{r.name.charAt(0)}</div>
              <div className="dues-info">
                <span className="dues-name">
                  {r.name}
                  {r.isOB && <span className="dues-ob">OB</span>}
                </span>
                <span className="dues-meta">
                  {r.studentId} ・ {r.gradeLabel} ・ {r.faculty}
                </span>
              </div>
              <button
                className={`dues-toggle ${r.paid ? "paid" : "unpaid"}`}
                onClick={() => toggleDues(r)}
              >
                {r.paid ? "納入済み" : "未納"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
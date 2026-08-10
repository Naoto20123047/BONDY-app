import { useNavigate } from "react-router-dom";
import "./rosterScreen.css";
import { useRoster } from "./useRoster";
import { calcGrade } from "../../lib/grade";

export default function RosterScreen() {
  const navigate = useNavigate();
  const {
    members,
    loading,
    keyword,
    setKeyword,
    gradeFilter,
    setGradeFilter,
    partFilter,
    setPartFilter,
    parts,
    grades,
  } = useRoster();

  if (loading) {
    return <div className="roster-content">読み込み中...</div>;
  }

  return (
    <div className="roster-content">
      <div className="roster-header">
        <h2 className="roster-title">名簿一覧</h2>
        <span className="roster-count">{members.length}名</span>
      </div>

      <div className="roster-filters">
        <input
          className="roster-search"
          placeholder="名前・学籍番号で検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select
          className="roster-select"
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
        >
          <option value="">学年</option>
          {grades.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          className="roster-select"
          value={partFilter}
          onChange={(e) => setPartFilter(e.target.value)}
        >
          <option value="">パート</option>
          {parts.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="roster-list">
        {members.map((m) => (
          <button
            key={m.id}
            className="roster-row"
            onClick={() => navigate(`/roster/${m.id}`)}
          >
            <div className="roster-avatar">{m.name.charAt(0)}</div>
            <div className="roster-info">
              <span className="roster-name">
                {m.name}
                {m.nickname && <span className="roster-nickname">（{m.nickname}）</span>}
              </span>
              <span className="roster-meta">
                {m.studentId} ・ {calcGrade(m.enrollmentYear, m.isOB)} ・ {m.part}
              </span>
            </div>
            {m.positions.length > 0 && (
              <span className="roster-badge">{m.positions[0]}</span>
            )}
            <i className="ti ti-chevron-right roster-chevron" />
          </button>
        ))}
      </div>
    </div>
  );
}
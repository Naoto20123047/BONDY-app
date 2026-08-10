import { useParams, useNavigate } from "react-router-dom";
import "./formResultsScreen.css";
import { useFormResults } from "./useFormResults";

// 選択肢の文言に応じたバーの色(定番の選択肢だけ色分け、それ以外は緑)
const barColor = (option: string): string => {
  if (option === "参加") return "var(--color-accent)";
  if (option === "不参加") return "var(--color-danger)";
  if (option === "未定") return "var(--color-text-muted)";
  return "var(--color-accent)";
};

// 回答タグの色(選択式の回答表示用)
const tagClass = (value: string): string => {
  if (value === "参加") return "results-tag-yes";
  if (value === "不参加") return "results-tag-no";
  if (value === "未定") return "results-tag-maybe";
  return "results-tag-default";
};

export default function FormResultsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { form, rows, isEvent, loading, summarize } = useFormResults(id);

  if (loading || !form) {
    return <div className="results-content">読み込み中...</div>;
  }

  const selectQuestions = form.questions.filter((q) => q.type === "select" && q.options);

  return (
    <div className="results-content">
      <button className="results-back" onClick={() => navigate("/forms")}>
        <i className="ti ti-arrow-left" /> フォーム一覧に戻る
      </button>

      <h2 className="results-title">{form.title}</h2>
      <div className="results-tags">
        <span className={`results-type-tag ${form.type === "イベント" ? "event" : "survey"}`}>
          {form.type}
        </span>
      </div>

      {/* サマリー:回答数 */}
      <div className="results-summary-cards">
        <div className="results-summary-card">
          <p className="results-summary-label">回答数</p>
          <p className="results-summary-value">{rows.length}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="results-empty">まだ回答がありません</p>
      ) : (
        <>
          {/* 選択式の集計(割合バー) */}
          {selectQuestions.map((q) => {
            const counts = summarize(q.id, q.options!);
            const total = rows.length || 1;
            return (
              <div key={q.id} className="results-chart">
                <p className="results-question-label">{q.label}</p>
                {q.options!.map((opt) => {
                  const count = counts[opt];
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={opt} className="results-bar-block">
                      <div className="results-bar-head">
                        <span className="results-bar-label">{opt}</span>
                        <span className="results-bar-meta">
                          {count}件 ・ {pct}%
                        </span>
                      </div>
                      <div className="results-bar-track">
                        <div
                          className="results-bar-fill"
                          style={{ width: `${pct}%`, background: barColor(opt) }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 個別回答の一覧 */}
          <p className="results-list-label">
            {isEvent ? "バンド別の回答" : "個別の回答"}
          </p>
          <div className="results-list">
            {rows.map((r) => (
              <div key={r.id} className="results-row">
                <div className="results-row-head">
                  <span className="results-respondent">{r.respondentName}</span>
                  <span className="results-date">{r.submittedAt}</span>
                </div>
                <div className="results-answers">
                  {form.questions.map((q) => {
                    const val = r.answers[q.id];
                    return (
                      <div key={q.id} className="results-answer">
                        <span className="results-answer-label">{q.label}</span>
                        {q.type === "select" && val ? (
                          <span className={`results-answer-tag ${tagClass(val)}`}>{val}</span>
                        ) : (
                          <span className="results-answer-value">{val ? val : "—"}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
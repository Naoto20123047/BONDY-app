import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./formResultsScreen.css";
import { useFormResults } from "./useFormResults";

const barColor = (option: string): string => {
  if (option === "参加") return "var(--color-accent)";
  if (option === "不参加") return "var(--color-danger)";
  if (option === "未定") return "var(--color-text-muted)";
  return "var(--color-accent)";
};

const tagClass = (value: string): string => {
  if (value === "参加") return "results-tag-yes";
  if (value === "不参加") return "results-tag-no";
  if (value === "未定") return "results-tag-maybe";
  return "results-tag-default";
};

export default function FormResultsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { form, rows, isEvent, loading, summarize, countVisible, isConditional } =
    useFormResults(id);

  const [current, setCurrent] = useState(0);
  const [openTexts, setOpenTexts] = useState<string[]>([]);

  if (loading || !form) {
    return <div className="results-content">読み込み中...</div>;
  }

  const selectQuestions = form.questions.filter((q) => q.type === "select" && q.options);
  const textQuestions = form.questions.filter((q) => q.type === "text");

  const index = Math.min(current, Math.max(rows.length - 1, 0));
  const row = rows[index];

  const prev = () => setCurrent((i) => Math.max(0, i - 1));
  const next = () => setCurrent((i) => Math.min(rows.length - 1, i + 1));

  const toggleText = (qid: string) =>
    setOpenTexts((prev) =>
      prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]
    );

  return (
    <div className="results-content">
      <button className="results-back" onClick={() => navigate("/forms")}>
        <i className="ti ti-arrow-left" /> フォーム一覧に戻る
      </button>

      <div className="results-header">
        <div className="results-header-main">
          <h2 className="results-title">{form.title}</h2>
          <div className="results-tags">
            <span className={`results-type-tag ${form.type === "イベント" ? "event" : "survey"}`}>
              {form.type === "イベント" ? "バンドフォーム" : "個別アンケート"}
            </span>
          </div>
        </div>
        <div className="results-summary-card">
          <p className="results-summary-label">回答数</p>
          <p className="results-summary-value">{rows.length}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="results-empty">まだ回答がありません</p>
      ) : (
        <div className="results-columns">
          {/* 左:集計 */}
          <div className="results-col-left">
            <p className="results-section-label">集計</p>

            <div className="results-scroll">
              {selectQuestions.length === 0 && textQuestions.length === 0 && (
                <p className="results-no-chart">集計できる質問はありません</p>
              )}

              {/* 選択式:割合バー */}
              {selectQuestions.map((q) => {
                const counts = summarize(q.id, q.options!);
                const visibleCount = countVisible(q.id);
                const total = visibleCount || 1;
                const conditional = isConditional(q.id);

                return (
                  <div key={q.id} className="results-chart">
                    <div className="results-chart-head">
                      <p className="results-question-label">{q.label}</p>
                      {conditional && (
                        <span className="results-cond-tag">
                          <i className="ti ti-arrow-guide" />
                          条件付き
                        </span>
                      )}
                    </div>

                    {conditional && (
                      <p className="results-denominator">
                        この質問が表示された回答:{visibleCount}件 / 全{rows.length}件
                      </p>
                    )}

                    {visibleCount === 0 ? (
                      <p className="results-no-target">
                        条件を満たす回答がまだありません
                      </p>
                    ) : (
                      q.options!.map((opt) => {
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
                      })
                    )}
                  </div>
                );
              })}

              {/* 記述式:ボタンで開閉 */}
              {textQuestions.map((q) => {
                const answers = rows
                  .filter((r) => r.visibleQuestionIds.includes(q.id))
                  .map((r) => ({
                    id: r.id,
                    name: r.respondentName,
                    value: (r.answers[q.id] ?? "").trim(),
                  }))
                  .filter((a) => a.value !== "");
                const isOpen = openTexts.includes(q.id);
                const conditional = isConditional(q.id);
                const visibleCount = countVisible(q.id);

                return (
                  <div key={q.id} className="results-chart">
                    <div className="results-chart-head">
                      <p className="results-question-label">{q.label}</p>
                      {conditional && (
                        <span className="results-cond-tag">
                          <i className="ti ti-arrow-guide" />
                          条件付き
                        </span>
                      )}
                    </div>

                    <div className="results-text-head">
                      <span className="results-text-count">
                        {answers.length}件の回答
                        {conditional && ` / 表示された${visibleCount}件中`}
                      </span>
                    </div>

                    <button
                      className="results-text-toggle"
                      onClick={() => toggleText(q.id)}
                      disabled={answers.length === 0}
                    >
                      <i className={`ti ${isOpen ? "ti-chevron-up" : "ti-chevron-down"}`} />
                      {answers.length === 0
                        ? "回答なし"
                        : isOpen
                        ? "回答を閉じる"
                        : "回答を表示"}
                    </button>

                    {isOpen && answers.length > 0 && (
                      <div className="results-text-list">
                        {answers.map((a) => (
                          <div key={a.id} className="results-text-item">
                            <span className="results-text-name">{a.name}</span>
                            <p className="results-text-value">{a.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右:個別回答 */}
          <div className="results-col-right">
            <div className="results-list-head">
              <p className="results-section-label">
                {isEvent ? "バンド別の回答" : "個別の回答"}
              </p>
              <div className="results-pager">
                <button
                  className="results-pager-btn"
                  onClick={prev}
                  disabled={index === 0}
                  aria-label="前の回答"
                >
                  <i className="ti ti-chevron-left" />
                </button>
                <span className="results-pager-count">
                  {index + 1} / {rows.length}
                </span>
                <button
                  className="results-pager-btn"
                  onClick={next}
                  disabled={index === rows.length - 1}
                  aria-label="次の回答"
                >
                  <i className="ti ti-chevron-right" />
                </button>
              </div>
            </div>

            {rows.length > 1 && (
              <select
                className="results-select"
                value={index}
                onChange={(e) => setCurrent(Number(e.target.value))}
              >
                {rows.map((r, i) => (
                  <option key={r.id} value={i}>
                    {i + 1}. {r.respondentName}
                  </option>
                ))}
              </select>
            )}

            <div className="results-scroll">
              <div className="results-row">
                <div className="results-row-head">
                  <div className="results-row-head-main">
                    <span className="results-respondent">{row.respondentName}</span>
                    {isEvent && (
                      <span className="results-submitter">
                        回答者:{row.submitterName}
                      </span>
                    )}
                  </div>
                  <span className="results-date">{row.submittedAt}</span>
                </div>

                <div className="results-meta">
                  {isEvent ? (
                    <>
                      <div className="results-meta-item">
                        <span className="results-meta-label">送信者</span>
                        <span className="results-meta-value">
                          {row.submitterName}（{row.studentId}）
                        </span>
                      </div>
                      <div className="results-meta-item">
                        <span className="results-meta-label">メンバー</span>
                        <span className="results-meta-value">
                          {row.bandMembers.length === 0 ? (
                            <span className="results-meta-none">—</span>
                          ) : (
                            <span className="results-member-tags">
                              {row.bandMembers.map((bm, i) => (
                                <span key={`${bm.name}-${i}`} className="results-member-tag">
                                  {bm.name}
                                  <span className="results-member-part">{bm.part}</span>
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="results-meta-item">
                        <span className="results-meta-label">学籍番号</span>
                        <span className="results-meta-value">{row.studentId}</span>
                      </div>
                      <div className="results-meta-item">
                        <span className="results-meta-label">学部・学年</span>
                        <span className="results-meta-value">
                          {row.faculty}・{row.gradeLabel}
                        </span>
                      </div>
                      <div className="results-meta-item">
                        <span className="results-meta-label">パート</span>
                        <span className="results-meta-value">{row.part}</span>
                      </div>
                      <div className="results-meta-item">
                        <span className="results-meta-label">所属バンド</span>
                        <span className="results-meta-value">
                          {row.bandNames.length === 0 ? (
                            <span className="results-meta-none">なし</span>
                          ) : (
                            <span className="results-member-tags">
                              {row.bandNames.map((n) => (
                                <span key={n} className="results-band-tag">{n}</span>
                              ))}
                            </span>
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="results-answers">
                  {form.questions
                    .filter((q) => row.visibleQuestionIds.includes(q.id))
                    .map((q) => {
                      const val = row.answers[q.id];
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
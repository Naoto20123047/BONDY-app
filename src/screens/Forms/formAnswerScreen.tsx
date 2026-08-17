import { useParams, useNavigate } from "react-router-dom";
import "./formAnswerScreen.css";
import { useFormAnswer } from "./useFormAnswer";

export default function FormAnswerScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    form,
    isEvent,
    isExpired,
    unpaidMemberNames,
    selectableBands,
    bandId,
    selectBand,
    answers,
    setAnswer,
    visibleQuestions,
    existingResponse,
    responses,
    loading,
    submitting,
    submit,
  } = useFormAnswer(id);

  if (loading || !form) {
    return <div className="answer-content">読み込み中...</div>;
  }

  const answeredBandIds = responses.map((r) => r.bandId);
  const showQuestions = !isEvent || bandId;

  return (
    <div className="answer-content">
      {/* 上部:固定 */}
      <div className="answer-fixed">
        <button className="answer-back" onClick={() => navigate("/forms")}>
          <i className="ti ti-arrow-left" /> フォーム一覧に戻る
        </button>

        <div className="answer-header">
          <h2 className="answer-title">{form.title}</h2>
          <div className="answer-meta">
            <span className={`answer-type-tag ${isEvent ? "event" : "survey"}`}>
              {isEvent ? "バンドフォーム" : "個別アンケート"}
            </span>
            <span className="answer-deadline">
              <i className="ti ti-clock" /> {form.deadline} 締切
            </span>
          </div>

          {isExpired && (
            <div className="answer-expired-notice">
              <i className="ti ti-lock" />
              回答期限を過ぎているため、回答・編集できません。
            </div>
          )}

          {isEvent && (
            <div className="answer-band-select">
              <label className="answer-band-label">出演バンド</label>
              <select
                className="answer-select"
                value={bandId}
                onChange={(e) => selectBand(e.target.value)}
                disabled={isExpired}
              >
                <option value="">選択してください</option>
                {selectableBands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {answeredBandIds.includes(b.id) ? "(回答済み)" : ""}
                  </option>
                ))}
              </select>
              {existingResponse && (
                <p className="answer-edit-note">
                  <i className="ti ti-pencil" />
                  このバンドの回答を編集しています。上書き保存されます。
                </p>
              )}
              {selectableBands.length === 0 && (
                <p className="answer-no-band">
                  承認済みのバンドに所属していないため、回答できません。
                </p>
              )}
            </div>
          )}

          {isEvent && bandId && unpaidMemberNames.length > 0 && !isExpired && (
            <div className="answer-unpaid-notice">
              <i className="ti ti-alert-triangle" />
              <div>
                <p className="answer-unpaid-title">会費未納のメンバーがいます</p>
                <p className="answer-unpaid-text">
                  今年度の会費が未納:{unpaidMemberNames.join("、")}
                  <br />
                  未納の場合、イベントに出演できないことがあります。回答は可能ですが、早めに納入してください。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 質問:ここだけスクロール */}
      <div className="answer-scroll">
        {!showQuestions ? (
          <div className="answer-placeholder">
            <i className="ti ti-guitar-pick" />
            <p>出演バンドを選択してください</p>
            <span>バンドを選ぶと質問が表示されます</span>
          </div>
        ) : (
          <div className="answer-questions">
            {visibleQuestions.map((q, i) => (
              <div key={q.id} className="answer-question">
                <div className="answer-question-head">
                  <span className="answer-question-no">Q{i + 1}</span>
                  {q.required && <span className="answer-required">必須</span>}
                </div>
                <label className="answer-label">{q.label}</label>

                {q.type === "select" ? (
                  <div className="answer-options">
                    {q.options?.map((opt) => (
                      <button
                        key={opt}
                        className={`answer-option ${answers[q.id] === opt ? "selected" : ""}`}
                        onClick={() => setAnswer(q.id, opt)}
                        disabled={isExpired}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="answer-textarea"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    disabled={isExpired}
                    placeholder="入力してください"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 下部:固定 */}
      {showQuestions && !isExpired && (
        <div className="answer-bottom">
          <button
            className="answer-submit"
            onClick={() => submit(() => navigate("/forms"))}
            disabled={submitting}
          >
            {submitting ? "送信中..." : existingResponse ? "回答を更新" : "回答を送信"}
          </button>
        </div>
      )}
    </div>
  );
}
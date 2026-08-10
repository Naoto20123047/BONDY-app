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

  return (
    <div className="answer-content">
      <button className="answer-back" onClick={() => navigate("/forms")}>
        <i className="ti ti-arrow-left" /> フォーム一覧に戻る
      </button>

      <h2 className="answer-title">{form.title}</h2>
      <p className="answer-deadline">
        <i className="ti ti-clock" /> 回答期限:{form.deadline}
      </p>

      {isExpired && (
        <div className="answer-expired-notice">
          このフォームは回答期限を過ぎているため、回答・編集できません。
        </div>
      )}

      {/* イベント型で、選択中バンドに未納メンバーがいるときの警告(回答自体は可能) */}
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

      {isEvent && (
        <div className="answer-field">
          <label className="answer-label">出演バンド</label>
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
              このバンドの回答を編集しています。上書き保存されます。
            </p>
          )}
        </div>
      )}

      {/* イベント型はバンド選択後に質問を表示、アンケート型は常に表示 */}
      {(!isEvent || bandId) &&
        form.questions.map((q) => (
          <div key={q.id} className="answer-field">
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

      {!isExpired && (!isEvent || bandId) && (
        <button
          className="answer-submit"
          onClick={() => submit(() => navigate("/forms"))}
          disabled={submitting}
        >
          {submitting ? "送信中..." : existingResponse ? "回答を更新" : "回答を送信"}
        </button>
      )}
    </div>
  );
}
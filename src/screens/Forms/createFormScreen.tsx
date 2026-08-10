import { useNavigate } from "react-router-dom";
import "./createFormScreen.css";
import { useCreateForm } from "./useCreateForm";

export default function CreateFormScreen() {
  const navigate = useNavigate();
  const {
    type,
    changeType,
    title,
    setTitle,
    deadline,
    setDeadline,
    questions,
    addQuestion,
    updateLabel,
    updateOption,
    addOption,
    removeOption,
    removeQuestion,
    saving,
    save,
  } = useCreateForm();

  return (
    <div className="create-content">
      <button className="create-back" onClick={() => navigate("/forms")}>
        <i className="ti ti-arrow-left" /> フォーム一覧に戻る
      </button>

      <h2 className="create-title">フォーム作成</h2>

      <div className="create-field">
        <label className="create-label">種類</label>
        <div className="create-type-toggle">
          <button
            className={`create-type ${type === "イベント" ? "active" : ""}`}
            onClick={() => changeType("イベント")}
          >
            イベント出欠
          </button>
          <button
            className={`create-type ${type === "アンケート" ? "active" : ""}`}
            onClick={() => changeType("アンケート")}
          >
            アンケート
          </button>
        </div>
        {type === "イベント" && (
          <p className="create-hint">
            回答画面に「出演バンド選択」が自動で表示されます。回答はバンド単位で管理されます。
          </p>
        )}
      </div>

      <div className="create-field">
        <label className="create-label">タイトル</label>
        <input
          className="create-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: BONDY FES 2026 出演確認"
        />
      </div>

      <div className="create-field">
        <label className="create-label">回答期限</label>
        <input
          className="create-input"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </div>

      <div className="create-field">
        <label className="create-label">質問項目</label>
        {questions.map((q) => (
          <div key={q.id} className="create-question">
            <div className="create-question-head">
              <input
                className="create-question-label"
                value={q.label}
                onChange={(e) => updateLabel(q.id, e.target.value)}
                placeholder="質問文を入力"
              />
              <button
                className="create-question-remove"
                onClick={() => removeQuestion(q.id)}
              >
                <i className="ti ti-trash" />
              </button>
            </div>

            {q.type === "select" && q.options && (
              <div className="create-options">
                {q.options.map((opt, i) => (
                  <div key={i} className="create-option-row">
                    <input
                      className="create-option-input"
                      value={opt}
                      onChange={(e) => updateOption(q.id, i, e.target.value)}
                      placeholder={`選択肢 ${i + 1}`}
                    />
                    {q.options!.length > 1 && (
                      <button
                        className="create-option-remove"
                        onClick={() => removeOption(q.id, i)}
                      >
                        <i className="ti ti-x" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="create-option-add"
                  onClick={() => addOption(q.id)}
                >
                  <i className="ti ti-plus" /> 選択肢を追加
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="create-add-buttons">
          <button className="create-add" onClick={() => addQuestion("text")}>
            <i className="ti ti-plus" /> 記述式の質問
          </button>
          <button className="create-add" onClick={() => addQuestion("select")}>
            <i className="ti ti-plus" /> 選択式の質問
          </button>
        </div>
      </div>

      <button
        className="create-save"
        onClick={() => save(() => navigate("/forms"))}
        disabled={saving}
      >
        {saving ? "作成中..." : "フォームを作成"}
      </button>
    </div>
  );
}
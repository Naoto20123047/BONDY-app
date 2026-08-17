import { useState } from "react";
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
    toggleRequired,
    updateOption,
    addOption,
    removeOption,
    removeQuestion,
    setShowIf,
    saving,
    save,
  } = useCreateForm();

  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="create-content">
      <button className="create-back" onClick={() => navigate("/forms")}>
        <i className="ti ti-arrow-left" /> フォーム一覧に戻る
      </button>

      <div className="create-header">
        <h2 className="create-title">フォーム作成</h2>
        <div className="create-header-actions">
          <button
            className="create-help-btn"
            onClick={() => setShowHelp(true)}
            aria-label="フォームの作り方"
          >
            <i className="ti ti-help-circle" />
            使い方
          </button>
          <button
            className="create-save"
            onClick={() => save(() => navigate("/forms"))}
            disabled={saving}
          >
            {saving ? "作成中..." : "フォームを作成"}
          </button>
        </div>
      </div>

      <div className="create-columns">
        {/* 左:基本設定 */}
        <div className="create-col-left">
          <div className="create-card">
            <p className="create-card-title">基本設定</p>

            <div className="create-field">
              <label className="create-label">種類</label>
              <div className="create-type-toggle">
                <button
                  className={`create-type ${type === "イベント" ? "active" : ""}`}
                  onClick={() => changeType("イベント")}
                >
                  <i className="ti ti-guitar-pick" />
                  バンドフォーム
                </button>
                <button
                  className={`create-type ${type === "アンケート" ? "active" : ""}`}
                  onClick={() => changeType("アンケート")}
                >
                  <i className="ti ti-user" />
                  個別アンケート
                </button>
              </div>
              <p className="create-hint">
                {type === "イベント"
                  ? "回答画面に「出演バンド選択」が自動で表示されます。回答はバンド単位で管理され、同じバンドのメンバーなら誰でも編集できます。"
                  : "1人1回答で管理されます。回答した本人だけが編集できます。"}
              </p>
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

            <div className="create-field last">
              <label className="create-label">回答期限</label>
              <input
                className="create-input"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <p className="create-hint">期限を過ぎると、新規回答も編集もできなくなります。</p>
            </div>
          </div>
        </div>

        {/* 右:質問項目 */}
        <div className="create-col-right">
          <div className="create-questions-head">
            <p className="create-card-title">
              質問項目
              <span className="create-question-count">{questions.length}</span>
            </p>
            <div className="create-add-buttons">
              <button className="create-add" onClick={() => addQuestion("text")}>
                <i className="ti ti-plus" /> 記述式
              </button>
              <button className="create-add" onClick={() => addQuestion("select")}>
                <i className="ti ti-plus" /> 選択式
              </button>
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="create-empty">
              <i className="ti ti-clipboard-plus" />
              <p>質問がまだありません</p>
              <span>上のボタンから質問を追加してください</span>
            </div>
          ) : (
            <div className="create-question-list">
              {questions.map((q, i) => {
                const prevQ = i > 0 ? questions[i - 1] : null;
                const prevOptions = (prevQ?.options ?? []).filter((o) => o.trim() !== "");

                let condDisabledReason: string | null = null;
                if (prevQ === null) {
                  condDisabledReason = "最初の質問には条件を設定できません";
                } else if (prevQ.type !== "select") {
                  condDisabledReason = "前の質問が記述式のため設定できません";
                } else if (prevOptions.length === 0) {
                  condDisabledReason = "前の質問の選択肢を入力すると設定できます";
                }

                return (
                  <div key={q.id} className="create-question">
                    <div className="create-question-top">
                      <span className="create-question-no">Q{i + 1}</span>
                      <span className={`create-question-type ${q.type}`}>
                        {q.type === "select" ? "選択式" : "記述式"}
                      </span>
                      {q.required && <span className="create-question-req">必須</span>}
                      {q.showIf && (
                        <span className="create-question-cond">
                          <i className="ti ti-arrow-guide" />
                          条件付き
                        </span>
                      )}
                      <button
                        className="create-question-remove"
                        onClick={() => removeQuestion(q.id)}
                        aria-label="この質問を削除"
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>

                    <input
                      className="create-question-label"
                      value={q.label}
                      onChange={(e) => updateLabel(q.id, e.target.value)}
                      placeholder="質問文を入力"
                    />

                    <label className="create-required">
                      <input
                        type="checkbox"
                        checked={q.required === true}
                        onChange={() => toggleRequired(q.id)}
                      />
                      <span>必須回答</span>
                    </label>

                    {q.type === "select" && q.options && (
                      <div className="create-options">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="create-option-row">
                            <span className="create-option-no">{oi + 1}</span>
                            <input
                              className="create-option-input"
                              value={opt}
                              onChange={(e) => updateOption(q.id, oi, e.target.value)}
                              placeholder={`選択肢 ${oi + 1}`}
                            />
                            {q.options!.length > 1 && (
                              <button
                                className="create-option-remove"
                                onClick={() => removeOption(q.id, oi)}
                                aria-label="この選択肢を削除"
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

                    <div className={`create-condition ${condDisabledReason ? "disabled" : ""}`}>
                      <div className="create-condition-head">
                        <i className="ti ti-arrow-guide" />
                        <span>表示条件</span>
                      </div>

                      {condDisabledReason ? (
                        <p className="create-condition-disabled">{condDisabledReason}</p>
                      ) : (
                        <div className="create-condition-row">
                          <span className="create-condition-text">Q{i} で</span>
                          <select
                            className="create-condition-select"
                            value={q.showIf?.value ?? ""}
                            onChange={(e) =>
                              setShowIf(q.id, e.target.value === "" ? null : e.target.value)
                            }
                          >
                            <option value="">条件なし（常に表示）</option>
                            {prevOptions.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                          <span className="create-condition-text">
                            を選んだときだけ表示
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ヘルプ */}
      {showHelp && (
        <>
          <div className="create-help-overlay" onClick={() => setShowHelp(false)} />
          <div className="create-help-modal" role="dialog" aria-label="フォームの作り方">
            <div className="create-help-head">
              <h3 className="create-help-title">フォームの作り方</h3>
              <button
                className="create-help-close"
                onClick={() => setShowHelp(false)}
                aria-label="閉じる"
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="create-help-body">
              <section className="create-help-section">
                <h4>2つの種類</h4>
                <div className="create-help-item">
                  <p className="create-help-item-title">
                    <i className="ti ti-guitar-pick" />
                    バンドフォーム
                  </p>
                  <p>
                    ライブの出演確認など、<strong>バンド単位</strong>で聞きたいときに使います。
                  </p>
                  <ul>
                    <li>回答画面に「出演バンド選択」が自動で表示されます</li>
                    <li>同じ人でも、所属する別のバンドを選べば複数回答できます</li>
                    <li>回答の編集は、そのバンドのメンバー全員ができます</li>
                    <li>会費未納のメンバーがいると警告が出ます（回答自体は可能）</li>
                  </ul>
                </div>
                <div className="create-help-item">
                  <p className="create-help-item-title">
                    <i className="ti ti-user" />
                    個別アンケート
                  </p>
                  <p>
                    一人ひとりに聞きたいときに使います。<strong>1人1回答</strong>です。
                  </p>
                  <ul>
                    <li>回答した本人だけが編集できます</li>
                  </ul>
                </div>
              </section>

              <section className="create-help-section">
                <h4>質問の種類</h4>
                <ul>
                  <li>
                    <strong>記述式</strong> — 自由に文章で回答してもらいます
                  </li>
                  <li>
                    <strong>選択式</strong> — 用意した選択肢から選んでもらいます。集計画面でグラフになります
                  </li>
                </ul>
              </section>

              <section className="create-help-section">
                <h4>必須回答</h4>
                <p>
                  チェックを入れると、その質問に答えないと送信できなくなります。
                  ただし、表示条件によって非表示になっている質問は必須になりません。
                </p>
              </section>

              <section className="create-help-section">
                <h4>表示条件</h4>
                <p>
                  <strong>直前の質問</strong>で特定の選択肢が選ばれたときだけ、
                  その質問を表示できます。
                </p>
                <div className="create-help-example">
                  <p className="create-help-example-title">例</p>
                  <p>Q1「出演しますか?」— 参加 / 不参加 / 未定</p>
                  <p>Q2「使用する機材は?」— <em>Q1で「参加」を選んだときだけ表示</em></p>
                </div>
                <ul>
                  <li>条件を設定できるのは、直前が<strong>選択式</strong>の質問のときだけです</li>
                  <li>直前の質問が非表示なら、その質問も表示されません</li>
                  <li>集計では、その質問が表示された人だけを分母に割合を出します</li>
                </ul>
              </section>

              <section className="create-help-section">
                <h4>回答期限</h4>
                <p>
                  期限を過ぎると、新規の回答も既存回答の編集もできなくなります。
                  一覧では「締切済み」として表示されます。
                </p>
              </section>

              <section className="create-help-section">
                <h4>作成後</h4>
                <p>
                  フォームを作成すると、在籍中のメンバー全員に通知が届きます。
                  回答状況は一覧の「集計」ボタンから確認できます。
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
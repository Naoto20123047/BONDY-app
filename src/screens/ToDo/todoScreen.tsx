import { useState } from "react";
import "./todoScreen.css";
import type { TodoStatus } from "../../Types/types";
import { useTodo, type TodoView } from "./useTodo";

const statuses: TodoStatus[] = ["未着手", "進行中", "完了"];

export default function TodoScreen() {
  const {
    todos,
    officerOptions,
    loading,
    statusFilter,
    setStatusFilter,
    addTodo,
    changeStatus,
    deleteTodo,
  } = useTodo();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [deadline, setDeadline] = useState("");

  if (loading) {
    return <div className="todo-content">読み込み中...</div>;
  }

  const handleAdd = async () => {
    const ok = await addTodo({ title, assigneeId: assigneeId || officerOptions[0]?.id || "", deadline });
    if (ok) {
      setTitle("");
      setDeadline("");
      setShowForm(false);
    }
  };

  // 担当者ごとにタスクをグループ化
  const grouped: { officerId: string; officerName: string; items: TodoView[] }[] =
    officerOptions
      .map((o) => ({
        officerId: o.id,
        officerName: o.name,
        items: todos.filter((t) => t.assigneeId === o.id),
      }))
      .filter((g) => g.items.length > 0);

  // どの幹部にも属さない担当のタスク(退会した幹部など)
  const orphanItems = todos.filter(
    (t) => !officerOptions.some((o) => o.id === t.assigneeId)
  );

  const renderTask = (t: TodoView) => (
    <div key={t.id} className="todo-item">
      <div className="todo-item-main">
        <span className="todo-item-title">{t.title}</span>
        {t.deadline && (
          <span className="todo-item-meta">
            <i className="ti ti-calendar" /> {t.deadline}
          </span>
        )}
      </div>
      <div className="todo-item-actions">
        <select
          className={`todo-status status-${t.status}`}
          value={t.status}
          onChange={(e) => changeStatus(t.id, e.target.value as TodoStatus)}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          className="todo-delete"
          aria-label="削除"
          onClick={() => deleteTodo(t.id, t.title)}
        >
          <i className="ti ti-trash" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="todo-content">
      <div className="todo-header">
        <h2 className="todo-title">幹部TODO</h2>
        <button className="todo-add-btn" onClick={() => setShowForm((v) => !v)}>
          <i className="ti ti-plus" /> タスク追加
        </button>
      </div>

      {showForm && (
        <div className="todo-form">
          <input
            className="todo-form-input"
            placeholder="タスク名"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="todo-form-row">
            <select
              className="todo-form-select"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">担当者を選択</option>
              {officerOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <input
              className="todo-form-date"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div className="todo-form-actions">
            <button className="todo-form-cancel" onClick={() => setShowForm(false)}>
              キャンセル
            </button>
            <button className="todo-form-submit" onClick={handleAdd}>
              追加
            </button>
          </div>
        </div>
      )}

      <div className="todo-filter">
        <button
          className={`todo-filter-btn ${statusFilter === "all" ? "active" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          すべて
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            className={`todo-filter-btn ${statusFilter === s ? "active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {todos.length === 0 ? (
        <p className="todo-empty">タスクはありません</p>
      ) : (
        <div className="todo-groups">
          {grouped.map((g) => (
            <div key={g.officerId} className="todo-group">
              <div className="todo-group-head">
                <div className="todo-group-avatar">{g.officerName.charAt(0)}</div>
                <span className="todo-group-name">{g.officerName}</span>
                <span className="todo-group-count">{g.items.length}</span>
              </div>
              <div className="todo-list">{g.items.map(renderTask)}</div>
            </div>
          ))}

          {orphanItems.length > 0 && (
            <div className="todo-group">
              <div className="todo-group-head">
                <div className="todo-group-avatar">?</div>
                <span className="todo-group-name">担当者不明</span>
                <span className="todo-group-count">{orphanItems.length}</span>
              </div>
              <div className="todo-list">{orphanItems.map(renderTask)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
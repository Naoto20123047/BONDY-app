import { useNavigate } from "react-router-dom";
import "./boardScreen.css";
import { useBoard } from "./useBoard";
import type { PostCategory } from "../../Types/types";

const categories: (PostCategory | "all")[] = ["all", "メンバー募集", "機材", "告知・連絡", "その他"];

const categoryLabel = (c: PostCategory | "all") => (c === "all" ? "すべて" : c);

// カテゴリごとの色分け(タグ用)
const categoryClass = (c: PostCategory) => {
  switch (c) {
    case "メンバー募集":
      return "cat-recruit";
    case "機材":
      return "cat-equipment";
    case "告知・連絡":
      return "cat-notice";
    default:
      return "cat-other";
  }
};

export default function BoardScreen() {
  const navigate = useNavigate();
  const { posts, loading, categoryFilter, setCategoryFilter } = useBoard();

  if (loading) {
    return <div className="board-content">読み込み中...</div>;
  }

  return (
    <div className="board-content">
      <div className="board-header">
        <h2 className="board-title">掲示板</h2>
        <button className="board-create" onClick={() => navigate("/board/new")}>
          <i className="ti ti-plus" /> 投稿する
        </button>
      </div>

      <div className="board-filter">
        {categories.map((c) => (
          <button
            key={c}
            className={`board-filter-btn ${categoryFilter === c ? "active" : ""}`}
            onClick={() => setCategoryFilter(c)}
          >
            {categoryLabel(c)}
          </button>
        ))}
      </div>

      <div className="board-list">
        {posts.length === 0 ? (
          <p className="board-empty">投稿はまだありません</p>
        ) : (
          posts.map((p) => (
            <button
              key={p.id}
              className={`board-card ${p.resolved ? "resolved" : ""}`}
              onClick={() => navigate(`/board/${p.id}`)}
            >
              <div className="board-card-top">
                <span className={`board-cat ${categoryClass(p.category)}`}>{p.category}</span>
                {p.isAnonymous && <span className="board-anon-badge">匿名</span>}
                {p.resolved && <span className="board-resolved-badge">解決済み</span>}
              </div>
              <span className="board-card-title">{p.title}</span>
              <p className="board-card-body">{p.body}</p>
              <div className="board-card-meta">
                <span className="board-card-author">
                  <i className="ti ti-user" /> {p.authorName}
                </span>
                <span className="board-card-comments">
                  <i className="ti ti-message-2" /> {p.commentCount}
                </span>
                <span className="board-card-date">{p.createdAt.slice(0, 10)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

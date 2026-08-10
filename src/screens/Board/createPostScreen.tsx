import { useNavigate } from "react-router-dom";
import "./createPostScreen.css";
import { useCreatePost } from "./useCreatePost";
import type { PostCategory } from "../../Types/types";

const categories: PostCategory[] = ["メンバー募集", "機材", "告知・連絡", "その他"];

export default function CreatePostScreen() {
  const navigate = useNavigate();
  const { category, setCategory, title, setTitle, body, setBody, submitting, submit } =
    useCreatePost();

  return (
    <div className="create-post-content">
      <button className="create-post-back" onClick={() => navigate("/board")}>
        <i className="ti ti-arrow-left" /> 掲示板に戻る
      </button>

      <h2 className="create-post-title">新規投稿</h2>

      <div className="create-post-field">
        <label className="create-post-label">カテゴリ</label>
        <div className="create-post-categories">
          {categories.map((c) => (
            <button
              key={c}
              className={`create-post-cat ${category === c ? "active" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="create-post-field">
        <label className="create-post-label">タイトル</label>
        <input
          className="create-post-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: ドラム募集しています"
          maxLength={50}
        />
      </div>

      <div className="create-post-field">
        <label className="create-post-label">本文</label>
        <textarea
          className="create-post-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="詳しい内容を書いてください"
          rows={8}
        />
      </div>

      <div className="create-post-actions">
        <button
          className="create-post-submit"
          onClick={() => submit(() => navigate("/board"))}
          disabled={submitting}
        >
          {submitting ? "投稿中..." : "投稿する"}
        </button>
      </div>
    </div>
  );
}
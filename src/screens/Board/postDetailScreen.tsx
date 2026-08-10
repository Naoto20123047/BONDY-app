import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./postDetailScreen.css";
import { usePostDetail } from "./usePostDetail";
import { useAuth } from "../../lib/AuthContext";
import { emojiStamps, imageStamps, quickReactions } from "../../lib/stamps";

const categoryClass = (c: string) => {
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

const isImageStamp = (s: string) => s.startsWith("/");

export default function PostDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { member } = useAuth();
  const {
    post,
    authorName,
    comments,
    isMyPost,
    loading,
    submitting,
    addComment,
    addStampComment,
    toggleCommentReaction,
    toggleResolved,
    deletePost,
    deleteComment,
  } = usePostDetail(id);

  const [commentText, setCommentText] = useState("");
  const [showStamps, setShowStamps] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [reactionExpanded, setReactionExpanded] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  if (loading) {
    return <div className="post-detail-content">読み込み中...</div>;
  }

  if (!post) {
    return (
      <div className="post-detail-content">
        <p>投稿が見つかりませんでした。</p>
        <button className="post-detail-back" onClick={() => navigate("/board")}>
          <i className="ti ti-arrow-left" /> 掲示板に戻る
        </button>
      </div>
    );
  }

  const handleComment = async () => {
    const ok = await addComment(commentText);
    if (ok) setCommentText("");
  };

  const handleStamp = async (stamp: string) => {
    const ok = await addStampComment(stamp);
    if (ok) setShowStamps(false);
  };

  const handlePressStart = (commentId: string) => {
    longPressTimer.current = window.setTimeout(() => {
      setReactionTarget(commentId);
      setReactionExpanded(false);
    }, 450);
  };
  const handlePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleReaction = async (commentId: string, emoji: string) => {
    await toggleCommentReaction(commentId, emoji);
    setReactionTarget(null);
    setReactionExpanded(false);
  };

  return (
    <div className="post-detail-content">
      {/* 上部:固定 */}
      <div className="post-detail-fixed">
        <button className="post-detail-back" onClick={() => navigate("/board")}>
          <i className="ti ti-arrow-left" /> 掲示板に戻る
        </button>

        <div className="post-detail-main">
          <div className="post-detail-top">
            <span className={`board-cat ${categoryClass(post.category)}`}>{post.category}</span>
            {post.resolved && <span className="post-detail-resolved">解決済み</span>}
          </div>

          <h2 className="post-detail-title">{post.title}</h2>

          <div className="post-detail-meta">
            <span><i className="ti ti-user" /> {authorName}</span>
            <span><i className="ti ti-clock" /> {post.createdAt.slice(0, 10)}</span>
          </div>

          <p className="post-detail-body">{post.body}</p>

          {isMyPost && (
            <div className="post-detail-owner-actions">
              <button className="post-detail-resolve-btn" onClick={toggleResolved}>
                <i className={`ti ${post.resolved ? "ti-rotate" : "ti-circle-check"}`} />
                {post.resolved ? "未解決に戻す" : "解決済みにする"}
              </button>
              <button
                className="post-detail-delete-btn"
                onClick={() => deletePost(() => navigate("/board"))}
              >
                <i className="ti ti-trash" /> 削除
              </button>
            </div>
          )}

          {post.resolved && (
            <p className="post-detail-resolved-note">
              <i className="ti ti-info-circle" /> 解決済みの投稿は、1週間後に自動的に削除されます。
            </p>
          )}
        </div>

        <p className="post-detail-comments-title">コメント({comments.length})</p>
      </div>

      {/* コメント一覧:ここだけスクロール */}
      <div className="post-detail-comment-scroll">
        {comments.length === 0 ? (
          <p className="post-detail-no-comment">まだコメントはありません</p>
        ) : (
          <div className="post-detail-comment-list">
            {comments.map((c) => {
              const reactionEntries = Object.entries(c.reactions);
              return (
                <div key={c.id} className="post-detail-comment">
                  <div className="post-detail-comment-avatar">{c.authorName.charAt(0)}</div>
                  <div className="post-detail-comment-body">
                    <div className="post-detail-comment-head">
                      <span className="post-detail-comment-author">{c.authorName}</span>
                      <span className="post-detail-comment-date">{c.createdAt.slice(0, 10)}</span>
                      {c.isMine && (
                        <button
                          className="post-detail-comment-delete"
                          onClick={() => deleteComment(c.id)}
                          aria-label="コメントを削除"
                        >
                          <i className="ti ti-x" />
                        </button>
                      )}
                    </div>

                    <div
                      className="post-detail-comment-pressable"
                      onTouchStart={() => handlePressStart(c.id)}
                      onTouchEnd={handlePressEnd}
                      onTouchMove={handlePressEnd}
                    >
                      {c.type === "stamp" ? (
                        isImageStamp(c.stamp) ? (
                          <img className="post-detail-comment-stamp-img" src={c.stamp} alt="スタンプ" />
                        ) : (
                          <span className="post-detail-comment-stamp-emoji">{c.stamp}</span>
                        )
                      ) : (
                        <p className="post-detail-comment-text">{c.body}</p>
                      )}
                      <button
                        className="post-detail-react-add"
                        onClick={() => {
                          setReactionTarget(c.id);
                          setReactionExpanded(false);
                        }}
                        aria-label="リアクション"
                      >
                        <i className="ti ti-mood-plus" />
                      </button>
                    </div>

                    {reactionEntries.length > 0 && (
                      <div className="post-detail-reactions">
                        {reactionEntries.map(([emoji, ids]) => {
                          const mine = member ? ids.includes(member.id) : false;
                          return (
                            <button
                              key={emoji}
                              className={`post-detail-reaction ${mine ? "mine" : ""}`}
                              onClick={() => toggleCommentReaction(c.id, emoji)}
                            >
                              {isImageStamp(emoji) ? (
                                <img src={emoji} alt="" className="post-detail-reaction-img" />
                              ) : (
                                <span>{emoji}</span>
                              )}
                              <span className="post-detail-reaction-count">{ids.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {reactionTarget === c.id && (
                      <div className="post-detail-react-picker">
                        {!reactionExpanded ? (
                          <>
                            {quickReactions.map((emoji) => (
                              <button
                                key={emoji}
                                className="post-detail-react-option"
                                onClick={() => handleReaction(c.id, emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                            <button
                              className="post-detail-react-more"
                              onClick={() => setReactionExpanded(true)}
                              aria-label="もっと見る"
                            >
                              <i className="ti ti-plus" />
                            </button>
                          </>
                        ) : (
                          <div className="post-detail-react-full">
                            {emojiStamps.map((emoji) => (
                              <button
                                key={emoji}
                                className="post-detail-react-option"
                                onClick={() => handleReaction(c.id, emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                            {imageStamps.map((s) => (
                              <button
                                key={s}
                                className="post-detail-react-option img"
                                onClick={() => handleReaction(c.id, s)}
                              >
                                <img src={s} alt="スタンプ" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 下部:固定 */}
      <div className="post-detail-bottom">
        {showStamps && (
          <div className="post-detail-stamp-picker">
            {imageStamps.length > 0 && (
              <div className="post-detail-stamp-section">
                <p className="post-detail-stamp-section-title">スタンプ</p>
                <div className="post-detail-stamp-grid">
                  {imageStamps.map((s) => (
                    <button key={s} className="post-detail-stamp-item" onClick={() => handleStamp(s)}>
                      <img src={s} alt="スタンプ" className="post-detail-stamp-item-img" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="post-detail-stamp-section">
              <p className="post-detail-stamp-section-title">絵文字</p>
              <div className="post-detail-stamp-grid">
                {emojiStamps.map((e) => (
                  <button
                    key={e}
                    className="post-detail-stamp-item emoji"
                    onClick={() => handleStamp(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="post-detail-comment-input-row">
          <button
            className={`post-detail-stamp-btn ${showStamps ? "active" : ""}`}
            onClick={() => setShowStamps((v) => !v)}
            aria-label="スタンプ"
          >
            <i className="ti ti-mood-smile" />
          </button>
          <textarea
            className="post-detail-comment-input"
            placeholder="コメントを入力"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onFocus={() => setShowStamps(false)}
            rows={2}
          />
          <button
            className="post-detail-comment-send"
            onClick={handleComment}
            disabled={submitting || !commentText.trim()}
          >
            送信
          </button>
        </div>
      </div>

      {/* オーバーレイ */}
      {reactionTarget && (
        <div
          className="post-detail-react-overlay"
          onClick={() => {
            setReactionTarget(null);
            setReactionExpanded(false);
          }}
        />
      )}
    </div>
  );
}
import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./postDetailScreen.css";
import { usePostDetail } from "./usePostDetail";
import { useAuth } from "../../lib/AuthContext";
import { emojiStamps, imageStamps, quickReactions } from "../../lib/stamps";
import { buildAnonLabelMap, anonAvatarColorId } from "../../lib/anon";
import MemberAvatar from "../Layout/MemberAvatar";

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
  const { member, memberMap } = useAuth();
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
  const [reactionListTarget, setReactionListTarget] = useState<{ id: string; emoji: string } | null>(null);
  const [reactionGroupTarget, setReactionGroupTarget] = useState<string | null>(null);
  const reactionLongPressTimer = useRef<number | null>(null);
  const reactionLongPressFired = useRef(false);
  const messageLongPressTimer = useRef<number | null>(null);
  const messageLongPressFired = useRef(false);

  // リアクション追加パネルの外側をタップしたら閉じる(チャット画面と同じ挙動に統一)
  useEffect(() => {
    if (!reactionTarget) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".post-detail-react-picker") || t.closest(".post-detail-comment-pressable")) return;
      setReactionTarget(null);
      setReactionExpanded(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("click", onDocClick);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", onDocClick);
    };
  }, [reactionTarget]);

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

  // 匿名スレッドの場合、コメントの投稿者ごとに「匿名A」「匿名B」...のラベルを割り振る
  const anonLabelMap = post.isAnonymous ? buildAnonLabelMap(comments) : {};

  const commentDisplayName = (c: (typeof comments)[number]) => {
    if (!post.isAnonymous) return c.authorName;
    const label = anonLabelMap[c.authorId] ?? "匿名";
    return c.isMine ? `${label}（あなた）` : label;
  };

  const commentAvatarLabel = (c: (typeof comments)[number]) => {
    if (!post.isAnonymous) return c.authorName.charAt(0);
    return (anonLabelMap[c.authorId] ?? "匿名").slice(-1);
  };

  const commentAvatarColor = (c: (typeof comments)[number]) => {
    if (!post.isAnonymous) return memberMap[c.authorId]?.avatarColor;
    return anonAvatarColorId(anonLabelMap[c.authorId] ?? "匿名");
  };

  // 匿名スレッドではアバター画像を使わない。実名が推測されるため
  // (アイコンカラーを使わないのと同じ理由)
  const commentAvatarThumb = (c: (typeof comments)[number]) =>
    post.isAnonymous ? undefined : memberMap[c.authorId]?.avatarThumb;

  const handleComment = async () => {
    const ok = await addComment(commentText);
    if (ok) setCommentText("");
  };

  const handleStamp = async (stamp: string) => {
    const ok = await addStampComment(stamp);
    if (ok) setShowStamps(false);
  };

  const handleReaction = async (commentId: string, emoji: string) => {
    await toggleCommentReaction(commentId, emoji);
    setReactionTarget(null);
    setReactionExpanded(false);
  };

  // リアクション済みの人一覧を表示するための長押し判定(タップだけならリアクションの付け外し)
  const handleReactionPressStart = (commentId: string, emoji: string) => {
    reactionLongPressFired.current = false;
    reactionLongPressTimer.current = window.setTimeout(() => {
      reactionLongPressFired.current = true;
      setReactionListTarget({ id: commentId, emoji });
    }, 450);
  };
  const handleReactionPressEnd = () => {
    if (reactionLongPressTimer.current) {
      clearTimeout(reactionLongPressTimer.current);
      reactionLongPressTimer.current = null;
    }
  };
  const handleReactionClick = (commentId: string, emoji: string) => {
    if (reactionLongPressFired.current) {
      reactionLongPressFired.current = false;
      return;
    }
    toggleCommentReaction(commentId, emoji);
  };

  // 本文を長押し:リアクションの種類ごとに付けた人を一覧表示(タップならリアクション追加パネルを開く)
  const handleMessagePressStart = (commentId: string) => {
    messageLongPressFired.current = false;
    messageLongPressTimer.current = window.setTimeout(() => {
      messageLongPressFired.current = true;
      setReactionGroupTarget(commentId);
    }, 450);
  };
  const handleMessagePressEnd = () => {
    if (messageLongPressTimer.current) {
      clearTimeout(messageLongPressTimer.current);
      messageLongPressTimer.current = null;
    }
  };
  const handleMessageClick = (commentId: string) => {
    if (messageLongPressFired.current) {
      messageLongPressFired.current = false;
      return;
    }
    setReactionTarget((prev) => (prev === commentId ? null : commentId));
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
            {post.isAnonymous && <span className="post-detail-anon-badge">匿名スレッド</span>}
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
              const isPickerOpen = reactionTarget === c.id;
              return (
                <div
                  key={c.id}
                  className={`post-detail-comment ${isPickerOpen ? "picker-open" : ""}`}
                >
                  <MemberAvatar
                    name={c.authorName}
                    label={commentAvatarLabel(c)}
                    avatarColor={commentAvatarColor(c)}
                    avatarThumb={commentAvatarThumb(c)}
                    className="post-detail-comment-avatar"
                  />
                  <div className="post-detail-comment-body">
                    <div className="post-detail-comment-head">
                      <span className="post-detail-comment-author">{commentDisplayName(c)}</span>
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
                      onClick={() => handleMessageClick(c.id)}
                      onTouchStart={() => handleMessagePressStart(c.id)}
                      onTouchEnd={handleMessagePressEnd}
                      onTouchMove={handleMessagePressEnd}
                      onMouseDown={() => handleMessagePressStart(c.id)}
                      onMouseUp={handleMessagePressEnd}
                      onMouseLeave={handleMessagePressEnd}
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
                    </div>

                    {reactionEntries.length > 0 && (
                      <div className="post-detail-reactions">
                        {reactionEntries.map(([emoji, ids]) => {
                          const mine = member ? ids.includes(member.id) : false;
                          return (
                            <button
                              key={emoji}
                              className={`post-detail-reaction ${mine ? "mine" : ""}`}
                              onClick={() => handleReactionClick(c.id, emoji)}
                              onTouchStart={() => handleReactionPressStart(c.id, emoji)}
                              onTouchEnd={handleReactionPressEnd}
                              onTouchMove={handleReactionPressEnd}
                              onMouseDown={() => handleReactionPressStart(c.id, emoji)}
                              onMouseUp={handleReactionPressEnd}
                              onMouseLeave={handleReactionPressEnd}
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

                    {isPickerOpen && (
                      <div
                        className="post-detail-react-picker"
                        onClick={(e) => e.stopPropagation()}
                      >
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


      {/* リアクションした人の一覧(長押しで表示) */}
      {reactionListTarget && (() => {
        const targetComment = comments.find((cc) => cc.id === reactionListTarget.id);
        const ids = targetComment?.reactions[reactionListTarget.emoji] ?? [];
        return (
          <>
            <div
              className="post-detail-reaction-list-overlay"
              onClick={() => setReactionListTarget(null)}
            />
            <div className="post-detail-reaction-list-modal" role="dialog" aria-label="リアクションした人">
              <div className="post-detail-reaction-list-head">
                <span className="post-detail-reaction-list-emoji">
                  {isImageStamp(reactionListTarget.emoji) ? (
                    <img src={reactionListTarget.emoji} alt="" className="post-detail-reaction-list-emoji-img" />
                  ) : (
                    reactionListTarget.emoji
                  )}
                </span>
                <span className="post-detail-reaction-list-title">リアクションした人({ids.length})</span>
                <button
                  className="post-detail-reaction-list-close"
                  onClick={() => setReactionListTarget(null)}
                  aria-label="閉じる"
                >
                  <i className="ti ti-x" />
                </button>
              </div>
              <div className="post-detail-reaction-list-body">
                {ids.length === 0 ? (
                  <p className="post-detail-reaction-list-empty">リアクションした人がいません</p>
                ) : (
                  ids.map((id) => {
                    const mb = memberMap[id];
                    return (
                      <div key={id} className="post-detail-reaction-list-item">
                        <span>
                          {mb ? mb.name : "不明なメンバー"}
                          {mb?.nickname && `（${mb.nickname}）`}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* リアクション一覧(種類ごと、本文を長押しで表示) */}
      {reactionGroupTarget && (() => {
        const targetComment = comments.find((cc) => cc.id === reactionGroupTarget);
        const entries = targetComment ? Object.entries(targetComment.reactions) : [];
        return (
          <>
            <div
              className="post-detail-reaction-group-overlay"
              onClick={() => setReactionGroupTarget(null)}
            />
            <div className="post-detail-reaction-group-modal" role="dialog" aria-label="リアクション一覧">
              <div className="post-detail-reaction-group-head">
                <span className="post-detail-reaction-group-title">リアクション一覧</span>
                <button
                  className="post-detail-reaction-group-close"
                  onClick={() => setReactionGroupTarget(null)}
                  aria-label="閉じる"
                >
                  <i className="ti ti-x" />
                </button>
              </div>
              <div className="post-detail-reaction-group-body">
                {entries.length === 0 ? (
                  <p className="post-detail-reaction-group-empty">まだリアクションがありません</p>
                ) : (
                  entries.map(([emoji, ids]) => (
                    <div key={emoji} className="post-detail-reaction-group-section">
                      <div className="post-detail-reaction-group-section-head">
                        <span className="post-detail-reaction-group-section-emoji">
                          {isImageStamp(emoji) ? (
                            <img src={emoji} alt="" className="post-detail-reaction-group-section-emoji-img" />
                          ) : (
                            emoji
                          )}
                        </span>
                        <span className="post-detail-reaction-group-section-count">{ids.length}人</span>
                      </div>
                      <div className="post-detail-reaction-group-section-list">
                        {ids.map((id) => {
                          const mb = memberMap[id];
                          return (
                            <span key={id} className="post-detail-reaction-group-name">
                              {mb ? mb.name : "不明なメンバー"}
                              {mb?.nickname && `（${mb.nickname}）`}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
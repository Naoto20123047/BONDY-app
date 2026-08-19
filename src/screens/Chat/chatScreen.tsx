import { useState, useRef, useEffect, Fragment } from "react";
import "./chatScreen.css";
import { useChat } from "./useChat";
import { emojiStamps, imageStamps, quickReactions } from "../../lib/stamps";
import { useAuth } from "../../lib/AuthContext";

const isImageStamp = (s: string) => s.startsWith("/");

export default function ChatScreen() {
  const { messages, loading, sending, sendMessage, sendStamp, toggleReaction } = useChat();
  const { member, memberMap } = useAuth();
  const [text, setText] = useState("");
  const [showStamps, setShowStamps] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [reactionExpanded, setReactionExpanded] = useState(false);
  const [reactionListTarget, setReactionListTarget] = useState<{ id: string; emoji: string } | null>(null);
  const [reactionGroupTarget, setReactionGroupTarget] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  const reactionLongPressTimer = useRef<number | null>(null);
  const reactionLongPressFired = useRef(false);
  const messageLongPressTimer = useRef<number | null>(null);
  const messageLongPressFired = useRef(false);

  useEffect(() => {
    if (messages.length > prevCount.current && !reactionTarget) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
    prevCount.current = messages.length;
  }, [messages, reactionTarget]);

  useEffect(() => {
    if (!reactionTarget) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".chat-react-picker") || t.closest(".chat-msg-pressable")) return;
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

  const handleSend = async () => {
    const ok = await sendMessage(text);
    if (ok) setText("");
  };

  const handleStamp = async (stamp: string) => {
    const ok = await sendStamp(stamp);
    if (ok) setShowStamps(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    await toggleReaction(messageId, emoji);
    setReactionTarget(null);
    setReactionExpanded(false);
  };

  // リアクション済みの人一覧を表示するための長押し判定(タップだけならリアクションの付け外し)
  const handleReactionPressStart = (messageId: string, emoji: string) => {
    reactionLongPressFired.current = false;
    reactionLongPressTimer.current = window.setTimeout(() => {
      reactionLongPressFired.current = true;
      setReactionListTarget({ id: messageId, emoji });
    }, 450);
  };
  const handleReactionPressEnd = () => {
    if (reactionLongPressTimer.current) {
      clearTimeout(reactionLongPressTimer.current);
      reactionLongPressTimer.current = null;
    }
  };
  const handleReactionClick = (messageId: string, emoji: string) => {
    if (reactionLongPressFired.current) {
      reactionLongPressFired.current = false;
      return;
    }
    toggleReaction(messageId, emoji);
  };

  // 本文を長押し:リアクションの種類ごとに付けた人を一覧表示(タップならリアクション追加パネルを開く)
  const handleMessagePressStart = (messageId: string) => {
    messageLongPressFired.current = false;
    messageLongPressTimer.current = window.setTimeout(() => {
      messageLongPressFired.current = true;
      setReactionGroupTarget(messageId);
    }, 450);
  };
  const handleMessagePressEnd = () => {
    if (messageLongPressTimer.current) {
      clearTimeout(messageLongPressTimer.current);
      messageLongPressTimer.current = null;
    }
  };
  const handleMessageClick = (messageId: string) => {
    if (messageLongPressFired.current) {
      messageLongPressFired.current = false;
      return;
    }
    setReactionTarget((prev) => (prev === messageId ? null : messageId));
    setReactionExpanded(false);
  };

  return (
    <div className="chat-content">
      <div className="chat-header">
        <h2 className="chat-title">チャット</h2>
      </div>

      <div className="chat-messages">
        {loading ? (
          <p className="chat-loading">読み込み中...</p>
        ) : messages.length === 0 ? (
          <p className="chat-empty">まだメッセージはありません。最初の投稿をしてみましょう。</p>
        ) : (
          messages.map((m, i) => {
            const showDate =
              i === 0 || formatDate(messages[i - 1].createdAt) !== formatDate(m.createdAt);
            const reactionEntries = Object.entries(m.reactions);
            const isPickerOpen = reactionTarget === m.id;
            // 最後の2件はパネルを上向きに出す
            const isNearBottom = i >= messages.length - 2;
            return (
              <Fragment key={m.id}>
                {showDate && (
                  <div className="chat-date-divider">
                    <span>{formatDate(m.createdAt)}</span>
                  </div>
                )}
                <div
                  className={`chat-msg ${m.isMine ? "mine" : "other"} ${
                    isPickerOpen ? "picker-open" : ""
                  }`}
                >
                  {!m.isMine && <span className="chat-msg-sender">{m.senderName}</span>}
                  <div className="chat-msg-row">
                    <div
                      className="chat-msg-pressable"
                      onClick={() => handleMessageClick(m.id)}
                      onTouchStart={() => handleMessagePressStart(m.id)}
                      onTouchEnd={handleMessagePressEnd}
                      onTouchMove={handleMessagePressEnd}
                      onMouseDown={() => handleMessagePressStart(m.id)}
                      onMouseUp={handleMessagePressEnd}
                      onMouseLeave={handleMessagePressEnd}
                    >
                      {m.type === "stamp" ? (
                        isImageStamp(m.stamp) ? (
                          <img className="chat-stamp-img" src={m.stamp} alt="スタンプ" />
                        ) : (
                          <span className="chat-stamp-emoji">{m.stamp}</span>
                        )
                      ) : (
                        <div className="chat-bubble">{m.text}</div>
                      )}
                    </div>
                    <span className="chat-msg-time">{formatTime(m.createdAt)}</span>
                  </div>

                  {reactionEntries.length > 0 && (
                    <div className="chat-reactions">
                      {reactionEntries.map(([emoji, ids]) => {
                        const mine = member ? ids.includes(member.id) : false;
                        return (
                          <button
                            key={emoji}
                            className={`chat-reaction ${mine ? "mine" : ""}`}
                            onClick={() => handleReactionClick(m.id, emoji)}
                            onTouchStart={() => handleReactionPressStart(m.id, emoji)}
                            onTouchEnd={handleReactionPressEnd}
                            onTouchMove={handleReactionPressEnd}
                            onMouseDown={() => handleReactionPressStart(m.id, emoji)}
                            onMouseUp={handleReactionPressEnd}
                            onMouseLeave={handleReactionPressEnd}
                          >
                            {isImageStamp(emoji) ? (
                              <img src={emoji} alt="" className="chat-reaction-img" />
                            ) : (
                              <span>{emoji}</span>
                            )}
                            <span className="chat-reaction-count">{ids.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {isPickerOpen && (
                    <div
                      className={`chat-react-picker ${isNearBottom ? "upward" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {!reactionExpanded ? (
                        <>
                          {quickReactions.map((emoji) => (
                            <button
                              key={emoji}
                              className="chat-react-option"
                              onClick={() => handleReaction(m.id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            className="chat-react-more"
                            onClick={() => setReactionExpanded(true)}
                            aria-label="もっと見る"
                          >
                            <i className="ti ti-plus" />
                          </button>
                        </>
                      ) : (
                        <div className="chat-react-full">
                          {emojiStamps.map((emoji) => (
                            <button
                              key={emoji}
                              className="chat-react-option"
                              onClick={() => handleReaction(m.id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                          {imageStamps.map((s) => (
                            <button
                              key={s}
                              className="chat-react-option img"
                              onClick={() => handleReaction(m.id, s)}
                            >
                              <img src={s} alt="スタンプ" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {showStamps && (
        <div className="chat-stamp-picker">
          {imageStamps.length > 0 && (
            <div className="chat-stamp-section">
              <p className="chat-stamp-section-title">スタンプ</p>
              <div className="chat-stamp-grid">
                {imageStamps.map((s) => (
                  <button key={s} className="chat-stamp-item" onClick={() => handleStamp(s)}>
                    <img src={s} alt="スタンプ" className="chat-stamp-item-img" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="chat-stamp-section">
            <p className="chat-stamp-section-title">絵文字</p>
            <div className="chat-stamp-grid">
              {emojiStamps.map((e) => (
                <button
                  key={e}
                  className="chat-stamp-item emoji"
                  onClick={() => handleStamp(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="chat-input-bar">
        <button
          className={`chat-stamp-btn ${showStamps ? "active" : ""}`}
          onClick={() => setShowStamps((v) => !v)}
          aria-label="スタンプ"
        >
          <i className="ti ti-mood-smile" />
        </button>
        <textarea
          className="chat-input"
          placeholder="メッセージを入力"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowStamps(false)}
          rows={1}
        />
        <button
          className="chat-send"
          onClick={handleSend}
          disabled={sending || !text.trim()}
        >
          <i className="ti ti-send" />
        </button>
      </div>

      {/* リアクションした人の一覧(長押しで表示) */}
      {reactionListTarget && (() => {
        const targetMessage = messages.find((mm) => mm.id === reactionListTarget.id);
        const ids = targetMessage?.reactions[reactionListTarget.emoji] ?? [];
        return (
          <>
            <div
              className="chat-reaction-list-overlay"
              onClick={() => setReactionListTarget(null)}
            />
            <div className="chat-reaction-list-modal" role="dialog" aria-label="リアクションした人">
              <div className="chat-reaction-list-head">
                <span className="chat-reaction-list-emoji">
                  {isImageStamp(reactionListTarget.emoji) ? (
                    <img src={reactionListTarget.emoji} alt="" className="chat-reaction-list-emoji-img" />
                  ) : (
                    reactionListTarget.emoji
                  )}
                </span>
                <span className="chat-reaction-list-title">リアクションした人({ids.length})</span>
                <button
                  className="chat-reaction-list-close"
                  onClick={() => setReactionListTarget(null)}
                  aria-label="閉じる"
                >
                  <i className="ti ti-x" />
                </button>
              </div>
              <div className="chat-reaction-list-body">
                {ids.length === 0 ? (
                  <p className="chat-reaction-list-empty">リアクションした人がいません</p>
                ) : (
                  ids.map((id) => {
                    const mb = memberMap[id];
                    return (
                      <div key={id} className="chat-reaction-list-item">
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
        const targetMessage = messages.find((mm) => mm.id === reactionGroupTarget);
        const entries = targetMessage ? Object.entries(targetMessage.reactions) : [];
        return (
          <>
            <div
              className="chat-reaction-group-overlay"
              onClick={() => setReactionGroupTarget(null)}
            />
            <div className="chat-reaction-group-modal" role="dialog" aria-label="リアクション一覧">
              <div className="chat-reaction-group-head">
                <span className="chat-reaction-group-title">リアクション一覧</span>
                <button
                  className="chat-reaction-group-close"
                  onClick={() => setReactionGroupTarget(null)}
                  aria-label="閉じる"
                >
                  <i className="ti ti-x" />
                </button>
              </div>
              <div className="chat-reaction-group-body">
                {entries.length === 0 ? (
                  <p className="chat-reaction-group-empty">まだリアクションがありません</p>
                ) : (
                  entries.map(([emoji, ids]) => (
                    <div key={emoji} className="chat-reaction-group-section">
                      <div className="chat-reaction-group-section-head">
                        <span className="chat-reaction-group-section-emoji">
                          {isImageStamp(emoji) ? (
                            <img src={emoji} alt="" className="chat-reaction-group-section-emoji-img" />
                          ) : (
                            emoji
                          )}
                        </span>
                        <span className="chat-reaction-group-section-count">{ids.length}人</span>
                      </div>
                      <div className="chat-reaction-group-section-list">
                        {ids.map((id) => {
                          const mb = memberMap[id];
                          return (
                            <span key={id} className="chat-reaction-group-name">
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
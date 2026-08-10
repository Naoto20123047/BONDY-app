import { useState, useRef, useEffect, Fragment } from "react";
import "./chatScreen.css";
import { useChat } from "./useChat";
import { emojiStamps, imageStamps, quickReactions } from "../../lib/stamps";
import { useAuth } from "../../lib/AuthContext";

const isImageStamp = (s: string) => s.startsWith("/");

export default function ChatScreen() {
  const { messages, loading, sending, sendMessage, sendStamp, toggleReaction } = useChat();
  const { member } = useAuth();
  const [text, setText] = useState("");
  const [showStamps, setShowStamps] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [reactionExpanded, setReactionExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

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
                      onClick={() => {
                        setReactionTarget((prev) => (prev === m.id ? null : m.id));
                        setReactionExpanded(false);
                      }}
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
                            onClick={() => toggleReaction(m.id, emoji)}
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
    </div>
  );
}
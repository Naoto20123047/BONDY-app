import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./bandDetailScreen.css";
import { useBandDetail } from "./useBandDetail";
import { useAuth } from "../../lib/AuthContext";

export default function BandDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { member: currentMember } = useAuth();
  const {
    band,
    memberViews,
    addableMembers,
    filteredAddable,
    addKeyword,
    setAddKeyword,
    isMyBand,
    loading,
    addMember,
    removeMember,
    requestDissolve,
  } = useBandDetail(id);

  const [showAdd, setShowAdd] = useState(false);
  const [addId, setAddId] = useState("");
  const [addPart, setAddPart] = useState("");

  if (loading) {
    return <div className="band-detail-content">読み込み中...</div>;
  }

  if (!band) {
    return (
      <div className="band-detail-content">
        <p>バンドが見つかりませんでした。</p>
        <button className="band-detail-back" onClick={() => navigate("/bands")}>
          <i className="ti ti-arrow-left" /> バンド一覧に戻る
        </button>
      </div>
    );
  }

  const canEdit = isMyBand && band.status !== "解散申請中" && band.status !== "解散";

  const handleAdd = async () => {
    await addMember(addId, addPart);
    setAddId("");
    setAddPart("");
    setAddKeyword("");
    setShowAdd(false);
  };

  const selectedMember = addableMembers.find((m) => m.id === addId);

  return (
    <div className="band-detail-content">
      <button className="band-detail-back" onClick={() => navigate("/bands")}>
        <i className="ti ti-arrow-left" /> バンド一覧に戻る
      </button>

      <div className="band-detail-head">
        <h2 className="band-detail-name">{band.name}</h2>
        <span className={`band-detail-status status-${band.status}`}>{band.status}</span>
      </div>

      <div className="band-detail-section">
        <div className="band-detail-section-head">
          <p className="band-detail-label">メンバー({memberViews.length}名)</p>
          {canEdit && (
            <button className="band-detail-add-btn" onClick={() => setShowAdd((v) => !v)}>
              <i className="ti ti-user-plus" /> 追加
            </button>
          )}
        </div>

        {showAdd && canEdit && (
          <div className="band-detail-add-panel">
            <input
              className="band-detail-add-search"
              placeholder="名前・学籍番号で検索"
              value={addKeyword}
              onChange={(e) => setAddKeyword(e.target.value)}
            />

            {!addId ? (
              <div className="band-detail-candidates">
                {filteredAddable.length === 0 ? (
                  <p className="band-detail-candidates-empty">該当するメンバーがいません</p>
                ) : (
                  filteredAddable.slice(0, 8).map((m) => (
                    <button
                      key={m.id}
                      className="band-detail-candidate"
                      onClick={() => setAddId(m.id)}
                    >
                      <span className="band-detail-candidate-avatar">{m.name.charAt(0)}</span>
                      <span className="band-detail-candidate-info">
                        <span className="band-detail-candidate-name">{m.name}</span>
                        <span className="band-detail-candidate-meta">
                          {m.gradeLabel}・{m.faculty}・{m.studentId}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="band-detail-add-selected">
                <div className="band-detail-selected-info">
                  <span className="band-detail-candidate-avatar">
                    {selectedMember?.name.charAt(0)}
                  </span>
                  <span className="band-detail-candidate-info">
                    <span className="band-detail-candidate-name">{selectedMember?.name}</span>
                    <span className="band-detail-candidate-meta">
                      {selectedMember?.gradeLabel}・{selectedMember?.studentId}
                    </span>
                  </span>
                  <button
                    className="band-detail-selected-clear"
                    onClick={() => setAddId("")}
                    aria-label="選び直す"
                  >
                    <i className="ti ti-x" />
                  </button>
                </div>
                <div className="band-detail-add-row">
                  <input
                    className="band-detail-add-part"
                    placeholder="パート(例: Gt)"
                    value={addPart}
                    onChange={(e) => setAddPart(e.target.value)}
                  />
                  <button className="band-detail-add-submit" onClick={handleAdd}>
                    追加
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="band-detail-members">
          {memberViews.map((m) => (
            <div key={m.memberId} className="band-detail-member">
              <div className="band-detail-avatar">{m.name.charAt(0)}</div>
              <span className="band-detail-member-name">{m.name}</span>
              <span className="band-detail-member-part">{m.part}</span>
              {canEdit && (
                <button
                  className="band-detail-member-remove"
                  onClick={() => removeMember(m.memberId)}
                >
                  <i className="ti ti-logout" />
                  {m.memberId === currentMember?.id ? "脱退" : "外す"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isMyBand && band.status !== "解散申請中" && band.status !== "解散" && (
        <div className="band-detail-actions">
          <button className="band-detail-dissolve" onClick={requestDissolve}>
            <i className="ti ti-flag" /> 解散を申請
          </button>
        </div>
      )}

      {band.status === "解散申請中" && (
        <div className="band-detail-notice">
          このバンドは解散申請中です。幹部の承認をお待ちください。
        </div>
      )}
    </div>
  );
}
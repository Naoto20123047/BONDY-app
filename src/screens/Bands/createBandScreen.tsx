import { useNavigate } from "react-router-dom";
import "./createBandScreen.css";
import { useCreateBand } from "./useCreateBand";
import { formatParts } from "../../lib/parts";
import MemberAvatar from "../Layout/MemberAvatar";

export default function CreateBandScreen() {
  const navigate = useNavigate();
  const {
    name,
    setName,
    selected,
    availableMembers,
    addMember,
    removeMember,
    updatePart,
    loading,
    saving,
    save,
    currentMemberId,
  } = useCreateBand();

  if (loading) {
    return <div className="create-band-content">読み込み中...</div>;
  }

  return (
    <div className="create-band-content">
      <button className="create-band-back" onClick={() => navigate("/bands")}>
        <i className="ti ti-arrow-left" /> バンド一覧に戻る
      </button>

      <h2 className="create-band-title">バンド結成を申請</h2>

      <div className="create-band-field">
        <label className="create-band-label">バンド名</label>
        <input
          className="create-band-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: Sunset Drivers"
        />
      </div>

      <div className="create-band-field">
        <label className="create-band-label">メンバー</label>
        <div className="create-band-members">
          {selected.map((m) => (
            <div key={m.memberId} className="create-band-member">
              <MemberAvatar
                name={m.name}
                avatarColor={m.avatarColor}
                avatarThumb={m.avatarThumb}
                className="create-band-avatar"
              />
              <span className="create-band-member-name">
                {m.name}
                {m.memberId === currentMemberId && (
                  <span className="create-band-you">あなた</span>
                )}
              </span>
              <input
                className="create-band-part"
                value={m.part}
                onChange={(e) => updatePart(m.memberId, e.target.value)}
                placeholder="パート"
              />
              {m.memberId !== currentMemberId && (
                <button
                  className="create-band-remove"
                  onClick={() => removeMember(m.memberId)}
                >
                  <i className="ti ti-x" />
                </button>
              )}
            </div>
          ))}
        </div>

        {availableMembers.length > 0 && (
          <select
            className="create-band-add-select"
            value=""
            onChange={(e) => {
              if (e.target.value) addMember(e.target.value);
            }}
          >
            <option value="">+ メンバーを追加</option>
            {availableMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}({formatParts(m.parts)})
              </option>
            ))}
          </select>
        )}
      </div>

      <button
        className="create-band-save"
        onClick={() => save(() => navigate("/bands"))}
        disabled={saving}
      >
        {saving ? "申請中..." : "結成を申請する"}
      </button>
    </div>
  );
}
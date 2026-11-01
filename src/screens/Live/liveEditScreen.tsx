import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { hasOfficerRole } from "../../lib/roles";
import { createNotifications } from "../../lib/notify";
import {
  createLive,
  updateLive,
  fetchLive,
  fetchApprovedBands,
  memberIdsOfBands,
  formatDateShort,
  type LiveInput,
} from "../../lib/live";
import "./live.css";

const EMPTY: LiveInput = {
  title: "",
  date: "",
  venue: "",
  openTime: "17:30",
  startTime: "18:00",
  closeTime: "20:00",
  applyDeadline: "",
  submitDeadline: "",
  changeoverMinutes: 5,
};

/**
 * ライブの作成・編集(幹部)。
 * 作成すると、承認済みのすべてのバンドのメンバーに出演申し込みの案内が届く。
 */
export default function LiveEditScreen() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { member } = useAuth();
  const [input, setInput] = useState<LiveInput>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchLive(id).then((live) => {
      if (live) {
        setInput({
          title: live.title,
          date: live.date,
          venue: live.venue,
          openTime: live.openTime,
          startTime: live.startTime,
          closeTime: live.closeTime,
          applyDeadline: live.applyDeadline,
          submitDeadline: live.submitDeadline,
          changeoverMinutes: live.changeoverMinutes,
        });
      }
      setLoading(false);
    });
  }, [id]);

  if (!hasOfficerRole(member)) {
    return <div className="live-content">この画面は幹部のみ利用できます。</div>;
  }
  if (loading) return <div className="live-content">読み込み中...</div>;

  const set = <K extends keyof LiveInput>(key: K, value: LiveInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!input.title.trim()) return "ライブ名を入力してください。";
    if (!input.date) return "日付を入力してください。";
    if (!input.venue.trim()) return "会場を入力してください。";
    if (!input.openTime || !input.startTime || !input.closeTime) return "開場・開演・退館の時刻を入力してください。";
    if (input.startTime < input.openTime) return "開演は開場より後の時刻にしてください。";
    if (input.closeTime <= input.startTime) return "退館は開演より後の時刻にしてください。";
    if (!input.applyDeadline || !input.submitDeadline) return "2つの締切を入力してください。";
    if (input.submitDeadline < input.applyDeadline) return "セットリスト・機材の締切は、出演申し込みの締切より後にしてください。";
    if (input.submitDeadline > input.date) return "締切は開催日より前にしてください。";
    return null;
  };

  const handleSave = async () => {
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (!member) return;
    setSaving(true);
    try {
      const data = { ...input, title: input.title.trim(), venue: input.venue.trim() };
      if (isNew) {
        const liveId = await createLive(data, member.id);
        // 承認済みのすべてのバンドのメンバーに、出演申し込みの案内を送る
        const bands = await fetchApprovedBands();
        await createNotifications(
          memberIdsOfBands(bands),
          "live_update",
          `「${data.title}」の出演申し込みが始まりました(締切 ${formatDateShort(data.applyDeadline)})`,
          `/live/${liveId}/apply`
        );
        navigate(`/live/${liveId}`, { replace: true });
      } else {
        await updateLive(id!, data);
        navigate(`/live/${id}`, { replace: true });
      }
    } catch (e) {
      console.error("ライブの保存に失敗しました", e);
      setError("保存に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="live-content">
      <button className="live-back" onClick={() => navigate(isNew ? "/live" : `/live/${id}`)}>
        <i className="ti ti-arrow-left" /> {isNew ? "ライブ一覧" : "ライブ詳細"}に戻る
      </button>
      <h2 className="live-title">{isNew ? "ライブを作成" : "ライブを編集"}</h2>

      <div className="live-form" style={{ marginTop: 16 }}>
        <label className="live-field full">
          <span className="live-label">ライブ名</span>
          <input className="live-input" value={input.title} onChange={(e) => set("title", e.target.value)} placeholder="冬ライブ 2026" />
        </label>
        <label className="live-field">
          <span className="live-label">日付</span>
          <input className="live-input" type="date" value={input.date} onChange={(e) => set("date", e.target.value)} />
        </label>
        <label className="live-field">
          <span className="live-label">会場</span>
          <input className="live-input" value={input.venue} onChange={(e) => set("venue", e.target.value)} />
        </label>
        <label className="live-field">
          <span className="live-label">開場</span>
          <input className="live-input" type="time" value={input.openTime} onChange={(e) => set("openTime", e.target.value)} />
        </label>
        <label className="live-field">
          <span className="live-label">開演</span>
          <input className="live-input" type="time" value={input.startTime} onChange={(e) => set("startTime", e.target.value)} />
        </label>
        <label className="live-field">
          <span className="live-label">退館時刻</span>
          <input className="live-input" type="time" value={input.closeTime} onChange={(e) => set("closeTime", e.target.value)} />
        </label>
        <div className="live-field">
          <span className="live-label">転換の時間</span>
          <div className="live-stepper">
            <button type="button" onClick={() => set("changeoverMinutes", Math.max(0, input.changeoverMinutes - 1))}>−</button>
            <span>{input.changeoverMinutes}分</span>
            <button type="button" onClick={() => set("changeoverMinutes", input.changeoverMinutes + 1)}>＋</button>
          </div>
        </div>
        <label className="live-field">
          <span className="live-label">出演申し込みの締切</span>
          <input className="live-input" type="date" value={input.applyDeadline} onChange={(e) => set("applyDeadline", e.target.value)} />
        </label>
        <label className="live-field">
          <span className="live-label">セットリスト・機材の締切</span>
          <input className="live-input" type="date" value={input.submitDeadline} onChange={(e) => set("submitDeadline", e.target.value)} />
        </label>
      </div>

      {error && <p className="live-error" style={{ marginTop: 16 }}>{error}</p>}

      {isNew && (
        <p className="live-note">保存すると、承認済みのすべてのバンドに出演申し込みの案内が届きます。</p>
      )}
      <div className="live-actions">
        <button className="live-btn wide" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : isNew ? "保存して申し込みを受け付ける" : "保存する"}
        </button>
      </div>
    </div>
  );
}

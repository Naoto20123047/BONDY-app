import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { PART_OPTIONS, togglePart } from "../../lib/parts";
import "./profileSetupScreen.css";

// 開志専門職大学の学部
const FACULTIES = ["事業創造学部", "情報学部", "アニメ・マンガ学部"];

interface ProfileSetupScreenProps {
  /** 紹介画面に戻る。加入フローから開かれたときだけ渡される */
  onBack?: () => void;
}

export default function ProfileSetupScreen({ onBack }: ProfileSetupScreenProps) {
  const { firebaseUser, refreshMember } = useAuth();

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [faculty, setFaculty] = useState("");
  const [studentId, setStudentId] = useState("");
  const [enrollmentYear, setEnrollmentYear] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // パートの選択をトグル(「なし」は他と排他)
  const toggle = (part: string) => {
    setParts((prev) => togglePart(prev, part));
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim() || !faculty || !studentId.trim() || !enrollmentYear) {
      setError("すべての必須項目を入力してください。");
      return;
    }
    if (parts.length === 0) {
      setError("パートを選択してください。担当がない場合は「なし」を選んでください。");
      return;
    }
    // 学籍番号は8桁の数字
    if (!/^\d{8}$/.test(studentId)) {
      setError("学籍番号は8桁の数字で入力してください。");
      return;
    }
    const year = Number(enrollmentYear);
    if (isNaN(year) || year < 2000 || year > 2100) {
      setError("入学年度を正しく入力してください(例: 2024)。");
      return;
    }
    if (!firebaseUser) {
      setError("認証情報が見つかりません。もう一度ログインしてください。");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, "members", firebaseUser.uid), {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? "",
        authMethod: "email",
        name: name.trim(),
        nickname: nickname.trim(),
        faculty,
        studentId: studentId.trim(),
        enrollmentYear: year,
        parts,
        role: "一般メンバー",
        positions: [],
        isOB: false,
        duesPaid: false,
        status: "active",
        // NEWバッジの判定に使う。今年度に加入した人だけバッジが出る
        joinedAt: new Date().toISOString().slice(0, 10),
      });
      await refreshMember();
    } catch (e) {
      console.error("プロフィール登録に失敗しました", e);
      setError("登録に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    await signOut(auth);
  };

  return (
    <div className="setup-page">
      <div className="setup-card">
        {onBack && (
          <button className="setup-back" onClick={onBack}>
            <i className="ti ti-arrow-left" /> 紹介に戻る
          </button>
        )}

        <h2 className="setup-title">プロフィール登録</h2>
        <p className="setup-desc">はじめに、あなたの情報を登録してください。</p>

        <div className="setup-field">
          <label className="setup-label">氏名</label>
          <input
            className="setup-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="山田太郎"
          />
        </div>

        <div className="setup-field">
          <label className="setup-label">
            ニックネーム
            <span className="setup-optional">任意</span>
          </label>
          <input
            className="setup-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="たろ"
            maxLength={20}
          />
          <p className="setup-note">名簿では「氏名(ニックネーム)」の形で表示されます</p>
        </div>

        <div className="setup-field">
          <label className="setup-label">学部</label>
          <select
            className="setup-input"
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
          >
            <option value="">選択してください</option>
            {FACULTIES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="setup-field">
          <label className="setup-label">学籍番号(8桁)</label>
          <input
            className="setup-input"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="24000001"
            inputMode="numeric"
            maxLength={8}
          />
        </div>

        <div className="setup-field">
          <label className="setup-label">入学年度</label>
          <input
            className="setup-input"
            type="number"
            value={enrollmentYear}
            onChange={(e) => setEnrollmentYear(e.target.value)}
            placeholder="2024"
          />
        </div>

        <div className="setup-field">
          <label className="setup-label">
            パート
            <span className="setup-optional multi">複数選択可</span>
          </label>
          <div className="setup-parts">
            {PART_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                className={`setup-part ${parts.includes(p) ? "selected" : ""}`}
                onClick={() => toggle(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="setup-note">
            担当が複数ある場合は、すべて選択してください
          </p>
        </div>

        {error && <p className="setup-error">{error}</p>}

        <button className="setup-save" onClick={handleSave} disabled={saving}>
          {saving ? "登録中..." : "登録して始める"}
        </button>

        <button className="setup-cancel" onClick={handleCancel}>
          キャンセル(ログアウト)
        </button>
      </div>
    </div>
  );
}
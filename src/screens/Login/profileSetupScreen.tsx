import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import "./profileSetupScreen.css";

// 開志専門職大学の学部
const FACULTIES = ["事業創造学部", "情報学部", "アニメ・マンガ学部"];

export default function ProfileSetupScreen() {
  const { firebaseUser, refreshMember } = useAuth();

  const [name, setName] = useState("");
  const [faculty, setFaculty] = useState("");
  const [studentId, setStudentId] = useState("");
  const [enrollmentYear, setEnrollmentYear] = useState("");
  const [part, setPart] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    if (!name.trim() || !faculty || !studentId.trim() || !enrollmentYear || !part.trim()) {
      setError("すべての項目を入力してください。");
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
        faculty,
        studentId: studentId.trim(),
        enrollmentYear: year,
        part: part.trim(),
        role: "一般メンバー",
        positions: [],
        isOB: false,
        duesPaid: false,
        status: "active",
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
          <label className="setup-label">パート</label>
          <input
            className="setup-input"
            value={part}
            onChange={(e) => setPart(e.target.value)}
            placeholder="Vo/Gt"
          />
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
import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { PART_OPTIONS, togglePart } from "../../lib/parts";
import { currentFiscalYear } from "../../lib/grade";
import { fetchOfficerIdsAsPending } from "../../lib/members";
import { createNotifications } from "../../lib/notify";
import type { MemberCategory } from "../../Types/types";
import "./profileSetupScreen.css";
import { todayString } from "../../lib/date";

// 開志専門職大学の学部
const FACULTIES = ["事業創造学部", "情報学部", "アニメ・マンガ学部"];

/** 在学生として登録できる大学のアドレス(firestore.rules と揃える) */
const UNIVERSITY_DOMAIN = "@kaishi-pu.ac.jp";

interface ProfileSetupScreenProps {
  /** 紹介画面に戻る。加入フローから開かれたときだけ渡される */
  onBack?: () => void;
}

/**
 * プロフィール登録。
 *
 * 区分(在学生・教員・OB)によって入力する項目が変わる。
 *  - 在学生: 学部・学籍番号・入学年度。大学のアドレスで登録した人だけが選べる
 *  - 教員:   追加の項目なし
 *  - OB:     卒業年度
 * 教員・OBは幹部の確認待ちで登録され、確認が済むまで一部の機能が使えない。
 */
export default function ProfileSetupScreen({ onBack }: ProfileSetupScreenProps) {
  const { firebaseUser, refreshMember } = useAuth();

  const isUniversityEmail = (firebaseUser?.email ?? "").toLowerCase().endsWith(UNIVERSITY_DOMAIN);

  const [category, setCategory] = useState<MemberCategory>(isUniversityEmail ? "在学生" : "教員");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [faculty, setFaculty] = useState("");
  const [studentId, setStudentId] = useState("");
  const [enrollmentYear, setEnrollmentYear] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 卒業年度の選択肢(今年度から30年分)
  const thisYear = currentFiscalYear();
  const graduationYears = Array.from({ length: 30 }, (_, i) => thisYear - i);

  // パートの選択をトグル(「なし」は他と排他)
  const toggle = (part: string) => {
    setParts((prev) => togglePart(prev, part));
  };

  /** 入力内容を確かめる。問題があれば文言を返す */
  const validate = (): string | null => {
    if (!name.trim()) return "氏名を入力してください。";
    if (parts.length === 0) {
      return "パートを選択してください。担当がない場合は「なし」を選んでください。";
    }
    if (category === "在学生") {
      if (!isUniversityEmail) {
        return "在学生として登録するには、大学のメールアドレスでアカウントを作成してください。";
      }
      if (!faculty || !studentId.trim() || !enrollmentYear) {
        return "すべての必須項目を入力してください。";
      }
      // 学籍番号は8桁の数字
      if (!/^\d{8}$/.test(studentId)) return "学籍番号は8桁の数字で入力してください。";
      const year = Number(enrollmentYear);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return "入学年度を正しく入力してください(例: 2024)。";
      }
    }
    if (category === "OB" && !graduationYear) return "卒業年度を選択してください。";
    return null;
  };

  const handleSave = async () => {
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (!firebaseUser) {
      setError("認証情報が見つかりません。もう一度ログインしてください。");
      return;
    }

    const isStudent = category === "在学生";

    setSaving(true);
    try {
      await setDoc(doc(db, "members", firebaseUser.uid), {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? "",
        authMethod: "email",
        name: name.trim(),
        nickname: nickname.trim(),
        category,
        // 教員・OBは学部・学籍番号・入学年度を持たない
        faculty: isStudent ? faculty : "",
        studentId: isStudent ? studentId.trim() : "",
        enrollmentYear: isStudent ? Number(enrollmentYear) : 0,
        ...(category === "OB" ? { graduationYear: Number(graduationYear) } : {}),
        parts,
        role: "一般メンバー",
        positions: [],
        isOB: category === "OB",
        duesPaid: false,
        status: "active",
        // 教員・OBは幹部の確認待ちで登録する
        ...(isStudent ? {} : { approved: false }),
        // NEWバッジの判定に使う。今年度に加入した人だけバッジが出る
        joinedAt: todayString(),
      });

      // 教員・OBは、幹部に確認を依頼する通知を送る(失敗しても登録は成立させる)
      if (!isStudent) {
        try {
          const officerIds = await fetchOfficerIdsAsPending();
          await createNotifications(
            officerIds,
            "approval_needed",
            `${name.trim()}さん(${category})が新しく登録しました。確認してください`,
            "/admin/approvals/members"
          );
        } catch (e) {
          console.error("幹部への通知に失敗しました", e);
        }
      }

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
          <label className="setup-label">区分</label>
          <div className="setup-parts">
            {(["在学生", "教員", "OB"] as MemberCategory[]).map((c) => (
              <button
                key={c}
                type="button"
                className={`setup-part ${category === c ? "selected" : ""}`}
                onClick={() => setCategory(c)}
                disabled={c === "在学生" && !isUniversityEmail}
              >
                {c}
              </button>
            ))}
          </div>
          {!isUniversityEmail && (
            <p className="setup-note">
              在学生は、大学のメールアドレス({UNIVERSITY_DOMAIN})で登録してください。
            </p>
          )}
          {category !== "在学生" && (
            <p className="setup-note">
              教員・OBは、幹部の確認が済むまで一部の機能が制限されます。
            </p>
          )}
        </div>

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

        {category === "在学生" && (
          <>
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
          </>
        )}

        {category === "OB" && (
          <div className="setup-field">
            <label className="setup-label">卒業年度</label>
            <select
              className="setup-input"
              value={graduationYear}
              onChange={(e) => setGraduationYear(e.target.value)}
            >
              <option value="">選択してください</option>
              {graduationYears.map((y) => (
                <option key={y} value={y}>{y}年度</option>
              ))}
            </select>
          </div>
        )}

        {category !== "在学生" && (
          <p className="setup-note">教員・OBは、学籍番号と学部の入力はありません。</p>
        )}

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

import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { calcGrade } from "../../lib/grade";
import "./reactivateScreen.css";

/**
 * 退会済みの人がログインしてきたときに出す画面。
 *
 * 退会は本人の意思なので締め出さない。Member ドキュメントが残っている限り、
 * ここから復帰すれば会費記録やバンド履歴もそのまま引き継がれる。
 * 幹部が「完全削除」した後はドキュメント自体が無いため、この画面には来ず、
 * プロフィール登録から新規メンバーとしてやり直すことになる。
 *
 * 除籍された人はこの画面に来ない(AuthContext でサインアウトされる)。
 */
export default function ReactivateScreen() {
  const { withdrawnMember, reactivate } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!withdrawnMember) return null;

  const handleReactivate = async () => {
    setError(null);
    setProcessing(true);
    try {
      await reactivate();
    } catch (e) {
      console.error("復帰処理に失敗しました", e);
      setError("復帰に失敗しました。時間をおいて再度お試しください。");
      setProcessing(false);
    }
  };

  return (
    <div className="reactivate-page">
      <div className="reactivate-card">
        <div className="reactivate-brand">
          <img src="/logo.png" alt="BONDY" className="reactivate-logo" />
          <span className="reactivate-brand-name">BONDYアプリ</span>
        </div>

        <h1 className="reactivate-heading">おかえりなさい</h1>
        <p className="reactivate-sub">
          このアカウントは退会済みです。復帰すると、以前の登録内容のまま再び利用できます。
        </p>

        <dl className="reactivate-info">
          <div className="reactivate-row">
            <dt>氏名</dt>
            <dd>{withdrawnMember.name}</dd>
          </div>
          <div className="reactivate-row">
            <dt>学部・学年</dt>
            <dd>
              {withdrawnMember.faculty}・
              {calcGrade(withdrawnMember.enrollmentYear, withdrawnMember.isOB)}
            </dd>
          </div>
          <div className="reactivate-row">
            <dt>学籍番号</dt>
            <dd>{withdrawnMember.studentId}</dd>
          </div>
          {withdrawnMember.withdrawnAt && (
            <div className="reactivate-row">
              <dt>退会日</dt>
              <dd>{withdrawnMember.withdrawnAt}</dd>
            </div>
          )}
        </dl>

        <p className="reactivate-note">
          所属していたバンドからは退会時に外れています。必要であれば、復帰後にあらためて追加してもらってください。
        </p>

        {error && <p className="reactivate-error">{error}</p>}

        <button
          className="reactivate-submit"
          onClick={handleReactivate}
          disabled={processing}
        >
          {processing ? "処理中..." : "復帰する"}
        </button>

        <button
          className="reactivate-cancel"
          onClick={() => signOut(auth)}
          disabled={processing}
        >
          復帰しない(ログアウト)
        </button>
      </div>
    </div>
  );
}

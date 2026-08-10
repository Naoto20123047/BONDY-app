import { useNavigate } from "react-router-dom";
import "./formsScreen.css";
import { useForms } from "./useForms";
import type { FormListItem } from "./useForms";

interface FormsScreenProps {
  isOfficer: boolean;
}

export default function FormsScreen({ isOfficer }: FormsScreenProps) {
  const navigate = useNavigate();
  const { pending, answered, expired, loading, deleteForm } = useForms();

  if (loading) {
    return <div className="forms-content">読み込み中...</div>;
  }

  // タイプのタグ(イベント=緑、アンケート=グレー)
  const typeTag = (type: string) => (
    <span className={`forms-tag ${type === "イベント" ? "event" : "survey"}`}>{type}</span>
  );

  // 幹部用のアクション(集計・削除)
  const officerActions = (f: FormListItem, withDelete = true) =>
    isOfficer && (
      <div className="forms-actions">
        <button
          className="forms-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/forms/${f.id}/results`);
          }}
        >
          <i className="ti ti-chart-bar" /> 集計
        </button>
        {withDelete && (
          <button
            className="forms-action-icon"
            aria-label="削除"
            onClick={(e) => {
              e.stopPropagation();
              deleteForm(f.id, f.title);
            }}
          >
            <i className="ti ti-trash" />
          </button>
        )}
      </div>
    );

  return (
    <div className="forms-content">
      <div className="forms-header">
        <h2 className="forms-title">フォーム</h2>
        {isOfficer && (
          <button className="forms-create" onClick={() => navigate("/forms/new")}>
            <i className="ti ti-plus" /> フォーム作成
          </button>
        )}
      </div>

      <div className="forms-columns">
        {/* 左:未回答 */}
        <div className="forms-col">
          <p className="forms-section-label">未回答</p>
          {pending.length === 0 ? (
            <p className="forms-empty">未回答のフォームはありません</p>
          ) : (
            <div className="forms-list">
              {pending.map((f) => (
                <div
                  key={f.id}
                  className="forms-card pending"
                  onClick={() => navigate(`/forms/${f.id}`)}
                >
                  <div className="forms-card-body">
                    <div className="forms-card-info">
                      <div className="forms-card-tags">{typeTag(f.type)}</div>
                      <p className="forms-card-title">{f.title}</p>
                      <div className="forms-card-deadline">
                        <i className="ti ti-clock" /> {f.deadline} 締切
                      </div>
                    </div>
                    {officerActions(f)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右:回答済み・締切済み */}
        <div className="forms-col">
          <p className="forms-section-label">回答済み</p>
          {answered.length === 0 ? (
            <p className="forms-empty">回答済みのフォームはありません</p>
          ) : (
            <div className="forms-list">
              {answered.map((f) => (
                <div
                  key={f.id}
                  className="forms-card done"
                  onClick={() => navigate(`/forms/${f.id}`)}
                >
                  <div className="forms-card-body">
                    <div className="forms-card-info">
                      <div className="forms-card-tags">
                        {typeTag(f.type)}
                        <span className="forms-answered">
                          <i className="ti ti-check" /> 回答済み
                        </span>
                      </div>
                      <p className="forms-card-title">{f.title}</p>
                    </div>
                    {officerActions(f)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {expired.length > 0 && (
            <>
              <p className="forms-section-label">締切済み(未回答)</p>
              <div className="forms-list">
                {expired.map((f) => (
                  <div key={f.id} className="forms-card expired">
                    <div className="forms-card-body">
                      <div className="forms-card-info">
                        <div className="forms-card-tags">
                          {typeTag(f.type)}
                          <span className="forms-expired-tag">締切済み</span>
                        </div>
                        <p className="forms-card-title">{f.title}</p>
                      </div>
                      {officerActions(f)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
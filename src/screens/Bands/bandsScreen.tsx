import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./bandsScreen.css";
import { useBands } from "./useBands";

export default function BandsScreen() {
  const navigate = useNavigate();
  const { bands, loading, exportBands } = useBands();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (loading) {
    return <div className="bands-content">読み込み中...</div>;
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(bands.map((b) => b.id));
  const clearAll = () => setSelectedIds([]);

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedIds([]);
  };

  const cancelSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const handleExport = () => {
    exportBands(selectedIds);
  };

  return (
    <div className="bands-content">
      <div className="bands-header">
        <h2 className="bands-title">バンド</h2>
        {!selectMode ? (
          <div className="bands-header-actions">
            <button className="bands-export-btn" onClick={enterSelectMode}>
              <i className="ti ti-file-spreadsheet" /> Excel出力
            </button>
            <button className="bands-create" onClick={() => navigate("/bands/new")}>
              <i className="ti ti-plus" /> 結成を申請
            </button>
          </div>
        ) : (
          <button className="bands-cancel-btn" onClick={cancelSelectMode}>
            キャンセル
          </button>
        )}
      </div>

      {selectMode && (
        <div className="bands-select-bar">
          <div className="bands-select-left">
            <button className="bands-select-action" onClick={selectAll}>
              全選択
            </button>
            <button className="bands-select-action" onClick={clearAll}>
              全解除
            </button>
            <span className="bands-select-count">{selectedIds.length}件選択中</span>
          </div>
          <button
            className="bands-export-run"
            onClick={handleExport}
            disabled={selectedIds.length === 0}
          >
            <i className="ti ti-download" /> 出力
          </button>
        </div>
      )}

      <div className="bands-list">
        {bands.length === 0 ? (
          <p className="bands-empty">バンドはまだありません</p>
        ) : (
          bands.map((b) =>
            selectMode ? (
              <div
                key={b.id}
                className={`bands-item selectable ${selectedIds.includes(b.id) ? "selected" : ""}`}
                onClick={() => toggleSelect(b.id)}
              >
                <div className="bands-checkbox">
                  {selectedIds.includes(b.id) && <i className="ti ti-check" />}
                </div>
                <div className="bands-item-main">
                  <span className="bands-item-name">{b.name}</span>
                  <span className="bands-item-count">{b.members.length}名</span>
                </div>
                <span className={`bands-status status-${b.status}`}>{b.status}</span>
              </div>
            ) : (
              <button
                key={b.id}
                className="bands-item"
                onClick={() => navigate(`/bands/${b.id}`)}
              >
                {/* PC:上段ステータス */}
                <div className="bands-item-top">
                  <span className={`bands-status status-${b.status}`}>{b.status}</span>
                  <i className="ti ti-chevron-right bands-chevron" />
                </div>

                <div className="bands-item-main">
                  <span className="bands-item-name">{b.name}</span>
                  <span className="bands-item-count">{b.members.length}名</span>
                </div>

                {/* PC:パート構成 */}
                <div className="bands-item-parts">
                  {b.members.length === 0 ? (
                    <span className="bands-part-empty">メンバーなし</span>
                  ) : (
                    b.members.map((m, i) => (
                      <span key={`${m.memberId}-${i}`} className="bands-part-tag">
                        {m.part}
                      </span>
                    ))
                  )}
                </div>

                {/* スマホ:右側のステータスと矢印 */}
                <div className="bands-item-right">
                  <span className={`bands-status status-${b.status}`}>{b.status}</span>
                  <i className="ti ti-chevron-right bands-chevron" />
                </div>
              </button>
            )
          )
        )}
      </div>
    </div>
  );
}
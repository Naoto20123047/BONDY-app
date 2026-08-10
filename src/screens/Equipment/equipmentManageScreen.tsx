import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./equipmentManageScreen.css";
import { useEquipmentManage, categories } from "./useEquipmentManage";
import type { Equipment, EquipmentCategory } from "../../Types/types";

interface FormState {
  name: string;
  category: EquipmentCategory;
  totalQuantity: number;
  lendable: boolean;
  note: string;
}

const emptyForm: FormState = {
  name: "",
  category: "スピーカー",
  totalQuantity: 1,
  lendable: true,
  note: "",
};

export default function EquipmentManageScreen() {
  const navigate = useNavigate();
  const { items, loading, addEquipment, updateEquipment, toggleLendable, deleteEquipment } =
    useEquipmentManage();

  const [editingId, setEditingId] = useState<string | null>(null); // null=新規, id=編集
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  if (loading) {
    return <div className="eqm-content">読み込み中...</div>;
  }

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (eq: Equipment) => {
    setEditingId(eq.id);
    setForm({
      name: eq.name,
      category: eq.category,
      totalQuantity: eq.totalQuantity,
      lendable: eq.lendable,
      note: eq.note ?? "",
    });
    setShowForm(true);
  };

  const save = () => {
    if (!form.name.trim()) {
      window.alert("機材名を入力してください。");
      return;
    }
    if (form.totalQuantity < 1) {
      window.alert("総台数は1以上にしてください。");
      return;
    }
    const data = {
      name: form.name,
      category: form.category,
      totalQuantity: form.totalQuantity,
      lendable: form.lendable,
      note: form.note || undefined,
    };
    if (editingId) {
      updateEquipment(editingId, data);
    } else {
      addEquipment(data);
    }
    setShowForm(false);
  };

  return (
    <div className="eqm-content">
      <button className="eqm-back" onClick={() => navigate("/equipment")}>
        <i className="ti ti-arrow-left" /> 機材一覧に戻る
      </button>

      <div className="eqm-header">
        <h2 className="eqm-title">機材台帳の管理</h2>
        <button className="eqm-add-btn" onClick={openAdd}>
          <i className="ti ti-plus" /> 機材を追加
        </button>
      </div>

      {showForm && (
        <div className="eqm-form">
          <p className="eqm-form-title">{editingId ? "機材を編集" : "機材を追加"}</p>
          <div className="eqm-field">
            <label className="eqm-label">機材名</label>
            <input
              className="eqm-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: Yamaha DBR15"
            />
          </div>
          <div className="eqm-form-row">
            <div className="eqm-field">
              <label className="eqm-label">種別</label>
              <select
                className="eqm-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as EquipmentCategory })}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="eqm-field">
              <label className="eqm-label">総台数</label>
              <input
                className="eqm-input"
                type="number"
                min={1}
                value={form.totalQuantity}
                onChange={(e) => setForm({ ...form, totalQuantity: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="eqm-field">
            <label className="eqm-label">備考(任意)</label>
            <input
              className="eqm-input"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="例: イベント用・持ち出し禁止"
            />
          </div>
          <label className="eqm-checkbox">
            <input
              type="checkbox"
              checked={form.lendable}
              onChange={(e) => setForm({ ...form, lendable: e.target.checked })}
            />
            貸出可能にする
          </label>
          <div className="eqm-form-actions">
            <button className="eqm-cancel" onClick={() => setShowForm(false)}>キャンセル</button>
            <button className="eqm-save" onClick={save}>{editingId ? "更新" : "追加"}</button>
          </div>
        </div>
      )}

      <div className="eqm-list">
        {items.map((eq) => (
          <div key={eq.id} className="eqm-item">
            <div className="eqm-item-info">
              <span className="eqm-item-name">{eq.name}</span>
              <span className="eqm-item-meta">
                {eq.category} ・ {eq.totalQuantity}台
                {!eq.lendable && " ・ 貸出不可"}
              </span>
            </div>
            <div className="eqm-item-actions">
              <button
                className={`eqm-lendable ${eq.lendable ? "on" : "off"}`}
                onClick={() => toggleLendable(eq.id)}
                title="貸出可否を切り替え"
              >
                {eq.lendable ? "貸出可" : "貸出不可"}
              </button>
              <button className="eqm-icon-btn" onClick={() => openEdit(eq)}>
                <i className="ti ti-edit" />
              </button>
              <button className="eqm-icon-btn danger" onClick={() => deleteEquipment(eq.id)}>
                <i className="ti ti-trash" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
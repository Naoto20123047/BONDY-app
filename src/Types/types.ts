export type Role = "管理者" | "幹部" | "一般メンバー";

export type Position = "サークル長" | "副サークル長" | "会計担当" | "機材担当" | "広報担当";

export interface Member {
  id: string;
  uid: string;
  email: string;
  authMethod: "google" | "email";
  name: string;
  nickname?: string;
  faculty: string;
  studentId: string;
  enrollmentYear: number;
  part: string;
  role: Role;
  positions: Position[];
  isOB: boolean;
  duesPaid: boolean;
  status: "active" | "withdrawn";
  withdrawnAt?: string;
}
export type BandStatus = "申請中" | "承認済み" | "解散申請中" | "解散";

export interface BandMember {
  memberId: string;
  part: string;
}

export interface Band {
  id: string;
  name: string;
  members: BandMember[];
  status: BandStatus;
}

export type FormType = "イベント" | "アンケート";

export interface FormQuestion {
  id: string;
  label: string;
  type: "text" | "select";
  options?: string[];
}

export interface FormDef {
  id: string;
  title: string;
  type: FormType;
  questions: FormQuestion[];
  deadline: string;
}

export interface FormResponse {
  id: string;
  formId: string;
  memberId: string;
  answers: Record<string, string>;
  bandId?: string;
  submittedAt: string;
}

export type TodoStatus = "未着手" | "進行中" | "完了";

export interface Todo {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  createdBy: string;
  deadline?: string;
  status: TodoStatus;
}

export type RoleChangeType = "assign_position" | "dismiss_officer" | "dismiss_leader" | "assign_vice_leader";

export interface RoleChangeRequest {
  id: string;
  type: RoleChangeType;
  targetMemberId: string;
  proposedBy: string;
  approvals: string[];
  requiredApprovals: number;
  status: "pending" | "approved" | "rejected";
  position?: Position; // assign_position のとき、付与する役職
}

// ===== 機材貸出 =====

export type EquipmentCategory = "スピーカー" | "アンプ" | "ミキサー" | "マイク" | "ケーブル" | "その他";

export interface Equipment {
  id: string;
  name: string;
  category: EquipmentCategory;
  totalQuantity: number;
  lendable: boolean; // 貸出可否
  note?: string;
}

export type EquipmentRequestStatus =
  | "申請中"
  | "貸出中"
  | "返却報告済み"
  | "返却完了"
  | "却下";

export interface EquipmentRequest {
  id: string;
  equipmentId: string;
  quantity: number;
  memberId: string;
  dueDate: string; // 返却予定日
  status: EquipmentRequestStatus;
  approvedBy?: string;
  requestedAt: string;
  approvedAt?: string;
  reportedAt?: string;
  returnedAt?: string;
}

// ===== 掲示板 =====

export type PostCategory = "メンバー募集" | "機材" | "告知・連絡" | "その他";

export interface Post {
  id: string;
  authorId: string;
  category: PostCategory;
  title: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt?: string; // 解決フラグを立てた日時(自動削除の起点)
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

// ===== 通知 =====

export type NotificationType =
  | "form_published"       // フォーム配信
  | "approval_needed"      // 承認が必要
  | "approval_result"      // 承認/却下の結果
  | "todo_assigned"        // TODOアサイン
  | "equipment_request"    // 機材の申請・返却報告(機材担当へ)
  | "equipment_result"     // 機材の承認・却下・返却確認(申請者・本人へ)
  | "equipment_overdue"    // 機材延滞
  | "band_member_changed"  // バンドメンバーの追加・脱退
  | "post_comment";        // 掲示板の投稿にコメントが付いた

export interface AppNotification {
  id: string;
  targetMemberId: string;
  type: NotificationType;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}
export type Role = "管理者" | "幹部" | "一般メンバー";

export type Position = "サークル長" | "副サークル長" | "会計担当" | "機材担当" | "広報担当";

export interface Member {
  id: string;
  uid: string;
  email: string;
  authMethod: "google" | "email";
  name: string;
  nickname?: string;
  avatarColor?: string;
  avatarThumb?: string;   // 一覧用の小さいアバター画像(base64)。原寸は images コレクション
  avatarImageId?: string; // images コレクションの参照ID(未設定ならアイコンカラーで表示)
  faculty: string;
  studentId: string;
  enrollmentYear: number;
  parts: string[];
  role: Role;
  positions: Position[];
  isOB: boolean;
  duesPaid: boolean;
  /**
   * 在籍状態。退会と除籍は別物として扱う。
   *  - active    : 在籍中
   *  - withdrawn : 退会(本人の意思)。Auth は生きたままで、本人が再ログインすれば復帰できる
   *  - expelled  : 除籍(幹部の判断)。Auth を無効化し、復帰は幹部操作のみ
   */
  status: MemberStatus;
  /**
   * 加入日(YYYY-MM-DD)。プロフィール登録時に記録する。
   * NEWバッジの判定に使う。後から追加したフィールドなので、
   * それ以前からのメンバーには入っていない(その場合バッジは出ない)。
   */
  joinedAt?: string;
  withdrawnAt?: string;
  expelledAt?: string;
}

export type MemberStatus = "active" | "withdrawn" | "expelled";
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
  required?: boolean;        // 必須回答(未設定は任意)
  showIf?: {                 // 表示条件(直前の質問の回答)
    questionId: string;
    value: string;
  };
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
  isAnonymous?: boolean; // 匿名掲示板として作成されたか(投稿・コメントとも表示上匿名になる)
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

// ===== アバター画像 =====

// 画像は Member に直接持たせず、別コレクションに切り出す。
// 名簿一覧などで36名分の画像を読み込んでしまうのを防ぐため。
export interface AvatarImage {
  id: string;      // = ownerId(1人1枚のため、上書きで差し替える)
  ownerId: string;
  dataUrl: string; // data:image/webp;base64,... の形式
  updatedAt: string;
}

// ===== 紹介画面(幹部がアプリから編集する) =====

/**
 * v1.3.0 より前の形式。見出しと本文だけを持っていた。
 * 読み込み時に IntroBlock へ変換するので、新規に作ることはない。
 */
export interface IntroSection {
  id: string;
  heading: string;
  body: string;
}

/** ブロックの種類 */
export type IntroBlockType =
  | "text"       // 見出し(任意)+ 本文
  | "heading"    // 大きな見出しだけ
  | "image"      // 写真1枚
  | "imageText"  // 写真 + 文章(左右を入れ替えられる)
  | "gallery"    // 写真を2〜4枚並べる
  | "cards"      // 小見出し+短文のカードを並べる
  | "stats"      // 数字を並べる
  | "spacer";    // 余白だけ

/**
 * ブロックの背景。
 * 同じ tone のブロックが続くと、描画側で1つの帯にまとめて全幅で敷く。
 */
export type IntroTone = "plain" | "tint" | "dark";

/**
 * スクロールしてそのブロックが見えたときの出方。
 *
 * OS で「視差効果を減らす」を有効にしている人には、どれを選んでいても
 * 動かさず、最初から見えている状態で出す。
 */
export type IntroEffect =
  | "none"   // 動かさない
  | "fade"   // その場でふわっと
  | "up"     // 下から上へ
  | "left"   // 左から
  | "right"  // 右から
  | "zoom";  // 少し拡大しながら

/**
 * 紹介ページに載せる写真。
 *
 * 実体は Worker に付いている Cloudflare Workers KV にあり、
 * ここには画像のIDだけを持つ。表示するときに Worker から期限付きの
 * 署名URLをもらって <img> に渡す。
 * Firestore に base64 で持つアイコン画像とは別の仕組みなので注意。
 */
export interface IntroImage {
  fileId: string;
  /** 読み上げ・読み込み失敗時に出る説明 */
  alt?: string;
  /** 写真の下に出す短い説明 */
  caption?: string;
}

export interface IntroCard {
  id: string;
  title: string;
  body: string;
}

export interface IntroStat {
  id: string;
  /** 「40」「4回」など。単位ごと文字列で持つ */
  value: string;
  label: string;
}

/**
 * 紹介ページを構成する1ブロック。
 *
 * 配置は12列グリッド。span が列数で、並び順は配列の順。
 * 横に並べたいときは span を 6 と 6 にする、という考え方にしてある。
 * 座標(x, y)を持たせないのは、スマホでは必ず1列に積み直す必要があり、
 * PCで置いた座標がそのままでは使えないため。
 */
export interface IntroBlock {
  id: string;
  type: IntroBlockType;
  /** 12列中いくつ分か(1〜12)。768px以下では無視して全幅になる */
  span: number;
  tone: IntroTone;
  /** 文字の寄せ方。未指定は左寄せ */
  align?: "left" | "center" | "right";

  /** スクロールで見えたときの出方。未指定は "up" 扱い */
  effect?: IntroEffect;
  /** 出るまでの待ち時間(ミリ秒)。横に並べたブロックを順番に出したいときに使う */
  effectDelay?: number;

  /** text / heading / imageText / cards / stats で使う */
  heading?: string;
  /** text / imageText で使う */
  body?: string;
  /** heading の大きさ */
  level?: 1 | 2;

  /** image / imageText */
  image?: IntroImage;
  /** gallery */
  images?: IntroImage[];
  /** cards */
  cards?: IntroCard[];
  /** stats */
  stats?: IntroStat[];

  /** imageText で写真を右に置く */
  flip?: boolean;
  /** spacer の高さ(px) */
  height?: number;
}

/**
 * アカウント作成直後、まだメンバーになっていない人に見せる紹介ページ。
 * 在籍メンバーにもアプリ内の「サークル紹介」として同じものを出す。
 *
 * 文章も写真も運用しながら変わるものなので、コードに埋め込まず Firestore に置き、
 * 幹部がアプリから直接編集できるようにしている(pages/intro)。
 */
export interface IntroPage {
  title: string;
  lead: string;
  /** ヒーローの背景に敷く写真。未設定ならグラデーションだけ */
  heroImage?: IntroImage;
  blocks: IntroBlock[];
  updatedAt?: string;
  updatedBy?: string;
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

// ===== アーカイブ(活動の記録) =====
//
// 映像と音源は YouTube の限定公開に置き、BONDY は索引だけを持つ。
// 動画そのものをアプリで配信しようとすると容量も転送量も成立しないため、
// 「どのライブで、どのバンドが、何を演奏したか」を辿れることに絞っている。
//
// 写真アルバムは v1.3.0 では見送った(保存容量が持たないため)。

/** ライブや行事。映像・音源はこの下にぶら下がる */
export interface ArchiveEvent {
  id: string;
  title: string;
  /** 開催日(YYYY-MM-DD)。年度のまとめにも使う */
  date: string;
  venue?: string;
  note?: string;
  /**
   * 一覧から外す。
   * 「データは削除しない」方針に沿って、消さずに隠せるようにしてある。
   */
  hidden?: boolean;
  createdBy: string;
  createdAt: string;
}

export type ArchiveMediaKind = "video" | "audio";

/** イベントに紐づく1本の映像・音源 */
export interface ArchiveItem {
  id: string;
  eventId: string;
  kind: ArchiveMediaKind;
  /** YouTube の動画ID。限定公開のものを想定している */
  youtubeId: string;
  title: string;
  /** 演奏したバンド。ゲスト演奏など、紐づかないこともある */
  bandId?: string;
  /** イベント内での並び順(セットリスト順) */
  order: number;
  note?: string;
  hidden?: boolean;
  /**
   * イベント名と日付の写し。
   *
   * バンド詳細から「過去の演奏」を逆引きするとき、
   * これが無いとイベントを1件ずつ読みに行くことになるため複製している。
   * イベント名や日付を直したときは、紐づく ArchiveItem 側も更新すること。
   */
  eventTitle: string;
  eventDate: string;
  createdBy: string;
  createdAt: string;
}

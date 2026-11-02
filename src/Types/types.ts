/**
 * アプリ全体で使う型をここにまとめている。
 *
 * ドメインごとに `// ===== 名前 =====` で区切ってある。探すときは
 * 区切りを目印にするか、型名で検索するのが早い。
 * 概ね Firestore のコレクションと1対1で対応している。
 *
 * **1ファイルのままにしている理由**
 * 一度ドメインごとに10ファイルへ分けたが、2〜3型で十数行のファイルが並ぶだけで、
 * 探す手間と import の行数(48行→58行)が増えただけだった。
 * 型が今の倍ほどに増えて、この区切りでは追えなくなってから分ければよい。
 */

// ===== メンバー =====
//
// このアプリの中心になるデータ。members コレクションに1人1件で入っている。

/**
 * 権限の区分。
 *
 * かつて「管理者」もあったが、**幹部と権限が完全に同一**で、
 * 判定はどこも「幹部または管理者」の形しかなく、
 * アプリから付与する手段も無かった(Firestore コンソールで手書きするしかなかった)。
 * 名前だけが残って「管理者は何か特別なことができる」と誤解を生むため、
 * v1.3.0 で廃止した。
 *
 * 誰も手が出せなくなったときの最後の手段は Firebase コンソールであって、
 * アプリ内の役職ではない。引き継ぎメモ側にその旨を残すこと。
 *
 * 判定は lib/roles.ts にまとめてある。直接 === で比べないこと。
 */
export type Role = "幹部" | "一般メンバー";

/**
 * 担当。role とは別で、複数持てる。
 * 「幹部かどうか」が権限、「何の担当か」がこちら。
 */
export type Position =
  | "サークル長"
  | "副サークル長"
  | "会計担当"
  | "機材担当"
  | "広報担当";

/**
 * 在籍状態。**退会と除籍は別物として扱う。**
 *  - active    : 在籍中
 *  - withdrawn : 退会(本人の意思)。Auth は生きたままで、本人が再ログインすれば復帰できる
 *  - expelled  : 除籍(幹部の判断)。Auth を無効化し、復帰は幹部操作のみ
 */
export type MemberStatus = "active" | "withdrawn" | "expelled";

/**
 * 区分(v1.4.0)。
 *  - 在学生: 大学のアドレスで登録した人。登録してすぐ全機能が使える
 *  - 教員:   顧問など。どのアドレスでも登録でき、幹部の確認までは一部の機能だけ
 *  - OB:     卒業生。教員と同じく幹部の確認待ちで登録する
 *
 * v1.4.0 より前のメンバーは category を持たない。その場合は isOB から判定する
 * (lib/memberCategory.ts の memberCategory() を使うこと)。
 */
export type MemberCategory = "在学生" | "教員" | "OB";

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
  /** 区分(v1.4.0)。未設定は isOB から判定する */
  category?: MemberCategory;
  /** OB の卒業年度(v1.4.0) */
  graduationYear?: number;
  /**
   * 幹部の確認が済んでいるか(v1.4.0)。
   * 教員・OBとして登録した人は false で作られ、幹部が承認すると true になる。
   * **未設定(既存のメンバー・在学生)は確認済みとして扱う。**
   * false の間は、名簿・チャット・掲示板・アーカイブ・フォームなどが使えない。
   */
  approved?: boolean;
  isOB: boolean;
  duesPaid: boolean;
  status: MemberStatus;
  /**
   * 加入日(YYYY-MM-DD)。プロフィール登録時に記録する。
   * NEWバッジの判定に使う。後から追加したフィールドなので、
   * それ以前からのメンバーには入っていない(その場合バッジは出ない)。
   */
  joinedAt?: string;
  withdrawnAt?: string;
  expelledAt?: string;
  /**
   * 最後に反映した役職変更の申請ID(v1.3.2)。
   * 役職(role / positions)を変えるときは、ルールがこの申請を読んで
   * 「承認済みで、内容どおりか」を確かめる。画面では使わない。
   */
  appliedRequestId?: string;
  /**
   * 幹部に昇格した時刻(v1.4.1)。サーバーの時刻で書く。
   * 昇格から14日間は役職変更の申請・承認・却下に加われない(lib/roles.ts)。
   * v1.4.1 より前からの幹部は持たない(制限なし)。
   */
  promotedAt?: { toMillis(): number };
  /** 昇格させた幹部(v1.4.1) */
  promotedBy?: string;
}

// ===== 役職変更の申請(幹部が複数人で承認する) =====

export type RoleChangeType =
  | "assign_position"
  | "dismiss_officer"
  | "dismiss_leader"
  | "assign_vice_leader";

/**
 * 1人の独断で役職を動かせないようにするための仕組み。
 * requiredApprovals 人ぶん approvals が集まって初めて成立する。
 */
export interface RoleChangeRequest {
  id: string;
  type: RoleChangeType;
  targetMemberId: string;
  proposedBy: string;
  approvals: string[];
  requiredApprovals: number;
  /**
   * pending  : 承認を集めている
   * applied  : 承認がそろい、反映済み(v1.4.1。最後の承認と反映は同時に行う)
   * approved : v1.4.0 までの「承認済み」。反映には使えない(使い回しを防ぐため)
   * rejected : 却下
   */
  status: "pending" | "applied" | "approved" | "rejected";
  position?: Position; // assign_position のとき、付与する役職
  rejectedBy?: string;
}

// ===== バンド =====
//
// 結成も解散も幹部の承認を通すため、status で段階を持っている。

export type BandStatus = "申請中" | "承認済み" | "解散申請中" | "解散";

export interface BandMember {
  memberId: string;
  part: string;
}

export interface Band {
  id: string;
  name: string;
  members: BandMember[];
  /**
   * members と同じ並びの、IDだけの配列(v1.3.2)。
   * Firestore のルールは配列の中のオブジェクトを検索できないため、
   * 「そのバンドのメンバーか」の判定用に持たせている。
   * **members を書き換えるときは必ず一緒に更新すること。**
   * 既存のバンドには、幹部が管理画面を開いたときに書き足される(lib/migrations.ts)。
   */
  memberIds?: string[];
  status: BandStatus;
}

// ===== フォーム(イベント参加確認・アンケート) =====
//
// 定義(FormDef)と回答(FormResponse)を別コレクションに分けてある。

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
  /**
   * 締切日の終わり(日本時間 23:59:59)のミリ秒(v1.4.1)。
   * ルールで「締切を過ぎたら回答できない」を判定する。古いフォームは持たない
   */
  closesAt?: number;
}

export interface FormResponse {
  id: string;
  formId: string;
  memberId: string;
  /** 質問ID → 回答 */
  answers: Record<string, string>;
  bandId?: string;
  /**
   * フォームの種類の写し(v1.4.1)。
   * 個別アンケートの回答は本人と幹部しか読めないため、ルールが回答だけを見て
   * 判定できるように持たせている
   */
  formType?: FormType;
  submittedAt: string;
  /**
   * バンド回答を最後に編集した人(v1.3.2)。
   * 以前は memberId を上書きしていたが、回答者を書き換えられる穴になるため、
   * memberId は最初に回答した人のまま固定し、こちらに残す。
   */
  lastEditedBy?: string;
}

// ===== TODO(幹部の作業管理) =====

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

// ===== 機材貸出 =====
//
// 在庫は Equipment.totalQuantity に持ち、貸出中の数は
// EquipmentRequest を数えて求める(在庫数を直接減らさない)。
// 二重更新でずれるのを避けるため。

export type EquipmentCategory =
  | "スピーカー"
  | "アンプ"
  | "ミキサー"
  | "マイク"
  | "ケーブル"
  | "その他";

export interface Equipment {
  id: string;
  name: string;
  category: EquipmentCategory;
  totalQuantity: number;
  lendable: boolean; // 貸出可否
  note?: string;
}

/** 申請 → 貸出 → 返却報告 → 返却完了、の順に進む */
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
//
// 匿名投稿は表示だけでなく通知にも影響する(lib/teamsNotify.ts を参照)。
//
// v1.3.2 から、**匿名の投稿・コメントは本体に投稿者(authorId)を持たない。**
// 以前は本体に authorId を残していたため、画面では「匿名」でも、
// 部員なら誰でも SDK から投稿者を調べられた。
// 投稿者は anonymousAuthors(幹部と本人しか読めない)に分けて残している。
// 荒れたときに幹部が辿れる点と「データは削除しない」方針は変わらない。

export type PostCategory = "メンバー募集" | "機材" | "告知・連絡" | "その他";

export interface Post {
  id: string;
  /** 実名の投稿だけが持つ。匿名投稿には無い(anonymousAuthors を見る) */
  authorId?: string;
  category: PostCategory;
  title: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt?: string;   // 解決フラグを立てた日時(表示用)
  /**
   * 解決にした時刻(v1.4.1。サーバーの時刻)。自動削除の起点。
   * ルールは「これから7日経った投稿」しか投稿者以外に消させない
   */
  resolvedTs?: { toMillis(): number } | null;
  isAnonymous?: boolean; // 匿名掲示板として作成されたか(投稿・コメントとも表示上匿名になる)
}

export interface Comment {
  id: string;
  postId: string;
  /** 実名のスレッドのコメントだけが持つ */
  authorId?: string;
  /** 匿名スレッドのコメントの表示名(匿名A など)。同じ人は同じ名前になる */
  anonLabel?: string;
  body: string;
  createdAt: string;
}

/**
 * 匿名の投稿・コメントの投稿者。ドキュメントID = 投稿またはコメントのID。
 * 読めるのは幹部と本人だけ。
 */
export interface AnonymousAuthor {
  id: string;
  authorId: string;
  kind: "post" | "comment";
  postId: string;
  /**
   * 匿名投稿の投稿者だけが使う。コメントのお知らせを作った時点のコメント数。
   * コメントした人は投稿者が分からず通知を作れないため、
   * 投稿者がアプリを開いたときにこれと比べて自分宛てに作る。
   */
  seenCommentCount?: number;
}

// ===== アイコン画像 =====
//
// 画像は Member に直接持たせず、別コレクションに切り出してある。
// 名簿一覧などで在籍者全員ぶんの画像を読み込んでしまうのを防ぐため。
// 一覧には Member.avatarThumb(小さいもの)を使い、原寸はここから読む。
//
// 紹介ページの写真は別の仕組み(Workers KV)なので混同しないこと。

export interface AvatarImage {
  id: string;      // = ownerId(1人1枚のため、上書きで差し替える)
  ownerId: string;
  dataUrl: string; // data:image/webp;base64,... の形式
  updatedAt: string;
}

// ===== サークル紹介ページ =====
//
// アカウント作成直後のまだメンバーでない人と、在籍メンバーの両方に同じものを見せる。
// 文章も写真も運用しながら変わるものなので、コードに埋め込まず Firestore(pages/intro)に置き、
// 幹部がアプリから直接編集できるようにしている。
//
// ブロックを積んでページを組み立てる形式。編集画面は screens/AdminDashboard/、
// 表示は screens/Intro/、読み書きは lib/introPage.ts にある。

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
 * Firestore に base64 で持つアイコン画像(AvatarImage)とは別の仕組みなので注意。
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
 *
 * 種類ごとに使うフィールドが違うので、ほとんどが任意になっている。
 * どの種類で何を使うかは各フィールドのコメントを見ること。
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

export interface IntroPage {
  title: string;
  lead: string;
  /** ヒーローの背景に敷く写真。未設定ならグラデーションだけ */
  heroImage?: IntroImage;
  blocks: IntroBlock[];
  updatedAt?: string;
  updatedBy?: string;
}

// ===== アプリ内通知 =====
//
// Teams への通知とは別物。あちらは lib/teamsNotify.ts。

export type NotificationType =
  | "form_published"       // フォーム配信
  | "approval_needed"      // 承認が必要
  | "approval_result"      // 承認/却下の結果
  | "todo_assigned"        // TODOアサイン
  | "equipment_request"    // 機材の申請・返却報告(機材担当へ)
  | "equipment_result"     // 機材の承認・却下・返却確認(申請者・本人へ)
  | "equipment_overdue"    // 機材延滞
  | "band_member_changed"  // バンドメンバーの追加・脱退
  | "post_comment"         // 掲示板の投稿にコメントが付いた
  | "live_update"          // ライブの出演募集・出演決定・提出のお願い(v1.4.0)
  | "officer_promoted";    // 幹部への昇格(幹部全員へ。v1.4.1)

export interface AppNotification {
  id: string;
  targetMemberId: string;
  type: NotificationType;
  message: string;
  /** 押したときの遷移先(アプリ内のパス) */
  link: string;
  read: boolean;
  createdAt: string;
  /** 差出人(v1.4.1)。それより前の通知は持たない */
  createdBy?: string;
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
   * **イベント名や日付を直したときは、紐づく ArchiveItem 側も更新すること。**
   * (lib/archive.ts の updateEvent がまとめて面倒を見ている)
   */
  eventTitle: string;
  eventDate: string;
  createdBy: string;
  createdAt: string;
}

// ===== ライブ準備(v1.4.0) =====
//
// 幹部がライブを作成して出演を募集し、バンドが申し込む。
// 締切後に幹部が出演順を決めると、出演バンドはセットリストと編成・機材を提出する。
// 提出された内容から、当日の資料(タイムテーブル・セットリスト・外部PA向けチャンネル表)を作る。
//
// ライブの出演確認はフォームではなくこの申し込みで行う
// (フォームのバンドごとの回答は、ライブ以外のイベントのために残してある)。
// 読み書きは lib/live.ts にまとめてある。

/** 出演順の1枠 */
export interface LiveSlot {
  bandId: string;
  /** 表示用の写し(バンド名が変わっても資料は作れるように) */
  bandName: string;
  /** 持ち時間(分)。転換の時間は含まない */
  minutes: number;
}

export interface Live {
  id: string;
  title: string;
  /** 開催日(YYYY-MM-DD) */
  date: string;
  venue: string;
  /** 開場・開演・退館の時刻(HH:MM) */
  openTime: string;
  startTime: string;
  closeTime: string;
  /** 出演申し込みの締切(YYYY-MM-DD) */
  applyDeadline: string;
  /** セットリスト・編成の提出締切(YYYY-MM-DD) */
  submitDeadline: string;
  /**
   * 締切日の終わり(日本時間 23:59:59)をミリ秒にしたもの。
   * Firestore のルールで「締切を過ぎたら書き込めない」を判定するために持つ
   */
  applyClosesAt: number;
  submitClosesAt: number;
  /** 転換の時間(分) */
  changeoverMinutes: number;
  /** 出演順。幹部が決めるまでは空 */
  lineup: LiveSlot[];
  /** lineup のバンドIDだけ(ルールでの判定用。lineup と必ず揃える) */
  lineupBandIds: string[];
  /** 出演順を出演バンドに知らせた日時。これ以降、出演バンドが提出できる */
  lineupPublishedAt?: string;
  createdBy: string;
  createdAt: string;
}

/** 出演の申し込み(lives/{liveId}/entries/{bandId})。バンドで1つ */
export interface LiveEntry {
  id: string; // = bandId
  bandId: string;
  bandName: string;
  participate: boolean;
  /** 希望の持ち時間(分) */
  desiredMinutes: number;
  /** 出演できない時間帯(自由記述) */
  unavailable: string;
  /** 幹部へのメモ */
  note: string;
  updatedBy: string;
  updatedAt: string;
}

export type SetlistItemKind = "song" | "mc";

export interface SetlistItem {
  id: string;
  kind: SetlistItemKind;
  /** 曲名(MCのときは空) */
  title: string;
  songType?: "オリジナル" | "コピー";
  /** 原曲のアーティスト(コピーのとき) */
  artist?: string;
  /** 演奏時間(秒) */
  seconds: number;
  /** PA・照明へのメモ */
  note?: string;
}

/** セットリスト(lives/{liveId}/setlists/{bandId}) */
export interface LiveSetlist {
  id: string; // = bandId
  bandId: string;
  items: SetlistItem[];
  submittedAt: string;
  updatedBy: string;
}

/** 編成・機材の1人分 */
export interface StageMember {
  memberId: string;
  name: string;
  /** パート(Vo / Gt / Ba / Dr / Key / DTM など) */
  part: string;
  /** メインの機材(マイク・アンプ・ドラムセット・キーボード)を会場のものにするか */
  useVenueGear: boolean;
  /** キーボード・DTM をステレオ(DI 2本)で出すか */
  stereo: boolean;
  /** 持ち込む機材・備考(例: エフェクター、スネア) */
  extras: string;
  /** ステージ上の立ち位置(0〜100 の割合。左上が 0,0、下が客席側) */
  x: number;
  y: number;
}

/** 編成・機材とステージ配置(lives/{liveId}/stagePlans/{bandId}) */
export interface LiveStagePlan {
  id: string; // = bandId
  bandId: string;
  members: StageMember[];
  /** モニター(返し)の要望 */
  monitorRequest: string;
  submittedAt: string;
  updatedBy: string;
}

/**
 * 紹介ページの読み書き
 *
 * アカウントは作ったがまだメンバーになっていない人(見学者)と、
 * 在籍メンバーの「サークル紹介」の両方で使う1枚のページ。
 *
 * 中身は運用しながら変わるため、コードに埋め込まず Firestore の pages/intro に置き、
 * 幹部がアプリから編集できるようにしている。デプロイなしで直せる。
 *
 * 見学者は Member ドキュメントを持たないので、セキュリティルール側の読み取り条件を
 * 「ログインしていること」にしてある(isActive() では読めない)。
 *
 * ■ 旧形式からの移行
 * v1.3.0 で { heading, body } の固定構造から、並べ替えのできるブロック配列に変えた。
 * 保存済みのデータは旧形式のままなので、読み込み時に変換している。
 * 変換は読むたびに行うため、幹部が保存し直すまでの間も表示は壊れない。
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type {
  IntroPage,
  IntroSection,
  IntroBlock,
  IntroBlockType,
  IntroImage,
  IntroCard,
  IntroStat,
  IntroTone,
  IntroEffect,
} from "../Types/types";

/** Firestore 上の置き場所。将来ほかのページを足せるようコレクションにしてある */
const INTRO_DOC_ID = "intro";

/** ランダムなID(並べ替えや削除の識別に使う) */
export const newBlockId = (): string => Math.random().toString(36).slice(2, 9);

/** 12列グリッドの列数 */
export const GRID_COLUMNS = 12;

/** ブロックの種類ごとの表示名 */
export const BLOCK_LABELS: Record<IntroBlockType, string> = {
  text: "文章",
  heading: "大見出し",
  image: "写真",
  imageText: "写真 + 文章",
  gallery: "写真を並べる",
  cards: "カード",
  stats: "数字",
  spacer: "余白",
};

/** 種類を選んだときに入る初期値 */
export function createBlock(type: IntroBlockType): IntroBlock {
  const base: IntroBlock = {
    id: newBlockId(),
    type,
    span: GRID_COLUMNS,
    tone: "plain",
    // 既定は控えめに下から。うるさければ幹部が「なし」に変えられる
    effect: "up",
  };

  switch (type) {
    case "text":
      return { ...base, heading: "見出し", body: "ここに文章を書きます。" };
    case "heading":
      return { ...base, heading: "大きな見出し", level: 1, align: "center" };
    case "image":
      return { ...base };
    case "imageText":
      return { ...base, span: 12, heading: "見出し", body: "写真の横に入る文章です。" };
    case "gallery":
      return { ...base, images: [] };
    case "cards":
      return {
        ...base,
        heading: "パート紹介",
        cards: [
          { id: newBlockId(), title: "ギター", body: "短い説明を書きます。" },
          { id: newBlockId(), title: "ベース", body: "短い説明を書きます。" },
        ],
      };
    case "stats":
      return {
        ...base,
        tone: "tint",
        stats: [
          { id: newBlockId(), value: "40", label: "部員数" },
          { id: newBlockId(), value: "4", label: "年間ライブ回数" },
        ],
      };
    case "spacer":
      return { ...base, height: 48 };
  }
}

/**
 * まだ一度も編集されていないときに表示する内容。
 * 幹部が保存すると Firestore の内容に置き換わる。
 */
export const DEFAULT_INTRO: IntroPage = {
  title: "BONDYへようこそ",
  lead:
    "BONDYは開志専門職大学の軽音サークルです。" +
    "まずはどんなサークルか見てから、加入するか決めてください。",
  blocks: [
    {
      id: "activity",
      type: "text",
      span: 12,
      tone: "plain",
      effect: "up",
      heading: "活動について",
      body:
        "バンドを組んでライブに出たり、学内のイベントで演奏したりしています。" +
        "未経験から始めた人もいます。",
    },
    {
      id: "app",
      type: "text",
      span: 12,
      tone: "tint",
      effect: "up",
      heading: "このアプリでできること",
      body:
        "部員名簿、バンドの結成申請、イベントやアンケートへの回答、機材の貸出申請、" +
        "会費の確認、チャットと掲示板が使えます。",
    },
    {
      id: "join",
      type: "text",
      span: 12,
      tone: "plain",
      effect: "up",
      heading: "加入について",
      body:
        "「加入する」を押すとプロフィール登録に進みます。" +
        "まだ決めきれない場合は、そのまま閉じて後から戻ってきても構いません。",
    },
  ],
};

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

const TONES: IntroTone[] = ["plain", "tint", "dark"];
const EFFECTS: IntroEffect[] = ["none", "fade", "up", "left", "right", "zoom"];
const BLOCK_TYPES = Object.keys(BLOCK_LABELS) as IntroBlockType[];

/** 待ち時間の上限(ミリ秒)。長すぎると読み手が置いていかれる */
const MAX_EFFECT_DELAY = 800;

export function clampSpan(value: unknown): number {
  const span = Math.round(Number(value));
  if (!Number.isFinite(span)) return GRID_COLUMNS;
  return Math.min(GRID_COLUMNS, Math.max(1, span));
}

function readImage(value: unknown): IntroImage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<IntroImage>;
  if (typeof raw.fileId !== "string" || raw.fileId === "") return undefined;
  return {
    fileId: raw.fileId,
    alt: typeof raw.alt === "string" ? raw.alt : undefined,
    caption: typeof raw.caption === "string" ? raw.caption : undefined,
  };
}

/**
 * Firestore から来た値をブロックとして読み直す。
 *
 * 幹部が編集するだけなので壊れた値は入らないはずだが、旧形式との混在や
 * 保存途中の欠けで画面が真っ白になるのを避けるため、足りない項目は既定値で埋める。
 */
function readBlock(value: unknown): IntroBlock | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const type = raw.type as IntroBlockType;
  if (!BLOCK_TYPES.includes(type)) return null;

  const block: IntroBlock = {
    id: typeof raw.id === "string" && raw.id !== "" ? raw.id : newBlockId(),
    type,
    span: clampSpan(raw.span),
    tone: TONES.includes(raw.tone as IntroTone) ? (raw.tone as IntroTone) : "plain",
  };

  if (EFFECTS.includes(raw.effect as IntroEffect)) {
    block.effect = raw.effect as IntroEffect;
  }
  if (typeof raw.effectDelay === "number" && Number.isFinite(raw.effectDelay)) {
    block.effectDelay = Math.min(MAX_EFFECT_DELAY, Math.max(0, raw.effectDelay));
  }

  if (raw.align === "center" || raw.align === "left" || raw.align === "right") {
    block.align = raw.align;
  }
  if (typeof raw.heading === "string") block.heading = raw.heading;
  if (typeof raw.body === "string") block.body = raw.body;
  if (raw.level === 1 || raw.level === 2) block.level = raw.level;
  if (raw.flip === true) block.flip = true;
  if (typeof raw.height === "number") block.height = raw.height;

  const image = readImage(raw.image);
  if (image) block.image = image;

  if (Array.isArray(raw.images)) {
    const images = raw.images
      .map(readImage)
      .filter((i): i is IntroImage => i !== undefined);
    if (images.length > 0) block.images = images;
  }

  if (Array.isArray(raw.cards)) {
    block.cards = raw.cards
      .filter((c): c is Partial<IntroCard> => !!c && typeof c === "object")
      .map((c) => ({
        id: typeof c.id === "string" ? c.id : newBlockId(),
        title: typeof c.title === "string" ? c.title : "",
        body: typeof c.body === "string" ? c.body : "",
      }));
  }

  if (Array.isArray(raw.stats)) {
    block.stats = raw.stats
      .filter((s): s is Partial<IntroStat> => !!s && typeof s === "object")
      .map((s) => ({
        id: typeof s.id === "string" ? s.id : newBlockId(),
        value: typeof s.value === "string" ? s.value : "",
        label: typeof s.label === "string" ? s.label : "",
      }));
  }

  return block;
}

/** 旧形式(見出し+本文の配列)を文章ブロックに移す */
function migrateSections(sections: IntroSection[]): IntroBlock[] {
  return sections.map((section, index) => ({
    id: section.id || newBlockId(),
    type: "text" as const,
    span: GRID_COLUMNS,
    // 交互に色を変えて、旧データでも帯として見えるようにする
    tone: (index % 2 === 1 ? "tint" : "plain") as IntroTone,
    effect: "up" as IntroEffect,
    heading: section.heading ?? "",
    body: section.body ?? "",
  }));
}

/**
 * 紹介ページを取得する。
 * 未作成・読み取り失敗の場合は既定の内容を返すので、画面が空になることはない。
 */
export async function loadIntroPage(): Promise<IntroPage> {
  try {
    const snapshot = await getDoc(doc(db, "pages", INTRO_DOC_ID));
    if (!snapshot.exists()) return DEFAULT_INTRO;

    const data = snapshot.data() as Record<string, unknown>;

    let blocks: IntroBlock[];
    if (Array.isArray(data.blocks)) {
      blocks = data.blocks.map(readBlock).filter((b): b is IntroBlock => b !== null);
    } else if (Array.isArray(data.sections)) {
      // v1.3.0 より前に保存されたデータ
      blocks = migrateSections(data.sections as IntroSection[]);
    } else {
      blocks = [];
    }

    return {
      title: typeof data.title === "string" ? data.title : DEFAULT_INTRO.title,
      lead: typeof data.lead === "string" ? data.lead : DEFAULT_INTRO.lead,
      heroImage: readImage(data.heroImage),
      blocks,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
      updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined,
    };
  } catch (e) {
    console.error("紹介ページの取得に失敗しました", e);
    return DEFAULT_INTRO;
  }
}

// ---------------------------------------------------------------------------
// 保存
// ---------------------------------------------------------------------------

/**
 * Firestore は undefined を受け付けないため、値のある項目だけを残す。
 * 空文字と空配列も落として、ドキュメントを無駄に太らせない。
 */
function compact(source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

function writeImage(image?: IntroImage): Record<string, unknown> | undefined {
  if (!image?.fileId) return undefined;
  return compact({
    fileId: image.fileId,
    alt: image.alt?.trim(),
    caption: image.caption?.trim(),
  });
}

function writeBlock(block: IntroBlock): Record<string, unknown> {
  return compact({
    id: block.id,
    type: block.type,
    span: clampSpan(block.span),
    tone: block.tone,
    effect: block.effect,
    // 0 は「待たない」なので保存しない(compact で落ちる)
    effectDelay: block.effectDelay ? block.effectDelay : undefined,
    align: block.align,
    heading: block.heading?.trim(),
    body: block.body?.trim(),
    level: block.level,
    flip: block.flip ? true : undefined,
    height: block.height,
    image: writeImage(block.image),
    images: (block.images ?? [])
      .map(writeImage)
      .filter((i): i is Record<string, unknown> => i !== undefined),
    cards: (block.cards ?? []).map((c) => ({
      id: c.id,
      title: c.title.trim(),
      body: c.body.trim(),
    })),
    stats: (block.stats ?? []).map((s) => ({
      id: s.id,
      value: s.value.trim(),
      label: s.label.trim(),
    })),
  });
}

/** 紹介ページを保存する(幹部のみ) */
export async function saveIntroPage(
  page: Pick<IntroPage, "title" | "lead" | "heroImage" | "blocks">,
  editorId: string
): Promise<void> {
  const payload = compact({
    title: page.title.trim(),
    lead: page.lead.trim(),
    heroImage: writeImage(page.heroImage),
    updatedAt: new Date().toISOString(),
    updatedBy: editorId,
  });

  // ブロックを全部消した状態も保存できるよう、compact を通さず必ず入れる
  payload.blocks = page.blocks.map(writeBlock);

  await setDoc(doc(db, "pages", INTRO_DOC_ID), payload);
}

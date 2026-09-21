/**
 * アーカイブ(活動の記録)の読み書き
 *
 * ■ 何を持つか
 * 映像・音源の実体は YouTube の限定公開に置き、BONDY は索引だけを持つ。
 * 1本で数百MBになる動画をアプリ側で抱えると、保存容量も転送量も成立しない。
 * YouTube ならホスティング・変換・モバイル再生がすべて無償で片付く。
 *
 * BONDY にしか作れないのは「どのライブで、どのバンドが演奏したか」を
 * 辿れること。既存の Band と繋ぐことで、YouTube のプレイリストでは
 * 作れない導線になる。
 *
 * ■ 写真アルバムについて
 * v1.3.0 では見送った。1回のライブで200枚を原寸で置くと、
 * どの無料枠でも数回で尽きるため。判断の経緯は仕様書を参照。
 *
 * ■ 限定公開の性質
 * 限定公開の動画は「URLを知っていれば誰でも見られる」。アプリが部員限定でも、
 * 画面が漏れれば動画も漏れる。非公開(private)にすると埋め込み再生ができないため、
 * ここは限定公開を前提にしている。運用で補う部分。
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { fiscalYearOf } from "./grade";
import type { ArchiveEvent, ArchiveItem, ArchiveMediaKind } from "../Types/types";

const EVENTS = "archiveEvents";
const ITEMS = "archiveItems";

// ---------------------------------------------------------------------------
// YouTube の URL 解析
// ---------------------------------------------------------------------------

/**
 * 貼り付けられた文字列から YouTube の動画IDを取り出す。
 *
 * 幹部がどの形で貼るか分からないため、よくある形を一通り受ける。
 *   https://www.youtube.com/watch?v=XXXXXXXXXXX
 *   https://youtu.be/XXXXXXXXXXX
 *   https://www.youtube.com/embed/XXXXXXXXXXX
 *   https://www.youtube.com/live/XXXXXXXXXXX
 *   XXXXXXXXXXX (IDだけ)
 *
 * 取り出せない場合は null。
 */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (text === "") return null;

  // ID そのもの(11文字)
  if (/^[\w-]{11}$/.test(text)) return text;

  let url: URL;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;

    // /embed/xxx や /live/xxx や /shorts/xxx
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["embed", "live", "shorts", "v"].includes(parts[0])) {
      return /^[\w-]{11}$/.test(parts[1]) ? parts[1] : null;
    }
  }

  return null;
}

/** 埋め込み再生用のURL。Cookie を置かない方のドメインを使う */
export function youtubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1`;
}

/** サムネイル。限定公開でもこのURLは取得できる */
export function youtubeThumbUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

/** YouTube で直接開くときのURL */
export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

/**
 * イベントを全件取得して、新しい順に並べる。
 *
 * where と orderBy を組み合わせると複合インデックスが要るため、
 * 絞り込みと並べ替えはこちら側で行う。年に数件しか増えないので問題ない。
 */
export async function listEvents(includeHidden = false): Promise<ArchiveEvent[]> {
  const snapshot = await getDocs(collection(db, EVENTS));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ArchiveEvent, "id">) }))
    .filter((e) => includeHidden || !e.hidden)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getEvent(eventId: string): Promise<ArchiveEvent | null> {
  const snapshot = await getDoc(doc(db, EVENTS, eventId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...(snapshot.data() as Omit<ArchiveEvent, "id">) };
}

/** あるイベントの映像・音源。セットリスト順に並べる */
export async function listItems(
  eventId: string,
  includeHidden = false
): Promise<ArchiveItem[]> {
  const snapshot = await getDocs(
    query(collection(db, ITEMS), where("eventId", "==", eventId))
  );
  return snapshot.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ArchiveItem, "id">) }))
    .filter((i) => includeHidden || !i.hidden)
    .sort((a, b) => a.order - b.order);
}

/**
 * あるバンドの過去の演奏を新しい順に取得する。
 *
 * ArchiveItem に eventTitle / eventDate を複製してあるので、
 * イベントを読み直さずに一覧を出せる。
 */
export async function listItemsByBand(bandId: string): Promise<ArchiveItem[]> {
  const snapshot = await getDocs(
    query(collection(db, ITEMS), where("bandId", "==", bandId))
  );
  return snapshot.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ArchiveItem, "id">) }))
    .filter((i) => !i.hidden)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

export interface EventSummary {
  count: number;
  /** 一覧の表紙に使う動画ID。セットリストの先頭のもの */
  coverYoutubeId?: string;
  /** 表紙に選んだ動画の order(より前のものが来たら差し替えるため) */
  coverOrder: number;
}

/**
 * イベントごとの本数と表紙を作る。
 *
 * 一覧では動画のサムネイルを表紙として出したいので、
 * 各イベントの先頭の1本を拾っておく。
 */
export async function summarizeItemsByEvent(): Promise<Record<string, EventSummary>> {
  const snapshot = await getDocs(collection(db, ITEMS));
  const summary: Record<string, EventSummary> = {};

  snapshot.docs.forEach((d) => {
    const data = d.data() as ArchiveItem;
    if (data.hidden) return;

    const current = summary[data.eventId] ?? { count: 0, coverOrder: Infinity };
    current.count += 1;
    if (data.order < current.coverOrder) {
      current.coverOrder = data.order;
      current.coverYoutubeId = data.youtubeId;
    }
    summary[data.eventId] = current;
  });

  return summary;
}

// ---------------------------------------------------------------------------
// 年度ごとのまとめ
// ---------------------------------------------------------------------------

export interface ArchiveYear {
  /** 年度(4月始まり)。日付が読めないものは null にまとめる */
  fiscalYear: number | null;
  events: ArchiveEvent[];
}

/** イベントを年度ごとに分ける。新しい年度が先 */
export function groupByFiscalYear(events: ArchiveEvent[]): ArchiveYear[] {
  const buckets = new Map<number | null, ArchiveEvent[]>();

  for (const event of events) {
    const year = fiscalYearOf(event.date);
    const list = buckets.get(year);
    if (list) list.push(event);
    else buckets.set(year, [event]);
  }

  return Array.from(buckets.entries())
    .map(([fiscalYear, list]) => ({ fiscalYear, events: list }))
    .sort((a, b) => {
      if (a.fiscalYear === null) return 1;
      if (b.fiscalYear === null) return -1;
      return b.fiscalYear - a.fiscalYear;
    });
}

// ---------------------------------------------------------------------------
// 書き込み(幹部のみ。権限は Firestore ルール側で担保している)
// ---------------------------------------------------------------------------

export interface EventInput {
  title: string;
  date: string;
  venue?: string;
  note?: string;
}

export async function createEvent(
  input: EventInput,
  editorId: string
): Promise<string> {
  const ref = await addDoc(collection(db, EVENTS), {
    title: input.title.trim(),
    date: input.date,
    venue: input.venue?.trim() ?? "",
    note: input.note?.trim() ?? "",
    hidden: false,
    createdBy: editorId,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

/**
 * イベントを更新する。
 *
 * タイトルと日付は ArchiveItem 側にも複製してあるため、
 * 変わった場合は紐づく動画もまとめて書き換える(バンド詳細の逆引きで使うため)。
 */
export async function updateEvent(
  eventId: string,
  input: EventInput
): Promise<void> {
  const title = input.title.trim();

  await updateDoc(doc(db, EVENTS, eventId), {
    title,
    date: input.date,
    venue: input.venue?.trim() ?? "",
    note: input.note?.trim() ?? "",
  });

  const items = await listItems(eventId, true);
  const stale = items.filter(
    (i) => i.eventTitle !== title || i.eventDate !== input.date
  );
  if (stale.length === 0) return;

  const batch = writeBatch(db);
  stale.forEach((item) => {
    batch.update(doc(db, ITEMS, item.id), {
      eventTitle: title,
      eventDate: input.date,
    });
  });
  await batch.commit();
}

/** イベントの表示・非表示を切り替える */
export async function setEventHidden(
  eventId: string,
  hidden: boolean
): Promise<void> {
  await updateDoc(doc(db, EVENTS, eventId), { hidden });
}

export interface ItemInput {
  kind: ArchiveMediaKind;
  youtubeId: string;
  title: string;
  bandId?: string;
  note?: string;
}

export async function createItem(
  event: ArchiveEvent,
  input: ItemInput,
  order: number,
  editorId: string
): Promise<string> {
  const ref = await addDoc(collection(db, ITEMS), {
    eventId: event.id,
    kind: input.kind,
    youtubeId: input.youtubeId,
    title: input.title.trim(),
    bandId: input.bandId ?? "",
    note: input.note?.trim() ?? "",
    order,
    hidden: false,
    eventTitle: event.title,
    eventDate: event.date,
    createdBy: editorId,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateItem(itemId: string, input: ItemInput): Promise<void> {
  await updateDoc(doc(db, ITEMS, itemId), {
    kind: input.kind,
    youtubeId: input.youtubeId,
    title: input.title.trim(),
    bandId: input.bandId ?? "",
    note: input.note?.trim() ?? "",
  });
}

export async function setItemHidden(itemId: string, hidden: boolean): Promise<void> {
  await updateDoc(doc(db, ITEMS, itemId), { hidden });
}

/** 並べ替えの結果をまとめて保存する */
export async function saveItemOrder(items: ArchiveItem[]): Promise<void> {
  const batch = writeBatch(db);
  items.forEach((item, index) => {
    if (item.order === index) return;
    batch.update(doc(db, ITEMS, item.id), { order: index });
  });
  await batch.commit();
}

/**
 * 記録を消す。
 *
 * 「データは削除しない」方針があるため、通常は非表示で足りる。
 * これは入力し間違えたものを片付けるための逃げ道で、
 * 削除依頼への対応方針が決まるまでは非表示を優先すること。
 */
export async function deleteItem(itemId: string): Promise<void> {
  await deleteDoc(doc(db, ITEMS, itemId));
}

/**
 * イベントを、紐づく映像・音源ごと削除する。
 *
 * **イベントだけ消してはいけない。** ArchiveItem はイベント名と日付を
 * 複製して持っており、バンド詳細の逆引き(listItemsByBand)は
 * イベントの存在を確認しない。孤児になった映像が「過去の演奏」に
 * 残り続けてしまう。
 *
 * 作成し間違えたイベントを取り消すための操作で、通常の運用では
 * 非表示(setEventHidden)を使う。
 */
export async function deleteEventWithItems(eventId: string): Promise<void> {
  const items = await listItems(eventId, true);

  // 1回のバッチは500操作まで。イベント自身のぶんを残して分割する
  const chunkSize = 400;
  for (let i = 0; i < items.length; i += chunkSize) {
    const batch = writeBatch(db);
    items.slice(i, i + chunkSize).forEach((item) => {
      batch.delete(doc(db, ITEMS, item.id));
    });
    await batch.commit();
  }

  // 先に映像を消してからイベントを消す。逆にすると、途中で失敗したときに
  // 親の無い映像だけが残ってしまう
  await deleteDoc(doc(db, EVENTS, eventId));
}

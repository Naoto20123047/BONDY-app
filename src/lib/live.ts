/**
 * ライブ準備の読み書きと計算
 *
 * Firestore の構成
 *   lives/{liveId}                     ライブ本体(幹部が作成・編集)
 *   lives/{liveId}/entries/{bandId}    出演の申し込み(バンドで1つ)
 *   lives/{liveId}/setlists/{bandId}   セットリスト(出演バンド)
 *   lives/{liveId}/stagePlans/{bandId} 編成・機材とステージ配置(出演バンド)
 *
 * 締切の判定は Firestore のルールでも行っている(applyClosesAt / submitClosesAt)。
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { endOfDayJstMillis, todayString } from "./date";
import { asNumber, asText } from "./sanitize";
import type {
  Band,
  Live,
  LiveEntry,
  LiveSetlist,
  LiveSlot,
  LiveStagePlan,
  SetlistItem,
  StageMember,
} from "../Types/types";

// ---------------------------------------------------------------------------
// 時刻・日付
// ---------------------------------------------------------------------------

/** "18:25" → 1105(0時からの分) */
export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** 1105 → "18:25" */
export const fromMinutes = (total: number): string => {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** 秒 → "4:30" */
export const formatSeconds = (sec: number): string => {
  const sign = sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
};

/** 締切日の終わり(日本時間 23:59:59)をミリ秒で */
export const endOfDayMillis = (date: string): number => endOfDayJstMillis(date);

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-12-20" → "12/20(土)" */
export const formatDateShort = (date: string): string => {
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
};

/** "2026-12-20" → "2026年12月20日(土)" */
export const formatDateLong = (date: string): string => {
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
};

/** 締切まであと何日か(当日は0、過ぎていれば負) */
export const daysUntil = (date: string): number => {
  const today = new Date(`${todayString()}T00:00:00+09:00`).getTime();
  const target = new Date(`${date}T00:00:00+09:00`).getTime();
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
};

// ---------------------------------------------------------------------------
// ライブの段階
// ---------------------------------------------------------------------------

export type LivePhase =
  | "preparing" //  作成直後(出演順はまだ)で、申し込みの締切を過ぎた
  | "accepting" //  出演の申し込み受付中
  | "submitting" // 出演順が決まり、出演バンドが提出する期間
  | "closed" //     提出の締切を過ぎた(当日の資料を作る段階)
  | "ended"; //     開催日を過ぎた

export const livePhase = (live: Live, now = Date.now()): LivePhase => {
  if (daysUntil(live.date) < 0) return "ended";
  if (live.lineupPublishedAt) {
    return now <= live.submitClosesAt ? "submitting" : "closed";
  }
  return now <= live.applyClosesAt ? "accepting" : "preparing";
};

export const PHASE_LABEL: Record<LivePhase, string> = {
  preparing: "出演バンドの決定待ち",
  accepting: "出演の申し込み受付中",
  submitting: "セットリスト・編成の提出期間",
  closed: "提出の締切後",
  ended: "終了",
};

// ---------------------------------------------------------------------------
// タイムテーブル
// ---------------------------------------------------------------------------

export interface TimetableRow {
  kind: "open" | "band" | "changeover" | "teardown";
  label: string;
  start: number; // 分
  end: number;
  bandId?: string;
}

/** 出演順から、開始・終了時刻を割り出す */
export const slotTimes = (live: Live, lineup: LiveSlot[] = live.lineup) => {
  let cursor = toMinutes(live.startTime);
  return lineup.map((slot, i) => {
    const start = cursor;
    const end = start + slot.minutes;
    cursor = end + (i < lineup.length - 1 ? live.changeoverMinutes : 0);
    return { ...slot, start, end };
  });
};

/** 終演予定(分) */
export const endTime = (live: Live, lineup: LiveSlot[] = live.lineup): number => {
  const times = slotTimes(live, lineup);
  return times.length > 0 ? times[times.length - 1].end : toMinutes(live.startTime);
};

/** 当日のタイムテーブル(開場・各バンド・転換・撤収) */
export const buildTimetable = (live: Live): TimetableRow[] => {
  const rows: TimetableRow[] = [
    { kind: "open", label: "開場", start: toMinutes(live.openTime), end: toMinutes(live.openTime) },
  ];
  const times = slotTimes(live);
  times.forEach((t, i) => {
    rows.push({ kind: "band", label: t.bandName, start: t.start, end: t.end, bandId: t.bandId });
    if (i < times.length - 1) {
      rows.push({
        kind: "changeover",
        label: "転換",
        start: t.end,
        end: t.end + live.changeoverMinutes,
      });
    }
  });
  const last = endTime(live);
  rows.push({ kind: "teardown", label: "撤収", start: last, end: toMinutes(live.closeTime) });
  return rows;
};

// ---------------------------------------------------------------------------
// 外部PA向けのチャンネル表
// ---------------------------------------------------------------------------

export interface PaChannel {
  /** "1" や "4–5" */
  ch: string;
  instrument: string;
  player: string;
  input: string;
}

const normalizePart = (part: string): string => part.replace(/[.．\s]/g, "").toLowerCase();

/** パートの表示名(Vo → Vo.) */
export const partLabel = (part: string): string => {
  const p = normalizePart(part);
  const map: Record<string, string> = { vo: "Vo.", gt: "Gt.", ba: "Ba.", dr: "Dr.", key: "Key.", dtm: "DTM" };
  return map[p] ?? part;
};

/** 機材の要約(編成・機材の一覧に出す1行) */
export const gearSummary = (m: StageMember): string => {
  const p = normalizePart(m.part);
  const venue = m.useVenueGear ? "会場のもの" : "持ち込み";
  const extras = m.extras.trim() ? ` · ${m.extras.trim()}` : "";
  if (p === "vo") return `マイク:${venue}${extras}`;
  if (p === "gt") return `アンプ:${venue}${extras}`;
  if (p === "ba") return `DI · アンプ:${venue}${extras}`;
  if (p === "dr") return `ドラムセット:${venue}${extras}`;
  if (p === "key" || p === "dtm") {
    return `${m.stereo ? "ステレオ(DI 2本)" : "モノラル(DI 1本)"} · 楽器:${venue}${extras}`;
  }
  return `機材:${venue}${extras}`;
};

/**
 * 編成・機材から、外部PAに渡す入力の一覧(チャンネル表)を作る。
 * パートごとの標準的なマイク・DIの数で組み立てる。細かい違いは備考欄で伝える。
 */
export const buildPaChannels = (plan: LiveStagePlan): PaChannel[] => {
  // ドラム→ベース→ギター→鍵盤→その他→ボーカルの順(PAが一般に並べる順)
  const order = (part: string) => {
    const p = normalizePart(part);
    return ["dr", "ba", "gt", "key", "dtm"].indexOf(p) >= 0
      ? ["dr", "ba", "gt", "key", "dtm"].indexOf(p)
      : p === "vo"
      ? 9
      : 5;
  };
  const members = [...plan.members].sort((a, b) => order(a.part) - order(b.part));

  const rows: { instrument: string; player: string; input: string; count: number }[] = [];
  for (const m of members) {
    const p = normalizePart(m.part);
    const extras = m.extras.trim();
    const withExtras = (base: string) => (extras ? `${base} · ${extras}` : base);
    const lastName = m.name.split(/\s/)[0];

    if (p === "dr") {
      rows.push({ instrument: "Kick", player: lastName, input: "マイク", count: 1 });
      rows.push({ instrument: "Snare", player: lastName, input: withExtras("マイク"), count: 1 });
      rows.push({ instrument: "Hi-Hat", player: lastName, input: "マイク", count: 1 });
      rows.push({ instrument: "OH L / R", player: lastName, input: "マイク 2本", count: 2 });
    } else if (p === "ba") {
      rows.push({ instrument: "Bass", player: lastName, input: withExtras("DI"), count: 1 });
    } else if (p === "gt") {
      rows.push({ instrument: "Gt.", player: lastName, input: withExtras("アンプにマイク"), count: 1 });
    } else if (p === "key" || p === "dtm") {
      const label = p === "key" ? "Key." : "DTM";
      rows.push(
        m.stereo
          ? { instrument: `${label} L / R`, player: lastName, input: withExtras("DI 2本"), count: 2 }
          : { instrument: label, player: lastName, input: withExtras("DI"), count: 1 }
      );
    } else if (p === "vo") {
      rows.push({
        instrument: "Vo.",
        player: lastName,
        input: withExtras(m.useVenueGear ? "マイク(会場のもの)" : "マイク(持ち込み)"),
        count: 1,
      });
    } else {
      rows.push({ instrument: m.part || "その他", player: lastName, input: withExtras("要相談"), count: 1 });
    }
  }

  let ch = 1;
  return rows.map((r) => {
    const label = r.count > 1 ? `${ch}–${ch + r.count - 1}` : `${ch}`;
    ch += r.count;
    return { ch: label, instrument: r.instrument, player: r.player, input: r.input };
  });
};

// ---------------------------------------------------------------------------
// 読み書き
// ---------------------------------------------------------------------------

const toLive = (id: string, data: unknown): Live => {
  const raw = data as Omit<Live, "id">;
  return { ...raw, lineup: raw.lineup ?? [], lineupBandIds: raw.lineupBandIds ?? [], id };
};

export async function fetchLives(): Promise<Live[]> {
  const snap = await getDocs(collection(db, "lives"));
  return snap.docs
    .map((d) => toLive(d.id, d.data()))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function fetchLive(id: string): Promise<Live | null> {
  const snap = await getDoc(doc(db, "lives", id));
  return snap.exists() ? toLive(snap.id, snap.data()) : null;
}

export type LiveInput = Pick<
  Live,
  | "title"
  | "date"
  | "venue"
  | "openTime"
  | "startTime"
  | "closeTime"
  | "applyDeadline"
  | "submitDeadline"
  | "changeoverMinutes"
>;

/** ライブを作成する。作成したライブのIDを返す */
export async function createLive(input: LiveInput, createdBy: string): Promise<string> {
  const ref = await addDoc(collection(db, "lives"), {
    ...input,
    applyClosesAt: endOfDayMillis(input.applyDeadline),
    submitClosesAt: endOfDayMillis(input.submitDeadline),
    lineup: [],
    lineupBandIds: [],
    createdBy,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateLive(id: string, input: LiveInput): Promise<void> {
  await updateDoc(doc(db, "lives", id), {
    ...input,
    applyClosesAt: endOfDayMillis(input.applyDeadline),
    submitClosesAt: endOfDayMillis(input.submitDeadline),
  });
}

/** 出演順を保存する。publish が true なら、出演バンドが提出できるようになる */
export async function saveLineup(id: string, lineup: LiveSlot[], publish: boolean): Promise<void> {
  await updateDoc(doc(db, "lives", id), {
    lineup,
    lineupBandIds: lineup.map((s) => s.bandId),
    ...(publish ? { lineupPublishedAt: new Date().toISOString() } : {}),
  });
}

// ---------------------------------------------------------------------------
// 読んだデータの型をそろえる(v1.4.1)
//
// ルールでは配列の中身(セットリストの各曲、編成の各メンバー)の型までは確かめきれない。
// 想定外の型の値が1件あるだけで、当日の資料などを開いた全員の画面が止まるので、
// 画面に渡す前にここでそろえる。
// ---------------------------------------------------------------------------

const toEntry = (id: string, data: unknown): LiveEntry => {
  const raw = data as Partial<LiveEntry>;
  return {
    id,
    bandId: asText(raw.bandId) || id,
    bandName: asText(raw.bandName),
    participate: raw.participate === true,
    desiredMinutes: asNumber(raw.desiredMinutes),
    unavailable: asText(raw.unavailable),
    note: asText(raw.note),
    updatedBy: asText(raw.updatedBy),
    updatedAt: asText(raw.updatedAt),
  };
};

const toSetlist = (id: string, data: unknown): LiveSetlist => {
  const raw = data as Partial<LiveSetlist>;
  const items = Array.isArray(raw.items) ? (raw.items as unknown[]) : [];
  return {
    id,
    bandId: asText(raw.bandId) || id,
    submittedAt: asText(raw.submittedAt),
    updatedBy: asText(raw.updatedBy),
    items: items
      .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
      .map((it, i) => ({
        id: asText(it.id) || `item-${i}`,
        kind: it.kind === "mc" ? "mc" : "song",
        title: asText(it.title),
        songType: it.songType === "オリジナル" || it.songType === "コピー" ? it.songType : undefined,
        artist: it.artist === undefined ? undefined : asText(it.artist),
        seconds: asNumber(it.seconds),
        note: it.note === undefined ? undefined : asText(it.note),
      })),
  };
};

const toStagePlan = (id: string, data: unknown): LiveStagePlan => {
  const raw = data as Partial<LiveStagePlan>;
  const members = Array.isArray(raw.members) ? (raw.members as unknown[]) : [];
  return {
    id,
    bandId: asText(raw.bandId) || id,
    monitorRequest: asText(raw.monitorRequest),
    submittedAt: asText(raw.submittedAt),
    updatedBy: asText(raw.updatedBy),
    members: members
      .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
      .map((m) => ({
        memberId: asText(m.memberId),
        name: asText(m.name),
        part: asText(m.part),
        useVenueGear: m.useVenueGear === true,
        stereo: m.stereo === true,
        extras: asText(m.extras),
        x: asNumber(m.x, 50),
        y: asNumber(m.y, 50),
      })),
  };
};

export async function fetchEntries(liveId: string): Promise<LiveEntry[]> {
  const snap = await getDocs(collection(db, "lives", liveId, "entries"));
  return snap.docs.map((d) => toEntry(d.id, d.data()));
}

export async function saveEntry(liveId: string, entry: Omit<LiveEntry, "id">): Promise<void> {
  await setDoc(doc(db, "lives", liveId, "entries", entry.bandId), entry);
}

export async function fetchSetlists(liveId: string): Promise<LiveSetlist[]> {
  const snap = await getDocs(collection(db, "lives", liveId, "setlists"));
  return snap.docs.map((d) => toSetlist(d.id, d.data()));
}

export async function fetchSetlist(liveId: string, bandId: string): Promise<LiveSetlist | null> {
  const snap = await getDoc(doc(db, "lives", liveId, "setlists", bandId));
  return snap.exists() ? toSetlist(snap.id, snap.data()) : null;
}

export async function saveSetlist(
  liveId: string,
  bandId: string,
  items: SetlistItem[],
  updatedBy: string
): Promise<void> {
  // Firestore は undefined を保存できないため、空の項目は落とす
  const cleaned = items.map((it) =>
    Object.fromEntries(Object.entries(it).filter(([, v]) => v !== undefined))
  );
  await setDoc(doc(db, "lives", liveId, "setlists", bandId), {
    bandId,
    items: cleaned,
    submittedAt: new Date().toISOString(),
    updatedBy,
  });
}

export async function fetchStagePlans(liveId: string): Promise<LiveStagePlan[]> {
  const snap = await getDocs(collection(db, "lives", liveId, "stagePlans"));
  return snap.docs.map((d) => toStagePlan(d.id, d.data()));
}

export async function fetchStagePlan(liveId: string, bandId: string): Promise<LiveStagePlan | null> {
  const snap = await getDoc(doc(db, "lives", liveId, "stagePlans", bandId));
  return snap.exists() ? toStagePlan(snap.id, snap.data()) : null;
}

export async function saveStagePlan(
  liveId: string,
  bandId: string,
  members: StageMember[],
  monitorRequest: string,
  updatedBy: string
): Promise<void> {
  await setDoc(doc(db, "lives", liveId, "stagePlans", bandId), {
    bandId,
    members,
    monitorRequest,
    submittedAt: new Date().toISOString(),
    updatedBy,
  });
}

/** 承認済みのバンド(出演を申し込めるバンド) */
export async function fetchApprovedBands(): Promise<Band[]> {
  const snap = await getDocs(collection(db, "bands"));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<Band, "id">), id: d.id }))
    .filter((b) => b.status === "承認済み");
}

/** 自分がメンバーのバンドか */
export const isMyBand = (band: Pick<Band, "members">, memberId: string): boolean =>
  band.members.some((m) => m.memberId === memberId);

/** バンドのメンバー全員のID(重複なし) */
export const memberIdsOfBands = (bands: Pick<Band, "members">[]): string[] =>
  Array.from(new Set(bands.flatMap((b) => b.members.map((m) => m.memberId))));

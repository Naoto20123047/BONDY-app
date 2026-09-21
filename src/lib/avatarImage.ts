/**
 * アバター画像の圧縮と保存
 *
 * Firebase Cloud Storage は 2026年2月以降 Blaze プラン必須のため使えない。
 * 代わりに canvas で小さく圧縮して、Firestore に base64 で持つ。
 *
 * 2種類のサイズを作る。
 *
 *  - サムネイル(96px): Member ドキュメントに直接持たせる
 *      名簿一覧・会費管理・掲示板コメントなど、一覧で使う。
 *      これらの画面は元々 members を全件読んでいるので、
 *      **読み取り回数は1回も増えない**。増えるのは1人あたり数KBの転送量だけ。
 *
 *  - 原寸(256px): images コレクションに別で持たせる
 *      マイページ・部員詳細など、1人だけ大きく出す画面で読む。
 *      Member に埋め込むと一覧で36名分の原寸を読むことになるため分けてある。
 */

import { doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

/** 原寸の長辺(px) */
export const AVATAR_MAX_EDGE = 256;
/** 原寸の目標サイズ。仕様は 30〜60KB */
const FULL_TARGET_BYTES = 60 * 1024;

/** サムネイルの長辺(px)。一覧では 32〜40px 程度で表示するので、高解像度でも足りる */
export const AVATAR_THUMB_EDGE = 96;
/** サムネイルの目標サイズ。36名分が members の読み込みに乗るため小さく保つ */
const THUMB_TARGET_BYTES = 6 * 1024;

/** 受け付ける元画像の上限。これを超えるものは処理に時間がかかりすぎる */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * Firestore の1ドキュメント上限は 1MiB。
 * base64 はバイナリの約1.33倍になるため、実質の天井は約700KB。
 */
const MAX_STORED_BYTES = 700 * 1024;

export interface CompressedAvatar {
  /** 原寸(images コレクション用) */
  full: string;
  /** サムネイル(Member ドキュメント用) */
  thumb: string;
}

// 同じ画像を何度も読みに行かないためのキャッシュ(タブを閉じるまで)
const cache = new Map<string, string>();

/** data URL のおおよそのバイト数 */
const approxBytes = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(",");
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((body.length * 3) / 4);
};

/**
 * ファイルを画像として読み込む。
 * createImageBitmap に imageOrientation: "from-image" を渡すことで、
 * EXIF の回転情報を反映してから描画する(EXIF自体は後段で捨てられるため)。
 */
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // 古い型定義には imageOrientation が無いことがあるため、ここだけ緩めにする
      const options = { imageOrientation: "from-image" } as unknown as ImageBitmapOptions;
      return await createImageBitmap(file, options);
    } catch {
      // 未対応のブラウザは <img> で読み込む(こちらも既定でEXIFの向きを反映する)
    }
  }

  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    img.src = url;
  });
}

/** 中央を正方形に切り出して、指定の大きさで描き直す */
function renderSquare(
  source: ImageBitmap | HTMLImageElement,
  edge: number
): HTMLCanvasElement {
  const side = Math.min(source.width, source.height);
  const sx = Math.floor((source.width - side) / 2);
  const sy = Math.floor((source.height - side) / 2);
  const size = Math.min(edge, side);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("画像の変換に失敗しました。");
  }
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

/** 目標サイズに収まるまで品質を落として書き出す */
function encode(canvas: HTMLCanvasElement, targetBytes: number): string {
  // WebP が使えるならそちら(同画質でJPEGより小さい)、だめならJPEG
  const probe = canvas.toDataURL("image/webp", 0.8);
  const type = probe.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";

  let quality = 0.85;
  let dataUrl = canvas.toDataURL(type, quality);
  while (approxBytes(dataUrl) > targetBytes && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL(type, quality);
  }
  return dataUrl;
}

/**
 * 画像を原寸とサムネイルの2種類に圧縮する。
 *
 * canvas に描き直して書き出すため、**EXIF はこの時点で完全に失われる**。
 * スマホの写真には GPS 座標が埋まっていることがあり、自宅や部室の位置が
 * 漏れるのを防ぐ目的でも、この経路を必ず通す。
 */
export async function compressAvatarImage(file: File): Promise<CompressedAvatar> {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください。");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("画像が大きすぎます。20MB以下のものを選んでください。");
  }

  const source = await loadImage(file);

  const full = encode(renderSquare(source, AVATAR_MAX_EDGE), FULL_TARGET_BYTES);
  const thumb = encode(renderSquare(source, AVATAR_THUMB_EDGE), THUMB_TARGET_BYTES);

  if ("close" in source) {
    source.close();
  }

  if (approxBytes(full) > MAX_STORED_BYTES) {
    throw new Error("画像を十分に小さくできませんでした。別の画像を選んでください。");
  }

  return { full, thumb };
}

/**
 * 保存済みの画像(dataURL)からサムネイルだけを作り直す。
 *
 * サムネイルを導入する前に設定された画像には avatarThumb が無く、
 * 一覧でアイコンカラーのままになってしまうため、その補完に使う。
 */
export async function makeThumbFromDataUrl(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = dataUrl;
  });
  return encode(renderSquare(img, AVATAR_THUMB_EDGE), THUMB_TARGET_BYTES);
}

/** 原寸の画像を取得する。未設定・削除済み・読めない場合は null */
export async function loadAvatarImage(imageId: string): Promise<string | null> {
  const cached = cache.get(imageId);
  if (cached) return cached;

  try {
    const snapshot = await getDoc(doc(db, "images", imageId));
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as { dataUrl?: string };
    if (!data.dataUrl) return null;
    cache.set(imageId, data.dataUrl);
    return data.dataUrl;
  } catch (e) {
    // 取得できなくてもサムネイルかアイコンカラーにフォールバックすればよい
    console.error("アバター画像の取得に失敗しました", e);
    return null;
  }
}

/** 原寸の画像を保存する。ドキュメントIDは memberId と同じ(上書き) */
export async function saveAvatarImage(memberId: string, dataUrl: string): Promise<string> {
  await setDoc(doc(db, "images", memberId), {
    ownerId: memberId,
    dataUrl,
    updatedAt: new Date().toISOString(),
  });
  cache.set(memberId, dataUrl);
  return memberId;
}

/** 原寸の画像を削除する(アイコンカラー表示に戻す) */
export async function deleteAvatarImage(memberId: string): Promise<void> {
  await deleteDoc(doc(db, "images", memberId));
  cache.delete(memberId);
}

/**
 * avatarThumb が欠けている自分の Member を補完する。
 *
 * サムネイルを導入する前に画像を設定した人は、Member に avatarThumb を持たない。
 * この状態だと原寸を読む画面(マイページ・部員詳細)では画像が出るのに、
 * 一覧では出ないという食い違いが起きる。
 *
 * ログイン時に一度だけ実行して、自分の分を自動で埋める。
 * 他人の Member は書き換えられないので、各自のログイン時に解消される。
 *
 * 補完できたサムネイルを返す(何もしなかった・失敗した場合は null)。
 */
export async function backfillAvatarThumb(
  memberId: string,
  imageId: string
): Promise<string | null> {
  try {
    const full = await loadAvatarImage(imageId);
    if (!full) return null;

    const thumb = await makeThumbFromDataUrl(full);
    await updateDoc(doc(db, "members", memberId), { avatarThumb: thumb });
    console.log("[avatar] 一覧用サムネイルを補完しました", `${Math.round(thumb.length / 1024)}KB`);
    return thumb;
  } catch (e) {
    console.error("アバターのサムネイル補完に失敗しました", e);
    return null;
  }
}

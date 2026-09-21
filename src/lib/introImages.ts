/**
 * 紹介ページの写真
 *
 * アイコン画像(avatarImage.ts)は Firestore に base64 で持っているが、
 * 紹介ページの写真は枚数も1枚あたりのサイズも桁が違うため、Worker に付いている
 * Cloudflare Workers KV に置く。アプリは KV を直接触らず、すべて Worker 経由。
 *
 *   アップロード  … アプリで圧縮 → Worker → KV
 *   表示         … Worker から期限付きの署名URLをもらって <img src> に渡す
 *
 * 当初は Google Drive に置く設計だったが、サービスアカウントは保存容量を持たず
 * (403 storageQuotaExceeded)、回避策の共有ドライブと OAuth 委任はどちらも
 * Google Workspace 契約が前提のため断念した(worker/src/imageStore.ts に詳細)。
 *
 * <img> には Authorization ヘッダを付けられないため、画像URLだけは
 * Firebase の ID トークンでは守れない。代わりに Worker が発行する
 * 期限付き署名で守っている(worker/src/imageStore.ts のコメント参照)。
 */

import { callWorker, isWorkerConfigured } from "./workerClient";
import type { IntroPage, IntroImage } from "../Types/types";

/** 長辺の上限(px)。PCの全幅で見ても粗くならない程度 */
const MAX_EDGE = 1600;

/** 目標サイズ。KV の無料枠は1GBなので、無闇に大きくしない */
const TARGET_BYTES = 400 * 1024;

/** 受け付ける元画像の上限 */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/** 署名URLを作り直すまでの余裕(秒)。期限ぎりぎりで読み込むのを避ける */
const REFRESH_MARGIN = 10 * 60;

interface CachedUrl {
  url: string;
  /** エポック秒 */
  expiresAt: number;
}

// タブを開いている間だけ持つ。署名は使い回せるので、画面遷移のたびに取り直さない
const urlCache = new Map<string, CachedUrl>();

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** data URL のおおよそのバイト数 */
function approxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((body.length * 3) / 4);
}

/**
 * ファイルを画像として読み込む。
 * createImageBitmap に imageOrientation: "from-image" を渡して、
 * EXIF の回転を反映してから描画する。
 */
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      const options = { imageOrientation: "from-image" } as unknown as ImageBitmapOptions;
      return await createImageBitmap(file, options);
    } catch {
      // 未対応のブラウザは <img> で読み込む
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

/**
 * 長辺が MAX_EDGE に収まるよう縮めて描き直す。
 * アイコンと違い切り抜きはしない(構図を保つ)。
 */
function render(source: ImageBitmap | HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("画像の変換に失敗しました。");
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** 目標サイズに収まるまで品質を落として書き出す */
function encode(canvas: HTMLCanvasElement): string {
  const probe = canvas.toDataURL("image/webp", 0.8);
  const type = probe.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";

  let quality = 0.86;
  let dataUrl = canvas.toDataURL(type, quality);
  while (approxBytes(dataUrl) > TARGET_BYTES && quality > 0.45) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL(type, quality);
  }
  return dataUrl;
}

/**
 * 画像を圧縮して data URL にする。
 *
 * canvas に描き直すため **EXIF はこの時点で完全に失われる**。
 * スマホの写真には GPS 座標が入っていることがあり、部室や自宅の位置が
 * 紹介ページから漏れるのを防ぐ目的でも、必ずこの経路を通す。
 */
export async function compressIntroImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください。");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("画像が大きすぎます。25MB以下のものを選んでください。");
  }

  const source = await loadImage(file);
  const dataUrl = encode(render(source));
  if ("close" in source) {
    source.close();
  }
  return dataUrl;
}

interface UploadResponse {
  fileId: string;
  url: string;
  expiresIn: number;
}

/**
 * 画像を圧縮して保存する(幹部のみ)。
 * 返ってきた署名URLはそのままキャッシュに入れるので、すぐ表示できる。
 */
export async function uploadIntroImage(
  file: File
): Promise<{ fileId: string; url: string }> {
  if (!isWorkerConfigured()) {
    throw new Error(
      "画像のアップロード先が設定されていません。管理者に連絡してください。"
    );
  }

  const dataUrl = await compressIntroImage(file);

  const response = await callWorker<UploadResponse>("/images/upload", {
    dataUrl,
    name: file.name.replace(/\.[^.]+$/, ""),
  });

  urlCache.set(response.fileId, {
    url: response.url,
    expiresAt: nowSeconds() + response.expiresIn,
  });

  return { fileId: response.fileId, url: response.url };
}

/** 画像を消す(幹部のみ)。失敗しても致命的ではない */
export async function deleteIntroImage(fileId: string): Promise<void> {
  if (!isWorkerConfigured()) return;
  try {
    await callWorker("/images/delete", { fileId });
  } catch (e) {
    console.error("画像の削除に失敗しました", e);
  }
  urlCache.delete(fileId);
}

interface SignResponse {
  urls: Record<string, string>;
  expiresIn: number;
}

/**
 * 表示用の署名URLをまとめて取得する。
 *
 * キャッシュに残っていて期限に余裕があるものは問い合わせない。
 * Worker が未設定・応答しない場合は空のまま返す(画像が出ないだけで、
 * 文章は表示できる)。
 */
export async function resolveIntroImageUrls(
  fileIds: string[]
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  const limit = nowSeconds() + REFRESH_MARGIN;

  for (const fileId of fileIds) {
    const cached = urlCache.get(fileId);
    if (cached && cached.expiresAt > limit) {
      resolved[fileId] = cached.url;
    } else {
      missing.push(fileId);
    }
  }

  if (missing.length === 0 || !isWorkerConfigured()) {
    return resolved;
  }

  try {
    const response = await callWorker<SignResponse>("/images/sign", {
      fileIds: missing,
    });
    const expiresAt = nowSeconds() + response.expiresIn;
    for (const [fileId, url] of Object.entries(response.urls)) {
      urlCache.set(fileId, { url, expiresAt });
      resolved[fileId] = url;
    }
  } catch (e) {
    // 画像が出ないだけで紹介ページ自体は読める。ここで画面を止めない
    console.error("画像URLの取得に失敗しました", e);
  }

  return resolved;
}

/** ページ内で使われている画像のファイルIDを重複なく集める */
export function collectIntroFileIds(page: IntroPage): string[] {
  const ids = new Set<string>();

  const add = (image?: IntroImage) => {
    if (image?.fileId) ids.add(image.fileId);
  };

  add(page.heroImage);
  for (const block of page.blocks) {
    add(block.image);
    for (const image of block.images ?? []) add(image);
  }

  return Array.from(ids);
}

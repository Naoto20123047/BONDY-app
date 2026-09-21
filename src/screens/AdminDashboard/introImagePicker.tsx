import { useEffect, useRef, useState } from "react";
import { uploadIntroImage, resolveIntroImageUrls } from "../../lib/introImages";
import type { IntroImage } from "../../Types/types";

interface IntroImagePickerProps {
  image?: IntroImage;
  /** null を渡すと「写真を外す」。Drive 側の削除は呼び出し元が行う */
  onChange: (image: IntroImage | null) => void;
  /** 写真の下に出す説明文の欄を出すか */
  withCaption?: boolean;
  /** 未設定のときにボタンに出す文言 */
  emptyLabel?: string;
}

/**
 * 紹介ページ用の写真を選ぶ欄。
 *
 * 選んだ瞬間にアプリ側で圧縮し、Worker 経由で Drive に上げる。
 * 「保存する」を押す前でもアップロードは終わっているので、
 * 保存に失敗しても写真は Drive に残る(使わなければ放置される)。
 *
 * 圧縮の過程で EXIF が落ちるため、スマホの写真に入っている GPS 座標は
 * Drive にも紹介ページにも残らない(introImages.ts のコメント参照)。
 */
export default function IntroImagePicker({
  image,
  onChange,
  withCaption = true,
  emptyLabel = "写真を選ぶ",
}: IntroImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileId = image?.fileId;

  // 既に設定されている写真のプレビューを取りに行く
  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    resolveIntroImageUrls([fileId]).then((map) => {
      if (!cancelled) setUrl(map[fileId] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const handlePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを続けて選べるように、値は毎回空に戻す
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const uploaded = await uploadIntroImage(file);
      setUrl(uploaded.url);
      onChange({
        fileId: uploaded.fileId,
        alt: image?.alt ?? "",
        caption: image?.caption ?? "",
      });
    } catch (e) {
      console.error("写真のアップロードに失敗しました", e);
      window.alert(
        e instanceof Error ? e.message : "写真のアップロードに失敗しました。"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = () => {
    const ok = window.confirm(
      "この写真を外します。Drive からも削除されるので、元に戻せません。\n\nよろしいですか?"
    );
    if (!ok) return;
    setUrl(null);
    onChange(null);
  };

  return (
    <div className="intro-pick">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handlePick}
        style={{ display: "none" }}
      />

      {fileId ? (
        <div className="intro-pick-preview">
          {url ? (
            <img className="intro-pick-img" src={url} alt="" />
          ) : (
            <div className="intro-pick-img is-loading" />
          )}
          <div className="intro-pick-actions">
            <button
              type="button"
              className="intro-pick-btn"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <i className="ti ti-refresh" /> 差し替える
            </button>
            <button
              type="button"
              className="intro-pick-btn danger"
              onClick={handleRemove}
              disabled={busy}
            >
              <i className="ti ti-trash" /> 外す
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="intro-pick-empty"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <i className={`ti ${busy ? "ti-loader" : "ti-photo-plus"}`} />
          {busy ? "アップロード中..." : emptyLabel}
        </button>
      )}

      {fileId && (
        <div className="intro-pick-fields">
          <input
            className="intro-edit-input"
            value={image?.alt ?? ""}
            onChange={(e) => onChange({ ...image!, alt: e.target.value })}
            placeholder="写真の説明(読み上げ用。任意)"
          />
          {withCaption && (
            <input
              className="intro-edit-input"
              value={image?.caption ?? ""}
              onChange={(e) => onChange({ ...image!, caption: e.target.value })}
              placeholder="写真の下に出す一言(任意)"
            />
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import "./memberAvatar.css";
import { avatarStyle } from "../../lib/avatarColors";
import { loadAvatarImage } from "../../lib/avatarImage";

interface MemberAvatarProps {
  name: string;
  /** 画像が無いときに出す文字。省略すると name の1文字目 */
  label?: string;
  avatarColor?: string;
  /** 一覧用の小さい画像。Member ドキュメントに入っているので追加の読み取りは発生しない */
  avatarThumb?: string;
  /** 原寸を読みたい画面だけ渡す。渡すと images コレクションへの読み取りが1回発生する */
  avatarImageId?: string;
  /** 大きさ・角丸は呼び出し側のクラスで決める(.mypage-avatar など) */
  className: string;
}

/**
 * アバターの表示。
 *
 * 表示の優先順位は 原寸 → サムネイル → アイコンカラー+頭文字。
 *
 * 一覧画面では avatarImageId を渡さないこと。渡すと人数分の読み取りが発生する。
 * サムネイルだけなら members の読み込みに相乗りするので追加コストはない。
 */
export default function MemberAvatar({
  name,
  label,
  avatarColor,
  avatarThumb,
  avatarImageId,
  className,
}: MemberAvatarProps) {
  const [fullSrc, setFullSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!avatarImageId) {
      setFullSrc(null);
      return;
    }

    loadAvatarImage(avatarImageId).then((dataUrl) => {
      if (!cancelled) setFullSrc(dataUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [avatarImageId]);

  // 原寸が読めるまではサムネイルを出しておく(切り替わりのちらつきを防ぐ)
  const src = fullSrc ?? avatarThumb ?? null;

  // 画像があるときは背景色を当てない(円の縁に色が出てしまうため)
  return (
    <div className={className} style={src ? undefined : avatarStyle(avatarColor)}>
      {src ? (
        <img src={src} alt="" className="member-avatar-img" />
      ) : (
        label ?? name.charAt(0)
      )}
    </div>
  );
}

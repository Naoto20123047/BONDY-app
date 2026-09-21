import { useState, useEffect } from "react";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { togglePart } from "../../lib/parts";
import { DEFAULT_AVATAR_COLOR } from "../../lib/avatarColors";
import {
  compressAvatarImage,
  loadAvatarImage,
  saveAvatarImage,
  deleteAvatarImage,
  makeThumbFromDataUrl,
} from "../../lib/avatarImage";

export function useEditProfile() {
  const { member, refreshMember, refreshMemberMap } = useAuth();
  const [parts, setParts] = useState<string[]>([]);
  const [nickname, setNickname] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(DEFAULT_AVATAR_COLOR);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // アバター画像
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null); // プレビュー(原寸)
  const [imageThumb, setImageThumb] = useState<string | null>(null);     // 一覧用サムネイル
  const [imageChanged, setImageChanged] = useState(false);               // 保存時に書き込むか
  const [imageError, setImageError] = useState<string | null>(null);
  const [processingImage, setProcessingImage] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (member) {
      setParts(member.parts ?? []);
      setNickname(member.nickname ?? "");
      setAvatarColor(member.avatarColor ?? DEFAULT_AVATAR_COLOR);
      setImageChanged(false);
      setImageError(null);
      setImageThumb(member.avatarThumb ?? null);

      // 設定済みの画像を読み込んでプレビューに出す。
      // 読めるまではサムネイルを出しておく
      if (member.avatarImageId) {
        const hadThumb = !!member.avatarThumb;
        setImageDataUrl(member.avatarThumb ?? null);

        loadAvatarImage(member.avatarImageId).then(async (dataUrl) => {
          if (cancelled || !dataUrl) return;
          setImageDataUrl(dataUrl);

          // サムネイルを導入する前に設定された画像には avatarThumb が無い。
          // 一覧に出ないままになるので、ここで作って保存時に書き込む
          if (!hadThumb) {
            try {
              const thumb = await makeThumbFromDataUrl(dataUrl);
              if (!cancelled) setImageThumb(thumb);
            } catch (e) {
              console.error("サムネイルの生成に失敗しました", e);
            }
          }
        });
      } else {
        setImageDataUrl(null);
      }
    }
    setLoading(false);

    return () => {
      cancelled = true;
    };
  }, [member]);

  // パートの選択をトグル(「なし」は他と排他)
  const toggle = (part: string) => {
    setParts((prev) => togglePart(prev, part));
  };

  /** 画像を選び直す。ここで圧縮とEXIF除去まで済ませ、保存は「保存する」を押したとき */
  const pickImage = async (file: File) => {
    setImageError(null);
    setProcessingImage(true);
    try {
      const { full, thumb } = await compressAvatarImage(file);
      setImageDataUrl(full);
      setImageThumb(thumb);
      setImageChanged(true);
    } catch (e) {
      console.error("画像の処理に失敗しました", e);
      setImageError(e instanceof Error ? e.message : "画像を処理できませんでした。");
    } finally {
      setProcessingImage(false);
    }
  };

  /** 画像を外してアイコンカラー表示に戻す */
  const clearImage = () => {
    setImageError(null);
    setImageDataUrl(null);
    setImageThumb(null);
    setImageChanged(true);
  };

  const save = async (onDone: () => void) => {
    if (!member) return;
    if (parts.length === 0) {
      window.alert("パートを選択してください。担当がない場合は「なし」を選んでください。");
      return;
    }
    if (nickname.trim().length > 20) {
      window.alert("ニックネームは20文字以内で入力してください。");
      return;
    }
    setSaving(true);
    try {
      // 書き込むサムネイル。
      // 画像はあるのに avatarThumb が無い場合は、ここで確実に作る。
      // 画面を開いた直後に保存を押すと、非同期の補完が間に合わないことがあるため、
      // タイミングに依存しないようこの場でも作り直す。
      let thumbToWrite = imageThumb;
      if (!imageChanged && member.avatarImageId && !member.avatarThumb) {
        try {
          const full = imageDataUrl ?? (await loadAvatarImage(member.avatarImageId));
          if (full) {
            thumbToWrite = await makeThumbFromDataUrl(full);
          }
        } catch (e) {
          console.error("サムネイルの生成に失敗しました", e);
        }
      }

      // 画像は Member とは別のコレクションに書く
      if (imageChanged) {
        try {
          if (imageDataUrl) {
            await saveAvatarImage(member.id, imageDataUrl);
          } else {
            await deleteAvatarImage(member.id);
          }
        } catch (e) {
          console.error("アバター画像の保存に失敗しました", e);
          window.alert("アバター画像の保存に失敗しました。時間をおいて再度お試しください。");
          return; // 画像が保存できていないので参照IDも書き換えない
        }
      }

      await updateDoc(doc(db, "members", member.id), {
        parts,
        nickname: nickname.trim(),
        avatarColor,
        // 変更したときだけ触る。外した場合はフィールドごと消す。
        // サムネイルは Member に直接持たせるので、一覧画面は追加の読み取り無しで表示できる
        ...(imageChanged
          ? {
              avatarImageId: imageDataUrl ? member.id : deleteField(),
              avatarThumb: thumbToWrite ? thumbToWrite : deleteField(),
            }
          : // 画像は変えていないが、サムネイルだけ欠けている場合は補う
          thumbToWrite && !member.avatarThumb
          ? { avatarThumb: thumbToWrite }
          : {}),
      });

      await refreshMember();     // 自分の情報を更新
      await refreshMemberMap();  // 他画面のアバター表示にも反映
      onDone();
    } catch (e) {
      console.error("プロフィールの更新に失敗しました", e);
      window.alert("更新に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return {
    member,
    parts,
    toggle,
    nickname,
    setNickname,
    avatarColor,
    setAvatarColor,
    imageDataUrl,
    pickImage,
    clearImage,
    imageError,
    processingImage,
    loading,
    saving,
    save,
  } as const;
}

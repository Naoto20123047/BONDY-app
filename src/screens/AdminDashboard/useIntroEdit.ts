import { useState, useEffect } from "react";
import { useAuth } from "../../lib/AuthContext";
import {
  loadIntroPage,
  saveIntroPage,
  createBlock,
  newBlockId,
  clampSpan,
} from "../../lib/introPage";
import { deleteIntroImage } from "../../lib/introImages";
import type {
  IntroBlock,
  IntroBlockType,
  IntroImage,
  IntroTone,
} from "../../Types/types";

/**
 * 紹介ページの編集(幹部のみ)
 *
 * ブロックを積んでページを組み立てる。Markdown は使わない。
 * 幹部が記法を覚える必要がないようにするため、改行はそのまま表示される
 * (表示側で white-space: pre-wrap)。
 *
 * 並べ替えはドラッグと上下ボタンの両方を用意してある。
 * HTML標準のドラッグはタッチ端末では動かないため、スマホからでも
 * 編集できるよう上下ボタンを残している。
 */
export function useIntroEdit() {
  const { member } = useAuth();
  const [title, setTitle] = useState("");
  const [lead, setLead] = useState("");
  const [heroImage, setHeroImage] = useState<IntroImage | undefined>(undefined);
  const [blocks, setBlocks] = useState<IntroBlock[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /** いま開いているブロック。1つずつ開いて編集する */
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadIntroPage().then((page) => {
      if (cancelled) return;
      setTitle(page.title);
      setLead(page.lead);
      setHeroImage(page.heroImage);
      setBlocks(page.blocks);
      setUpdatedAt(page.updatedAt);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // ブロックの増減
  // -------------------------------------------------------------------------

  const addBlock = (type: IntroBlockType) => {
    const block = createBlock(type);
    setBlocks((prev) => [...prev, block]);
    setOpenId(block.id);
  };

  const updateBlock = (id: string, patch: Partial<IntroBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBlock = (id: string) => {
    const target = blocks.find((b) => b.id === id);
    if (!target) return;

    const label = target.heading?.trim() || "このブロック";
    const ok = window.confirm(`「${label}」を削除します。よろしいですか?`);
    if (!ok) return;

    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (openId === id) setOpenId(null);

    // ブロックを消しても写真は Drive に残す。別のブロックで使い回すことがあるため。
    // 写真そのものを消すのは「写真を外す」を押したときだけ。
  };

  /** 並べ替え。direction が -1 なら上へ、1 なら下へ */
  const moveBlock = (id: string, direction: -1 | 1) => {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (index < 0) return prev;
      const next = index + direction;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  };

  /** ドラッグでの並べ替え。掴んだブロックを、落とした位置に差し込む */
  const reorderBlock = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setBlocks((prev) => {
      const from = prev.findIndex((b) => b.id === draggedId);
      const to = prev.findIndex((b) => b.id === targetId);
      if (from < 0 || to < 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  };

  /** ブロックを複製する。同じ形のものを続けて作るとき用 */
  const duplicateBlock = (id: string) => {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (index < 0) return prev;
      const source = prev[index];
      const copy: IntroBlock = {
        ...source,
        id: newBlockId(),
        cards: source.cards?.map((c) => ({ ...c, id: newBlockId() })),
        stats: source.stats?.map((s) => ({ ...s, id: newBlockId() })),
        images: source.images?.map((i) => ({ ...i })),
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const setSpan = (id: string, span: number) => {
    updateBlock(id, { span: clampSpan(span) });
  };

  const setTone = (id: string, tone: IntroTone) => {
    updateBlock(id, { tone });
  };

  // -------------------------------------------------------------------------
  // 写真
  // -------------------------------------------------------------------------

  /** ブロックの写真を差し替える。null を渡すと外す(Drive からも消す) */
  const setBlockImage = async (id: string, image: IntroImage | null) => {
    const current = blocks.find((b) => b.id === id)?.image;
    updateBlock(id, { image: image ?? undefined });
    if (!image && current?.fileId) {
      await deleteIntroImage(current.fileId);
    }
  };

  const addGalleryImage = (id: string, image: IntroImage) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, images: [...(b.images ?? []), image] } : b))
    );
  };

  const removeGalleryImage = async (id: string, fileId: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, images: (b.images ?? []).filter((i) => i.fileId !== fileId) }
          : b
      )
    );
    await deleteIntroImage(fileId);
  };

  const updateGalleryImage = (
    id: string,
    fileId: string,
    patch: Partial<IntroImage>
  ) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              images: (b.images ?? []).map((i) =>
                i.fileId === fileId ? { ...i, ...patch } : i
              ),
            }
          : b
      )
    );
  };

  /** ヒーローの背景写真を差し替える。null を渡すと外す */
  const changeHeroImage = async (image: IntroImage | null) => {
    const current = heroImage;
    setHeroImage(image ?? undefined);
    if (!image && current?.fileId) {
      await deleteIntroImage(current.fileId);
    }
  };

  // -------------------------------------------------------------------------
  // カードと数字
  // -------------------------------------------------------------------------

  const addCard = (id: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              cards: [...(b.cards ?? []), { id: newBlockId(), title: "", body: "" }],
            }
          : b
      )
    );
  };

  const updateCard = (
    id: string,
    cardId: string,
    field: "title" | "body",
    value: string
  ) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              cards: (b.cards ?? []).map((c) =>
                c.id === cardId ? { ...c, [field]: value } : c
              ),
            }
          : b
      )
    );
  };

  const removeCard = (id: string, cardId: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, cards: (b.cards ?? []).filter((c) => c.id !== cardId) }
          : b
      )
    );
  };

  const addStat = (id: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              stats: [...(b.stats ?? []), { id: newBlockId(), value: "", label: "" }],
            }
          : b
      )
    );
  };

  const updateStat = (
    id: string,
    statId: string,
    field: "value" | "label",
    value: string
  ) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              stats: (b.stats ?? []).map((s) =>
                s.id === statId ? { ...s, [field]: value } : s
              ),
            }
          : b
      )
    );
  };

  const removeStat = (id: string, statId: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, stats: (b.stats ?? []).filter((s) => s.id !== statId) }
          : b
      )
    );
  };

  // -------------------------------------------------------------------------
  // 保存
  // -------------------------------------------------------------------------

  /** 中身が何も無いブロックは保存しない(押し間違いで空欄が増えないように) */
  const isEmpty = (block: IntroBlock): boolean => {
    switch (block.type) {
      case "spacer":
        return false;
      case "image":
        return !block.image?.fileId;
      case "gallery":
        return (block.images ?? []).length === 0;
      case "cards":
        return (block.cards ?? []).every(
          (c) => c.title.trim() === "" && c.body.trim() === ""
        );
      case "stats":
        return (block.stats ?? []).every(
          (s) => s.value.trim() === "" && s.label.trim() === ""
        );
      case "imageText":
        return !block.image?.fileId && !block.heading?.trim() && !block.body?.trim();
      default:
        return !block.heading?.trim() && !block.body?.trim();
    }
  };

  const save = async (onDone?: () => void) => {
    if (!member) return;
    if (!title.trim()) {
      window.alert("タイトルを入力してください。");
      return;
    }

    const cleaned = blocks.filter((b) => !isEmpty(b));

    setSaving(true);
    try {
      await saveIntroPage({ title, lead, heroImage, blocks: cleaned }, member.id);
      setBlocks(cleaned);
      setUpdatedAt(new Date().toISOString());
      window.alert("サークル紹介を保存しました。");
      if (onDone) onDone();
    } catch (e) {
      console.error("紹介ページの保存に失敗しました", e);
      window.alert("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return {
    title,
    setTitle,
    lead,
    setLead,
    heroImage,
    changeHeroImage,
    blocks,
    openId,
    setOpenId,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
    reorderBlock,
    duplicateBlock,
    setSpan,
    setTone,
    setBlockImage,
    addGalleryImage,
    removeGalleryImage,
    updateGalleryImage,
    addCard,
    updateCard,
    removeCard,
    addStat,
    updateStat,
    removeStat,
    updatedAt,
    loading,
    saving,
    save,
  } as const;
}

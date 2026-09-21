import { useState, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import {
  getEvent,
  listItems,
  createEvent,
  updateEvent,
  setEventHidden,
  createItem,
  updateItem,
  setItemHidden,
  saveItemOrder,
  deleteItem,
  deleteEventWithItems,
  parseYouTubeId,
} from "../../lib/archive";
import type { ArchiveEvent, ArchiveItem, ArchiveMediaKind, Band } from "../../Types/types";

/** 映像1本ぶんの入力内容 */
export interface ItemForm {
  kind: ArchiveMediaKind;
  /** 貼り付けられた YouTube の URL。保存時に動画IDへ変換する */
  url: string;
  title: string;
  bandId: string;
  note: string;
}

export interface BandOption {
  id: string;
  name: string;
  /** 解散済みかどうか。過去の演奏には解散したバンドも紐づく */
  dissolved: boolean;
}

/**
 * アーカイブの登録・編集(幹部のみ)
 *
 * eventId が undefined のときは新規作成。保存するとIDが確定するので、
 * 呼び出し側で編集画面へ移す。映像の追加は、イベントが存在してからになる。
 */
export function useArchiveEdit(eventId: string | undefined) {
  const { member } = useAuth();

  const [event, setEvent] = useState<ArchiveEvent | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [note, setNote] = useState("");

  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [bands, setBands] = useState<BandOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const bandsSnap = await getDocs(collection(db, "bands"));
      setBands(
        bandsSnap.docs
          .map((d) => {
            const data = d.data() as Omit<Band, "id">;
            return {
              id: d.id,
              name: data.name,
              dissolved: data.status === "解散",
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "ja"))
      );

      if (!eventId) {
        setLoading(false);
        return;
      }

      const [found, list] = await Promise.all([
        getEvent(eventId),
        listItems(eventId, true),
      ]);
      if (found) {
        setEvent(found);
        setTitle(found.title);
        setDate(found.date);
        setVenue(found.venue ?? "");
        setNote(found.note ?? "");
      }
      setItems(list);
    } catch (e) {
      console.error("アーカイブの取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // -------------------------------------------------------------------------
  // イベント
  // -------------------------------------------------------------------------

  /** 保存する。新規なら作成したIDを返す */
  const save = async (): Promise<string | null> => {
    if (!member) return null;
    if (!title.trim()) {
      window.alert("イベント名を入力してください。");
      return null;
    }
    if (!date) {
      window.alert("開催日を入力してください。");
      return null;
    }

    setSaving(true);
    try {
      const input = { title, date, venue, note };
      if (event) {
        await updateEvent(event.id, input);
        await load();
        window.alert("保存しました。");
        return event.id;
      }
      const newId = await createEvent(input, member.id);
      window.alert("イベントを作成しました。続けて映像を追加できます。");
      return newId;
    } catch (e) {
      console.error("イベントの保存に失敗しました", e);
      window.alert("保存に失敗しました。");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const toggleEventHidden = async () => {
    if (!event) return;
    const next = !event.hidden;
    const ok = window.confirm(
      next
        ? "このイベントを一覧から隠します。記録は消えません。\n\nよろしいですか?"
        : "このイベントを一覧に戻します。よろしいですか?"
    );
    if (!ok) return;
    try {
      await setEventHidden(event.id, next);
      await load();
    } catch (e) {
      console.error("表示の切り替えに失敗しました", e);
      window.alert("切り替えに失敗しました。");
    }
  };

  /**
   * イベントを取り消す。紐づく映像もまとめて消える。
   *
   * 作成し間違えたときのための操作。記録を残したまま一覧から外したい場合は
   * 非表示を使う。成功したら true を返すので、呼び出し側で一覧へ戻す。
   */
  const removeEvent = async (): Promise<boolean> => {
    if (!event) return false;

    const count = items.length;
    const ok = window.confirm(
      `「${event.title}」を削除します。\n\n` +
        (count > 0
          ? `登録されている映像・音源 ${count}本 の記録も一緒に消えます。\n`
          : "") +
        "元に戻せません。YouTube上の動画そのものは消えません。\n\n" +
        "記録を残したまま一覧から外すだけなら、「一覧から隠す」を使ってください。\n\n" +
        "本当に削除しますか?"
    );
    if (!ok) return false;

    setSaving(true);
    try {
      await deleteEventWithItems(event.id);
      return true;
    } catch (e) {
      console.error("イベントの削除に失敗しました", e);
      window.alert("削除に失敗しました。");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // 映像・音源
  // -------------------------------------------------------------------------

  const addItem = async (form: ItemForm): Promise<boolean> => {
    if (!member || !event) return false;

    const youtubeId = parseYouTubeId(form.url);
    if (!youtubeId) {
      window.alert(
        "YouTubeのURLを認識できませんでした。\n\n" +
          "動画ページのURL(https://www.youtube.com/watch?v=... など)を貼り付けてください。"
      );
      return false;
    }
    if (!form.title.trim()) {
      window.alert("タイトルを入力してください。");
      return false;
    }

    try {
      await createItem(
        event,
        {
          kind: form.kind,
          youtubeId,
          title: form.title,
          bandId: form.bandId || undefined,
          note: form.note,
        },
        items.length,
        member.id
      );
      await load();
      return true;
    } catch (e) {
      console.error("映像の追加に失敗しました", e);
      window.alert("追加に失敗しました。");
      return false;
    }
  };

  const editItem = async (itemId: string, form: ItemForm): Promise<boolean> => {
    const youtubeId = parseYouTubeId(form.url);
    if (!youtubeId) {
      window.alert("YouTubeのURLを認識できませんでした。");
      return false;
    }
    if (!form.title.trim()) {
      window.alert("タイトルを入力してください。");
      return false;
    }

    try {
      await updateItem(itemId, {
        kind: form.kind,
        youtubeId,
        title: form.title,
        bandId: form.bandId || undefined,
        note: form.note,
      });
      await load();
      return true;
    } catch (e) {
      console.error("映像の更新に失敗しました", e);
      window.alert("更新に失敗しました。");
      return false;
    }
  };

  const toggleItemHidden = async (item: ArchiveItem) => {
    try {
      await setItemHidden(item.id, !item.hidden);
      await load();
    } catch (e) {
      console.error("表示の切り替えに失敗しました", e);
      window.alert("切り替えに失敗しました。");
    }
  };

  /** 並べ替え。direction が -1 なら上へ、1 なら下へ */
  const moveItem = async (itemId: string, direction: -1 | 1) => {
    const index = items.findIndex((i) => i.id === itemId);
    if (index < 0) return;
    const next = index + direction;
    if (next < 0 || next >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    // 先に画面へ反映してから保存する(待ち時間で引っかからないように)
    setItems(reordered.map((item, i) => ({ ...item, order: i })));

    try {
      await saveItemOrder(reordered);
    } catch (e) {
      console.error("並べ替えの保存に失敗しました", e);
      window.alert("並べ替えを保存できませんでした。");
      await load();
    }
  };

  const removeItem = async (item: ArchiveItem) => {
    const ok = window.confirm(
      `「${item.title}」の記録を完全に削除します。元に戻せません。\n\n` +
        "残しておきたい場合は、削除ではなく「非表示」を使ってください。\n\n" +
        "よろしいですか?"
    );
    if (!ok) return;
    try {
      await deleteItem(item.id);
      await load();
    } catch (e) {
      console.error("削除に失敗しました", e);
      window.alert("削除に失敗しました。");
    }
  };

  return {
    event,
    title,
    setTitle,
    date,
    setDate,
    venue,
    setVenue,
    note,
    setNote,
    items,
    bands,
    loading,
    saving,
    save,
    toggleEventHidden,
    removeEvent,
    addItem,
    editItem,
    toggleItemHidden,
    moveItem,
    removeItem,
  } as const;
}

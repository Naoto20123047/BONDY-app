import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { loadIntroPage, DEFAULT_INTRO } from "../../lib/introPage";
import IntroBody from "../Intro/IntroBody";
import type { IntroPage } from "../../Types/types";
import "./introScreen.css";

interface IntroScreenProps {
  /** 「加入する」を押したときに呼ばれる(プロフィール登録へ進む) */
  onJoin: () => void;
}

/**
 * 見学者向けの紹介画面。
 *
 * アカウントを作っただけで Member ドキュメントが無い人に表示する。
 * この状態は「見学・検討中」として正式に扱う方針なので、
 * 「加入しない」を選んでもアカウントは削除しない。後から戻ってこられる。
 *
 * 中身はアプリ内の「サークル紹介」と同じ IntroBody を使う。
 * 文章は幹部が幹部管理から編集する(pages/intro)。
 */
export default function IntroScreen({ onJoin }: IntroScreenProps) {
  const [page, setPage] = useState<IntroPage>(DEFAULT_INTRO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadIntroPage().then((loaded) => {
      if (!cancelled) {
        setPage(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDecline = async () => {
    const ok = window.confirm(
      "加入せずにログアウトします。\n\n" +
        "アカウントは残るので、気が変わったらいつでも同じアカウントでログインして加入できます。\n\n" +
        "よろしいですか?"
    );
    if (!ok) return;
    await signOut(auth);
  };

  if (loading) {
    return <div className="intro-join-loading">読み込み中...</div>;
  }

  return (
    <div className="intro-join-page">
      <IntroBody page={page} />

      <div className="intro-join-cta">
        <div className="intro-join-cta-inner">
          <h2 className="intro-join-cta-title">加入しますか?</h2>
          <p className="intro-join-cta-text">
            「加入する」を押すと、プロフィールの登録に進みます。
          </p>

          <button className="intro-join-btn" onClick={onJoin}>
            加入する
          </button>

          <button className="intro-decline-btn" onClick={handleDecline}>
            今は加入しない
          </button>

          <p className="intro-join-note">
            加入しなくてもアカウントは残ります。あとから加入することもできます。
          </p>
        </div>
      </div>
    </div>
  );
}

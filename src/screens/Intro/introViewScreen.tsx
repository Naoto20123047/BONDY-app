import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./introViewScreen.css";
import IntroBody from "./IntroBody";
import { useAuth } from "../../lib/AuthContext";
import { loadIntroPage, DEFAULT_INTRO } from "../../lib/introPage";
import type { IntroPage } from "../../Types/types";

/**
 * アプリ内の「サークル紹介」。
 *
 * サイドバーや下部ナビを出さず、**独立した1枚のページ**として全画面で表示する。
 * 見学者に見せている紹介画面とまったく同じ見た目になる。
 * アプリへは左上の「戻る」で戻る。
 */
export default function IntroViewScreen() {
  const navigate = useNavigate();
  const { member } = useAuth();
  const [page, setPage] = useState<IntroPage>(DEFAULT_INTRO);
  const [loading, setLoading] = useState(true);

  const isOfficer = member?.role === "幹部" || member?.role === "管理者";

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

  if (loading) {
    return <div className="intro-view-loading">読み込み中...</div>;
  }

  return (
    <div className="intro-view">
      {/* ページの上に浮かせる。スクロールしても付いてくる */}
      <div className="intro-view-bar">
        <button className="intro-view-btn" onClick={() => navigate("/home")}>
          <i className="ti ti-arrow-left" /> アプリに戻る
        </button>
        {isOfficer && (
          <button
            className="intro-view-btn"
            onClick={() => navigate("/admin/intro")}
          >
            <i className="ti ti-pencil" /> 編集
          </button>
        )}
      </div>

      <IntroBody page={page} />

      <footer className="intro-view-footer">
        <p className="intro-view-note">
          このページは、アカウントを作ったばかりの人にも同じ内容で表示されます。
          {page.updatedAt && `（最終更新:${page.updatedAt.slice(0, 10)}）`}
        </p>
      </footer>
    </div>
  );
}

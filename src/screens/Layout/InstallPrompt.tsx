import { useEffect, useState } from "react";
import "./installPrompt.css";

// ブラウザ標準の型定義に無いため、必要な範囲だけ独自定義
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// 閉じてから再度案内を出すまでの日数
const DISMISS_DAYS = 14;
const DISMISS_KEY = "bondy_install_prompt_dismissed_at";

// 既にホーム画面から起動しているか(=インストール済みでスタンドアロン表示)
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  // iOS Safariのみが持つ非標準プロパティ
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

// iOS(iPhone/iPad)のSafariかどうか(Chrome/Firefox on iOSは案内の操作手順が異なるため対象外)
const isIOSSafari = () => {
  const ua = window.navigator.userAgent;
  const isIOSDevice = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  return isIOSDevice && isSafari;
};

const isDismissed = () => {
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  const daysPassed = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return daysPassed < DISMISS_DAYS;
};

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // 初回レンダー時に一度だけ判定(useEffect内でのsetState連鎖を避けるため遅延初期化を使う)
  const [showIOSHint, setShowIOSHint] = useState(() => !isStandalone() && isIOSSafari());
  const [dismissed, setDismissed] = useState(() => isStandalone() || isDismissed());

  useEffect(() => {
    if (isStandalone()) return; // インストール済みなら以降のイベント監視も行わない

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowIOSHint(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  if (dismissed || isStandalone()) return null;
  if (!deferredPrompt && !showIOSHint) return null;

  return (
    <div className="install-prompt" role="status">
      <div className="install-prompt-icon">
        <i className="ti ti-download" />
      </div>
      <div className="install-prompt-body">
        {deferredPrompt ? (
          <>
            <p className="install-prompt-title">アプリをインストール</p>
            <p className="install-prompt-text">
              ホーム画面に追加すると、アプリのように素早く開けます。
            </p>
          </>
        ) : (
          <>
            <p className="install-prompt-title">ホーム画面に追加</p>
            <p className="install-prompt-text">
              <i className="ti ti-share-2" /> 共有ボタン →「ホーム画面に追加」でアプリのように使えます。
            </p>
          </>
        )}
      </div>
      <div className="install-prompt-actions">
        {deferredPrompt && (
          <button className="install-prompt-install" onClick={handleInstallClick}>
            インストール
          </button>
        )}
        <button className="install-prompt-close" onClick={handleDismiss} aria-label="閉じる">
          <i className="ti ti-x" />
        </button>
      </div>
    </div>
  );
}

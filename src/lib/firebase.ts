import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Firebaseアプリを初期化
const app = initializeApp(firebaseConfig);

/**
 * App Check(v1.4.1)。
 *
 * アプリ以外(スクリプトなど)から Firestore を呼ばれて、無料枠(1日5万読み取り)を
 * 使い切られるのを減らすための仕組み。reCAPTCHA v3 のサイトキーを
 * .env の VITE_RECAPTCHA_SITE_KEY に入れたときだけ有効になる(未設定なら何もしない)。
 *
 * **Firebase コンソールで App Check を「強制」にするのは、Worker を v1.4.1 にしてから。**
 * Worker は利用者の代わりに Firestore を読むため、App Check のトークンを
 * 一緒に渡す必要がある(lib/workerClient.ts と worker/src/firestore.ts)。
 * 開発時(localhost)はデバッグ用トークンが要る。手順は README を参照。
 */
const recaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? "").trim();
export const appCheck: AppCheck | null = recaptchaSiteKey
  ? initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

// 認証とFirestoreをエクスポート(各フックから使う)
export const auth = getAuth(app);
export const db = getFirestore(app);

# BONDY Worker

BONDYアプリのサーバー側処理を引き受ける Cloudflare Worker。

Firebase Spark プラン(無料)では Cloud Functions が使えないため、サーバーでしか
できない処理をここにまとめている。無料枠は 1日10万リクエストで、60名規模の
サークルでは到底使い切らない。

## エンドポイント

| メソッド | パス | 用途 | 権限 |
|---|---|---|---|
| GET | `/health` | 疎通確認 | 不要 |
| POST | `/notify/teams` | Teams への通知中継(C-2) | 在籍メンバー |
| POST | `/admin/disable-user` | Auth アカウントの有効/無効切り替え(A-3) | 幹部、または本人の退会時 |

Drive を使う画像の取得・アップロードは未実装。アーカイブ機能の公開範囲ルールが
決まってから追加する。

## 認証

全エンドポイント共通で Firebase の ID トークンを使う。

```
Authorization: Bearer <getIdToken() の結果>
```

Worker 側の流れ。

1. Google の公開鍵(JWKS)で署名を検証する。鍵は Cache API にキャッシュする
2. `iss` と `aud` が `bondy-app-66ca4` であることを確認する
3. 有効期限を確認する(時計ずれを60秒許容)
4. Firestore REST で `members/{uid}` を読み、`status` と `role` で権限を判定する

**権限判定にメールアドレスのドメインは使っていない。** v1.4.0 で外部メール連携を
入れるとドメイン判定が破綻するため、Member ドキュメントを正としている。

Firestore の読み取りは呼び出し元の ID トークンで行う。サービスアカウントを使って
いないので、Worker が Firestore を素通しで読める状態にはならず、セキュリティ
ルールがそのまま効く。

## セットアップ

```bash
cd worker
npm install
```

### Secrets の設定

**リポジトリが public なので、秘匿情報は絶対にコミットしないこと。**
`wrangler.toml` に書くのも禁止。以下は全て `wrangler secret put` で設定する。

```bash
# Teams の Workflows で発行した Webhook URL
npx wrangler secret put TEAMS_WEBHOOK_URL

# Firebase のサービスアカウントキー(JSON をそのまま貼り付ける)
# Firebaseコンソール → プロジェクトの設定 → サービスアカウント → 新しい秘密鍵の生成
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
```

サービスアカウントには Identity Toolkit の管理権限が必要。Firebase が自動生成する
`firebase-adminsdk-xxxxx@bondy-app-66ca4.iam.gserviceaccount.com` には既に付いている。

### デプロイ

```bash
npx wrangler deploy
```

デプロイ元の Cloudflare アカウントは、**サークル共用Googleアカウントに紐づけること。**
個人アカウントに紐づけると引き継ぎができなくなる。

### アプリ側の設定

デプロイ後に払い出される URL を、アプリの `.env` に追加する。

```
VITE_WORKER_URL=https://bondy-worker.<サブドメイン>.workers.dev
```

## 動作確認

### Phase 0: 疎通

```bash
# 認証不要。CORS とルーティングの確認
curl https://bondy-worker.<サブドメイン>.workers.dev/health
# => {"ok":true}
```

ブラウザからの fetch が CORS で通るかは、アプリのコンソールで確認する。
`ALLOWED_ORIGINS` に載っていないオリジンからは弾かれる。

```js
// 本番URLで開いた状態のコンソールで実行
await (await fetch("https://bondy-worker.xxx.workers.dev/health")).json()
```

### Teams 通知

本番の全体チャットに繋ぐ前に、**必ずテスト用チャットの Webhook URL で試すこと。**

```js
// ログイン済みの状態でコンソールから
const token = await firebase.auth().currentUser.getIdToken();
await fetch("https://bondy-worker.xxx.workers.dev/notify/teams", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ text: "テスト送信" }),
});
```

### アカウントの無効化

**本番メンバーでは試さないこと。** テスト用アカウントを1つ作って確認する。

無効化されたアカウントは、次回ログイン時に Firebase 側で弾かれる。ただし既に
発行済みの ID トークンは最大1時間有効なので、ログイン中の人が即座に締め出される
わけではない。アプリ側で `status` を見てサインアウトさせる処理と併用すること。

## 注意

- 通知の送信失敗でアプリ本体の操作(投稿など)を失敗させないこと。呼び出し側で
  エラーを握りつぶす
- Cloudflare の利用規約は動画・大容量ファイルのホスティングを禁止している。
  ライブ映像をここに流してはいけない(YouTube の限定公開を使う)

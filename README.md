# BONDY アプリ

音楽サークル BONDY の運営を一括で扱う Web / PWA アプリ。
名簿・バンド・会費・機材貸出・掲示板・チャット・フォーム・活動記録をひとつにまとめている。

在籍メンバー約60名。React + TypeScript + Vite、データは Firebase(Firestore / Auth)。
サーバーでしかできない処理だけ Cloudflare Worker に置いてある(`worker/` を参照)。

**このリポジトリは公開されている。秘匿情報を絶対にコミットしないこと。**

---

## 開発をはじめる

```bash
npm install
npm run dev      # 開発サーバー(http://localhost:5173)
npm run build    # tsc -b と vite build。型エラーがあると通らない
npm run lint
```

`.env` はコミットされていないので、引き継ぎ時に別途受け取る。中身は次のキー。

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_WORKER_URL          # Worker のURL。未設定だと画像アップロードとTeams通知が動かない
```

### デプロイ

```bash
npm run build
firebase deploy --only hosting
```

セキュリティルールを変えたときは別で流す。
**`firestore.rules` は必ず Firebase コンソールのシミュレータで確認してからデプロイすること。**
在籍メンバーが実際に使っているので、間違えると全員が使えなくなる。

```bash
firebase deploy --only firestore:rules
```

---

## ディレクトリ構成

```
src/
  App.tsx            ルーティング
  main.tsx           エントリポイント
  theme.css          色と余白の定義。個別CSSはここの変数を使う
  Types/types.ts     アプリ全体の型
  lib/               画面に依存しない処理(Firestore読み書き、整形、判定)
  screens/           画面ごとのフォルダ
worker/              Cloudflare Worker(別 package.json。worker/README.md を参照)
firestore.rules      Firestore のセキュリティルール
```

### 画面は3点セット

`screens/<機能>/` の中は、1画面につき次の3ファイルで構成している。

| ファイル | 役割 |
|---|---|
| `xxxScreen.tsx` | 見た目だけ。JSXと、その画面の中だけで完結する状態 |
| `xxxScreen.css` | その画面のスタイル |
| `useXxx.ts` | データの取得・更新。Firestore を触るのはここ |

**画面コンポーネントから直接 Firestore を呼ばないこと。** フックに寄せてあるので、
「この画面が何を読み書きしているか」は `useXxx.ts` だけ見れば分かる。

### ファイル名の付け方

大文字始まりと小文字始まりが混ざって見えるが、規則がある。

- **PascalCase**(`MemberAvatar.tsx`)= **複数の場所から使う共有部品**
  `Layout` / `NotificationBell` / `InstallPrompt` / `MemberAvatar` / `IntroBody` / `YouTubePlayer`
- **camelCase**(`rosterScreen.tsx`)= **そのフォルダの中だけで使うもの**
  各画面と、画面専用の部品(`introBlockEditor.tsx` など)

新しくファイルを足すときもこの規則に従う。
他のフォルダから import したくなったら、PascalCase に改名して共有部品に格上げする。

---

## lib/ の中身

| ファイル | 役割 |
|---|---|
| `firebase.ts` | Firebase の初期化。他は全部ここから `db` / `auth` を取る |
| `AuthContext.tsx` | ログイン状態と自分の Member。全メンバーの氏名もキャッシュしている |
| `members.ts` | members コレクションの読み取り。**在籍者だけか全員かで関数が分かれている** |
| `roles.ts` | 幹部かどうかの判定。`member.role === "幹部"` と直接書かない |
| `grade.ts` | 年度(4月始まり)と学年の計算 |
| `date.ts` | 日付の生成と表示。**`toISOString()` を使わないこと**(理由はファイル冒頭) |
| `notify.ts` | アプリ内通知の作成 |
| `useNotifications.ts` | 通知の購読(ベルのアイコン) |
| `teamsNotify.ts` | Teams への通知。匿名投稿は流さない |
| `workerClient.ts` | Worker の呼び出し |
| `archive.ts` | 活動記録(イベントと映像・音源) |
| `introPage.ts` | 紹介ページのブロック構造と保存 |
| `introImages.ts` | 紹介ページの写真(Worker KV 経由) |
| `avatarImage.ts` | アイコン画像の圧縮と保存 |
| `avatarColors.ts` | アイコンの色 |
| `anon.ts` | 匿名投稿の「匿名A」などの割り当て |
| `parts.ts` | パート(Vo/Gt/Ba…)の選択肢と表示 |
| `stamps.ts` | チャットのスタンプ |
| `equipmentManager.ts` | 機材担当の判定 |
| `formLabel.ts` | フォーム種別の表示名 |

---

## 触る前に知っておくこと

**データは削除しない。** 退会・除籍・非表示はフラグで表す。
過去の記録から人やイベントが消えると、何が起きたのか誰にも分からなくなるため。
完全削除は幹部管理のユーザー履歴画面からのみで、在籍中の人は消せない。

**権限は「幹部」と「一般メンバー」の2つだけ。**
判定は3箇所(`lib/roles.ts` / `firestore.rules` の `isOfficer()` / `worker/src/firestore.ts`)にあり、
**変えるときは3つとも合わせること。** フロントだけ直してもサーバーが弾き続ける。
なお「管理者」という役職は v1.3.0 で廃止した。幹部と権限が同一で、名前だけが誤解を生んでいたため。
最後の手段は Firebase コンソールのオーナー権限であって、アプリ内の役職ではない。

**役職の変更は1人では成立しない。** 降格や役職付与は幹部が複数人で承認する仕組みにしてある。

**動画をここでホストしない。** Cloudflare の利用規約が動画・大容量ファイルの配信を禁じている。
ライブ映像は YouTube の限定公開に置き、アプリは索引だけを持つ。

**秘匿情報はコミットしない。** リポジトリは公開されている。
Worker の鍵類は `wrangler secret put` で設定する(`worker/README.md`)。
Firebase のサービスアカウント JSON をリポジトリに置かないこと。

**無料枠で動かしている。** Firestore は1日5万読み取り。
1つの画面で members を何度も読むと、それだけで枠を削る。

---

## 引き継ぎ

Cloudflare と Firebase のアカウントは、個人ではなく**サークル共用の Google アカウント**に
紐づけておくこと。個人に紐づくと代替わりのときに誰も触れなくなる。

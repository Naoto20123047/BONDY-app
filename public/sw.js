// 最小構成のService Worker
//
// 目的: PWAとして「インストール可能」とブラウザに判定してもらうため。
// Chromeのインストール判定条件の1つに「fetchイベントを処理するService Workerが
// 登録されていること」があり、これが無いと(マニフェストが正しくても)
// beforeinstallpromptイベントが発火せず、インストール案内を出せない。
//
// 現時点ではオフラインキャッシュ等は一切行わず、全リクエストをそのまま
// ネットワークへ流すだけにしている(BONDYアプリはFirestoreのリアルタイム
// データに強く依存するため、キャッシュ戦略は慎重に設計する必要があり、
// 今回はインストール判定を通すことだけを目的にスコープを絞った)。

self.addEventListener("install", () => {
  // 新しいService Workerをすぐ有効化する(待機させない)
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 有効化したらすぐ既存のページも制御下に置く
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // キャッシュはせず、素通しでネットワークに流すだけ
  event.respondWith(fetch(event.request));
});

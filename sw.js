/* ============================================================
   どうぐばこ：オフライン対応（サービスワーカー）
   ------------------------------------------------------------
   ・一度開いたアプリを端末に保存しておき、ネットがなくても開けるようにする
   ・画面とプログラムは、ネットがあれば必ず最新を取りに行き、なければ保存しておいたものを使う
   ・書体・画像・地図の部品（中身が変わらないもの）は、保存しておいたものを使う
   ・保存するのは、このサイトのファイルだけ。地図の画像・道順の計算などの外部の通信は保存しない
   ・名簿や印鑑などのデータは、ここでは扱わない（アプリが端末の中に保存している）

   アプリを更新したら、下の VERSION を変えると、古い保存分が入れ替わる
   ============================================================ */
const VERSION = '2026-10-13-2';
const CACHE = 'dougubako-' + VERSION;

// 最初に保存しておくもの（どうぐばこを一度開けば、ネットがなくても各アプリが開けるように）
const CORE = [
  './',
  './icon.svg',
  './icon.png',
  './manifest.webmanifest',
  './common/license.js',
  './fonts/fonts.css',
  './fonts/ZenMaruGothic-box-500.woff2',
  './fonts/ZenMaruGothic-box-700.woff2',
  './marathon/',
  './busroute/',
  './vendor/leaflet/leaflet.min.js',
  './vendor/leaflet/leaflet.min.css',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/sortable/Sortable.min.js',
  './oyugikai/',
  './vendor/sheetjs/xlsx.full.min.js',
  './vendor/jspdf/jspdf.umd.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 1つ失敗しても他は保存する
    await Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('dougubako-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 外部（地図・道順・検索）は保存しない
  if (url.pathname.endsWith('/sw.js')) return;

  // 中身が変わらないもの（書体・画像・地図の部品）：保存分を先に使う
  if (/\.(woff2|png|svg)$/.test(url.pathname) || url.pathname.includes('/vendor/')) { e.respondWith(cacheFirst(req)); return; }
  // それ以外（画面・プログラム・設定）：必ずネットの最新を優先し、ネットがないときだけ保存分を使う
  //   （新しい画面と古いプログラムが混ざって動かなくなるのを防ぐ）
  e.respondWith(networkFirst(req));
});

// 画面・プログラム：ネットを優先する
//   ・ネットの返事が8秒以上かかるときは、保存分があればそれを先に表示する（保存分がなければ返事を待つ）
//   ・ネットにつながらないときは保存分。保存分もなければ「つながっていません」の案内
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; });
  const slow = new Promise(r => setTimeout(() => r('slow'), 8000));
  try {
    const first = await Promise.race([net, slow]);
    if (first !== 'slow') return first;
    const hit = await c.match(req, { ignoreSearch: true });
    return hit || await net;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
    if (!isPage) return new Response('', { status: 504 });
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>どうぐばこ</title><body style="font-family:sans-serif;padding:40px;line-height:1.8">インターネットにつながっていないため、開けませんでした。<br>一度インターネットにつながる場所で開くと、次からはつながっていなくても使えるようになります。</body>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
// 書体・画像・地図の部品：保存分があればそれを使う（中身は変わらないため）
async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}

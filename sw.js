/* ============================================================
   どうぐばこ：オフライン対応（サービスワーカー）
   ------------------------------------------------------------
   ・一度開いたアプリを端末に保存しておき、ネットがなくても開けるようにする
   ・画面（HTML）は、ネットがあれば最新を取りに行き、なければ保存しておいたものを使う
   ・書体や部品は、保存しておいたものをすぐ使い、裏で新しいものがないか確かめる
   ・保存するのは、このサイトのファイルだけ。地図の画像・道順の計算などの外部の通信は保存しない
   ・名簿や印鑑などのデータは、ここでは扱わない（アプリが端末の中に保存している）

   アプリを更新したら、下の VERSION を変えると、古い保存分が入れ替わる
   ============================================================ */
const VERSION = '2026-10-11-2';
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

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isPage) e.respondWith(networkFirst(req));
  else if (url.pathname.includes('/fonts/') && url.pathname.endsWith('.woff2')) e.respondWith(cacheFirst(req));
  else e.respondWith(staleWhileRevalidate(req, e));
});

// 画面：ネットを優先（4秒で返事がなければ保存分）。ネットがなければ保存分
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>どうぐばこ</title><body style="font-family:sans-serif;padding:40px;line-height:1.8">インターネットにつながっていないため、開けませんでした。<br>一度インターネットにつながる場所で開くと、次からはつながっていなくても使えるようになります。</body>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
// 書体：保存分があればそれを使う（中身は変わらないため）
async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}
// 部品など：保存分をすぐ返し、裏で新しいものに入れ替える
async function staleWhileRevalidate(req, e) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  const update = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { e.waitUntil(update); return hit; }
  return (await update) || new Response('', { status: 504 });
}

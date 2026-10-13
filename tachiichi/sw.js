/* ============================================================
   お遊戯会 立ち位置（配布版）：オフライン対応
   ・このフォルダ（/tachiichi/）の中だけを受け持つ。どうぐばこ本体の sw.js とは別
   ・一度開けば、ネットがなくても開ける
   ・画面とプログラムは、ネットがあれば最新を取りに行き、なければ保存分を使う
   ・部品（lib/）とアイコンは、保存分を使う
   直したら VERSION を変える
   ============================================================ */
const VERSION = '2026-10-14-1';
const CACHE = 'tachiichi-' + VERSION;
const CORE = [
  './',
  './icon.png',
  './icon.svg',
  './manifest.webmanifest',
  './lib/sheetjs/xlsx.full.min.js',
  './lib/jspdf/jspdf.umd.min.js',
  './lib/sortable/Sortable.min.js',
];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('tachiichi-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (url.pathname.includes('/lib/') || /\.(png|svg)$/.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req));
});
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
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>立ち位置</title><body style="font-family:sans-serif;padding:40px;line-height:1.8">インターネットにつながっていないため、開けませんでした。<br>一度インターネットにつながる場所で開くと、次からはつながっていなくても使えるようになります。</body>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}

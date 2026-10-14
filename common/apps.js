/* ============================================================
   どうぐばこ 共通：アプリの一覧（ここ1か所だけで管理する）
   ------------------------------------------------------------
   ・先生用どうぐばこ（/）と、管理者用どうぐばこ（/kanri/）の両方が、この一覧を読んで表示する
   ・アプリ本体は1つだけ。どちらのメニューから開いても、同じアプリが開く
   ・for: 'all'   … 先生用・管理者用の両方に出す
          'admin' … 管理者用だけに出す（先生用のどうぐばこには出ない）
   ・アプリを足す・管理者用に切り替えるときは、ここを1行書き換えるだけ
   ============================================================ */
(function () {
  'use strict';
  const ICONS = {
    oyugikai: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="5" width="40" height="5" rx="2" fill="#ffd8e4"/><path d="M5 9h11c-1 8-1 17 2 27H5z" fill="#ff8fa3"/><path d="M43 9H32c1 8 1 17-2 27h13z" fill="#ff8fa3"/><path d="M4 36h40v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#fff"/><circle cx="18.5" cy="25" r="3.2" fill="#fff"/><path d="M14 36c0-4 2-7 4.5-7s4.5 3 4.5 7z" fill="#fff"/><circle cx="29.5" cy="25" r="3.2" fill="#ffd23f"/><path d="M25 36c0-4 2-7 4.5-7s4.5 3 4.5 7z" fill="#ffd23f"/></svg>',
    nandemo: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="5" width="32" height="30" rx="3.5" fill="#fff"/><rect x="11.5" y="8.5" width="25" height="23" rx="2" fill="none" stroke="#d9dfe1" stroke-width="1.6"/><path d="M16 15h16M16 20.5h16M19 26h10" stroke="#b9c2c5" stroke-width="2.4" stroke-linecap="round"/><path d="M19.6 37 17 46l3.8-1.9 2.4 3.3 1.2-8.6zM28.4 37 31 46l-3.8-1.9-2.4 3.3-1.2-8.6z" fill="#ff8fa3"/><circle cx="24" cy="34" r="7" fill="#ff6b81" stroke="#fff" stroke-width="2.4"/><circle cx="24" cy="34" r="3" fill="#fff"/><path d="M40.5 2.5l1.2 3.1 3.1 1.2-3.1 1.2-1.2 3.1-1.2-3.1-3.1-1.2 3.1-1.2z" fill="#ffd23f"/></svg>',
    marathon: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="6" width="27" height="33" rx="3.5" fill="#fff"/><path d="M12.5 14h16M12.5 20h16M12.5 26h9" stroke="#e8a35c" stroke-width="2.6" stroke-linecap="round"/><path d="M30.2 36.5 27.4 45l3.8-1.7 2.3 3.2 1.4-8.2zM39.8 36.5l2.8 8.5-3.8-1.7-2.3 3.2-1.4-8.2z" fill="#fff"/><circle cx="35" cy="32" r="8" fill="#ffd23f" stroke="#fff" stroke-width="2.6"/><path d="m35 27.6 1.35 2.75 3.03.44-2.19 2.13.52 3.02L35 34.52l-2.71 1.42.52-3.02-2.19-2.13 3.03-.44z" fill="#fff"/></svg>',
    busroute: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="11" width="40" height="24" rx="6" fill="#fff"/><rect x="8.5" y="15.5" width="7.5" height="7.5" rx="1.8" fill="#8fbf62"/><rect x="19" y="15.5" width="7.5" height="7.5" rx="1.8" fill="#8fbf62"/><rect x="29.5" y="15.5" width="10" height="9.5" rx="1.8" fill="#8fbf62"/><rect x="4" y="27.5" width="40" height="2.6" fill="#cfe3b9"/><circle cx="41" cy="31.5" r="1.6" fill="#ffd23f"/><circle cx="14" cy="35.5" r="5" fill="#33413a" stroke="#fff" stroke-width="2.6"/><circle cx="34" cy="35.5" r="5" fill="#33413a" stroke="#fff" stroke-width="2.6"/></svg>',
  };
  // 使えるアプリ（path はサイトのいちばん上から見た場所）
  const APPS = [
    { id: 'marathon', for: 'all', n: 'マラソン大会<br>表彰状', color: '#d47a24', path: 'marathon/' },
    { id: 'oyugikai', for: 'all', n: 'お遊戯会<br>立ち位置', color: '#7048e8', path: 'oyugikai/' },
    { id: 'busroute', for: 'admin', n: 'バスルート<br>計画', color: '#5f8a34', path: 'busroute/', net: true },
  ];
  // 準備中のアプリ（できあがったら APPS に移す）
  const SOON = [
    { id: 'nandemo', name: 'なんでも賞状', n: 'なんでも<br>賞状' },
  ];

  /* ---------- 管理者用の合言葉 ----------
     合言葉そのものは書かず、元に戻せない形（SHA-256）だけを置く。
     合言葉を変えるときは、新しい合言葉の SHA-256 をここに入れる（Mac では  printf '%s' '合言葉' | shasum -a 256 ）。
     ※ 端末の中で確かめるだけなので、詳しい人が調べれば回り込める。「先生の目に触れないようにする」ためのもの */
  const ADMIN_HASH = '8af0a5313c9af59e7f3fd8015dda45a499c0922d1f032dd167fb27647dca4de8';
  const ADMIN_KEY = 'dougubako.kanri.ok';
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } },
  };
  const D = {
    ICONS, APPS, SOON,
    forTeachers: () => APPS.filter(a => a.for === 'all'),
    forAdmins: () => APPS.filter(a => a.for === 'admin'),
    isAdminApp: id => APPS.some(a => a.id === id && a.for === 'admin'),
    adminOk: () => ls.get(ADMIN_KEY) === ADMIN_HASH,
    async tryPasscode(text) {
      if (!window.crypto || !crypto.subtle) return false;
      const ok = (await sha256(String(text).trim())) === ADMIN_HASH;
      if (ok) ls.set(ADMIN_KEY, ADMIN_HASH);
      return ok;
    },
    adminLogout() { ls.del(ADMIN_KEY); },
    // 管理者用のアプリを開いたとき、合言葉がまだならアプリの上に案内を出す（base はサイトのいちばん上への道すじ。例 '../'）
    guardAdmin(appId, base) {
      if (!D.isAdminApp(appId) || D.adminOk()) return true;
      const ov = document.createElement('div');
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(238,243,241,.97);display:grid;place-items:center;padding:24px;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",Meiryo,sans-serif;color:#1f2a2e';
      ov.innerHTML = `<div style="max-width:420px;width:100%;background:#fff;border:1px solid #d9e3df;border-radius:18px;padding:26px 22px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08)">
        <img src="${base}icon.svg" alt="" style="width:72px;height:72px;border-radius:18px;display:block;margin:0 auto 12px">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">🔒 管理者用のアプリです</div>
        <div style="font-size:14px;line-height:1.7;color:#5d6c70;margin-bottom:18px">「管理者用どうぐばこ」を開いて、合言葉を入れてから使ってください。</div>
        <a href="${base}kanri/" style="display:inline-block;background:#2f7d6b;color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:10px 22px;font-size:15px">管理者用どうぐばこを開く</a></div>`;
      document.body.appendChild(ov);
      return false;
    },
  };
  window.DouguApps = D;
})();

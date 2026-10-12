/* ============================================================
   どうぐばこ 共通部品：利用許可証（ライセンス）
   ------------------------------------------------------------
   ・どうぐばこ（入口）でログインすると「利用許可証」を受け取り、端末に保存する
   ・許可証には有効期限（30日）があり、会社の署名がついている（書き換えると無効になる）
   ・各アプリは、端末の中の許可証を確かめるだけ（会社のサーバーには問い合わせない）
   ・期限が近づくと、どうぐばこを開いたときに裏で自動更新する
   ・許可証の中身は「園の名前・先生の名前・プラン・期限」だけ。園児の情報は入らない

   ※試作版のため、会社のサーバーの代わりに「デモ用の仮サーバー」をこのファイルの中で動かしています。
     本番では DemoServer の部分が、会社のサーバーへの通信に置き換わります。
   ============================================================ */
(function () {
  'use strict';
  const LS = {
    token: 'dougubako.license',          // 利用許可証
    trust: 'dougubako.trust',            // 「この端末を信頼する」（30日間、確認コードを省略）
    checked: 'dougubako.license.checked',// 最後にサーバーで確認した日時
    server: 'dougubako.demo.server',     // デモ用の仮サーバーの状態
    offline: 'dougubako.demo.offline',   // 「ネットを切った状態」の再現
  };
  // ★ログインのオン・オフ★
  //   false：ログインなしで、全部のアプリを使える（今はこちら。明青幼稚園での利用）
  //   true ：どうぐばこを開くとログインが必要になり、利用許可証のしくみが動く
  //   ログインを使うときは、ここを true に変えるだけでよい（画面・しくみはすべて残してある）
  const LOGIN_REQUIRED = false;
  // ログインなしのときに使う園の情報
  const NO_LOGIN_PROFILE = { orgName: '明青幼稚園', staff: '', plan: 'standard' };

  const DAY = 86400000;
  const LIFETIME = 30 * DAY;             // 許可証の有効期間
  const RENEW_BEFORE = 7 * DAY;          // 期限の何日前から自動更新するか
  const RECHECK_EVERY = DAY;             // 何日おきに契約の状態を確かめるか
  const PLANS = {
    light: { name: 'ライト', apps: ['marathon', 'oyugikai'] },
    standard: { name: 'スタンダード', apps: ['marathon', 'busroute', 'oyugikai'] },
  };
  const APP_NAMES = { marathon: 'マラソン大会 表彰状', busroute: 'バスルート計画', oyugikai: 'お遊戯会 立ち位置' };

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } },
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const b64u = {
    enc(bytes) { let s = ''; new Uint8Array(bytes).forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); },
    encText(t) { return b64u.enc(new TextEncoder().encode(t)); },
    decText(s) { return new TextDecoder().decode(b64u.dec(s)); },
  };
  const subtle = (window.crypto && window.crypto.subtle) || null;
  const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
  const SIG = { name: 'ECDSA', hash: 'SHA-256' };

  /* ------------------------------------------------------------
     デモ用の仮サーバー（本番では会社のサーバー）
     ------------------------------------------------------------ */
  const DemoServer = (() => {
    const ACCOUNTS = {
      'demo@example.com': { pw: 'demo1234', staff: 'さくら先生', org: 'mori' },
      'light@example.com': { pw: 'demo1234', staff: 'ひまわり先生', org: 'hikari' },
      'ended@example.com': { pw: 'demo1234', staff: 'もみじ先生', org: 'aozora' },
    };
    const defaults = () => ({
      orgs: {
        mori: { name: '明青幼稚園', plan: 'standard', active: true },
        hikari: { name: 'ひかり幼稚園（架空）', plan: 'light', active: true },
        aozora: { name: 'あおぞら幼稚園（架空）', plan: 'standard', active: false },
      },
      stopped: {}, keys: null, tickets: {},
    });
    let st;
    try { st = JSON.parse(ls.get(LS.server)) || defaults(); } catch (e) { st = defaults(); }
    const save = () => ls.set(LS.server, JSON.stringify(st));
    let privKey = null, pubKey = null;
    async function keys() {
      if (!subtle) return null;
      if (privKey) return { privKey, pubKey };
      if (!st.keys) {
        const kp = await subtle.generateKey(ALG, true, ['sign', 'verify']);
        st.keys = { priv: await subtle.exportKey('jwk', kp.privateKey), pub: await subtle.exportKey('jwk', kp.publicKey) }; save();
      }
      privKey = await subtle.importKey('jwk', st.keys.priv, ALG, false, ['sign']);
      pubKey = await subtle.importKey('jwk', st.keys.pub, ALG, false, ['verify']);
      return { privKey, pubKey };
    }
    async function net() {
      await sleep(450 + Math.random() * 450);
      if (LOGIN_REQUIRED && ls.get(LS.offline) === '1') throw { code: 'offline' };
    }
    function fail(code) { throw { code }; }
    function checkAccount(email) {
      const a = ACCOUNTS[email]; if (!a) fail('bad_login');
      if (!st.orgs[a.org].active) fail('ended');
      if (st.stopped[email]) fail('stopped');
      return a;
    }
    async function issue(email, expAt) {
      const a = ACCOUNTS[email]; const o = st.orgs[a.org]; const now = Date.now();
      const payload = { v: 1, sub: email, staff: a.staff, orgName: o.name, plan: o.plan, apps: PLANS[o.plan].apps, iat: now, exp: expAt || now + LIFETIME, id: Math.random().toString(36).slice(2, 10) };
      const p = b64u.encText(JSON.stringify(payload));
      const k = await keys();
      const s = k ? b64u.enc(await subtle.sign(SIG, k.privKey, new TextEncoder().encode(p))) : 'unsigned';
      return p + '.' + s;
    }
    return {
      async publicKey() { const k = await keys(); return k && k.pubKey; },
      async login(email, pw, trustToken) {
        await net();
        const a = ACCOUNTS[email]; if (!a || a.pw !== pw) fail('bad_login');
        checkAccount(email);
        if (trustToken && st.tickets['trust:' + trustToken] === email) return { token: await issue(email) };
        const ticket = Math.random().toString(36).slice(2, 10);
        const code = String(Math.floor(100000 + Math.random() * 900000));
        st.tickets[ticket] = { email, code, at: Date.now() }; save();
        const [u, d] = email.split('@');
        return { needCode: true, ticket, sentTo: u.slice(0, 2) + '***@' + d, demoCode: code };
      },
      async confirm(ticket, code, trust) {
        await net();
        const t = st.tickets[ticket]; if (!t) fail('expired_code');
        if (t.code !== String(code).trim()) fail('bad_code');
        delete st.tickets[ticket];
        checkAccount(t.email);
        let trustToken = null;
        if (trust) { trustToken = Math.random().toString(36).slice(2, 14); st.tickets['trust:' + trustToken] = t.email; }
        save();
        return { token: await issue(t.email), trustToken };
      },
      async renew(email) { await net(); checkAccount(email); return { token: await issue(email) }; },
      // ---- 体験メニュー用の操作（本番では会社の管理画面・園の管理者の操作にあたる） ----
      orgOf(email) { return ACCOUNTS[email] && ACCOUNTS[email].org; },
      org(id) { return st.orgs[id]; },
      setActive(id, v) { st.orgs[id].active = v; save(); },
      setPlan(id, plan) { st.orgs[id].plan = plan; save(); },
      isStopped(email) { return !!st.stopped[email]; },
      setStopped(email, v) { if (v) st.stopped[email] = true; else delete st.stopped[email]; save(); },
      async issueWithExp(email, expAt) { return issue(email, expAt); },
      reset() { st = defaults(); privKey = pubKey = null; save(); },
    };
  })();

  /* ------------------------------------------------------------
     端末側：許可証を確かめる・受け取る・更新する
     ------------------------------------------------------------ */
  function parse(raw) {
    try { const [p, s] = raw.split('.'); return { p, s, payload: JSON.parse(b64u.decText(p)) }; } catch (e) { return null; }
  }
  async function verifySig(t) {
    if (!subtle || t.s === 'unsigned') return true; // 署名の仕組みが使えない環境（試作のみ）
    try {
      const key = await DemoServer.publicKey(); // 本番では、アプリに組み込んだ会社の公開鍵を使う
      return await subtle.verify(SIG, key, b64u.dec(t.s), new TextEncoder().encode(t.p));
    } catch (e) { return false; }
  }
  const L = {
    PLANS, APP_NAMES, DAY,
    loginRequired: LOGIN_REQUIRED,
    profile: { ...NO_LOGIN_PROFILE, apps: [...PLANS[NO_LOGIN_PROFILE.plan].apps] },
    isOffline: () => LOGIN_REQUIRED && ls.get(LS.offline) === '1',
    // 状態：none（未ログイン）/ bad（書き換えられている）/ expired（期限切れ）/ notInPlan（プラン外）/ ok
    async status(appId) {
      const raw = ls.get(LS.token); if (!raw) return { state: 'none' };
      const t = parse(raw); if (!t) return { state: 'bad' };
      if (!(await verifySig(t))) return { state: 'bad' };
      const pl = t.payload;
      if (Date.now() > pl.exp) return { state: 'expired', payload: pl };
      if (appId && !pl.apps.includes(appId)) return { state: 'notInPlan', payload: pl };
      return { state: 'ok', payload: pl };
    },
    needsRenew(pl) {
      const last = +ls.get(LS.checked) || 0;
      return pl.exp - Date.now() < RENEW_BEFORE || Date.now() - last > RECHECK_EVERY;
    },
    lastChecked() { return +ls.get(LS.checked) || 0; },
    async login(email, pw) {
      const r = await DemoServer.login(email.trim().toLowerCase(), pw, ls.get(LS.trust));
      if (r.token) { ls.set(LS.token, r.token); ls.set(LS.checked, String(Date.now())); }
      return r;
    },
    async confirm(ticket, code, trust) {
      const r = await DemoServer.confirm(ticket, code, trust);
      ls.set(LS.token, r.token); ls.set(LS.checked, String(Date.now()));
      if (r.trustToken) ls.set(LS.trust, r.trustToken);
      return r;
    },
    // 更新：成功→ok / 通信できない→offline（許可証はそのまま）/ 解約・停止→許可証を消す
    async renew() {
      const raw = ls.get(LS.token); const t = raw && parse(raw);
      if (!t) return { result: 'none' };
      try {
        const r = await DemoServer.renew(t.payload.sub);
        ls.set(LS.token, r.token); ls.set(LS.checked, String(Date.now()));
        return { result: 'ok', payload: parse(r.token).payload, prev: t.payload };
      } catch (e) {
        if (e.code === 'offline') return { result: 'offline' };
        if (e.code === 'ended' || e.code === 'stopped') { ls.del(LS.token); return { result: e.code, prev: t.payload }; }
        return { result: 'error' };
      }
    },
    logout() { ls.del(LS.token); ls.del(LS.checked); },
    // アプリ側：許可証がなければ、画面の上に「どうぐばこを開いてください」を出す（アプリの中身は使えない）
    async guardApp(appId, homeUrl) {
      if (!LOGIN_REQUIRED) return true;   // ログインなしで使う設定のときは確認しない
      const st = await L.status(appId);
      if (st.state === 'ok') return true;
      const plan = Object.values(PLANS).find(p => p.apps.includes(appId));
      const msg = {
        none: ['どうぐばこにログインしてください', 'このアプリを使うには、先に「どうぐばこ」を開いてログインしてください。'],
        bad: ['どうぐばこにログインしてください', '利用許可証を確認できませんでした。「どうぐばこ」を開いて、ログインし直してください。'],
        expired: ['利用許可証の期限が切れています', '「どうぐばこ」を開くと、インターネットにつながっていれば自動で更新されます。'],
        notInPlan: [`このアプリは${plan ? plan.name : '上位'}プランで使えます`, '園の管理者がプランを変更すると、使えるようになります。'],
      }[st.state];
      const ov = document.createElement('div');
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(238,243,241,.97);display:grid;place-items:center;padding:24px;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",Meiryo,sans-serif;color:#1f2a2e';
      ov.innerHTML = `<div style="max-width:420px;width:100%;background:#fff;border:1px solid #d9e3df;border-radius:18px;padding:26px 22px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08)">
        <img src="${homeUrl}icon.svg" alt="" style="width:72px;height:72px;border-radius:18px;display:block;margin:0 auto 12px">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">${msg[0]}</div>
        <div style="font-size:14px;line-height:1.7;color:#5d6c70;margin-bottom:18px">${msg[1]}</div>
        <a href="${homeUrl}" style="display:inline-block;background:#2f7d6b;color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:10px 22px;font-size:15px">どうぐばこを開く</a></div>`;
      document.body.appendChild(ov);
      return false;
    },
    demo: {
      server: DemoServer,
      setOffline(v) { if (v) ls.set(LS.offline, '1'); else ls.del(LS.offline); },
      forceRecheck() { ls.del(LS.checked); },
      currentEmail() { const raw = ls.get(LS.token); const t = raw && parse(raw); return t ? t.payload.sub : null; },
      async setExpiry(expAt) { const e = L.demo.currentEmail(); if (!e) return false; ls.set(LS.token, await DemoServer.issueWithExp(e, expAt)); return true; },
      tamper() { const raw = ls.get(LS.token); const t = raw && parse(raw); if (!t) return false; t.payload.plan = 'standard'; t.payload.apps = PLANS.standard.apps; ls.set(LS.token, b64u.encText(JSON.stringify(t.payload)) + '.' + t.s); return true; },
      resetAll() { [LS.token, LS.trust, LS.checked, LS.offline].forEach(ls.del); DemoServer.reset(); },
    },
  };
  window.DouguLicense = L;
})();

(() => {
  if (window.top !== window || window.__a14) return;
  window.__a14 = 1;
  const THEMES = { green: '#00ff9c', cyan: '#00e5ff', magenta: '#ff2bd6', amber: '#ffb000' };
  const FOCUS_TEXT = 'I am choosing to open this site on purpose, and I accept that it takes time away from my work.';
  const DIS = ['crash', 'update', 'virus', 'frozen', 'invisible', 'duress'];
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let cfg = null, host = null, shadow = null, layer = null, hudEl = null, locked = false, disguised = false;
  let origTitle = '', saved = [], favEl = null, revealed = false, hostObs = null, tObs = null, timers = [];
  let clicks = [], konami = [], tamperAt = 0, rTimer = 0, rObs = null;

  const send = (m) => { try { return chrome.runtime.sendMessage(m).catch(() => null); } catch { return Promise.resolve(null); } };
  const frag = (h) => [...new DOMParser().parseFromString(h, 'text/html').body.childNodes].map((n) => document.importNode(n, true));

  const PAGECSS = `html.a14-blur body{filter:blur(12px)!important;transition:filter .15s}
html.a14-locked,html.a14-locked body{overflow:hidden!important}
@media print{html.a14-locked body{display:none!important}}
.a14-redact{filter:blur(6px)!important;cursor:pointer}.a14-redact.a14-show{filter:none!important}`;
  const ps = document.createElement('style'); ps.textContent = PAGECSS; document.documentElement.appendChild(ps);

  const CSS = `*{box-sizing:border-box;font-family:"Space Grotesk","Segoe UI",Arial,sans-serif}
.layer{position:fixed;inset:0;pointer-events:auto;display:flex;align-items:center;justify-content:center}
.layer[data-mode=pin],.layer[data-mode=focus]{background:#f5f0e8;background-image:linear-gradient(rgba(0,0,0,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.05) 1px,transparent 1px);background-size:32px 32px}
.modal{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(245,240,232,.72)}
.layer[data-mode=pin] .modal,.layer[data-mode=focus] .modal{background:none}
.card{width:360px;max-width:92vw;padding:28px;border:3px solid #0a0a0a;border-radius:0;background:#fff;color:#0a0a0a;box-shadow:9px 9px 0 #0a0a0a;display:flex;flex-direction:column;gap:12px}
.card h2{margin:0;font:800 22px/1.05 "Syne","Arial Black",sans-serif;color:#0a0a0a;letter-spacing:-.03em}.card p{margin:0;color:#6b6560;font-size:13px;line-height:1.5}
.card input,.card textarea{width:100%;padding:11px 12px;background:#fffdf7;border:3px solid #0a0a0a;border-radius:0;color:#0a0a0a;font-size:15px;outline:none}
.card input:focus,.card textarea:focus{border-color:#c084fc}.card textarea{min-height:90px;resize:none}
.card button,.notes button{padding:10px;border:3px solid #0a0a0a;border-radius:0;background:#ffff00;color:#0a0a0a;box-shadow:4px 4px 0 #0a0a0a;font-weight:800;font-size:14px;cursor:pointer}
.card button:disabled{opacity:.35;cursor:default}.msg{min-height:16px;color:#ff6b6b}
.shake{animation:sh .35s}@keyframes sh{20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
.scr{position:absolute;inset:0}
.s-crash{background:#f8f9fa;color:#3c4043;padding:14vh 10vw}.s-crash .sad{font-size:72px;font-weight:300}.s-crash h1{font-size:28px;font-weight:400;margin:10px 0}
.s-crash p{font-size:14px;margin:8px 0;max-width:560px}.s-crash .code{color:#80868b;font-size:12px}
.s-crash button{margin-top:18px;padding:8px 18px;background:#1a73e8;color:#fff;border:0;border-radius:4px;font-size:14px}
.s-update{background:#0063b1;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;font-family:"Segoe UI",system-ui,sans-serif}
.s-update p{margin:0;font-size:22px}.s-update p+p{font-size:16px;opacity:.9}
.spin{width:48px;height:48px;border:4px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:rot 1s linear infinite}@keyframes rot{to{transform:rotate(360deg)}}
.s-virus{background:#1b1b1f;display:flex;align-items:center;justify-content:center}
.win{width:520px;max-width:92vw;background:#fff;color:#222;border-radius:6px;overflow:hidden;box-shadow:0 20px 60px #000}
.win .bar{background:#0f6cbd;color:#fff;padding:10px 14px;font-size:13px}.win .body{padding:22px}.win h3{margin:0 0 14px;font-weight:500}
.prog{height:10px;background:#ddd;border-radius:5px;overflow:hidden}.prog i{display:block;height:100%;width:0;background:#0f6cbd}
.files{font-size:12px;color:#666;margin:12px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-frozen{cursor:wait}.s-inv{cursor:default}
.s-duress{background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px}
.s-duress .logo{font-size:84px;font-weight:500;letter-spacing:-2px;font-family:Product Sans,Arial,sans-serif}
.s-duress .q{width:min(560px,86vw);padding:14px 20px;border:1px solid #dfe1e5;border-radius:24px;font-size:16px;outline:none}
.hud{position:fixed;left:10px;bottom:10px;padding:4px 8px;font:11px/1.4 "JetBrains Mono",Consolas,monospace;color:#0a0a0a;background:#ffff00;border:2px solid #0a0a0a;box-shadow:3px 3px 0 #0a0a0a;pointer-events:none;letter-spacing:1px}
.flash{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font:800 28px "JetBrains Mono",Consolas,monospace;color:#0a0a0a;letter-spacing:4px;animation:fl .9s forwards;background:rgba(255,255,0,.82)}
@keyframes fl{0%{opacity:0}20%{opacity:1}80%{opacity:1}100%{opacity:0}}
.notes{position:fixed;right:18px;bottom:18px;width:340px;max-width:92vw;padding:14px;border:3px solid #0a0a0a;background:#fff;color:#0a0a0a;pointer-events:auto;display:flex;flex-direction:column;gap:8px;box-shadow:7px 7px 0 #0a0a0a}
.notes .nh{display:flex;justify-content:space-between;color:#0a0a0a;font-family:"Syne","Arial Black",sans-serif}.notes .x{cursor:pointer}
.notes input,.notes textarea{width:100%;padding:8px;background:#fffdf7;border:3px solid #0a0a0a;border-radius:0;color:#0a0a0a;font-size:14px}.notes textarea{height:200px;resize:vertical}
.notes .row{display:flex;gap:8px}.notes .row button{flex:1}`;

  const TPL = {
    crash: '<div class="scr s-crash"><div class="sad">:(</div><h1>Aw, Snap!</h1><p>Something went wrong while displaying this webpage. To continue, reload or go to another page.</p><p class="code">Error code: STATUS_ACCESS_VIOLATION</p><button type="button">Reload</button></div>',
    update: '<div class="scr s-update"><div class="spin"></div><p class="pct">Working on updates 0%</p><p>Don\'t turn off your computer. This will take a while.</p></div>',
    virus: '<div class="scr s-virus"><div class="win"><div class="bar">Windows Security</div><div class="body"><h3>Scanning your device…</h3><div class="prog"><i></i></div><p class="files">Starting scan…</p></div></div></div>',
    frozen: '<div class="scr s-frozen"></div>',
    invisible: '<div class="scr s-inv"></div>',
    duress: '<div class="scr s-duress"><div class="logo"><span style="color:#4285f4">G</span><span style="color:#ea4335">o</span><span style="color:#fbbc05">o</span><span style="color:#4285f4">g</span><span style="color:#34a853">l</span><span style="color:#ea4335">e</span></div><input class="q" placeholder="Search Google or type a URL"></div>'
  };
  const FILES = ['C:\\Windows\\System32\\drivers\\etc\\hosts', 'C:\\Windows\\System32\\kernel32.dll', 'C:\\Users\\Public\\Documents\\desktop.ini', 'C:\\Program Files\\Common Files\\system\\ado\\msado15.dll', 'C:\\Windows\\SysWOW64\\ntdll.dll', 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu'];

  function ensureHost() {
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('style', 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;');
      shadow = host.attachShadow({ mode: 'closed' });
      const st = document.createElement('style'); st.textContent = CSS; shadow.appendChild(st);
    }
    host.style.setProperty('--ac', THEMES[cfg && cfg.theme] || THEMES.green);
    if (!host.isConnected) document.documentElement.appendChild(host);
  }
  function clearLayer() { timers.forEach(clearInterval); timers = []; if (layer) layer.remove(); layer = null; }

  function beep(f, d) {
    if (!cfg || !cfg.sounds) return;
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value = f; g.gain.value = 0.04; o.connect(g); g.connect(a.destination); o.start();
      setTimeout(() => { o.stop(); a.close(); }, d);
    } catch {}
  }
  function flash() {
    beep(880, 120);
    if (!cfg || !cfg.hud) return;
    ensureHost();
    const f = frag('<div class="flash">ACCESS GRANTED</div>')[0]; shadow.append(f); setTimeout(() => f.remove(), 950);
  }

  // ----- lock UI -----
  function showLock(mode) {
    ensureHost(); locked = true;
    document.documentElement.classList.add('a14-locked');
    if (!hostObs) { hostObs = new MutationObserver(() => { if (host && !host.isConnected) document.documentElement.appendChild(host); }); hostObs.observe(document.documentElement, { childList: true }); }
    if (layer && layer.isConnected && layer.dataset.mode === mode) return;
    clearLayer();
    layer = document.createElement('div'); layer.className = 'layer'; layer.dataset.mode = mode; shadow.appendChild(layer);
    if (mode === 'pin') openPrompt(true);
    else { layer.append(...frag(TPL[mode] || TPL.invisible)); animate(mode); layer.addEventListener('click', hot); }
    hud();
  }
  function animate(mode) {
    if (mode === 'update') {
      let p = 0; const el = layer.querySelector('.pct');
      timers.push(setInterval(() => { if (p < 99) p += Math.random() < 0.6 ? 1 : 2; el.textContent = 'Working on updates ' + Math.min(p, 99) + '%'; }, 2500));
    } else if (mode === 'virus') {
      let w = 0; const bar = layer.querySelector('.prog i'), f = layer.querySelector('.files');
      timers.push(setInterval(() => { w = (w + 1.5) % 100; bar.style.width = w + '%'; f.textContent = 'Scanning: ' + FILES[Math.floor(Math.random() * FILES.length)]; }, 300));
    }
  }
  function hot(e) {
    if (e.clientX > 90 || e.clientY > 90) return;
    const n = Date.now(); clicks = clicks.filter((t) => n - t < 900); clicks.push(n);
    if (clicks.length >= 3) { clicks = []; openPrompt(false); }
  }
  function openPrompt(inline) {
    if (!layer || layer.querySelector('.modal')) return;
    const m = frag(`<div class="modal"><form class="card"><h2>Locked</h2><p>Enter your PIN to continue.</p><input class="pw" type="password" placeholder="PIN or password" autocomplete="off">${cfg && cfg.totpOn ? '<input class="otp" inputmode="numeric" placeholder="Authenticator code" autocomplete="off">' : ''}<button>Unlock</button><p class="msg"></p></form></div>`)[0];
    layer.append(m);
    const f = m.querySelector('form'), pw = m.querySelector('.pw'), otp = m.querySelector('.otp'), msg = m.querySelector('.msg');
    setTimeout(() => pw.focus(), 30);
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !inline) m.remove(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await send({ type: 'unlock', pin: pw.value, totp: otp ? otp.value : '' });
      pw.value = ''; if (otp) otp.value = '';
      if (r && r.ok) { if (!r.duress) flash(); await init(); return; }
      msg.textContent = !r ? 'Extension error' : r.wait ? `Too many attempts. Try again in ${r.wait}s.` : r.msg || r.error || 'Wrong PIN';
      f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); beep(180, 220);
    });
  }
  function showFocus() {
    ensureHost(); locked = true;
    document.documentElement.classList.add('a14-locked');
    if (layer && layer.dataset.mode === 'focus') return;
    clearLayer();
    layer = document.createElement('div'); layer.className = 'layer'; layer.dataset.mode = 'focus'; shadow.appendChild(layer);
    const m = frag(`<div class="modal"><form class="card"><h2>Focus mode</h2><p class="h"></p><p><i>${FOCUS_TEXT}</i></p><textarea placeholder="Type the sentence above (no pasting)"></textarea><button disabled>Unlock for 10 minutes</button></form></div>`)[0];
    m.querySelector('.h').textContent = (cfg.host || 'This site') + ' is on your distraction list.';
    layer.append(m);
    const ta = m.querySelector('textarea'), b = m.querySelector('button'), norm = (s) => s.replace(/\s+/g, ' ').trim();
    ta.addEventListener('paste', (e) => e.preventDefault());
    ta.addEventListener('input', () => { b.disabled = norm(ta.value) !== FOCUS_TEXT; });
    m.querySelector('form').addEventListener('submit', async (e) => { e.preventDefault(); if (b.disabled) return; await send({ type: 'focusPass' }); await init(); });
  }
  function unlockUI() {
    locked = false;
    document.documentElement.classList.remove('a14-locked');
    clearLayer();
    if (hostObs) { hostObs.disconnect(); hostObs = null; }
    konami = []; clicks = [];
  }

  // ----- notes overlay (Alt+Shift+N) -----
  function openNotes() {
    if (locked || !cfg) return;
    ensureHost();
    if (shadow.querySelector('.notes')) return;
    const n = frag('<div class="notes"><div class="nh"><b>Notes</b><span class="x">✕</span></div><input class="pw" type="password" placeholder="PIN to open" autocomplete="off"><textarea class="ta" hidden></textarea><div class="row"><button class="go">Open</button><button class="sv" hidden>Save</button></div><p class="msg" style="color:#ff6b6b;margin:0;font-size:12px"></p></div>')[0];
    shadow.append(n);
    let pin = ''; const $ = (s) => n.querySelector(s);
    ['keydown', 'keyup', 'keypress'].forEach((t) => n.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Escape') n.remove(); }));
    $('.x').onclick = () => n.remove();
    $('.pw').focus();
    const open = async () => {
      const r = await send({ type: 'notesLoad', pin: $('.pw').value });
      if (!r || !r.ok) { $('.msg').textContent = (r && (r.wait ? 'Wait ' + r.wait + 's' : r.msg || r.error)) || 'Error'; return; }
      pin = $('.pw').value; $('.pw').hidden = true; $('.go').hidden = true; $('.ta').hidden = false; $('.sv').hidden = false; $('.ta').value = r.text; $('.ta').focus(); $('.msg').textContent = '';
    };
    $('.go').onclick = open; $('.pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    $('.sv').onclick = async () => { const r = await send({ type: 'notesSave', pin, text: $('.ta').value }); $('.msg').style.color = r && r.ok ? '#6bff9c' : '#ff6b6b'; $('.msg').textContent = r && r.ok ? 'Saved (encrypted)' : 'Save failed'; };
  }

  // ----- HUD -----
  function hud() {
    const want = cfg && cfg.hud && !locked;
    if (!want) { if (hudEl) hudEl.remove(); hudEl = null; return; }
    ensureHost();
    if (!hudEl) { hudEl = frag('<div class="hud"></div>')[0]; shadow.append(hudEl); }
    hudEl.textContent = '◈ A14 · ' + (cfg.hidden ? 'STEALTH' : 'ARMED');
  }

  // ----- title / favicon disguise -----
  function mkFav() {
    const d = cfg.decoy;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='${d.c}'/><text x='16' y='23' font-size='20' text-anchor='middle' fill='white' font-family='Arial'>${d.l}</text></svg>`;
    const l = document.createElement('link'); l.rel = 'icon'; l.href = 'data:image/svg+xml,' + encodeURIComponent(svg); return l;
  }
  function fixIcons() {
    const head = document.head; if (!head) return;
    if (!favEl) favEl = mkFav();
    document.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"]').forEach((l) => { if (l !== favEl) { saved.push(l); l.remove(); } });
    if (!favEl.isConnected) head.appendChild(favEl);
  }
  function setT() { if (document.title !== cfg.decoy.t) document.title = cfg.decoy.t; }
  function disguise() {
    if (!disguised) { disguised = true; origTitle = document.title; }
    setT(); fixIcons();
    if (!tObs) {
      tObs = new MutationObserver(() => {
        if (!disguised || !cfg) return;
        if (document.title !== cfg.decoy.t) { origTitle = document.title; setT(); }
        fixIcons();
      });
      tObs.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    }
  }
  function undisguise() {
    if (!disguised) return;
    disguised = false;
    if (tObs) { tObs.disconnect(); tObs = null; }
    document.title = origTitle;
    if (favEl) favEl.remove(); favEl = null;
    saved.forEach((l) => document.head && document.head.appendChild(l)); saved = [];
  }

  // ----- auto-redact (pattern matching only) -----
  const RXS = '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}|\\b(?:\\d[ -]?){13,19}\\b|(?:\\+\\d{1,3}[\\s.-]?)?(?:\\(\\d{2,4}\\)|\\d{2,4})[\\s.-]\\d{3,4}[\\s.-]\\d{3,4}|(?:otp|code|pin|passcode)\\D{0,12}\\d{4,8}';
  function scan() {
    if (!document.body) return;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
      const p = n.parentElement;
      if (!p || n.nodeValue.length < 6 || /^(SCRIPT|STYLE|TEXTAREA|INPUT|NOSCRIPT|CODE|PRE)$/.test(p.tagName) || p.isContentEditable || p.closest('.a14-redact')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    } });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      const t = n.nodeValue, rx = new RegExp(RXS, 'gi'); let m, last = 0, any = false; const f = document.createDocumentFragment();
      while ((m = rx.exec(t))) {
        any = true; if (m.index > last) f.append(t.slice(last, m.index));
        const s = document.createElement('span'); s.className = 'a14-redact'; s.textContent = m[0]; f.append(s); last = m.index + m[0].length;
      }
      if (any) { f.append(t.slice(last)); n.replaceWith(f); }
    }
  }
  function setRedact(on) {
    if (on && !rObs && document.body) {
      scan();
      rObs = new MutationObserver(() => { clearTimeout(rTimer); rTimer = setTimeout(scan, 600); });
      rObs.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else if (!on && rObs) {
      rObs.disconnect(); rObs = null;
      document.querySelectorAll('.a14-redact').forEach((s) => s.replaceWith(document.createTextNode(s.textContent)));
    }
  }

  // ----- apply config -----
  function apply() {
    if (!cfg) return;
    document.documentElement.classList.toggle('a14-blur', !!cfg.blur && !revealed && !cfg.mode);
    if (cfg.mode) showLock(cfg.mode); else if (cfg.focus) showFocus(); else unlockUI();
    (cfg.hidden || (cfg.mode && cfg.hideOnLock)) ? disguise() : undisguise();
    setRedact(!!cfg.redact && !cfg.mode);
    hud();
  }
  async function init() { const c = await send({ type: 'init' }); if (c && c.decoy) { cfg = c; apply(); } }

  // ----- input guard / anti-tamper -----
  const BLOCK = ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'copy', 'cut', 'paste', 'dragstart', 'selectstart', 'touchstart', 'touchend', 'pointerdown', 'auxclick'];
  function guard(e) {
    if (!locked) return;
    if (host && e.composedPath().includes(host)) return;
    if (e.type === 'keydown') {
      if (layer && DIS.includes(layer.dataset.mode)) {
        konami.push(e.key.length === 1 ? e.key.toLowerCase() : e.key); konami = konami.slice(-KONAMI.length);
        if (konami.join() === KONAMI.join()) { konami = []; openPrompt(false); }
      }
      const bad = e.key === 'F12' || (e.ctrlKey && e.shiftKey && /^[ijc]$/i.test(e.key)) || (e.ctrlKey && /^[usp]$/i.test(e.key));
      if (bad && Date.now() - tamperAt > 5000) { tamperAt = Date.now(); send({ type: 'tamper', what: e.key }); }
    }
    if (e.type === 'contextmenu' && Date.now() - tamperAt > 5000) { tamperAt = Date.now(); send({ type: 'tamper', what: 'contextmenu' }); }
    e.stopImmediatePropagation(); e.preventDefault();
  }
  BLOCK.forEach((t) => window.addEventListener(t, guard, { capture: true, passive: false }));

  window.addEventListener('keydown', (e) => { if (e.altKey && e.shiftKey && e.code === 'KeyN') { e.preventDefault(); openNotes(); } }, true);
  window.addEventListener('mousedown', (e) => {
    if (locked) return;
    const r = e.target && e.target.closest && e.target.closest('.a14-redact');
    if (r) { e.preventDefault(); e.stopPropagation(); r.classList.toggle('a14-show'); return; }
    if (cfg && cfg.blur && !revealed) { revealed = true; document.documentElement.classList.remove('a14-blur'); e.preventDefault(); e.stopPropagation(); }
  }, true);
  const reblur = () => { revealed = false; if (cfg) document.documentElement.classList.toggle('a14-blur', !!cfg.blur && !cfg.mode); };
  document.addEventListener('mouseleave', reblur);
  window.addEventListener('blur', reblur);

  chrome.runtime.onMessage.addListener((m) => { if (m && m.type === 'refresh') init(); });
  window.addEventListener('pageshow', init);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') init(); });
  document.addEventListener('DOMContentLoaded', () => { if (cfg) apply(); });
  init();
})();

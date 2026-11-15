import * as C from './crypto.js';

const DEF = {
  lockStyle: 'pin', idleMinutes: 10, lockOnStartup: true, blurAll: false, hideOnLock: true, decoyMode: 'rotate',
  windowOn: false, winStart: '08:00', winEnd: '22:00', rules: '', focusSites: '',
  ghost: false, selfie: true, maxAttempts: 7, wipeOnDestruct: true, anomalyOn: false, anomalyCount: 8,
  clap: false, clapThr: 0.3, redact: false, deadDays: 0, hud: false, theme: 'green', sounds: true,
  totpOn: false, totpSecret: ''
};
const DECOYS = [
  { t: 'Untitled document - Google Docs', c: '#4285f4', l: 'D' },
  { t: 'Google Classroom', c: '#0f9d58', l: 'C' },
  { t: 'Inbox (3) - Gmail', c: '#ea4335', l: 'M' },
  { t: 'My Drive - Google Drive', c: '#f4b400', l: 'D' },
  { t: 'Wikipedia, the free encyclopedia', c: '#555555', l: 'W' }
];
const MAX_LOG_ENTRIES = 300;
const MAX_IMAGE_ENTRIES = 50;
const DEFSTATE = { browserLocked: false, duress: false, tabs: {}, hidden: {}, blur: {}, watched: {}, ruleOk: {}, focusPass: {}, lastActive: {}, fails: 0, lockoutUntil: 0 };
const local = chrome.storage.local, session = chrome.storage.session;

// ---------- storage helpers ----------
const getSettings = async () => ({ ...DEF, ...((await local.get('settings')).settings || {}) });
const getState = async () => ({ ...structuredClone(DEFSTATE), ...((await local.get('state')).state || {}) });
const hasPin = async () => !!(await local.get('auth')).auth?.pin;
let q = Promise.resolve();
function mutate(fn) {
  const p = q.then(async () => { const s = await getState(); const r = await fn(s); await local.set({ state: s }); return r; });
  q = p.catch(() => {});
  return p;
}
let lq = Promise.resolve();
function log(type, data = {}) {
  lq = lq.then(async () => {
    const { log: arr = [] } = await local.get('log');
    const entry = { t: Date.now(), type, ...data };
    arr.unshift(entry);
    if (entry.img) {
      let images = 0;
      for (const item of arr) {
        if (!item.img) continue;
        images++;
        if (images > MAX_IMAGE_ENTRIES) delete item.img;
      }
    }
    await local.set({ log: arr.slice(0, MAX_LOG_ENTRIES) });
  }).catch(() => {});
  return lq;
}

// ---------- helpers ----------
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function rulesOf(text) {
  return (text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [d, a] = l.split(/[\s,]+/);
    return { d: (d || '').toLowerCase().replace(/^www\./, ''), a: (a || 'lock').toLowerCase() };
  });
}
const matchRule = (text, host) => { const r = rulesOf(text).find((x) => x.d && (host === x.d || host.endsWith('.' + x.d))); return r ? r.a : null; };
function decoyFor(s) {
  const i = s.decoyMode === 'rotate' ? Math.floor(new Date().getHours() / 5) % DECOYS.length : Math.min(Number(s.decoyMode) || 0, DECOYS.length - 1);
  return DECOYS[i];
}
function inWindow(s) {
  const f = (x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
  const n = new Date(), m = n.getHours() * 60 + n.getMinutes(), a = f(s.winStart), b = f(s.winEnd);
  return a <= b ? m >= a && m <= b : m >= a || m <= b;
}
async function targetTab() {
  const { lastWin } = await session.get('lastWin');
  let t;
  if (lastWin) [t] = await chrome.tabs.query({ active: true, windowId: lastWin }).catch(() => []);
  if (!t) [t] = await chrome.tabs.query({ active: true, windowType: 'normal' });
  return t;
}
async function refreshAll() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'refresh' }).catch(() => {});
  updateBadge();
}
async function updateBadge() {
  const [s, st] = await Promise.all([getSettings(), getState()]);
  const any = st.browserLocked || Object.keys(st.tabs).length;
  chrome.action.setBadgeText({ text: !s.ghost && any ? 'LOCK' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#c0392b' });
}
async function tabConfig(tabId, url) {
  const [s, st] = await Promise.all([getSettings(), getState()]);
  const host = hostOf(url), id = String(tabId), rule = matchRule(s.rules, host), now = Date.now();
  let mode = null;
  if (st.browserLocked) mode = st.duress ? 'duress' : s.lockStyle;
  else if (st.tabs[id]) mode = st.tabs[id];
  else if (rule === 'lock' && st.ruleOk[id] !== host) mode = s.lockStyle;
  const focus = !mode && host && matchRule(s.focusSites, host) !== null && !(st.focusPass[host] > now);
  return {
    mode, focus, host,
    hidden: !!st.hidden[id] || rule === 'hide',
    blur: !!st.blur[id] || s.blurAll || rule === 'blur',
    decoy: decoyFor(s), hideOnLock: s.hideOnLock, hud: s.hud, theme: s.theme, sounds: s.sounds,
    redact: s.redact, totpOn: !!(s.totpOn && s.totpSecret)
  };
}

// ---------- offscreen (camera snapshot + clap detection) ----------
async function ensureOffscreen() {
  const c = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (c.length) return;
  await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Local-only intruder photo and clap detection.' });
}
async function snap(reason) {
  try {
    await ensureOffscreen();
    const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'snap' });
    await log('selfie', { reason, img: r && r.img, err: r && r.err });
  } catch (e) { await log('selfie', { reason, err: String(e) }); }
}
async function applySensors(s) {
  try {
    if (s.clap) { await ensureOffscreen(); await chrome.runtime.sendMessage({ target: 'offscreen', type: 'clapStart', thr: Number(s.clapThr) || 0.3 }); }
    else {
      const c = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (c.length) await chrome.runtime.sendMessage({ target: 'offscreen', type: 'clapStop' });
    }
  } catch {}
}
async function applyGhost(s) {
  try {
    if (s.ghost) {
      await chrome.action.setIcon({ imageData: { 16: new ImageData(16, 16), 32: new ImageData(32, 32) } });
      await chrome.action.setTitle({ title: ' ' });
    } else {
      await chrome.action.setIcon({ path: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' } });
      await chrome.action.setTitle({ title: 'a14x27s-tab' });
    }
  } catch {}
}

// ---------- context menu ----------
async function setupMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'a14', title: 'a14x27s-tab', contexts: ['all'] });
  chrome.contextMenus.create({ id: 'lock-tab', parentId: 'a14', title: 'Lock this tab', contexts: ['all'] });
  chrome.contextMenus.create({ id: 'hide-tab', parentId: 'a14', title: 'Hide this tab', contexts: ['all'] });
  chrome.contextMenus.create({ id: 'lock-group', parentId: 'a14', title: 'Lock this tab group', contexts: ['all'] });
  chrome.contextMenus.create({ id: 'lock-browser', parentId: 'a14', title: 'Lock the browser', contexts: ['all'] });
}

// ---------- locking ----------
async function lockBrowser(why = 'manual') {
  if (!(await hasPin())) return { ok: false, error: 'Set a PIN in Options first.' };
  await mutate((st) => { st.browserLocked = true; st.duress = false; });
  await log('lock', { why });
  await refreshAll();
  return { ok: true };
}
async function lockTabs(ids) {
  if (!(await hasPin())) return { ok: false, error: 'Set a PIN in Options first.' };
  const valid = [...new Set((ids || []).filter((id) => Number.isInteger(id) && id >= 0))];
  if (!valid.length) return { ok: false, error: 'No valid tab selected.' };
  const s = await getSettings();
  await mutate((st) => { for (const id of valid) st.tabs[id] = s.lockStyle; });
  await log('lock', { why: 'tab', n: valid.length });
  await refreshAll();
  return { ok: true };
}
async function hideTabs(ids) {
  const infos = [];
  for (const id of ids) { try { infos.push(await chrome.tabs.get(id)); } catch {} }
  await mutate((st) => { for (const t of infos) if (!st.hidden[t.id]) st.hidden[t.id] = { title: t.title || '', url: t.url || '' }; });
  await refreshAll();
  return { ok: true };
}

async function fail(s) {
  let res;
  await mutate((st) => {
    st.fails++;
    const wait = st.fails >= 3 ? Math.min(30 * 2 ** (st.fails - 3), 3600) : 0;
    if (wait) st.lockoutUntil = Date.now() + wait * 1000;
    res = { n: st.fails, wait };
  });
  await log('wrong_pin', { n: res.n });
  if (s.selfie) snap('wrong_pin');
  if (s.maxAttempts > 0 && res.n >= s.maxAttempts) await selfDestruct(s);
  return { ok: false, wait: res.wait, msg: 'Wrong PIN' };
}
async function selfDestruct(s) {
  await log('self_destruct');
  try {
    const keep = await chrome.tabs.create({ url: 'chrome://newtab/' });
    const tabs = await chrome.tabs.query({});
    await chrome.tabs.remove(tabs.filter((t) => t.id !== keep.id).map((t) => t.id)).catch(() => {});
    if (s.wipeOnDestruct) await chrome.browsingData.remove({ since: 0 }, { cookies: true, localStorage: true, indexedDB: true, cache: true, cacheStorage: true, serviceWorkers: true });
  } catch {}
  await mutate((st) => { st.fails = 0; st.lockoutUntil = Date.now() + 3600 * 1000; st.browserLocked = true; st.duress = false; });
  await refreshAll();
}
async function checkPin(pin, totp) {
  const st = await getState(), now = Date.now();
  if (st.lockoutUntil > now) return { ok: false, wait: Math.ceil((st.lockoutUntil - now) / 1000), msg: 'Locked out' };
  const { auth } = await local.get('auth');
  if (!auth?.pin) return { ok: true, kind: 'real', noPin: true };
  const s = await getSettings();
  if (s.windowOn && !inWindow(s)) { await log('outside_window'); return { ok: false, msg: 'Unlock not allowed at this time of day.' }; }
  pin = String(pin || '');
  const h = await C.hashPin(pin, auth.pin.salt);
  let kind = null;
  if (C.safeEq(h.hash, auth.pin.hash)) kind = 'real';
  else if (auth.duress) { const d = await C.hashPin(pin, auth.duress.salt); if (C.safeEq(d.hash, auth.duress.hash)) kind = 'duress'; }
  if (kind === 'real' && s.totpOn && s.totpSecret && !(await C.verifyTotp(s.totpSecret, totp))) kind = null;
  if (kind) {
    await mutate((x) => { x.fails = 0; x.lockoutUntil = 0; });
    if (kind === 'real') await local.set({ lastCheckin: now });
    return { ok: true, kind };
  }
  return fail(s);
}
async function applyUnlock(r, tabId, host) {
  const s = await getSettings();
  if (r.kind === 'duress') {
    await mutate((st) => { st.browserLocked = true; st.duress = true; });
    await log('duress');
    if (s.selfie) snap('duress');
    await refreshAll();
    return { ok: true, duress: true };
  }
  await mutate((st) => { st.browserLocked = false; st.duress = false; if (tabId != null) { delete st.tabs[tabId]; st.ruleOk[tabId] = host; } });
  await log('unlock');
  await refreshAll();
  return { ok: true };
}
const optsOk = async () => !(await hasPin()) || ((await session.get('optsUntil')).optsUntil || 0) > Date.now();
const wrongPin = (r) => (r.ok ? { ok: false, msg: 'Wrong PIN' } : r);

// ---------- message handlers ----------
const H = {
  async init(m, sender) { return tabConfig(sender.tab.id, sender.tab.url || sender.url); },
  async unlock(m, sender) {
    const r = await checkPin(m.pin, m.totp);
    return r.ok ? applyUnlock(r, sender.tab.id, hostOf(sender.tab.url)) : r;
  },
  async unlockBrowser(m) { const r = await checkPin(m.pin, m.totp); return r.ok ? applyUnlock(r, null, '') : r; },
  async focusPass(m, sender) {
    const host = hostOf(sender.tab.url);
    await mutate((st) => { st.focusPass[host] = Date.now() + 10 * 60 * 1000; });
    return { ok: true };
  },
  async tamper(m) { await log('tamper', { what: m.what }); const s = await getSettings(); if (s.selfie) snap('tamper'); return { ok: true }; },
  async honeyLog(m) {
    await log('honeypot', { kind: m.kind, event: m.event, user: m.user, len: m.len });
    const s = await getSettings(); if (s.selfie) snap('honeypot');
    return { ok: true };
  },
  async clap() { const s = await getSettings(); if (s.clap) { await log('clap'); return lockBrowser('clap'); } return { ok: false }; },

  async popupState() {
    const [st, t] = [await getState(), await targetTab()];
    const s = await getSettings();
    return {
      hasPin: await hasPin(), browserLocked: st.browserLocked, totpOn: !!(s.totpOn && s.totpSecret),
      hasVault: !!(await local.get('vault')).vault, hiddenCount: Object.keys(st.hidden).length,
      tab: t ? { id: t.id, host: hostOf(t.url), groupId: t.groupId, locked: !!st.tabs[t.id], hidden: !!st.hidden[t.id], blur: !!st.blur[t.id], watched: !!st.watched[t.id] } : null
    };
  },
  async lockTab(m) { const t = m.tabId ?? (await targetTab())?.id; return lockTabs([t]); },
  async hideTab(m) { const t = m.tabId ?? (await targetTab())?.id; return hideTabs([t]); },
  async lockGroup(m) { const ts = await chrome.tabs.query({ groupId: m.groupId }); return lockTabs(ts.map((t) => t.id)); },
  async hideGroup(m) {
    const ts = await chrome.tabs.query({ groupId: m.groupId });
    await hideTabs(ts.map((t) => t.id));
    try { await chrome.tabGroups.update(m.groupId, { collapsed: true }); } catch {}
    return { ok: true };
  },
  async lockBrowser() { return lockBrowser('manual'); },
  async panic() { await log('panic'); return lockBrowser('panic'); },
  async toggleBlur(m) {
    if (!Number.isInteger(m.tabId) || m.tabId < 0) return { ok: false, error: 'No valid tab selected.' };
    await mutate((st) => { st.blur[m.tabId] ? delete st.blur[m.tabId] : (st.blur[m.tabId] = true); });
    await refreshAll();
    return { ok: true };
  },
  async toggleWatch(m) {
    if (!Number.isInteger(m.tabId) || m.tabId < 0) return { ok: false, error: 'No valid tab selected.' };
    await mutate((st) => { st.watched[m.tabId] ? delete st.watched[m.tabId] : (st.watched[m.tabId] = true); });
    return { ok: true };
  },
  async hiddenList(m) {
    const r = await checkPin(m.pin);
    if (!r.ok || r.kind !== 'real') return wrongPin(r);
    const st = await getState();
    return { ok: true, list: Object.entries(st.hidden).map(([id, v]) => ({ id: Number(id), ...v })) };
  },
  async restoreHidden(m) {
    const r = await checkPin(m.pin);
    if (!r.ok || r.kind !== 'real') return wrongPin(r);
    await mutate((st) => { if (m.all) st.hidden = {}; else delete st.hidden[m.tabId]; });
    if (m.tabId != null) { try { const t = await chrome.tabs.update(m.tabId, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); } catch {} }
    await refreshAll();
    return { ok: true };
  },
  async bomb(m) {
    chrome.alarms.create(`bomb|${m.tabId}|${m.action}`, { delayInMinutes: Math.max(0.5, Number(m.minutes) || 1) });
    return { ok: true };
  },
  async makeHoneypot(m) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('honeypot.html?k=' + (m.kind === 'passwords' ? 'passwords' : 'bank')), active: false });
    return { ok: true };
  },
  async openPanel() { await openPanel(); return { ok: true }; },

  // ----- options (gated) -----
  async authCheck(m) {
    const r = await checkPin(m.pin, m.totp);
    if (!r.ok || r.kind !== 'real') return wrongPin(r);
    await session.set({ optsUntil: Date.now() + 10 * 60 * 1000 });
    return { ok: true };
  },
  async getOptions() {
    if (!(await optsOk())) return { ok: false, gated: true, totpOn: (await getSettings()).totpOn };
    const { auth, vault, notes } = await local.get(['auth', 'vault', 'notes']);
    return { ok: true, settings: await getSettings(), hasPin: !!auth?.pin, hasDuress: !!auth?.duress, hasVault: !!vault, hasNotes: !!notes };
  },
  async saveSettings(m) {
    if (!(await optsOk())) return { ok: false, error: 'Locked' };
    const cur = await getSettings(), n = { ...cur };
    for (const k of Object.keys(DEF)) if (k in m.settings && !['totpSecret'].includes(k)) n[k] = m.settings[k];
    for (const k of ['idleMinutes', 'maxAttempts', 'anomalyCount', 'deadDays', 'clapThr']) n[k] = Number(n[k]) || 0;
    if (!n.totpSecret) n.totpOn = false;
    await local.set({ settings: n });
    await boot(false);
    await refreshAll();
    return { ok: true };
  },
  async setPin(m) {
    const { auth = {} } = await local.get('auth');
    if (auth.pin) {
      const r = await checkPin(m.current);
      if (!r.ok || r.kind !== 'real') return wrongPin(r);
    }
    const np = String(m.newPin || '');
    if (m.kind === 'duress') {
      if (!auth.pin) return { ok: false, error: 'Set the main PIN first.' };
      if (!np) { delete auth.duress; await local.set({ auth }); return { ok: true }; }
      if (np.length < 4) return { ok: false, error: 'At least 4 characters.' };
      const same = await C.hashPin(np, auth.pin.salt);
      if (C.safeEq(same.hash, auth.pin.hash)) return { ok: false, error: 'Duress PIN must differ from the real PIN.' };
      auth.duress = await C.hashPin(np);
    } else {
      if (np.length < 4) return { ok: false, error: 'At least 4 characters.' };
      const { vault, notes } = await local.get(['vault', 'notes']);
      if (auth.pin) {
        try {
          if (vault) await local.set({ vault: await C.encryptJSON(await C.decryptJSON(vault, m.current), np) });
          if (notes) await local.set({ notes: await C.encryptJSON(await C.decryptJSON(notes, m.current), np) });
        } catch { return { ok: false, error: 'Could not re-encrypt vault/notes.' }; }
      }
      auth.pin = await C.hashPin(np);
      if (auth.duress) { const d = await C.hashPin(np, auth.duress.salt); if (C.safeEq(d.hash, auth.duress.hash)) delete auth.duress; }
    }
    await local.set({ auth, lastCheckin: Date.now() });
    await session.set({ optsUntil: Date.now() + 10 * 60 * 1000 });
    return { ok: true };
  },
  async totpNew() {
    if (!(await optsOk())) return { ok: false };
    const secret = C.newSecret();
    await session.set({ totpPending: secret });
    return { ok: true, secret, uri: `otpauth://totp/a14x27s-tab?secret=${secret}&issuer=a14x27s-tab` };
  },
  async totpConfirm(m) {
    if (!(await optsOk())) return { ok: false };
    const { totpPending } = await session.get('totpPending');
    if (!totpPending || !(await C.verifyTotp(totpPending, m.code))) return { ok: false, error: 'Code does not match.' };
    const s = await getSettings();
    await local.set({ settings: { ...s, totpSecret: totpPending, totpOn: true } });
    return { ok: true };
  },
  async getLog() { if (!(await optsOk())) return { ok: false }; return { ok: true, log: (await local.get('log')).log || [] }; },
  async clearLog() { if (!(await optsOk())) return { ok: false }; await local.set({ log: [] }); return { ok: true }; },

  // ----- vault + notes -----
  async vaultSave(m) {
    const r = await checkPin(m.pin);
    if (!r.ok || r.kind !== 'real' || r.noPin) return r.noPin ? { ok: false, error: 'Set a PIN first.' } : wrongPin(r);
    const win = await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] });
    const tabs = win.tabs.filter((t) => t.url && !t.url.startsWith(chrome.runtime.getURL('')));
    if (!tabs.length) return { ok: false, error: 'No tabs to vault.' };
    let items = tabs.map((t) => ({ url: t.url, title: t.title, pinned: t.pinned }));
    const { vault } = await local.get('vault');
    if (vault) { try { items = (await C.decryptJSON(vault, m.pin)).tabs.concat(items); } catch { return { ok: false, error: 'Existing vault cannot be read.' }; } }
    await local.set({ vault: await C.encryptJSON({ tabs: items }, m.pin) });
    const keep = await chrome.tabs.create({ windowId: win.id, url: 'chrome://newtab/' });
    await chrome.tabs.remove(tabs.map((t) => t.id).filter((id) => id !== keep.id));
    await log('vault_save', { n: tabs.length });
    return { ok: true, n: tabs.length };
  },
  async vaultRestore(m) {
    const r = await checkPin(m.pin);
    if (!r.ok || r.kind !== 'real') return wrongPin(r);
    const { vault } = await local.get('vault');
    if (!vault) return { ok: false, error: 'Vault is empty.' };
    let data;
    try { data = await C.decryptJSON(vault, m.pin); } catch { return { ok: false, error: 'Vault cannot be decrypted.' }; }
    await session.set({ suppressUntil: Date.now() + 20000 });
    for (const t of data.tabs) await chrome.tabs.create({ url: t.url, pinned: !!t.pinned, active: false });
    await local.remove('vault');
    await log('vault_restore', { n: data.tabs.length });
    return { ok: true, n: data.tabs.length };
  },
  async notesLoad(m) {
    const r = await checkPin(m.pin);
    if (!r.ok || r.kind !== 'real' || r.noPin) return r.noPin ? { ok: false, error: 'Set a PIN first.' } : wrongPin(r);
    const { notes } = await local.get('notes');
    if (!notes) return { ok: true, text: '' };
    try { return { ok: true, text: (await C.decryptJSON(notes, m.pin)).text }; } catch { return { ok: false, error: 'Cannot decrypt notes.' }; }
  },
  async notesSave(m) {
    const r = await checkPin(m.pin);
    if (!r.ok || r.kind !== 'real') return wrongPin(r);
    await local.set({ notes: await C.encryptJSON({ text: String(m.text || '') }, m.pin) });
    return { ok: true };
  }
};
chrome.runtime.onMessage.addListener((m, sender, send) => {
  if (m.target || !H[m.type]) return false;
  H[m.type](m, sender).then(send).catch((e) => send({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

// ---------- events ----------
async function openPanel() {
  const ws = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
  const url = chrome.runtime.getURL('popup.html');
  const ex = ws.find((w) => w.tabs?.some((t) => t.url?.startsWith(url)));
  if (ex) return chrome.windows.update(ex.id, { focused: true });
  return chrome.windows.create({ url: 'popup.html?panel=1', type: 'popup', width: 390, height: 720 });
}
chrome.commands.onCommand.addListener(async (c) => {
  if (c === 'panic') { await log('panic'); return lockBrowser('panic'); }
  if (c === 'open-panel') return openPanel();
  const t = await targetTab(); if (!t) return;
  if (c === 'lock-tab') return lockTabs([t.id]);
  if (c === 'hide-tab') return hideTabs([t.id]);
});
chrome.omnibox.onInputEntered.addListener((text) => {
  const t = text.trim().toLowerCase();
  if (t === 'lock' || t === 'panic') return lockBrowser('omnibox');
  openPanel();
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'lock-tab') return lockTabs([tab && tab.id]);
  if (info.menuItemId === 'hide-tab') return hideTabs([tab && tab.id]);
  if (info.menuItemId === 'lock-group' && tab && tab.groupId >= 0) return lockTabs((await chrome.tabs.query({ groupId: tab.groupId })).map((t) => t.id));
  if (info.menuItemId === 'lock-browser') return lockBrowser('context_menu');
});
chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === 'active') return;
  const s = await getSettings();
  if (Number(s.idleMinutes) > 0 && (await hasPin())) lockBrowser('idle');
});
chrome.tabs.onRemoved.addListener((id) => {
  mutate((st) => { for (const k of ['tabs', 'hidden', 'blur', 'watched', 'ruleOk']) delete st[k][id]; });
});
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  session.set({ lastWin: windowId });
  const s = await getSettings();
  const prev = await mutate((st) => {
    const p = st.lastActive[windowId]; st.lastActive[windowId] = tabId;
    if (p && p !== tabId && st.watched[p]) { st.tabs[p] = s.lockStyle; return p; }
    return null;
  });
  if (prev) { chrome.tabs.sendMessage(prev, { type: 'refresh' }).catch(() => {}); updateBadge(); }
});
chrome.windows.onFocusChanged.addListener(async (id) => {
  if (id === chrome.windows.WINDOW_ID_NONE) return;
  try { const w = await chrome.windows.get(id); if (w.type === 'normal') session.set({ lastWin: id }); } catch {}
});
chrome.tabs.onCreated.addListener(async () => {
  const s = await getSettings();
  if (!s.anomalyOn) return;
  const { suppressUntil = 0, created = [] } = await session.get(['suppressUntil', 'created']);
  const now = Date.now();
  if (now < suppressUntil) return;
  const arr = [...created.filter((x) => now - x < 5000), now];
  await session.set({ created: arr });
  if (arr.length >= Number(s.anomalyCount) && (await hasPin())) { await session.set({ created: [] }); await log('anomaly', { n: arr.length }); lockBrowser('anomaly'); }
});
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'deadman') {
    const s = await getSettings();
    const { lastCheckin = Date.now() } = await local.get('lastCheckin');
    if (Number(s.deadDays) > 0 && Date.now() - lastCheckin > s.deadDays * 86400000) {
      await local.remove(['vault', 'notes']);
      await log('deadman');
    }
    return;
  }
  const [kind, id, action] = a.name.split('|');
  if (kind !== 'bomb') return;
  if (action === 'close') chrome.tabs.remove(Number(id)).catch(() => {});
  else lockTabs([Number(id)]);
});

// ---------- boot ----------
async function boot(startup) {
  const s = await getSettings();
  chrome.idle.setDetectionInterval(Math.max(15, (Number(s.idleMinutes) || 10) * 60));
  await applyGhost(s);
  if (!(await chrome.alarms.get('deadman'))) chrome.alarms.create('deadman', { periodInMinutes: 360 });
  applySensors(s);
  if (startup) {
    const pin = await hasPin();
    await mutate((st) => {
      Object.assign(st, { tabs: {}, hidden: {}, blur: {}, watched: {}, ruleOk: {}, focusPass: {}, lastActive: {} });
      if (pin && s.lockOnStartup) { st.browserLocked = true; st.duress = false; }
    });
    await session.set({ suppressUntil: Date.now() + 25000 });
    await refreshAll();
  }
}
chrome.runtime.onStartup.addListener(() => boot(true));
chrome.runtime.onInstalled.addListener(async (d) => {
  await setupMenus();
  await boot(false);
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});
setupMenus();
boot(false);

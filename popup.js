const $ = (s) => document.querySelector(s);
const send = (m) => chrome.runtime.sendMessage(m);
const panel = new URLSearchParams(location.search).has('panel');
let S = null;
const note = (t, bad) => { const n = $('#note'); n.textContent = t || ''; n.className = 'sm ' + (bad ? 'bad' : 'ok'); };
const done = () => { if (!panel) window.close(); else load(); };
const err = (r) => (r && (r.wait ? `Too many attempts. Wait ${r.wait}s.` : r.msg || r.error)) || 'Failed';

async function load() {
  S = await send({ type: 'popupState' });
  $('#nopin').hidden = S.hasPin;
  $('#locked').hidden = !(S.hasPin && S.browserLocked);
  $('#main').hidden = !(S.hasPin && !S.browserLocked);
  $('#utotp').hidden = !S.totpOn;
  const t = S.tab; $('#host').textContent = t ? t.host : '';
  if (!t) return;
  $('#chips').innerHTML = '';
  for (const [k, v] of [['locked', t.locked], ['hidden', t.hidden], ['blur', t.blur], ['auto-lock', t.watched]]) {
    const c = document.createElement('span'); c.className = 'chip' + (v ? ' on' : ''); c.textContent = k; $('#chips').append(c);
  }
  $('#lockGrp').hidden = $('#hideGrp').hidden = !(t.groupId >= 0);
}
const act = (id, fn) => $(id).addEventListener('click', async () => { const r = await fn(); if (r && r.ok === false) note(err(r), true); else if (r && r.ok) done(); });
const tid = () => S.tab && S.tab.id;

act('#opt1', async () => { chrome.runtime.openOptionsPage(); });
act('#opts', async () => { chrome.runtime.openOptionsPage(); });
act('#lockTab', () => send({ type: 'lockTab', tabId: tid() }));
act('#hideTab', () => send({ type: 'hideTab', tabId: tid() }));
act('#blur', () => send({ type: 'toggleBlur', tabId: tid() }));
act('#watch', () => send({ type: 'toggleWatch', tabId: tid() }));
act('#lockBr', () => send({ type: 'lockBrowser' }));
act('#panic', () => send({ type: 'panic' }));
act('#lockGrp', () => send({ type: 'lockGroup', groupId: S.tab.groupId }));
act('#hideGrp', () => send({ type: 'hideGroup', groupId: S.tab.groupId }));
act('#bomb', async () => { const r = await send({ type: 'bomb', tabId: tid(), minutes: $('#bmin').value, action: $('#bact').value }); if (r.ok) note('Armed.'); return null; });
act('#unlock', () => send({ type: 'unlockBrowser', pin: $('#upin').value, totp: $('#utotp').value }));
act('#hp1', async () => { const r = await send({ type: 'makeHoneypot', kind: 'bank' }); if (r.ok) note('Honeypot tab created (background).'); return null; });
act('#hp2', async () => { const r = await send({ type: 'makeHoneypot', kind: 'passwords' }); if (r.ok) note('Honeypot tab created (background).'); return null; });
act('#vsave', async () => { const r = await send({ type: 'vaultSave', pin: $('#pin').value }); if (r.ok) note(`Vaulted ${r.n} tabs.`); $('#pin').value = ''; return r.ok ? null : r; });
act('#vrest', async () => { const r = await send({ type: 'vaultRestore', pin: $('#pin').value }); if (r.ok) note(`Restored ${r.n} tabs.`); $('#pin').value = ''; return r.ok ? null : r; });
act('#hall', async () => { const r = await send({ type: 'restoreHidden', pin: $('#pin').value, all: true }); $('#pin').value = ''; if (r.ok) { note('All hidden tabs restored.'); $('#hidden').innerHTML = ''; load(); return null; } return r; });
act('#hlist', async () => {
  const r = await send({ type: 'hiddenList', pin: $('#pin').value });
  if (!r.ok) return r;
  const pin = $('#pin').value; $('#pin').value = ''; $('#hidden').innerHTML = '';
  if (!r.list.length) note('No hidden tabs.');
  for (const h of r.list) {
    const d = document.createElement('div'); d.className = 'hl';
    const s = document.createElement('span'); s.textContent = (h.title || h.url || 'Tab ' + h.id).slice(0, 40);
    const b = document.createElement('button'); b.textContent = 'Restore';
    b.onclick = async () => { const x = await send({ type: 'restoreHidden', pin, tabId: h.id }); if (x.ok) { d.remove(); load(); } else note(err(x), true); };
    d.append(s, b); $('#hidden').append(d);
  }
  return null;
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'upin') $('#unlock').click(); });
load();

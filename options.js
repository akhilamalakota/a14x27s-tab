const $ = (s) => document.querySelector(s);
const send = (m) => chrome.runtime.sendMessage(m);
const say = (id, t, bad) => { const e = $(id); e.textContent = t || ''; e.className = 'sm ' + (bad ? 'bad' : 'ok'); };
const err = (r) => (r && (r.wait ? `Too many attempts. Wait ${r.wait}s.` : r.msg || r.error)) || 'Failed';

async function boot() {
  const r = await send({ type: 'getOptions' });
  if (r.gated) { $('#gate').hidden = false; $('#app').hidden = true; $('#gtotp').hidden = !r.totpOn; return; }
  $('#gate').hidden = true; $('#app').hidden = false;
  document.querySelectorAll('[data-k]').forEach((el) => {
    const v = r.settings[el.dataset.k];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
  $('#pinstate').textContent = r.hasPin ? `PIN is set.${r.hasDuress ? ' Duress PIN is set.' : ''}${r.hasVault ? ' Vault contains tabs.' : ''}` : 'No PIN set yet — set one now to enable locking.';
  loadLog();
}
$('#gbtn').onclick = async () => {
  const r = await send({ type: 'authCheck', pin: $('#gpin').value, totp: $('#gtotp').value });
  if (r.ok) boot(); else $('#gmsg').textContent = err(r);
};
$('#gpin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#gbtn').click(); });

$('#save').onclick = async () => {
  const settings = {};
  document.querySelectorAll('[data-k]').forEach((el) => { settings[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value; });
  const r = await send({ type: 'saveSettings', settings });
  say('#smsg', r.ok ? 'Saved.' : err(r), !r.ok);
};
$('#setpin').onclick = async () => {
  const r = await send({ type: 'setPin', kind: 'pin', current: $('#curpin').value, newPin: $('#newpin').value });
  if (r.ok) { $('#curpin').value = $('#newpin').value = ''; boot(); } else alert(err(r));
};
$('#setduress').onclick = async () => {
  const r = await send({ type: 'setPin', kind: 'duress', current: $('#curpin').value, newPin: $('#duress').value });
  if (r.ok) { $('#duress').value = ''; alert('Duress PIN updated.'); boot(); } else alert(err(r));
};
$('#totpnew').onclick = async () => {
  const r = await send({ type: 'totpNew' });
  if (r.ok) { $('#totpbox').hidden = false; $('#totpsec').textContent = r.secret; }
};
$('#totpok').onclick = async () => {
  const r = await send({ type: 'totpConfirm', code: $('#totpcode').value });
  if (r.ok) { $('#totpbox').hidden = true; alert('Authenticator enabled.'); } else alert(err(r));
};
$('#totpoff').onclick = async () => {
  const r = await send({ type: 'saveSettings', settings: { totpOn: false } });
  alert(r.ok ? 'Authenticator turned off.' : err(r));
};
const perm = async (c, label) => {
  try { const s = await navigator.mediaDevices.getUserMedia(c); s.getTracks().forEach((t) => t.stop()); say('#permmsg', label + ' access granted.'); }
  catch (e) { say('#permmsg', label + ' blocked: ' + e.name, true); }
};
$('#camtest').onclick = () => perm({ video: true }, 'Camera');
$('#mictest').onclick = () => perm({ audio: true }, 'Microphone');
$('#hp1').onclick = () => send({ type: 'makeHoneypot', kind: 'bank' });
$('#hp2').onclick = () => send({ type: 'makeHoneypot', kind: 'passwords' });

async function loadLog() {
  const r = await send({ type: 'getLog' });
  if (!r.ok) return;
  const L = r.log, count = (t) => L.filter((x) => x.type === t).length;
  $('#stats').innerHTML = '';
  for (const [k, v] of [['Locks', count('lock')], ['Unlocks', count('unlock')], ['Wrong PINs', count('wrong_pin')], ['Selfies', L.filter((x) => x.type === 'selfie' && x.img).length], ['Honeypot hits', count('honeypot')], ['Tamper', count('tamper')]]) {
    const d = document.createElement('div'); d.textContent = `${k}: ${v}`; $('#stats').append(d);
  }
  const tb = $('#rows'); tb.innerHTML = '';
  for (const e of L) {
    const tr = document.createElement('tr');
    const t = document.createElement('td'); t.textContent = new Date(e.t).toLocaleString();
    const k = document.createElement('td'); k.textContent = e.type;
    const d = document.createElement('td');
    if (e.img) { const i = document.createElement('img'); i.src = e.img; d.append(i, document.createElement('br')); }
    const info = { ...e }; delete info.t; delete info.type; delete info.img;
    d.append(document.createTextNode(Object.keys(info).length ? JSON.stringify(info) : ''));
    tr.append(t, k, d); tb.append(tr);
  }
}
$('#rlog').onclick = loadLog;
$('#clog').onclick = async () => { await send({ type: 'clearLog' }); loadLog(); };
boot();

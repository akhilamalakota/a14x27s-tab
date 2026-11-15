const $ = (s) => document.querySelector(s);
const send = (m) => chrome.runtime.sendMessage(m);
const say = (id, t, bad) => { const e = $(id); e.textContent = t || ''; e.className = 'sm ' + (bad ? 'bad' : 'ok'); };
const err = (r) => (r && (r.wait ? `Too many attempts. Wait ${r.wait}s.` : r.msg || r.error)) || 'Failed';
let sessionPin = '';

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
  loadProfiles();
}
$('#gbtn').onclick = async () => {
  const r = await send({ type: 'authCheck', pin: $('#gpin').value, totp: $('#gtotp').value });
  if (r.ok) { sessionPin = $('#gpin').value; boot(); } else $('#gmsg').textContent = err(r);
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
  const r = await send({ type: 'getLog', pin: sessionPin });
  if (!r.ok) { say('#backupMsg', r.error || 'Could not load the event log.', true); return; }
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
async function loadProfiles() {
  const r = await send({ type: 'profileList' });
  if (!r || !r.ok) return;
  const select = $('#profileList');
  select.innerHTML = '<option value="">Select a profile</option>';
  r.names.forEach((name) => {
    const option = document.createElement('option');
    option.value = name; option.textContent = name;
    if (name === r.active) option.selected = true;
    select.append(option);
  });
}
$('#rlog').onclick = loadLog;
$('#clog').onclick = async () => { await send({ type: 'clearLog' }); loadLog(); };
$('#profileSave').onclick = async () => {
  const r = await send({ type: 'profileSave', name: $('#profileName').value });
  if (r.ok) { $('#profileName').value = ''; say('#backupMsg', `Saved profile: ${r.name}`); loadProfiles(); } else say('#backupMsg', err(r), true);
};
$('#profileApply').onclick = async () => {
  const name = $('#profileList').value;
  if (!name) return say('#backupMsg', 'Choose a profile first.', true);
  const r = await send({ type: 'profileApply', name });
  say('#backupMsg', r.ok ? `Applied profile: ${name}` : err(r), !r.ok);
  if (r.ok) boot();
};
$('#backupExport').onclick = async () => {
  if (!sessionPin) return say('#backupMsg', 'Unlock settings first.', true);
  const r = await send({ type: 'exportBackup', pin: sessionPin });
  if (!r.ok) return say('#backupMsg', err(r), true);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(r.blob)], { type: 'application/json' }));
  a.download = `a14x27s-backup-${new Date().toISOString().slice(0, 10)}.a14backup`;
  a.click(); URL.revokeObjectURL(a.href);
  say('#backupMsg', 'Encrypted backup exported.');
};
$('#backupFile').addEventListener('change', async () => {
  const file = $('#backupFile').files[0];
  if (!file || !sessionPin) return;
  try {
    const blob = JSON.parse(await file.text());
    const r = await send({ type: 'importBackup', pin: sessionPin, blob });
    say('#backupMsg', r.ok ? 'Encrypted backup restored.' : err(r), !r.ok);
    if (r.ok) boot();
  } catch (e) { say('#backupMsg', `Backup import failed: ${e.message}`, true); }
});
boot();

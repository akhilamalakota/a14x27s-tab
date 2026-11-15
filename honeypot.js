const kind = new URLSearchParams(location.search).get('k') === 'passwords' ? 'passwords' : 'bank';
const T = kind === 'bank'
  ? { title: 'SecureBank Online – Sign In', h: 'SecureBank Online', p: 'Sign in to view your accounts.', u: 'User ID' }
  : { title: 'Saved passwords – Password Manager', h: 'Saved passwords', p: 'Enter your master password to view saved passwords.', u: 'Email' };
document.title = T.title; h.textContent = T.h; p.textContent = T.p; u.placeholder = T.u;
let last = false;
const check = () => {
  const v = document.visibilityState === 'visible';
  if (v && !last) chrome.runtime.sendMessage({ type: 'honeyLog', kind, event: 'opened' });
  last = v;
};
document.addEventListener('visibilitychange', check); check();
f.addEventListener('submit', (e) => {
  e.preventDefault();
  chrome.runtime.sendMessage({ type: 'honeyLog', kind, event: 'credentials', user: u.value.slice(0, 60), len: w.value.length });
  e.target.querySelector('#e').textContent = 'Service temporarily unavailable. Please try again later.'; w.value = '';
});

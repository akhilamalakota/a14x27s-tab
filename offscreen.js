let clapStream = null, clapCtx = null, clapTimer = null;

async function snap() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
    const v = document.createElement('video'); v.muted = true; v.srcObject = stream; await v.play();
    await new Promise((r) => setTimeout(r, 700));
    const c = document.createElement('canvas'); c.width = v.videoWidth || 320; c.height = v.videoHeight || 240;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return { img: c.toDataURL('image/jpeg', 0.55) };
  } catch (e) { return { err: e.name || String(e) }; }
  finally { if (stream) stream.getTracks().forEach((t) => t.stop()); }
}
function clapStop() {
  clearInterval(clapTimer); clapTimer = null;
  if (clapStream) clapStream.getTracks().forEach((t) => t.stop()); clapStream = null;
  if (clapCtx) clapCtx.close().catch(() => {}); clapCtx = null;
}
async function clapStart(thr) {
  clapStop();
  try {
    clapStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    clapCtx = new AudioContext(); await clapCtx.resume();
    const an = clapCtx.createAnalyser(); an.fftSize = 1024;
    clapCtx.createMediaStreamSource(clapStream).connect(an);
    const buf = new Float32Array(an.fftSize); let above = false, lastClap = 0;
    clapTimer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let s = 0; for (const x of buf) s += x * x;
      const rms = Math.sqrt(s / buf.length), now = Date.now();
      if (rms > thr && !above) {
        above = true;
        if (lastClap && now - lastClap > 120 && now - lastClap < 700) { lastClap = 0; chrome.runtime.sendMessage({ type: 'clap' }); }
        else lastClap = now;
      } else if (rms < thr * 0.5) above = false;
    }, 25);
    return { ok: true };
  } catch (e) { return { ok: false, err: e.name || String(e) }; }
}
chrome.runtime.onMessage.addListener((m, s, send) => {
  if (m.target !== 'offscreen') return false;
  if (m.type === 'snap') { snap().then(send); return true; }
  if (m.type === 'clapStart') { clapStart(m.thr || 0.3).then(send); return true; }
  if (m.type === 'clapStop') { clapStop(); send({ ok: true }); }
  return false;
});

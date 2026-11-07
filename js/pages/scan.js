/*
 * Scan Attendance: a station that marks students present from their ID card.
 *  • Camera (laptop webcam, external USB camera or phone camera) reads the barcode or QR code
 *    continuously — no button to press.
 *  • USB / Bluetooth barcode scanners type the code followed by Enter; that is caught here too.
 *  • One scan per student per day; scanning again shows "Already recorded".
 */
window.Pages = window.Pages || {};
(function () {
  const { icon, esc, $, $$ } = UI;
  const PONYFILL = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/dist/iife/ponyfill.js';
  const FORMATS = ['code_128', 'qr_code'];
  const PREF = { cam: 'ims.scan.cam', device: 'ims.scan.device', sound: 'ims.scan.sound' };
  const pref = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  // Live state for the page currently on screen
  let st = null;

  // ── Barcode reading ──
  let detectorPromise = null;
  function getDetector() {
    if (!detectorPromise) {
      detectorPromise = (async () => {
        if ('BarcodeDetector' in window) {
          try {
            const supported = await window.BarcodeDetector.getSupportedFormats();
            if (FORMATS.every((f) => supported.includes(f))) return new window.BarcodeDetector({ formats: FORMATS });
          } catch (e) { /* fall back to the bundled reader */ }
        }
        await UI.loadScript(PONYFILL);
        return new window.BarcodeDetectionAPI.BarcodeDetector({ formats: FORMATS });
      })();
      detectorPromise.catch(() => { detectorPromise = null; });
    }
    return detectorPromise;
  }

  // ── Feedback: beep + vibrate ──
  let actx = null;
  function feedback(kind) {
    if (navigator.vibrate) { try { navigator.vibrate(kind === 'ok' ? 90 : kind === 'already' ? [60, 70, 60] : [250]); } catch (e) {} }
    if (pref.get(PREF.sound, 'on') !== 'on') return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const seq = { ok: [[1175, 0.13]], already: [[740, 0.09], [740, 0.09]], error: [[200, 0.38]] }[kind] || [];
      let t = actx.currentTime + 0.01;
      seq.forEach(([f, d]) => {
        const o = actx.createOscillator(), gain = actx.createGain();
        o.type = kind === 'error' ? 'square' : 'sine';
        o.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(kind === 'error' ? 0.12 : 0.3, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(gain).connect(actx.destination);
        o.start(t); o.stop(t + d + 0.02);
        t += d + 0.07;
      });
    } catch (e) {}
  }

  // ── Result panel ──
  function resultHtml(kind, s, info) {
    if (kind === 'idle') {
      return `<div class="scan-idle">
        <div class="scan-idle-ic">${icon('scan')}</div>
        <h3>Ready to scan</h3>
        <p class="muted">Hold the student's ID card in front of the camera, or scan it with a barcode scanner.</p>
      </div>`;
    }
    if (kind === 'unknown') {
      return `<div class="scan-banner error">${icon('alert')}<div><b>Card not recognised</b><span>${info.foreign ? 'This ID card belongs to another institute.' : `No student has the ID “${esc(info.code)}”.`}</span></div></div>
        <div class="scan-idle compact"><p class="muted">Check the card belongs to this institute, or add the student first.</p></div>`;
    }
    const c = Logic.courseOf(s), b = Logic.batchOf(s);
    const banner = {
      ok: ['ok', 'checkCircle', 'Attendance recorded', `Marked present at ${UI.fmtTime(info.at)}`],
      already: ['warn', 'clock', 'Attendance already recorded', info.at ? `Scanned today at ${UI.fmtTime(info.at)}` : `Marked ${info.st === 'L' ? 'late' : 'present'} today`],
      inactive: ['error', 'alert', 'Not recorded', `This student is marked “${({ completed: 'Completed', dropped: 'Dropped' })[s.status] || s.status}”.`]
    }[kind];
    return `<div class="scan-banner ${banner[0]}">${icon(banner[1])}<div><b>${banner[2]}</b><span>${esc(banner[3])}</span></div></div>
      <div class="scan-person">
        ${s.photo ? `<img class="scan-photo" src="${esc(s.photo)}" alt="">` : `<div class="scan-photo initials">${esc(UI.initials(s.name))}</div>`}
        <div class="scan-name">${esc(s.name)}</div>
        <div class="scan-code">${esc(s.code || '')}</div>
        <dl class="scan-facts">
          <div><dt>Course</dt><dd>${esc(c ? c.name : '—')}</dd></div>
          <div><dt>Batch</dt><dd>${esc(b ? b.name + (b.time ? ' · ' + b.time : '') : '—')}</dd></div>
        </dl>
      </div>`;
  }

  // Compact version over the camera picture (phones, where the side panel is below the fold)
  function popHtml(kind, s, info) {
    const line = {
      ok: `Present · ${UI.fmtTime(info.at)}`,
      already: info.at ? `Already recorded · ${UI.fmtTime(info.at)}` : 'Already recorded today',
      inactive: 'Not active — not recorded',
      unknown: 'Card not recognised'
    }[kind];
    const ic = { ok: 'checkCircle', already: 'clock', inactive: 'alert', unknown: 'alert' }[kind];
    return `${s ? UI.avatar(s.name, s.photo, 'lg') : `<div class="avatar lg">${icon('alert')}</div>`}
      <div class="li-main"><div class="scan-pop-name">${esc(s ? s.name : info.foreign ? 'Another institute' : info.code)}</div>
        <div class="scan-pop-line">${icon(ic)} ${esc(line)}</div></div>`;
  }

  function showResult(kind, s, info) {
    if (!st) return;
    const box = st.result;
    box.className = 'card scan-result is-' + kind;
    box.innerHTML = resultHtml(kind, s, info || {});
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    const pop = $('#scanPop', st.el);
    pop.hidden = kind === 'idle';
    if (kind !== 'idle') { pop.className = 'scan-pop is-' + kind; pop.innerHTML = popHtml(kind, s, info || {}); }
    clearTimeout(st.idleTimer);
    if (kind !== 'idle') st.idleTimer = setTimeout(() => showResult('idle'), 7000);
  }

  // ── Handling a scanned code ──
  function handle(raw, fromCamera) {
    const code = String(raw || '').replace(/[\r\n\t]/g, '').trim();
    if (!code || !st) return;
    const now = Date.now();
    // A card held in front of the camera is read many times a second — act on it once
    if (fromCamera && code.toUpperCase() === st.lastCode && now - st.lastAt < 3500) { st.lastAt = now; return; }
    st.lastCode = code.toUpperCase();
    st.lastAt = now;
    st.chain = st.chain.then(() => process(code)).catch((e) => { console.error(e); UI.toast(e.message || 'Could not record attendance', 'error'); });
  }

  async function process(code) {
    if (!st) return;
    const card = Logic.readCard(code);
    const s = card.student;
    if (!s) { feedback('error'); showResult('unknown', null, { code: card.foreign ? '' : code, foreign: card.foreign }); return; }
    if (s.status && s.status !== 'active') { feedback('error'); showResult('inactive', s, {}); return; }
    const r = await Logic.recordScan(s);
    feedback(r.status === 'marked' ? 'ok' : 'already');
    showResult(r.status === 'marked' ? 'ok' : 'already', s, r);
    refreshLog();
  }

  // ── Today's log ──
  function refreshLog() {
    if (!st) return;
    const today = UI.today();
    if (today !== st.day) { st.day = today; $('#scanDate', st.el).textContent = `${UI.weekday(today)}, ${UI.fmtDate(today)}`; }
    const list = Logic.scansOn(today);
    const present = Logic.attendanceOnDate(today).present;
    const active = Logic.activeStudents().length;
    $('#scanCount', st.el).innerHTML = `<b>${present}</b> of ${active} present today`;
    $('#scanLogCount', st.el).textContent = list.length ? `${list.length} scanned` : '';
    $('#scanLog', st.el).innerHTML = list.length ? list.slice(0, 200).map(({ s, at, st: mark }) => `
      <div class="list-item clickable" data-nav="student/${esc(s.id)}">
        ${UI.avatar(s.name, s.photo, 'sm')}
        <div class="li-main"><div class="li-title">${esc(s.name)}</div><div class="li-sub">${esc(s.code || '')}${Logic.batchOf(s) ? ' · ' + esc(Logic.batchOf(s).name) : ''}</div></div>
        <div class="li-end"><div class="strong small">${esc(UI.fmtTime(at))}</div>${mark === 'L' ? '<span class="badge badge-warning">Late</span>' : ''}</div>
      </div>`).join('')
      : UI.empty('scan', 'No scans yet today', 'Students appear here as they scan their ID cards.');
  }

  // ── Camera ──
  function setCamUi(state, message) {
    if (!st) return;
    const off = $('#camOff', st.el);
    const toggle = $('#camToggle', st.el);
    off.hidden = state === 'on';
    $('#scanCam', st.el).classList.toggle('live', state === 'on');
    toggle.innerHTML = state === 'on' || state === 'starting' ? `${icon('cameraOff')} <span>Stop camera</span>` : `${icon('camera')} <span>Start camera</span>`;
    if (state !== 'on') {
      $('#camMsg', st.el).innerHTML = state === 'starting'
        ? '<div class="spinner"></div><span>Starting camera…</span>'
        : `<div class="cam-ic">${icon('camera')}</div><span>${esc(message || 'Camera is off')}</span>
           <button class="btn btn-primary btn-sm" data-cam-start>${icon('camera')} Start camera</button>`;
    }
  }

  function camError(e) {
    const n = e && e.name;
    if (!window.isSecureContext) return 'The camera needs a secure (https) connection.';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera found. You can still use a USB or Bluetooth barcode scanner.';
    if (n === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
    return (e && e.message) || 'Could not start the camera.';
  }

  async function listCameras(current) {
    if (!st || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const sel = $('#camSel', st.el);
    sel.hidden = cams.length < 2;
    sel.innerHTML = cams.map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === current ? 'selected' : ''}>${esc(d.label || 'Camera ' + (i + 1))}</option>`).join('');
  }

  async function startCamera(deviceId) {
    if (!st) return;
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setCamUi('off', camError({})); return; }
    const mine = st;
    setCamUi('starting');
    const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: 'environment' }, ...size }
      });
    } catch (e) {
      if (deviceId && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) { pref.set(PREF.device, ''); return startCamera(''); }
      if (st === mine) setCamUi('off', camError(e));
      return;
    }
    if (st !== mine) { stream.getTracks().forEach((t) => t.stop()); return; }
    st.stream = stream;
    const video = $('#scanVideo', st.el);
    video.srcObject = stream;
    const track = stream.getVideoTracks()[0];
    const settings = (track && track.getSettings && track.getSettings()) || {};
    // Show a mirror image for front / laptop cameras so it feels natural; decoding is unaffected
    video.classList.toggle('mirror', settings.facingMode !== 'environment' && !/back|rear|environment/i.test((track && track.label) || ''));
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
    try { await video.play(); } catch (e) {}
    pref.set(PREF.cam, 'on');
    if (settings.deviceId) pref.set(PREF.device, settings.deviceId);
    setCamUi('on');
    listCameras(settings.deviceId).catch(() => {});
    $('#scanEngine', st.el).textContent = 'Loading scanner…';
    try {
      st.detector = await getDetector();
      if (st !== mine) return;
      $('#scanEngine', st.el).textContent = 'Scanning automatically';
      loop(mine);
    } catch (e) {
      if (st === mine) $('#scanEngine', st.el).textContent = 'Camera scanner unavailable — use a barcode scanner or type the ID';
    }
  }

  function loop(mine) {
    if (st !== mine || !st.stream) return;
    const video = $('#scanVideo', st.el);
    const next = () => { if (st === mine && st.stream) st.loopTimer = setTimeout(() => loop(mine), 110); };
    if (video.readyState < 2 || document.hidden) { next(); return; }
    st.detector.detect(video).then((codes) => {
      if (codes && codes.length && st === mine) handle(codes[0].rawValue, true);
    }).catch(() => {}).then(next);
  }

  function stopCamera() {
    if (!st) return;
    clearTimeout(st.loopTimer);
    if (st.stream) st.stream.getTracks().forEach((t) => t.stop());
    st.stream = null;
    const video = st.el && $('#scanVideo', st.el);
    if (video) video.srcObject = null;
  }

  // ── Full screen (attendance kiosk) ──
  function setKiosk(on) {
    document.body.classList.toggle('kiosk', on);
    const btn = st && $('#kioskBtn', st.el);
    if (btn) btn.innerHTML = on ? `${icon('minimize')} <span class="hide-sm">Exit full screen</span>` : `${icon('maximize')} <span class="hide-sm">Full screen</span>`;
  }
  function onFullscreen() { if (!document.fullscreenElement && document.body.classList.contains('kiosk')) setKiosk(false); }

  window.Pages.scan = {
    title: 'Scan Attendance',
    render(el) {
      this.leave();
      const today = UI.today();
      const sound = pref.get(PREF.sound, 'on') === 'on';
      el.innerHTML = `
        <div class="page-head">
          <div><h1>Scan Attendance</h1><p class="sub"><span id="scanDate">${UI.weekday(today)}, ${UI.fmtDate(today)}</span> · <span id="scanCount"></span></p></div>
          <div class="page-actions">
            <button class="btn" data-nav="attendance">${icon('calendar')} <span class="hide-sm">Attendance</span></button>
            <button class="icon-btn" id="soundBtn" title="Sound" aria-label="Sound">${icon(sound ? 'volume' : 'volumeOff')}</button>
            <button class="btn" id="kioskBtn">${icon('maximize')} <span class="hide-sm">Full screen</span></button>
          </div>
        </div>
        <div class="scan-grid">
          <div class="card scan-cam-card">
            <div class="scan-cam" id="scanCam">
              <video id="scanVideo" playsinline muted autoplay></video>
              <div class="scan-frame"><i></i><i></i><i></i><i></i><b class="scan-laser"></b></div>
              <div class="scan-cam-off" id="camOff"><div class="scan-cam-msg" id="camMsg"></div></div>
              <div class="scan-pop" id="scanPop" hidden></div>
            </div>
            <div class="scan-controls">
              <div class="row" style="flex-wrap:wrap;gap:8px">
                <span class="scan-engine"><span class="dot on"></span><span id="scanEngine">Camera off</span></span>
                <span style="flex:1"></span>
                <select class="select" id="camSel" hidden aria-label="Choose camera"></select>
                <button class="btn btn-sm" id="camToggle"></button>
              </div>
              <form id="scanForm" class="scan-input" autocomplete="off">
                <div class="input-group">${icon('scan')}<input class="input" id="scanInput" placeholder="Scan with a barcode scanner, or type a student ID" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go"></div>
                <button class="btn" type="submit">Mark</button>
              </form>
              <p class="hint" style="margin:0">USB and Bluetooth barcode scanners work automatically — no need to click anything.</p>
            </div>
          </div>
          <div class="scan-side">
            <div class="card scan-result" id="scanResult"></div>
            <div class="card">
              <div class="card-head"><h3>Today's scans</h3><span class="muted small" id="scanLogCount"></span></div>
              <div class="list scan-log" id="scanLog"></div>
            </div>
          </div>
        </div>`;

      st = { el, result: $('#scanResult', el), chain: Promise.resolve(), lastCode: '', lastAt: 0, buffer: '', day: today };
      const mine = st;
      showResult('idle');
      refreshLog();

      const input = $('#scanInput', el);
      const finePointer = window.matchMedia('(pointer: fine)').matches;
      if (finePointer) setTimeout(() => input.focus(), 50);
      $('#scanForm', el).addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; handle(v); });

      // Hardware scanners type fast and end with Enter. Catch that even when the box isn't focused.
      st.onKey = (e) => {
        if (st !== mine) return;
        const t = e.target;
        if (t === input || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
        if (document.querySelector('#overlays .overlay')) return;
        if (e.key === 'Enter') { if (st.buffer.length >= 2) { e.preventDefault(); handle(st.buffer); } st.buffer = ''; return; }
        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          st.buffer += e.key;
          clearTimeout(st.bufTimer);
          st.bufTimer = setTimeout(() => { st.buffer = ''; }, 400);
        }
      };
      document.addEventListener('keydown', st.onKey);
      // Keep the scanner box focused on desktop stations
      st.onClick = (e) => {
        if (st !== mine || !finePointer) return;
        if (e.target.closest('input, select, textarea, button, a, [data-nav]')) return;
        setTimeout(() => input.focus(), 0);
      };
      el.addEventListener('click', st.onClick);
      document.addEventListener('fullscreenchange', onFullscreen);
      st.onVisible = () => { if (st === mine && !document.hidden) refreshLog(); };
      document.addEventListener('visibilitychange', st.onVisible);

      $('#camToggle', el).addEventListener('click', () => {
        if (st.stream) { stopCamera(); pref.set(PREF.cam, 'off'); setCamUi('off'); $('#scanEngine', el).textContent = 'Camera off'; }
        else startCamera(pref.get(PREF.device, ''));
      });
      $('#camOff', el).addEventListener('click', (e) => { if (e.target.closest('[data-cam-start]')) startCamera(pref.get(PREF.device, '')); });
      $('#camSel', el).addEventListener('change', (e) => { pref.set(PREF.device, e.target.value); startCamera(e.target.value); });
      $('#soundBtn', el).addEventListener('click', (e) => {
        const on = pref.get(PREF.sound, 'on') !== 'on';
        pref.set(PREF.sound, on ? 'on' : 'off');
        e.currentTarget.innerHTML = icon(on ? 'volume' : 'volumeOff');
        UI.toast(on ? 'Sound on' : 'Sound off');
      });
      $('#kioskBtn', el).addEventListener('click', () => {
        const on = !document.body.classList.contains('kiosk');
        setKiosk(on);
        if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
        if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      });

      if (pref.get(PREF.cam, 'on') === 'on') startCamera(pref.get(PREF.device, ''));
      else setCamUi('off');
    },

    // Data changed (a scan here or on another device): refresh the list, keep the camera running
    onData() { refreshLog(); },

    leave() {
      if (!st) return;
      stopCamera();
      clearTimeout(st.idleTimer);
      clearTimeout(st.bufTimer);
      document.removeEventListener('keydown', st.onKey);
      document.removeEventListener('visibilitychange', st.onVisible);
      if (st.el) st.el.removeEventListener('click', st.onClick);
      document.removeEventListener('fullscreenchange', onFullscreen);
      if (document.body.classList.contains('kiosk')) {
        document.body.classList.remove('kiosk');
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      }
      st = null;
    }
  };
})();

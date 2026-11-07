/*
 * Student ID cards — drawn on a canvas at print resolution, standard CR80 size
 * (54 × 85.6 mm, portrait). Front: photo, details and a Code 128 barcode (USB / Bluetooth
 * scanners and cameras). Back: QR code (cameras), emergency contact, return address, signature.
 * Both codes hold the student ID, which the Scan Attendance page looks up.
 * Nothing is stored: cards are generated from the student's current details every time.
 */
(function () {
  const { icon, esc, $ } = UI;
  const W = 54, H = 85.6;      // card size in mm
  const S = 12;                // pixels per mm (~305 dpi)
  const m = (mm) => mm * S;
  const LIBS = {
    barcode: 'https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/barcodes/JsBarcode.code128.min.js',
    qr: 'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js',
    pdf: 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js'
  };
  const FONT = 'Inter, "Segoe UI", Roboto, Arial, sans-serif';
  const INK = '#0f172a', GREY = '#64748b', BODY = '#475569';
  const COLORS = ['#1e3a8a', '#4f46e5', '#0e7490', '#047857', '#b91c1c', '#9a3412', '#6d28d9', '#111827'];
  const DEFAULT_COLOR = COLORS[0];

  // ── Loading ──
  async function ready(withPdf) {
    await Promise.all([UI.loadScript(LIBS.barcode), UI.loadScript(LIBS.qr), withPdf ? UI.loadScript(LIBS.pdf) : null]);
    if (document.fonts && document.fonts.load) {
      await Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 40px Inter`))).catch(() => {});
    }
  }
  const images = new Map();
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (!images.has(src)) {
      images.set(src, new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      }));
    }
    return images.get(src);
  }

  // ── Drawing helpers (all coordinates in px; use m() to convert from mm) ──
  const hex = (c) => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;
  function mix(a, b, t) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function sheet() {
    const c = document.createElement('canvas');
    c.width = Math.round(m(W));
    c.height = Math.round(m(H));
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.textBaseline = 'alphabetic';
    return [c, g];
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function font(g, size, weight = 400, spacing = 0) {
    g.font = `${weight} ${m(size).toFixed(1)}px ${FONT}`;
    if ('letterSpacing' in g) g.letterSpacing = spacing ? m(spacing).toFixed(1) + 'px' : '0px';
  }
  const width = (g, t) => g.measureText(t).width;
  function ellipsis(g, text, maxPx) {
    text = String(text || '');
    if (width(g, text) <= maxPx) return text;
    while (text.length > 1 && width(g, text + '…') > maxPx) text = text.slice(0, -1);
    return text.trimEnd() + '…';
  }
  function wrap(g, text, maxPx, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    words.forEach((w) => {
      const next = cur ? cur + ' ' + w : w;
      if (width(g, next) <= maxPx || !cur) cur = next;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = ellipsis(g, lines.slice(maxLines - 1).join(' '), maxPx);
      return kept;
    }
    return lines.map((l) => ellipsis(g, l, maxPx));
  }
  // Largest font size (stepping down to `min`) at which `text` fits in `maxLines` lines
  function fit(g, text, maxPx, size, min, weight, maxLines = 1) {
    for (let s = size; s >= min; s = Math.round((s - 0.1) * 10) / 10) {
      font(g, s, weight);
      const lines = wrap(g, text, maxPx, 99);
      if (lines.length <= maxLines && lines.every((l) => width(g, l) <= maxPx)) return { size: s, lines };
    }
    font(g, min, weight);
    return { size: min, lines: wrap(g, text, maxPx, maxLines) };
  }
  function text(g, t, x, y, align = 'left') { g.textAlign = align; g.fillText(t, x, y); }
  const dims = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];
  function contain(g, img, x, y, w, h) {
    const [iw, ih] = dims(img);
    const r = Math.min(w / iw, h / ih);
    const dw = iw * r, dh = ih * r;
    g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  function cover(g, img, x, y, w, h) {
    const [iw, ih] = dims(img);
    const r = Math.max(w / iw, h / ih);
    const sw = w / r, sh = h / r;
    g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  }

  // Logos often come with a white or transparent border; crop it so the emblem fills its badge.
  const trimmed = new WeakMap();
  function trimLogo(img) {
    if (!img) return null;
    if (trimmed.has(img)) return trimmed.get(img);
    let out = img;
    try {
      const [iw, ih] = dims(img);
      const c = document.createElement('canvas');
      c.width = iw; c.height = ih;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, iw, ih).data;
      let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
      for (let y = 0; y < ih; y++) {
        for (let x = 0; x < iw; x++) {
          const i = (y * iw + x) * 4;
          const blank = px[i + 3] < 24 || (px[i] > 238 && px[i + 1] > 238 && px[i + 2] > 238);
          if (!blank) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
      }
      if (x1 >= x0 && y1 >= y0 && (x1 - x0 + 1 < iw || y1 - y0 + 1 < ih)) {
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
        const t = document.createElement('canvas');
        t.width = cw; t.height = ch;
        t.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
        out = t;
      }
    } catch (e) { /* use the logo as it is */ }
    trimmed.set(img, out);
    return out;
  }

  // Round logo badge (white disc); initials when there is no logo
  function badge(g, logo, cx, cy, r, color, name) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,.18)';
    g.shadowBlur = m(0.8);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(m(cx), m(cy), m(r), 0, Math.PI * 2); g.fill();
    g.restore();
    if (logo) {
      const [lw, lh] = dims(logo);
      const ratio = lw / lh;
      g.save();
      g.beginPath(); g.arc(m(cx), m(cy), m(r * 0.9), 0, Math.PI * 2); g.clip();
      if (ratio > 0.8 && ratio < 1.25) {
        // Round / square emblem: fill the badge, leaving a thin white ring
        const s = r * 1.8;
        contain(g, logo, m(cx - s / 2), m(cy - s / 2), m(s), m(s));
      } else {
        // Wide or tall logo: fit it inside the circle
        const s = r * 1.38;
        contain(g, logo, m(cx - s / 2), m(cy - s / 2), m(s), m(s));
      }
      g.restore();
    } else {
      g.fillStyle = color;
      font(g, r * 0.8, 700);
      text(g, UI.initials(name), m(cx), m(cy + r * 0.29), 'center');
    }
  }
  function bubbles(g, color) {
    g.save();
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.07;
    g.beginPath(); g.arc(m(W - 3), m(1), m(11), 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(m(W + 3), m(15), m(8), 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // Code 128 barcode, whole pixels per bar so scanners read it cleanly. Returns false if it can't be encoded.
  function barcode(g, value, cx, top, maxW, h) {
    const tmp = document.createElement('canvas');
    try {
      window.JsBarcode(tmp, value, { format: 'CODE128', width: 1, height: 4, margin: 0, displayValue: false });
      const modules = tmp.width;
      const k = Math.max(1, Math.min(6, Math.floor(m(maxW) / modules)));
      window.JsBarcode(tmp, value, { format: 'CODE128', width: k, height: Math.round(m(h)), margin: 0, displayValue: false, background: '#ffffff', lineColor: '#000000' });
    } catch (e) { return false; }
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, Math.round(m(cx) - tmp.width / 2), Math.round(m(top)));
    g.imageSmoothingEnabled = true;
    return true;
  }
  function qr(g, value, x, y, size) {
    // Links are longer: low error correction keeps the squares large enough for any phone camera
    const q = window.qrcode(0, value.length > 40 ? 'L' : 'M');
    q.addData(value);
    q.make();
    const n = q.getModuleCount();
    const k = Math.floor(m(size) / n);
    const ox = Math.round(m(x) + (m(size) - k * n) / 2), oy = Math.round(m(y) + (m(size) - k * n) / 2);
    g.fillStyle = '#000000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(ox + c * k, oy + r * k, k, k);
  }

  // `over` lets Settings preview unsaved design choices
  function details(s, over) {
    const st = { ...Store.settings(), ...(over || {}) };
    const course = Logic.courseOf(s), batch = Logic.batchOf(s);
    const end = Logic.endMonth(s);
    return {
      st,
      color: hex(st.idColor) || DEFAULT_COLOR,
      course: course ? course.name : '',
      batch: batch ? batch.name + (batch.time ? ' · ' + batch.time : '') : '',
      valid: end ? UI.monthLabel(end) : '',
      value: Logic.cardValue(s),
      qr: Logic.profileUrl(s) || Logic.cardValue(s)
    };
  }

  // ── Front ──
  async function drawFront(s, over) {
    const d = details(s, over);
    const [c, g] = sheet();
    const color = d.color, deep = mix(color, '#000000', 0.35), soft = mix(color, '#ffffff', 0.9);
    const [rawLogo, photo] = await Promise.all([loadImg(d.st.logo), loadImg(s.photo)]);
    const logo = trimLogo(rawLogo);

    // Header with a curved edge
    const hb = 20.5;
    const grad = g.createLinearGradient(0, 0, m(W), m(hb + 4));
    grad.addColorStop(0, color); grad.addColorStop(1, deep);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(m(W), 0); g.lineTo(m(W), m(hb));
    g.quadraticCurveTo(m(W / 2), m(hb + 7), 0, m(hb)); g.closePath(); g.fill();
    bubbles(g, color);
    g.strokeStyle = mix(color, '#ffffff', 0.55);
    g.lineWidth = m(0.45);
    g.beginPath(); g.moveTo(0, m(hb + 1.4)); g.quadraticCurveTo(m(W / 2), m(hb + 8.4), m(W), m(hb + 1.4)); g.stroke();

    // Institute
    badge(g, logo, 8.2, 8.4, 4.7, color, d.st.name);
    const nx = 14.8, nmax = m(W - nx - 2.8);
    const nm = fit(g, d.st.name, nmax, 3.3, 2.3, 700, 2);
    const lh = nm.size * 1.16;
    const tag = d.st.tagline ? 1 : 0;
    const blockH = nm.lines.length * lh + (tag ? 2.6 : 0);
    let y = 8.6 - blockH / 2 + nm.size * 0.82;
    g.fillStyle = '#ffffff';
    font(g, nm.size, 700);
    nm.lines.forEach((l) => { text(g, l, m(nx), m(y)); y += lh; });
    if (tag) {
      g.fillStyle = 'rgba(255,255,255,.82)';
      font(g, 1.75, 500);
      text(g, ellipsis(g, d.st.tagline, nmax), m(nx), m(y - lh + 2.75));
    }

    // Faint logo watermark behind the details
    if (logo) { g.save(); g.globalAlpha = 0.045; contain(g, logo, m(W / 2 - 13), m(47), m(26), m(26)); g.restore(); }

    // Photo
    const ps = 24, px = (W - ps) / 2, py = 17.2;
    g.save();
    g.shadowColor = 'rgba(15,23,42,.28)'; g.shadowBlur = m(1.6); g.shadowOffsetY = m(0.35);
    g.fillStyle = '#ffffff';
    rr(g, m(px - 1), m(py - 1), m(ps + 2), m(ps + 2), m(3.2)); g.fill();
    g.restore();
    g.save();
    rr(g, m(px), m(py), m(ps), m(ps), m(2.4)); g.clip();
    if (photo) cover(g, photo, m(px), m(py), m(ps), m(ps));
    else {
      g.fillStyle = soft; g.fillRect(m(px), m(py), m(ps), m(ps));
      g.fillStyle = color; font(g, 8.5, 600);
      text(g, UI.initials(s.name), m(W / 2), m(py + ps / 2 + 3), 'center');
    }
    g.restore();

    // Name & course
    y = py + ps + 5.1;
    g.fillStyle = INK;
    const name = fit(g, s.name || '', m(W - 6), 4.1, 3.0, 700, 2);
    font(g, name.size, 700);
    name.lines.forEach((l, i) => { text(g, l, m(W / 2), m(y), 'center'); if (i < name.lines.length - 1) y += name.size * 1.12; });
    if (d.course) {
      y += 3.5;
      g.fillStyle = color;
      font(g, 2.4, 600);
      text(g, ellipsis(g, d.course, m(W - 8)), m(W / 2), m(y), 'center');
    }

    // Divider
    y += 2.3;
    g.fillStyle = mix(color, '#ffffff', 0.75);
    g.fillRect(m(6.5), m(y), m(W - 13), m(0.25));

    // Details
    const rows = [['ID No.', d.value], ['Batch', d.batch], ['Mobile', s.phone],
      d.valid ? ['Valid till', d.valid] : ['Joined', s.admissionDate ? UI.fmtDate(s.admissionDate) : '']].filter((r) => r[1]);
    const rowH = 3.5, limit = 70.2;
    y += 3.9;
    rows.forEach(([label, value]) => {
      if (y > limit) return;
      g.fillStyle = GREY; font(g, 1.8, 600, 0.12);
      text(g, label.toUpperCase(), m(6.5), m(y));
      g.fillStyle = INK;
      const v = fit(g, value, m(W - 20.5 - 4), 2.3, 1.9, 600, 1);
      font(g, v.size, 600);
      text(g, v.lines[0] || '', m(20.5), m(y));
      y += rowH;
    });

    // Barcode
    g.fillStyle = '#ffffff';
    g.fillRect(m(3), m(71.3), m(W - 6), m(10));
    const ok = barcode(g, d.value, W / 2, 71.9, 44, 6.4);
    g.fillStyle = INK; font(g, 2.05, 600, 0.35);
    text(g, ok ? d.value : 'ID: ' + d.value, m(W / 2), m(ok ? 80.75 : 77.5), 'center');

    // Footer band
    const fb = H - 3.3;
    const fg = g.createLinearGradient(0, 0, m(W), 0);
    fg.addColorStop(0, deep); fg.addColorStop(1, color);
    g.fillStyle = fg; g.fillRect(0, m(fb), m(W), m(H - fb));
    g.fillStyle = '#ffffff'; font(g, 1.65, 700, 0.42);
    text(g, 'STUDENT IDENTITY CARD', m(W / 2), m(H - 1.05), 'center');
    return c;
  }

  // Middle of the back. Returns the last text line's position (mm); draws only when `draw` is true.
  function backBody(g, d, s, [k, qs, maxNote], draw) {
    const color = d.color, soft = mix(color, '#ffffff', 0.9);
    const put = (t, x, y, align) => { if (draw) text(g, t, x, y, align); };
    const qx = (W - qs) / 2, qy = 16.2;
    if (draw) {
      g.fillStyle = soft; rr(g, m(qx - 3.3), m(qy - 3.3), m(qs + 6.6), m(qs + 6.6), m(2.6)); g.fill();
      g.fillStyle = '#ffffff'; rr(g, m(qx - 2.4), m(qy - 2.4), m(qs + 4.8), m(qs + 4.8), m(1.8)); g.fill();
      qr(g, d.qr, qx, qy, qs);
    }
    let y = qy + qs + 5.5;
    g.fillStyle = GREY; font(g, 1.55, 700, 0.3);
    put(d.qr === d.value ? 'SCAN FOR ATTENDANCE' : 'SCAN TO VIEW STUDENT PROFILE', m(W / 2), m(y), 'center');

    // Emergency contact
    y += 4.3 * k;
    g.fillStyle = color; font(g, 1.7 * k, 700, 0.3);
    put('EMERGENCY CONTACT', m(5), m(y));
    if (draw) {
      const lw = width(g, 'EMERGENCY CONTACT');
      g.fillStyle = mix(color, '#ffffff', 0.75);
      g.fillRect(m(5) + lw + m(1.5), m(y - 0.6), m(W - 5) - (m(5) + lw + m(1.5)), m(0.22));
    }
    const rows = [['Guardian', s.guardianName], ['Phone', s.guardianPhone || s.phone],
      ['Born', s.dob ? UI.fmtDate(s.dob) : ''], ['Address', s.address]].filter((r) => r[1]);
    const vx = 19.5, vmax = m(W - vx - 4.5);
    rows.forEach(([label, value]) => {
      y += 3.2 * k;
      g.fillStyle = GREY; font(g, 1.65 * k, 600, 0.1);
      put(label.toUpperCase(), m(5), m(y));
      g.fillStyle = INK; font(g, 2.0 * k, 600);
      const lines = label === 'Address' ? wrap(g, value, vmax, 2) : [ellipsis(g, value, vmax)];
      lines.forEach((l, i) => { if (i) y += 2.45 * k; put(l, m(vx), m(y)); });
    });

    // Card rules, then where to return it — always in full
    const note = d.st.idNote || `This card is the property of ${d.st.name}. Carry it at all times and show it at the entrance to mark your attendance.`;
    const ret = [d.st.address, d.st.phone && 'Ph: ' + d.st.phone].filter(Boolean).join(' · ');
    const lh = 2.2 * k;
    y += 1.6 * k;
    g.fillStyle = BODY; font(g, 1.6 * k, 400);
    wrap(g, note, m(W - 10), maxNote).forEach((l) => { y += lh; put(l, m(5), m(y)); });
    if (ret) {
      y += 0.5 * k;
      g.fillStyle = INK; font(g, 1.6 * k, 600);
      wrap(g, 'If found, please return to: ' + ret, m(W - 10), 3).forEach((l) => { y += lh; put(l, m(5), m(y)); });
    }
    return y;
  }

  // ── Back ──
  async function drawBack(s, over) {
    const d = details(s, over);
    const [c, g] = sheet();
    const color = d.color, deep = mix(color, '#000000', 0.35), soft = mix(color, '#ffffff', 0.9);
    const [rawLogo, rawSign] = await Promise.all([loadImg(d.st.logo), loadImg(d.st.idSignature)]);
    const sign = trimLogo(rawSign);
    const logo = trimLogo(rawLogo);

    // Header band
    const hh = 12.4;
    const grad = g.createLinearGradient(0, 0, m(W), m(hh));
    grad.addColorStop(0, color); grad.addColorStop(1, deep);
    g.fillStyle = grad; g.fillRect(0, 0, m(W), m(hh));
    bubbles(g, color);
    badge(g, logo, 6.9, hh / 2, 3.7, color, d.st.name);
    const nx = 12.2, nmax = m(W - nx - 2.6);
    const contact = [d.st.phone, d.st.email].filter(Boolean).join(' · ');
    const nm = fit(g, d.st.name, nmax, 2.8, 2.0, 700, 1);
    g.fillStyle = '#ffffff'; font(g, nm.size, 700);
    text(g, nm.lines[0] || '', m(nx), m(contact ? 5.7 : 7.2));
    if (contact) {
      g.fillStyle = 'rgba(255,255,255,.85)'; font(g, 1.65, 500);
      text(g, ellipsis(g, contact, nmax), m(nx), m(9.0));
    }

    // QR code, emergency contact and notes — sized so everything fits (smaller only when text is long)
    const opts = [[1, 19, 3], [0.95, 18, 3], [0.9, 17, 3], [0.86, 16, 2], [0.82, 15, 2]];
    let pick = opts[opts.length - 1];
    for (const o of opts) { if (backBody(g, d, s, o, false) <= 73.3) { pick = o; break; } }
    backBody(g, d, s, pick, true);

    // Issue date & signature
    g.fillStyle = GREY; font(g, 1.45, 600, 0.15);
    text(g, 'ISSUED ON', m(5), m(78.2));
    g.fillStyle = INK; font(g, 1.95, 600);
    text(g, UI.fmtDate(UI.today()), m(5), m(80.8));
    const sx = W - 22, sw = 17;
    if (sign) contain(g, sign, m(sx), m(73.7), m(sw), m(5.3));
    g.fillStyle = '#94a3b8'; g.fillRect(m(sx), m(79.3), m(sw), m(0.2));
    g.fillStyle = GREY; font(g, 1.45, 600, 0.1);
    text(g, 'Authorised Signatory', m(sx + sw / 2), m(81.2), 'center');

    // Footer band
    g.fillStyle = color; g.fillRect(0, m(H - 1.9), m(W), m(1.9));
    return c;
  }

  // ── Files ──
  const slug = (v) => String(v || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const fileBase = (s) => `ID-card-${slug(Logic.cardValue(s))}-${slug(s.name)}`;
  const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

  async function pngBoth(s) {
    const [f, b] = await Promise.all([drawFront(s), drawBack(s)]);
    const gap = Math.round(m(5)), pad = Math.round(m(4));
    const c = document.createElement('canvas');
    c.width = f.width * 2 + gap + pad * 2;
    c.height = f.height + pad * 2;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    [f, b].forEach((card, i) => {
      const x = pad + i * (f.width + gap);
      g.strokeStyle = '#e2e8f0'; g.lineWidth = 2;
      g.strokeRect(x - 1, pad - 1, card.width + 2, card.height + 2);
      g.drawImage(card, x, pad);
    });
    UI.downloadBlob(fileBase(s) + '.png', await toBlob(c, 'image/png'));
  }

  const img = (c) => c.toDataURL('image/png');
  // Bulk PDFs: high-quality JPEG keeps files ~3× smaller; barcodes and QR codes still read cleanly
  const jpg = (c) => c.toDataURL('image/jpeg', 0.94);

  async function pdfOne(s) {
    await ready(true);
    const [f, b] = await Promise.all([drawFront(s), drawBack(s)]);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait', compress: true });
    doc.setProperties({ title: `ID card · ${s.name}` });
    doc.addImage(img(f), 'PNG', 0, 0, W, H, undefined, 'FAST');
    doc.addPage([W, H], 'portrait');
    doc.addImage(img(b), 'PNG', 0, 0, W, H, undefined, 'FAST');
    UI.downloadBlob(fileBase(s) + '.pdf', doc.output('blob'));
  }

  // Many cards in one PDF. 'a4': 9 cards per A4 page with cut lines — fronts on one page,
  // backs on the next, mirrored so they line up when printed double-sided (flip on long edge).
  // 'card': one card per page (front, back, front, back…) for PVC card printers.
  async function pdfMany(list, layout, onProgress) {
    await ready(true);
    const { jsPDF } = window.jspdf;
    const doc = layout === 'card'
      ? new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait', compress: true })
      : new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({ title: 'Student ID cards' });
    if (layout === 'card') {
      for (let i = 0; i < list.length; i++) {
        const [f, b] = await Promise.all([drawFront(list[i]), drawBack(list[i])]);
        if (i) doc.addPage([W, H], 'portrait');
        doc.addImage(jpg(f), 'JPEG', 0, 0, W, H, undefined, 'FAST');
        doc.addPage([W, H], 'portrait');
        doc.addImage(jpg(b), 'JPEG', 0, 0, W, H, undefined, 'FAST');
        onProgress && onProgress(i + 1);
      }
    } else {
      const cols = 3, rows = 3, gap = 4;
      const x0 = (210 - (cols * W + (cols - 1) * gap)) / 2, y0 = (297 - (rows * H + (rows - 1) * gap)) / 2;
      const per = cols * rows;
      const place = (i, mirror) => {
        const r = Math.floor(i / cols), col = i % cols;
        return [x0 + (mirror ? cols - 1 - col : col) * (W + gap), y0 + r * (H + gap)];
      };
      let done = 0;
      for (let p = 0; p < list.length; p += per) {
        const chunk = list.slice(p, p + per);
        const cards = [];
        for (const s of chunk) { cards.push(await Promise.all([drawFront(s), drawBack(s)])); onProgress && onProgress(++done); }
        [0, 1].forEach((side) => {
          if (p || side) doc.addPage('a4', 'portrait');
          doc.setDrawColor(200); doc.setLineWidth(0.1);
          cards.forEach((pair, i) => {
            const [x, y] = place(i, side === 1);
            doc.addImage(jpg(pair[side]), 'JPEG', x, y, W, H, undefined, 'FAST');
            doc.rect(x, y, W, H);
          });
          doc.setFontSize(7); doc.setTextColor(150);
          doc.text(side ? 'Backs (print on the reverse, flip on long edge)' : 'Fronts', 105, 292, { align: 'center' });
        });
      }
    }
    const inst = slug(Store.settings().name) || 'institute';
    UI.downloadBlob(`ID-cards-${inst}-${UI.today()}.pdf`, doc.output('blob'));
  }

  // ── Screens ──
  function open(s) {
    UI.modal({
      title: `ID card · ${s.name}`,
      size: 'lg',
      body: `<div class="idc-preview" id="idcPrev"><div class="idc-loading"><div class="spinner"></div><span>Creating ID card…</span></div></div>
        <p class="muted small idc-note">Standard ID card size (54 × 86 mm). The barcode and QR code hold the student ID <b>${esc(Logic.cardValue(s))}</b> — scan either one on the <a href="#/scan" data-close>Scan Attendance</a> page.</p>`,
      foot: `<button class="btn left" data-close>Close</button>
        <button class="btn" data-png disabled>${icon('download')} Image</button>
        <button class="btn btn-primary" data-pdf disabled>${icon('download')} Download PDF</button>`,
      onMount: async (root) => {
        const box = $('#idcPrev', root);
        const btnPng = $('[data-png]', root), btnPdf = $('[data-pdf]', root);
        try {
          await ready(false);
          const [f, b] = await Promise.all([drawFront(s), drawBack(s)]);
          box.innerHTML = `<figure><img src="${img(f)}" alt="ID card front"><figcaption>Front</figcaption></figure>
            <figure><img src="${img(b)}" alt="ID card back"><figcaption>Back</figcaption></figure>`;
          btnPng.disabled = btnPdf.disabled = false;
        } catch (e) {
          box.innerHTML = UI.empty('alert', 'Could not create the ID card', e.message);
          return;
        }
        const busy = (btn, fn) => async () => {
          const label = btn.innerHTML;
          btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> Preparing…';
          try { await fn(); UI.toast('ID card downloaded'); }
          catch (e) { UI.toast(e.message || 'Download failed', 'error'); }
          finally { btn.disabled = false; btn.innerHTML = label; }
        };
        btnPng.addEventListener('click', busy(btnPng, () => pngBoth(s)));
        btnPdf.addEventListener('click', busy(btnPdf, () => pdfOne(s)));
      }
    });
  }

  function openBulk(list, label) {
    let layout = 'a4';
    UI.modal({
      title: 'Download ID cards',
      body: `<p style="margin:0 0 16px">ID cards for <b>${list.length}</b> ${esc(label || 'students')}, in one PDF file.</p>
        <div class="stack" style="gap:10px" id="idcLayouts">
          <label class="option-card on"><input type="radio" name="layout" value="a4" checked>
            <div><div class="strong">A4 sheets — print &amp; cut</div><div class="muted small">9 cards per page with cut lines. Fronts and backs on alternate pages for double-sided printing.</div></div></label>
          <label class="option-card"><input type="radio" name="layout" value="card">
            <div><div class="strong">Card size — one per page</div><div class="muted small">54 × 86 mm pages (front, back) for PVC ID card printers or a print shop.</div></div></label>
        </div>
        <div class="progress" id="idcProg" hidden><div class="progress-bar"></div></div>
        <p class="muted small" id="idcStatus" style="margin:10px 0 0"></p>`,
      foot: `<button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" data-go ${list.length ? '' : 'disabled'}>${icon('download')} Download PDF</button>`,
      onMount(root, close) {
        root.querySelectorAll('input[name=layout]').forEach((r) => r.addEventListener('change', () => {
          layout = r.value;
          root.querySelectorAll('.option-card').forEach((o) => o.classList.toggle('on', o.contains(r) ? r.checked : false));
        }));
        const go = $('[data-go]', root), prog = $('#idcProg', root), bar = $('.progress-bar', root), status = $('#idcStatus', root);
        go.addEventListener('click', async () => {
          go.disabled = true;
          prog.hidden = false;
          status.textContent = 'Preparing…';
          try {
            await pdfMany(list, layout, (n) => {
              bar.style.width = Math.round((n / list.length) * 100) + '%';
              status.textContent = `Creating card ${n} of ${list.length}…`;
            });
            UI.toast(`${list.length} ID card${list.length === 1 ? '' : 's'} downloaded`);
            close();
          } catch (e) {
            status.textContent = e.message || 'Something went wrong';
            go.disabled = false;
          }
        });
      }
    });
  }

  // Front + back as image URLs (Settings preview)
  async function preview(s, over) {
    await ready(false);
    const [f, b] = await Promise.all([drawFront(s, over), drawBack(s, over)]);
    return [img(f), img(b)];
  }

  // QR code as an SVG tag (used on admit cards)
  async function qrSvg(value) {
    await UI.loadScript(LIBS.qr);
    const q = window.qrcode(0, value.length > 40 ? 'L' : 'M');
    q.addData(value);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  window.IDCard = { open, openBulk, preview, qrSvg, COLORS, DEFAULT_COLOR };
})();

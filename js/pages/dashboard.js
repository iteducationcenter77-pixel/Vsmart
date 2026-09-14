/* Dashboard: KPIs, collection trend, dues, recent payments, today's attendance. */
window.Pages = window.Pages || {};
(function () {
  const { icon, esc, money, num, $$ } = UI;

  const compact = (n) => {
    const cur = Store.settings().currency;
    if (n >= 1e7) return cur + +(n / 1e7).toFixed(1) + 'Cr';
    if (n >= 1e5) return cur + +(n / 1e5).toFixed(1) + 'L';
    if (n >= 1e3) return cur + +(n / 1e3).toFixed(1) + 'k';
    return cur + Math.round(n);
  };
  const niceMax = (v) => {
    if (v <= 0) return 1000;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  };

  // Single-series bar chart: fee collected per month (by payment date).
  function trendChart(months) {
    const data = months.map((m) => {
      const list = Logic.paymentsInMonth(m);
      return { m, v: list.reduce((a, p) => a + (Number(p.total) || 0), 0), n: list.length };
    });
    // Narrower drawing width on phones keeps axis text at a readable size
    const narrow = window.innerWidth < 600;
    const W = narrow ? 340 : 640, H = narrow ? 200 : 230, L = 46, R = 8, T = 22, B = 30;
    const max = niceMax(Math.max(...data.map((d) => d.v)));
    const cw = (W - L - R) / data.length;
    const bw = Math.min(34, cw * 0.46);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const ticks = [0, max / 2, max];
    const cur = UI.thisMonth();
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fee collection by month">`;
    ticks.forEach((t) => {
      svg += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>`;
      svg += `<text class="axis-label" x="${L - 10}" y="${y(t) + 4}" text-anchor="end">${esc(compact(t))}</text>`;
    });
    data.forEach((d, i) => {
      const cx = L + cw * i + cw / 2;
      const x = cx - bw / 2;
      const top = y(d.v);
      const h = H - B - top;
      if (d.v > 0) {
        const r = Math.min(4, h);
        svg += `<path class="bar" data-i="${i}" d="M${x},${H - B} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - B} Z"/>`;
      }
      svg += `<text class="axis-label" x="${cx}" y="${H - 9}" text-anchor="middle">${UI.MONTHS[Number(d.m.slice(5)) - 1]}</text>`;
      if (d.m === cur && d.v > 0) svg += `<text class="value-label" x="${cx}" y="${top - 7}" text-anchor="middle">${esc(compact(d.v))}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${L + cw * i}" y="${T}" width="${cw}" height="${H - T - B}"/>`;
    });
    svg += '</svg>';
    return { svg, data, geom: { W, H, L, cw, y } };
  }

  function bindChart(root, chart) {
    const box = root.querySelector('.chart');
    if (!box) return;
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    box.appendChild(tip);
    const bars = $$('.bar', box);
    $$('.hit', box).forEach((h) => {
      const i = Number(h.dataset.i);
      const d = chart.data[i];
      const show = () => {
        const svg = box.querySelector('svg');
        const scale = svg.getBoundingClientRect().width / chart.geom.W;
        tip.innerHTML = `${UI.monthLabel(d.m, true)}<b>${money(d.v)}</b>${d.n} payment${d.n === 1 ? '' : 's'}`;
        tip.style.left = (chart.geom.L + chart.geom.cw * i + chart.geom.cw / 2) * scale + 'px';
        tip.style.top = chart.geom.y(d.v) * scale + 'px';
        tip.hidden = false;
        bars.forEach((b) => b.classList.toggle('dim', Number(b.dataset.i) !== i));
      };
      const hide = () => { tip.hidden = true; bars.forEach((b) => b.classList.remove('dim')); };
      h.addEventListener('mouseenter', show);
      h.addEventListener('mouseleave', hide);
      h.addEventListener('touchstart', show, { passive: true });
    });
  }

  window.Pages.dashboard = {
    title: 'Dashboard',
    render(el) {
      const month = UI.thisMonth();
      const today = UI.today();
      const active = Logic.activeStudents();
      const newThisMonth = active.filter((s) => UI.monthOf(s.admissionDate) === month).length;
      const monthPayments = Logic.paymentsInMonth(month);
      const collected = monthPayments.reduce((a, p) => a + (Number(p.total) || 0), 0);
      const withDues = Logic.students().map((s) => ({ s, d: Logic.dues(s) })).filter((x) => x.d.total > 0).sort((a, b) => b.d.total - a.d.total);
      const totalDue = withDues.reduce((a, x) => a + x.d.total, 0);
      const att = Logic.attendanceOnDate(today);
      const courses = Store.all('courses');
      const batches = Store.all('batches').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const recent = Store.all('payments').sort(Logic.byDateDesc).slice(0, 6);
      const hour = new Date().getHours();
      const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const chart = trendChart(Array.from({ length: 6 }, (_, i) => UI.addMonths(month, i - 5)));

      const onboarding = !courses.length || !batches.length || !active.length ? `
        <div class="card card-pad" style="margin-bottom:16px">
          <div class="row" style="align-items:flex-start;flex-wrap:wrap">
            <div class="li-main" style="min-width:220px"><h3 style="font-size:16px">Let's set up your institute</h3>
              <p class="muted" style="margin-top:4px">Three quick steps and you're ready to take admissions, fees and attendance.</p></div>
            <div class="row-wrap">
              <button class="btn ${courses.length ? '' : 'btn-primary'}" data-nav="courses">${icon(courses.length ? 'check' : 'book')} 1. Add courses</button>
              <button class="btn ${courses.length && !batches.length ? 'btn-primary' : ''}" data-nav="courses">${icon(batches.length ? 'check' : 'layers')} 2. Create batches</button>
              <button class="btn ${courses.length && batches.length && !active.length ? 'btn-primary' : ''}" data-go-add>${icon(active.length ? 'check' : 'users')} 3. Add students</button>
            </div>
          </div>
        </div>` : '';

      const kpi = (ic, label, value, sub) => `<div class="card kpi">
        <div class="kpi-label"><span class="kpi-ic">${icon(ic)}</span><span class="truncate">${label}</span></div>
        <div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;

      el.innerHTML = `
        <div class="page-head">
          <div><h1>${greet}</h1><p class="sub">${UI.weekday(today)}, ${UI.fmtDate(today)}</p></div>
          <div class="page-actions">
            <button class="btn desktop-only" data-go-add>${icon('plus')} Add student</button>
            <button class="btn btn-primary desktop-only" data-nav="collect">${icon('wallet')} Collect fee</button>
          </div>
        </div>
        ${onboarding}
        <div class="kpis" style="margin-bottom:16px">
          ${kpi('users', 'Active students', num(active.length), newThisMonth ? `+${newThisMonth} admitted this month` : 'No new admissions this month')}
          ${kpi('wallet', `Collected · ${UI.MONTHS[Number(month.slice(5)) - 1]}`, money(collected), `${monthPayments.length} payment${monthPayments.length === 1 ? '' : 's'} this month`)}
          ${kpi('alert', 'Pending dues', money(totalDue), `${withDues.length} student${withDues.length === 1 ? '' : 's'} with dues`)}
          ${kpi('calendar', 'Attendance', att.marked ? `${att.present}<span class="muted" style="font-size:.6em;font-weight:500"> / ${att.marked}</span>` : '—', att.marked ? `${Math.round((att.present / att.marked) * 100)}% present today` : 'Not marked today')}
        </div>

        <div class="two-col" style="margin-bottom:16px">
          <div class="card">
            <div class="card-head"><h3>Fee collection · last 6 months</h3><span class="link" data-nav="reports">Reports</span></div>
            <div class="card-body"><div class="chart">${chart.svg}</div></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Pending dues</h3><span class="link" data-nav="reports">View all</span></div>
            <div class="list">
              ${withDues.length ? withDues.slice(0, 6).map(({ s, d }) => `
                <div class="list-item clickable" data-collect="${s.id}">
                  <div class="avatar">${esc(UI.initials(s.name))}</div>
                  <div class="li-main"><div class="li-title">${esc(s.name)}</div>
                    <div class="li-sub">${d.months.length ? `${d.months.length} month${d.months.length > 1 ? 's' : ''}` : ''}${d.months.length && d.admission ? ' + ' : ''}${d.admission ? 'admission' : ''} · ${esc((Logic.courseOf(s) || {}).name || '—')}</div></div>
                  <div class="li-end"><div class="strong money" style="color:var(--danger)">${money(d.total)}</div></div>
                </div>`).join('') : UI.empty('checkCircle', 'All clear', 'No pending fees right now.')}
            </div>
          </div>
        </div>

        <div class="two-col">
          <div class="card">
            <div class="card-head"><h3>Recent payments</h3><span class="link" data-nav="payments">View all</span></div>
            <div class="list">
              ${recent.length ? recent.map((p) => `
                <div class="list-item clickable" data-receipt="${p.id}">
                  <div class="avatar" style="background:var(--success-bg);color:var(--success)">${icon('receipt')}</div>
                  <div class="li-main"><div class="li-title">${esc(p.studentName)}</div>
                    <div class="li-sub">${esc(p.receiptNo)} · ${UI.fmtDate(p.date)} · ${esc(p.mode)}</div></div>
                  <div class="li-end strong money">${money(p.total)}</div>
                </div>`).join('') : UI.empty('receipt', 'No payments yet', 'Collected fees will appear here.')}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Today's batches</h3><span class="link" data-nav="attendance">Attendance</span></div>
            <div class="list">
              ${batches.length ? batches.map((b) => {
                const total = Logic.studentsInBatch(b.id).length;
                const rec = Logic.attendanceFor(today, b.id);
                const marked = rec ? Object.values(rec.records || {}) : [];
                const present = marked.filter((x) => x === 'P' || x === 'L').length;
                return `<div class="list-item clickable" data-att="${b.id}">
                  <div class="li-main"><div class="li-title">${esc(b.name)}</div>
                    <div class="li-sub">${esc(b.time || 'No timing set')} · ${total} student${total === 1 ? '' : 's'}</div></div>
                  <div class="li-end">${rec ? `<span class="badge badge-success">${present}/${marked.length} present</span>` : '<span class="badge">Not marked</span>'}</div>
                </div>`;
              }).join('') : UI.empty('layers', 'No batches yet', 'Create batches to take attendance.')}
            </div>
          </div>
        </div>`;

      bindChart(el, chart);
      $$('[data-go-add]', el).forEach((b) => b.addEventListener('click', () => {
        if (!Store.all('courses').length) { UI.toast('Add a course first', 'error'); App.go('courses'); return; }
        Pages.students.openForm();
      }));
      $$('[data-collect]', el).forEach((r) => r.addEventListener('click', () => App.go('collect?s=' + r.dataset.collect)));
      $$('[data-receipt]', el).forEach((r) => r.addEventListener('click', () => App.go('receipt/' + r.dataset.receipt)));
      $$('[data-att]', el).forEach((r) => r.addEventListener('click', () => App.go('attendance?b=' + r.dataset.att)));
    }
  };
})();

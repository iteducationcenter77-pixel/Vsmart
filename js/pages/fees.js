/* Fees: collect fee, receipt, payment history, monthly collection report. */
window.Pages = window.Pages || {};
(function () {
  const { icon, esc, money, $, $$ } = UI;
  const MODES = ['Cash', 'UPI', 'Card', 'Bank'];

  // ───────────── Collect fee ─────────────
  const cs = { sid: '', lines: [], extras: [], discount: 0, mode: 'Cash', date: UI.today(), note: '', q: '' };

  function resetFor(s) {
    const d = Logic.dues(s);
    const lines = d.months.map((r) => ({
      key: r.month, type: 'monthly', month: r.month, label: UI.monthLabel(r.month, true),
      sub: r.paid ? `Fee ${money(r.fee)} · ${money(r.paid)} already paid` : r.month === UI.thisMonth() ? 'Current month' : 'Overdue',
      due: r.due, amount: r.due, on: true, overdue: r.month < UI.thisMonth()
    }));
    if (d.admission > 0) lines.unshift({ key: 'adm', type: 'admission', label: 'Admission fee', sub: 'One-time', due: d.admission, amount: d.admission, on: true });
    // Offer up to 3 upcoming months as advance payment
    const end = Logic.endMonth(s);
    for (let i = 1, added = 0; i <= 12 && added < 3; i++) {
      const k = UI.addMonths(UI.thisMonth(), i);
      if (end && k > end) break;
      const row = Logic.ledger(s, k).find((r) => r.month === k);
      if (row && row.due > 0) { lines.push({ key: k, type: 'monthly', month: k, label: UI.monthLabel(k, true), sub: 'Advance', due: row.due, amount: row.due, on: false }); added++; }
    }
    Object.assign(cs, { sid: s.id, lines, extras: [], discount: 0, mode: 'Cash', date: UI.today(), note: '' });
  }

  const subtotal = () => cs.lines.filter((l) => l.on).reduce((a, l) => a + (Number(l.amount) || 0), 0) + cs.extras.reduce((a, x) => a + (Number(x.amount) || 0), 0);

  function pickerHtml() {
    const q = cs.q.toLowerCase();
    const list = Logic.activeStudents()
      .filter((s) => !q || [s.name, s.code, s.phone].join(' ').toLowerCase().includes(q))
      .map((s) => ({ s, due: Logic.dues(s).total }))
      .sort((a, b) => b.due - a.due || a.s.name.localeCompare(b.s.name))
      .slice(0, 60);
    if (!list.length) return UI.empty('users', Logic.activeStudents().length ? 'No match' : 'No active students', Logic.activeStudents().length ? 'Try another name or ID.' : 'Add students first.');
    return list.map(({ s, due }) => `<div class="list-item clickable" data-pick="${s.id}">
      <div class="avatar">${esc(UI.initials(s.name))}</div>
      <div class="li-main"><div class="li-title">${esc(s.name)}</div><div class="li-sub">${esc(s.code || '')} · ${esc((Logic.courseOf(s) || {}).name || '')}</div></div>
      <div class="li-end">${due > 0 ? `<div class="strong money" style="color:var(--danger)">${money(due)}</div><div class="small muted">due</div>` : '<span class="badge badge-success">Paid up</span>'}</div>
    </div>`).join('');
  }

  function linesHtml() {
    const cur = esc(Store.settings().currency);
    const rows = cs.lines.map((l) => `<div class="fee-line ${l.on ? '' : 'off'}" data-k="${l.key}">
        <input type="checkbox" class="check" ${l.on ? 'checked' : ''} aria-label="${esc(l.label)}">
        <div class="li-main" data-toggle><div class="li-title">${esc(l.label)}</div>
          <div class="li-sub" style="${l.overdue ? 'color:var(--danger)' : ''}">${esc(l.sub)}</div></div>
        <div class="input-prefix"><span>${cur}</span><input class="input" type="number" min="0" inputmode="decimal" value="${l.amount}"></div>
      </div>`);
    cs.extras.forEach((x) => rows.push(`<div class="fee-line" data-x="${x.id}">
        <button class="icon-btn" data-rm style="width:30px;height:30px" aria-label="Remove">${icon('x')}</button>
        <div class="li-main"><input class="input" data-label placeholder="e.g. Exam fee, Certificate, Books" value="${esc(x.label)}" style="height:36px"></div>
        <div class="input-prefix"><span>${cur}</span><input class="input" data-amt type="number" min="0" inputmode="decimal" value="${x.amount || ''}"></div>
      </div>`));
    return rows.length ? rows.join('') : UI.empty('checkCircle', 'Nothing due', 'This student has no pending fees. Add an advance month or another charge.');
  }

  window.Pages.collect = {
    title: 'Collect Fee',
    render(el, _p, query) {
      const qs = query && query.get('s');
      if (qs && qs !== cs.sid) { const s0 = Store.get('students', qs); if (s0) resetFor(s0); }
      if (!qs) cs.sid = '';
      const s = Store.get('students', cs.sid);

      if (!s) {
        el.innerHTML = `<div class="page-head"><div><h1>Collect fee</h1><p class="sub">Choose a student to record a payment</p></div></div>
          <div class="card"><div class="card-body" style="padding-bottom:4px">
            <div class="input-group">${icon('search')}<input class="input" id="pickQ" placeholder="Search student name, ID or phone" value="${esc(cs.q)}"></div></div>
            <div class="list" id="pickList" style="margin-top:12px;border-top:1px solid var(--border)">${pickerHtml()}</div></div>`;
        const bind = () => $$('[data-pick]', el).forEach((r) => r.addEventListener('click', () => App.go('collect?s=' + r.dataset.pick)));
        bind();
        const qi = $('#pickQ', el);
        qi.addEventListener('input', () => { cs.q = qi.value; $('#pickList', el).innerHTML = pickerHtml(); bind(); });
        if (window.innerWidth > 860) qi.focus();
        return;
      }

      App.dirty = true;
      const c = Logic.courseOf(s);
      const due = Logic.dues(s).total;
      el.innerHTML = `
        <div class="page-head"><div><h1>Collect fee</h1><p class="sub">Receipt ${esc(Logic.nextReceiptNo())}</p></div></div>
        <div class="two-col">
          <div class="stack">
            <div class="card card-body row" style="flex-wrap:wrap">
              <div class="avatar">${esc(UI.initials(s.name))}</div>
              <div class="li-main" style="min-width:170px"><div class="li-title">${esc(s.name)}</div><div class="li-sub">${esc(s.code || '')} · ${esc(c ? c.name : '')} · Fee ${money(s.monthlyFee)}/month</div></div>
              ${due > 0 ? `<span class="badge badge-danger">${money(due)} due</span>` : '<span class="badge badge-success">Paid up</span>'}
              <button class="btn btn-sm" data-change>Change</button>
            </div>
            <div class="card">
              <div class="card-head"><h3>Fee items</h3><span class="muted small">Tick what's being paid</span></div>
              <div class="list" id="lines">${linesHtml()}</div>
              <div class="card-foot"><button class="btn btn-sm" id="addExtra">${icon('plus')} Other charge</button></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Payment</h3></div>
            <div class="card-body stack">
              <div class="field"><label>Payment date</label><input class="input" type="date" id="payDate" value="${cs.date}" max="${UI.today()}"></div>
              <div class="field"><label>Payment mode</label><div class="seg block" id="payMode">${MODES.map((m) => `<button type="button" class="${cs.mode === m ? 'on' : ''}" data-mode="${m}">${m}</button>`).join('')}</div></div>
              <div class="field"><label>Discount</label><div class="input-prefix"><span>${esc(Store.settings().currency)}</span><input class="input" type="number" min="0" id="payDisc" value="${cs.discount || ''}" placeholder="0"></div></div>
              <div class="field"><label>Note / reference</label><input class="input" id="payNote" value="${esc(cs.note)}" placeholder="UPI ref, cheque no., remarks"></div>
              <div class="sum-rows" style="padding-top:8px;border-top:1px solid var(--border)">
                <div><span class="muted">Subtotal</span><span class="money" id="sumSub"></span></div>
                <div><span class="muted">Discount</span><span class="money" id="sumDisc"></span></div>
              </div>
              <div class="total-box"><span class="strong">Total</span><span class="amount" id="sumTotal"></span></div>
              <div class="form-error" id="payErr"></div>
              <button class="btn btn-primary btn-lg btn-block" id="paySave">${icon('receipt')} Save & print receipt</button>
            </div>
          </div>
        </div>`;

      const totals = () => {
        const sub = subtotal();
        const disc = Math.min(Number(cs.discount) || 0, sub);
        $('#sumSub', el).textContent = money(sub);
        $('#sumDisc', el).textContent = disc ? '−' + money(disc) : money(0);
        $('#sumTotal', el).textContent = money(sub - disc);
      };
      const linesEl = $('#lines', el);
      const bindLines = () => {
        $$('[data-k]', linesEl).forEach((row) => {
          const l = cs.lines.find((x) => x.key === row.dataset.k);
          const cb = $('.check', row), amt = $('input[type=number]', row);
          const set = (on) => { l.on = on; cb.checked = on; row.classList.toggle('off', !on); totals(); };
          cb.addEventListener('change', () => set(cb.checked));
          $('[data-toggle]', row).addEventListener('click', () => set(!l.on));
          amt.addEventListener('input', () => { l.amount = Number(amt.value) || 0; if (!l.on && l.amount) set(true); totals(); });
        });
        $$('[data-x]', linesEl).forEach((row) => {
          const x = cs.extras.find((e) => e.id === row.dataset.x);
          $('[data-label]', row).addEventListener('input', (e) => { x.label = e.target.value; });
          $('[data-amt]', row).addEventListener('input', (e) => { x.amount = Number(e.target.value) || 0; totals(); });
          $('[data-rm]', row).addEventListener('click', () => { cs.extras = cs.extras.filter((e) => e !== x); linesEl.innerHTML = linesHtml(); bindLines(); totals(); });
        });
      };
      bindLines();
      totals();

      $('#addExtra', el).addEventListener('click', () => {
        cs.extras.push({ id: UI.uid(), label: '', amount: 0 });
        linesEl.innerHTML = linesHtml(); bindLines();
        const inputs = $$('[data-label]', linesEl); inputs[inputs.length - 1].focus();
      });
      $('[data-change]', el).addEventListener('click', () => { App.dirty = false; cs.sid = ''; App.go('collect'); });
      $('#payDate', el).addEventListener('change', (e) => { cs.date = e.target.value || UI.today(); });
      $('#payNote', el).addEventListener('input', (e) => { cs.note = e.target.value; });
      $('#payDisc', el).addEventListener('input', (e) => { cs.discount = Number(e.target.value) || 0; totals(); });
      $$('[data-mode]', el).forEach((b) => b.addEventListener('click', () => {
        cs.mode = b.dataset.mode;
        $$('[data-mode]', el).forEach((x) => x.classList.toggle('on', x === b));
      }));

      $('#paySave', el).addEventListener('click', async (e) => {
        const items = [];
        cs.lines.filter((l) => l.on && Number(l.amount) > 0).forEach((l) => items.push(l.type === 'monthly'
          ? { type: 'monthly', month: l.month, label: l.label, amount: Number(l.amount), full: Number(l.amount) >= l.due }
          : { type: 'admission', label: 'Admission fee', amount: Number(l.amount) }));
        cs.extras.filter((x) => Number(x.amount) > 0).forEach((x) => items.push({ type: 'other', label: x.label || 'Other charge', amount: Number(x.amount) }));
        if (!items.length) { $('#payErr', el).textContent = 'Select at least one item with an amount.'; return; }
        const sub = items.reduce((a, i) => a + i.amount, 0);
        const discount = Math.min(Number(cs.discount) || 0, sub);
        e.currentTarget.disabled = true;
        const b = Logic.batchOf(s);
        const p = await Store.save('payments', {
          receiptNo: Logic.nextReceiptNo(), date: cs.date, studentId: s.id, studentName: s.name, studentCode: s.code || '',
          courseName: c ? c.name : '', batchName: b ? b.name : '', items, subtotal: sub, discount, total: sub - discount, mode: cs.mode, note: cs.note
        });
        App.dirty = false;
        cs.sid = '';
        UI.toast(`Payment of ${money(p.total)} saved`);
        App.go('receipt/' + p.id);
      });
    }
  };

  // ───────────── Receipt ─────────────
  window.Pages.receipt = {
    title: 'Receipt',
    render(el, [id]) {
      const p = Store.get('payments', id);
      if (!p) { el.innerHTML = UI.empty('receipt', 'Receipt not found', 'It may have been deleted.', `<button class="btn" data-nav="payments">All payments</button>`); return; }
      const st = Store.settings();
      const s = Store.get('students', p.studentId);
      const bal = s ? Logic.dues(s).total : null;
      const phone = s ? UI.waPhone(s.phone || s.guardianPhone) : '';
      const lines = (p.items || []).map((i) => i.type === 'monthly' ? `Tuition fee – ${UI.monthLabel(i.month, true)}` : i.label);
      const share = [`*${st.name}*`, `Fee Receipt ${p.receiptNo}`, `Date: ${UI.fmtDate(p.date)}`, `Student: ${p.studentName} (${p.studentCode})`, '',
        ...(p.items || []).map((i, n) => `${lines[n]}: ${money(i.amount)}`), p.discount ? `Discount: −${money(p.discount)}` : '',
        `*Total paid: ${money(p.total)}* (${p.mode})`, bal ? `Balance due: ${money(bal)}` : '', '', 'Thank you!'].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');

      el.innerHTML = `
        <div class="no-print row" style="justify-content:space-between;flex-wrap:wrap;margin-bottom:16px">
          <button class="back-link" style="margin:0" data-back>${icon('arrowLeft')} Back</button>
          <div class="page-actions">
            <button class="btn btn-danger" data-del>${icon('trash')}<span class="hide-sm">Delete</span></button>
            <a class="btn" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(share)}">${icon('message')} WhatsApp</a>
            <button class="btn btn-primary" data-print>${icon('printer')} Print / PDF</button>
          </div>
        </div>
        <div class="receipt">
          <div class="r-head">
            <div class="r-inst"><div class="brand-mark">${esc(UI.initials(st.name))}</div>
              <div><h2>${esc(st.name)}</h2>
                ${st.tagline ? `<div class="r-muted">${esc(st.tagline)}</div>` : ''}
                ${st.address ? `<div class="r-muted">${esc(st.address)}</div>` : ''}
                ${st.phone || st.email ? `<div class="r-muted">${esc([st.phone, st.email].filter(Boolean).join(' · '))}</div>` : ''}</div></div>
            <div class="r-title"><span class="tag">FEE RECEIPT</span>
              <div style="margin-top:10px;font-weight:700;font-size:16px">${esc(p.receiptNo)}</div><div class="r-muted">${UI.fmtDate(p.date)}</div></div>
          </div>
          <dl class="r-meta" style="margin:0">
            <div><dt>Received from</dt><dd>${esc(p.studentName)}</dd></div>
            <div><dt>Student ID</dt><dd>${esc(p.studentCode || '—')}</dd></div>
            <div><dt>Course</dt><dd>${esc(p.courseName || '—')}${p.batchName ? ` · ${esc(p.batchName)}` : ''}</dd></div>
            <div><dt>Payment mode</dt><dd>${esc(p.mode)}${p.note ? ` · <span style="font-weight:400">${esc(p.note)}</span>` : ''}</dd></div>
          </dl>
          <table>
            <thead><tr><th style="width:36px">#</th><th>Description</th><th class="num">Amount</th></tr></thead>
            <tbody>
              ${(p.items || []).map((i, n) => `<tr><td>${n + 1}</td><td>${esc(lines[n])}</td><td class="num">${money(i.amount)}</td></tr>`).join('')}
              ${p.discount ? `<tr><td></td><td>Subtotal</td><td class="num">${money(p.subtotal)}</td></tr><tr><td></td><td>Discount</td><td class="num">−${money(p.discount)}</td></tr>` : ''}
            </tbody>
          </table>
          <div class="r-total"><span style="font-weight:600">Total paid</span><span class="amt">${money(p.total)}</span></div>
          <div class="r-words">Amount in words: <b>${esc(UI.amountInWords(p.total))}</b></div>
          <div class="r-foot">
            <div><span class="paid-stamp">PAID</span>
              ${bal != null ? `<div class="r-muted" style="margin-top:14px">Balance due as of ${UI.fmtDate(UI.today())}: <b style="color:#101828">${money(bal)}</b></div>` : ''}
              ${st.receiptNote ? `<div class="r-muted" style="margin-top:6px;max-width:360px">${esc(st.receiptNote)}</div>` : ''}</div>
            <div class="sign">Authorised signature</div>
          </div>
        </div>`;

      $('[data-back]', el).addEventListener('click', () => (history.length > 1 ? history.back() : App.go('payments')));
      $('[data-print]', el).addEventListener('click', () => window.print());
      $('[data-del]', el).addEventListener('click', async () => {
        const ok = await UI.confirmBox({ title: `Delete receipt ${p.receiptNo}?`, message: `The ${money(p.total)} payment will be removed and the months it covered will show as due again.` });
        if (!ok) return;
        await Store.remove('payments', p.id);
        UI.toast('Receipt deleted');
        App.go('payments');
      });
    }
  };

  // ───────────── Payments history ─────────────
  const ps = { month: UI.thisMonth(), all: false, mode: '', q: '' };

  window.Pages.payments = {
    title: 'Payments',
    render(el) {
      const q = ps.q.toLowerCase();
      const list = Store.all('payments')
        .filter((p) => ps.all || UI.monthOf(p.date) === ps.month)
        .filter((p) => !ps.mode || p.mode === ps.mode)
        .filter((p) => !q || [p.studentName, p.studentCode, p.receiptNo].join(' ').toLowerCase().includes(q))
        .sort(Logic.byDateDesc);
      const total = list.reduce((a, p) => a + (Number(p.total) || 0), 0);
      const byMode = MODES.map((m) => [m, list.filter((p) => p.mode === m).reduce((a, p) => a + (Number(p.total) || 0), 0)]).filter(([, v]) => v);
      const forText = (p) => (p.items || []).map((i) => i.type === 'monthly' ? UI.monthLabel(i.month) : i.label).join(', ');

      el.innerHTML = `
        <div class="page-head">
          <div><h1>Payments</h1><p class="sub">${ps.all ? 'All time' : UI.monthLabel(ps.month, true)} · ${list.length} receipt${list.length === 1 ? '' : 's'} · <b class="money" style="color:var(--text)">${money(total)}</b></p></div>
          <div class="page-actions"><button class="btn" data-csv>${icon('download')} <span class="hide-sm">Export</span></button>
            <button class="btn btn-primary" data-nav="collect">${icon('plus')} Collect fee</button></div>
        </div>
        <div class="toolbar">
          <div class="input-group">${icon('search')}<input class="input" id="payQ" placeholder="Search student or receipt no." value="${esc(ps.q)}"></div>
          <input class="input" type="month" id="payMonth" value="${ps.month}" style="width:auto" ${ps.all ? 'disabled' : ''}>
          <select class="select" id="payModeF"><option value="">All modes</option>${MODES.map((m) => `<option ${ps.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <button class="chip ${ps.all ? 'on' : ''}" id="payAll">All time</button>
        </div>
        ${byMode.length ? `<div class="row-wrap" style="margin-bottom:16px">${byMode.map(([m, v]) => `<span class="badge plain">${m}: <b class="money">${money(v)}</b></span>`).join('')}</div>` : ''}
        <div class="card">${list.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th class="hide-sm">For</th><th class="hide-sm">Mode</th><th class="num">Amount</th></tr></thead>
          <tbody>${list.map((p) => `<tr class="clickable" data-id="${p.id}">
            <td class="nowrap strong">${esc(p.receiptNo)}</td><td class="nowrap">${UI.fmtDate(p.date)}</td>
            <td><div class="strong">${esc(p.studentName)}</div><div class="small muted">${esc(p.studentCode || '')}</div></td>
            <td class="hide-sm muted" style="max-width:260px">${esc(forText(p))}</td><td class="hide-sm">${esc(p.mode)}</td>
            <td class="num strong">${money(p.total)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3">Total</td><td class="hide-sm"></td><td class="hide-sm"></td><td class="num">${money(total)}</td></tr></tfoot>
        </table></div>` : UI.empty('receipt', 'No payments found', 'Try another month or clear the filters.')}</div>`;

      $$('[data-id]', el).forEach((r) => r.addEventListener('click', () => App.go('receipt/' + r.dataset.id)));
      const qi = $('#payQ', el);
      qi.addEventListener('change', () => { ps.q = qi.value; this.render(el); });
      qi.addEventListener('keyup', (e) => { if (e.key === 'Enter' || !qi.value) { ps.q = qi.value; this.render(el); } });
      $('#payMonth', el).addEventListener('change', (e) => { if (e.target.value) { ps.month = e.target.value; this.render(el); } });
      $('#payModeF', el).addEventListener('change', (e) => { ps.mode = e.target.value; this.render(el); });
      $('#payAll', el).addEventListener('click', () => { ps.all = !ps.all; this.render(el); });
      $('[data-csv]', el).addEventListener('click', () => {
        const rows = [['Receipt', 'Date', 'Student', 'Student ID', 'Course', 'For', 'Mode', 'Subtotal', 'Discount', 'Total', 'Note']];
        list.forEach((p) => rows.push([p.receiptNo, p.date, p.studentName, p.studentCode, p.courseName, forText(p), p.mode, p.subtotal, p.discount, p.total, p.note]));
        UI.download(`payments-${ps.all ? 'all' : ps.month}.csv`, UI.csv(rows), 'text/csv');
      });
    }
  };

  // ───────────── Monthly report ─────────────
  const rs = { month: UI.thisMonth(), filter: 'all' };

  window.Pages.reports = {
    title: 'Reports',
    render(el) {
      const rows = Logic.monthReport(rs.month);
      const expected = rows.reduce((a, r) => a + r.fee, 0);
      const outstanding = rows.reduce((a, r) => a + r.due, 0);
      const settled = expected - outstanding;
      const rate = expected ? Math.round((settled / expected) * 100) : 0;
      const pays = Logic.paymentsInMonth(rs.month);
      const cashIn = pays.reduce((a, p) => a + (Number(p.total) || 0), 0);
      const exp = Logic.expensesIn(rs.month);
      const byMode = MODES.map((m) => [m, pays.filter((p) => p.mode === m).reduce((a, p) => a + (Number(p.total) || 0), 0)]);
      const admissions = Store.all('students').filter((s) => UI.monthOf(s.admissionDate) === rs.month).length;
      const shown = rows.filter((r) => rs.filter === 'all' || r.status === rs.filter).sort((a, b) => b.due - a.due || a.s.name.localeCompare(b.s.name));
      const cnt = (k) => rows.filter((r) => r.status === k).length;
      const sb = (st) => st === 'paid' ? '<span class="badge badge-success">Paid</span>' : st === 'partial' ? '<span class="badge badge-warning">Partial</span>' : '<span class="badge badge-danger">Unpaid</span>';
      const kpi = (l, v, sub) => `<div class="card kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-sub">${sub}</div></div>`;

      el.innerHTML = `
        <div class="page-head">
          <div><h1>Monthly report</h1><p class="sub">Fee collection for ${UI.monthLabel(rs.month, true)}</p></div>
          <div class="page-actions no-print">
            <div class="row" style="gap:4px"><button class="icon-btn" data-m="-1">${icon('chevronLeft')}</button>
              <input class="input" type="month" id="repMonth" value="${rs.month}" style="width:auto">
              <button class="icon-btn" data-m="1">${icon('chevronRight')}</button></div>
            <button class="btn" data-csv>${icon('download')} <span class="hide-sm">CSV</span></button>
            <button class="btn" data-print>${icon('printer')} <span class="hide-sm">Print</span></button>
          </div>
        </div>
        <div class="kpis" style="margin-bottom:16px">
          ${kpi('Expected fees', money(expected), `${rows.length} student${rows.length === 1 ? '' : 's'} billed`)}
          ${kpi('Settled', money(settled), `${cnt('paid')} fully paid`)}
          ${kpi('Outstanding', `<span style="${outstanding ? 'color:var(--danger)' : ''}">${money(outstanding)}</span>`, `${cnt('unpaid')} unpaid · ${cnt('partial')} partial`)}
          ${kpi('Collection rate', rate + '%', `<span style="display:block;height:6px;border-radius:3px;background:var(--surface-3);margin-top:8px;overflow:hidden"><span style="display:block;height:100%;width:${rate}%;background:var(--accent);border-radius:3px"></span></span>`)}
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-head"><h3>Cash flow · ${UI.monthLabel(rs.month, true)}</h3><span class="muted small">${admissions} new admission${admissions === 1 ? '' : 's'}</span></div>
          <div class="stat-strip" style="border-top:0">
            <div><div class="v money">${money(cashIn)}</div><div class="l">Fees received (${pays.length} receipts)</div></div>
            <div><div class="v money">${money(exp)}</div><div class="l">Expenses</div></div>
            <div><div class="v money" style="color:${cashIn - exp >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(cashIn - exp)}</div><div class="l">Net</div></div>
            <div><div class="small" style="display:grid;gap:2px">${byMode.map(([m, v]) => `<div class="row" style="justify-content:space-between"><span class="muted">${m}</span><span class="money">${money(v)}</span></div>`).join('')}</div></div>
          </div>
        </div>
        <div class="chips no-print" style="margin-bottom:16px">
          ${[['all', 'All', rows.length], ['unpaid', 'Unpaid', cnt('unpaid')], ['partial', 'Partial', cnt('partial')], ['paid', 'Paid', cnt('paid')]].map(([k, t, n]) => `<button class="chip ${rs.filter === k ? 'on' : ''}" data-f="${k}">${t} <span class="count">${n}</span></button>`).join('')}
        </div>
        <div class="card">${shown.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Student</th><th class="hide-sm">Course</th><th class="num">Fee</th><th class="num">Paid</th><th class="num">Due</th><th>Status</th><th class="no-print"></th></tr></thead>
          <tbody>${shown.map((r) => `<tr class="clickable" data-sid="${r.s.id}">
            <td><div class="strong">${esc(r.s.name)}</div><div class="small muted">${esc(r.s.code || '')}${r.s.phone ? ' · ' + esc(r.s.phone) : ''}</div></td>
            <td class="hide-sm">${esc((Logic.courseOf(r.s) || {}).name || '—')}</td>
            <td class="num">${money(r.fee)}</td><td class="num">${money(r.paid)}</td>
            <td class="num" style="${r.due ? 'color:var(--danger);font-weight:600' : ''}">${money(r.due)}</td><td>${sb(r.status)}</td>
            <td class="no-print right">${r.due ? `<button class="btn btn-sm" data-collect="${r.s.id}">Collect</button>` : ''}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="hide-sm"></td><td class="num">${money(shown.reduce((a, r) => a + r.fee, 0))}</td><td class="num">${money(shown.reduce((a, r) => a + r.paid, 0))}</td><td class="num">${money(shown.reduce((a, r) => a + r.due, 0))}</td><td></td><td class="no-print"></td></tr></tfoot>
        </table></div>` : UI.empty('chart', 'Nothing to show', rows.length ? 'No students match this filter.' : 'No students were billed in this month.')}</div>`;

      $$('[data-m]', el).forEach((b) => b.addEventListener('click', () => { rs.month = UI.addMonths(rs.month, Number(b.dataset.m)); this.render(el); }));
      $('#repMonth', el).addEventListener('change', (e) => { if (e.target.value) { rs.month = e.target.value; this.render(el); } });
      $$('[data-f]', el).forEach((b) => b.addEventListener('click', () => { rs.filter = b.dataset.f; this.render(el); }));
      $$('[data-sid]', el).forEach((r) => r.addEventListener('click', (e) => {
        if (e.target.closest('[data-collect]')) { App.go('collect?s=' + r.dataset.sid); return; }
        App.go('student/' + r.dataset.sid);
      }));
      $('[data-print]', el).addEventListener('click', () => window.print());
      $('[data-csv]', el).addEventListener('click', () => {
        const out = [['Student', 'ID', 'Phone', 'Course', 'Fee', 'Paid', 'Due', 'Status']];
        shown.forEach((r) => out.push([r.s.name, r.s.code, r.s.phone, (Logic.courseOf(r.s) || {}).name, r.fee, r.paid, r.due, r.status]));
        UI.download(`fee-report-${rs.month}.csv`, UI.csv(out), 'text/csv');
      });
    }
  };
})();

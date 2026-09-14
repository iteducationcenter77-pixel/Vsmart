/* Students: list, add/edit form, profile with fee ledger, payments & attendance. */
window.Pages = window.Pages || {};
(function () {
  const { icon, esc, money, $, $$ } = UI;

  const STATUS = {
    active: ['Active', 'badge-success'],
    completed: ['Completed', 'badge-accent'],
    dropped: ['Dropped', 'badge-danger']
  };
  const statusBadge = (s) => { const [t, c] = STATUS[s.status] || STATUS.active; return `<span class="badge ${c}">${t}</span>`; };

  // ───────────── List ─────────────
  const filt = { q: '', status: 'active', course: '', batch: '' };

  function filtered() {
    const q = filt.q.toLowerCase();
    return Logic.students().filter((s) => {
      if (filt.status === 'dues') { if (Logic.dues(s).total <= 0) return false; }
      else if (filt.status !== 'all' && s.status !== filt.status) return false;
      if (filt.course && s.courseId !== filt.course) return false;
      if (filt.batch && s.batchId !== filt.batch) return false;
      if (q && ![s.name, s.code, s.phone, s.guardianName, s.guardianPhone].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function rowsHtml(list) {
    if (!list.length) {
      return Store.all('students').length
        ? UI.empty('search', 'No matching students', 'Try a different search or filter.')
        : UI.empty('users', 'No students yet', 'Add your first student to start tracking fees and attendance.',
          `<button class="btn btn-primary" data-add>${icon('plus')} Add student</button>`);
    }
    return list.map((s) => {
      const c = Logic.courseOf(s), b = Logic.batchOf(s);
      const due = Logic.dues(s).total;
      return `<div class="list-item clickable" data-id="${s.id}">
        <div class="avatar">${esc(UI.initials(s.name))}</div>
        <div class="li-main">
          <div class="li-title">${esc(s.name)} <span class="faint small" style="font-weight:400">· ${esc(s.code || '')}</span></div>
          <div class="li-sub">${esc(c ? c.name : 'No course')}${b ? ' · ' + esc(b.name) : ''}${s.phone ? ' · ' + esc(s.phone) : ''}</div>
        </div>
        ${s.status !== 'active' ? `<div class="hide-sm">${statusBadge(s)}</div>` : ''}
        <div class="li-end">${due > 0
          ? `<div class="strong money" style="color:var(--danger)">${money(due)}</div><div class="small muted">due</div>`
          : '<span class="badge badge-success">Paid up</span>'}</div>
      </div>`;
    }).join('');
  }

  window.Pages.students = {
    title: 'Students',
    render(el) {
      const all = Logic.students();
      const courses = Store.all('courses');
      const batches = Store.all('batches').filter((b) => !filt.course || b.courseId === filt.course);
      const count = (k) => k === 'all' ? all.length : k === 'dues' ? all.filter((s) => Logic.dues(s).total > 0).length : all.filter((s) => s.status === k).length;
      const chips = [['active', 'Active'], ['dues', 'With dues'], ['completed', 'Completed'], ['dropped', 'Dropped'], ['all', 'All']];

      el.innerHTML = `
        <div class="page-head">
          <div><h1>Students</h1><p class="sub">${count('active')} active · ${all.length} total</p></div>
          <div class="page-actions">
            <button class="btn" data-export>${icon('download')} <span class="hide-sm">Export</span></button>
            <button class="btn btn-primary" data-add>${icon('plus')} Add student</button>
          </div>
        </div>
        <div class="toolbar">
          <div class="input-group">${icon('search')}<input class="input" id="stuSearch" placeholder="Search name, ID or phone" value="${esc(filt.q)}"></div>
          <select class="select" id="stuCourse"><option value="">All courses</option>${courses.map((c) => `<option value="${c.id}" ${filt.course === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          <select class="select" id="stuBatch"><option value="">All batches</option>${batches.map((b) => `<option value="${b.id}" ${filt.batch === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
        </div>
        <div class="chips" style="margin-bottom:16px">
          ${chips.map(([k, t]) => `<button class="chip ${filt.status === k ? 'on' : ''}" data-st="${k}">${t} <span class="count">${count(k)}</span></button>`).join('')}
        </div>
        <div class="card"><div class="list" id="stuList">${rowsHtml(filtered())}</div></div>`;

      const list = $('#stuList', el);
      const bindRows = () => {
        $$('[data-id]', list).forEach((r) => r.addEventListener('click', () => App.go('student/' + r.dataset.id)));
        $$('[data-add]', el).forEach((b) => b.onclick = () => this.openForm());
      };
      bindRows();
      $('#stuSearch', el).addEventListener('input', (e) => { filt.q = e.target.value; list.innerHTML = rowsHtml(filtered()); bindRows(); });
      $('#stuCourse', el).addEventListener('change', (e) => { filt.course = e.target.value; filt.batch = ''; this.render(el); });
      $('#stuBatch', el).addEventListener('change', (e) => { filt.batch = e.target.value; this.render(el); });
      $$('[data-st]', el).forEach((c) => c.addEventListener('click', () => { filt.status = c.dataset.st; this.render(el); }));
      $('[data-export]', el).addEventListener('click', () => {
        const rows = [['ID', 'Name', 'Phone', 'Guardian', 'Guardian phone', 'Course', 'Batch', 'Admission date', 'Monthly fee', 'Status', 'Due']];
        filtered().forEach((s) => rows.push([s.code, s.name, s.phone, s.guardianName, s.guardianPhone, (Logic.courseOf(s) || {}).name, (Logic.batchOf(s) || {}).name, s.admissionDate, s.monthlyFee, s.status, Logic.dues(s).total]));
        UI.download(`students-${UI.today()}.csv`, UI.csv(rows), 'text/csv');
      });
    },

    // ───────────── Add / edit form ─────────────
    openForm(existing) {
      const courses = Store.all('courses').sort((a, b) => a.name.localeCompare(b.name));
      if (!courses.length) { UI.toast('Add a course first', 'error'); App.go('courses'); return; }
      const s = existing || { status: 'active', admissionDate: UI.today(), courseId: courses.length === 1 ? courses[0].id : '' };
      const isNew = !existing;
      const c0 = Store.get('courses', s.courseId);
      const v = (k, d = '') => esc(s[k] != null ? s[k] : d);
      const batchOpts = (cid, sel) => `<option value="">No batch</option>` + Store.all('batches')
        .filter((b) => !b.courseId || b.courseId === cid)
        .map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.name)}${b.time ? ' · ' + esc(b.time) : ''}</option>`).join('');

      UI.modal({
        title: isNew ? 'Add student' : 'Edit student',
        body: `<form id="stuForm" class="form-grid" autocomplete="off">
          <div class="form-section">Personal details</div>
          <div class="field full"><label class="req">Full name</label><input class="input" name="name" value="${v('name')}" required></div>
          <div class="field"><label class="req">Mobile number</label><input class="input" name="phone" type="tel" inputmode="tel" value="${v('phone')}" required></div>
          <div class="field"><label>Email</label><input class="input" name="email" type="email" value="${v('email')}"></div>
          <div class="field"><label>Guardian name</label><input class="input" name="guardianName" value="${v('guardianName')}"></div>
          <div class="field"><label>Guardian mobile</label><input class="input" name="guardianPhone" type="tel" inputmode="tel" value="${v('guardianPhone')}"></div>
          <div class="field"><label>Date of birth</label><input class="input" name="dob" type="date" value="${v('dob')}"></div>
          <div class="field"><label>Gender</label><select class="select" name="gender">
            ${['', 'Male', 'Female', 'Other'].map((g) => `<option value="${g}" ${s.gender === g ? 'selected' : ''}>${g || 'Select'}</option>`).join('')}</select></div>
          <div class="field full"><label>Address</label><input class="input" name="address" value="${v('address')}"></div>

          <div class="form-section">Course & fees</div>
          <div class="field"><label class="req">Course</label><select class="select" name="courseId" required>
            <option value="">Select course</option>
            ${courses.map((c) => `<option value="${c.id}" ${c.id === s.courseId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Batch</label><select class="select" name="batchId">${batchOpts(s.courseId, s.batchId)}</select></div>
          <div class="field"><label class="req">Admission date</label><input class="input" name="admissionDate" type="date" value="${v('admissionDate')}" required></div>
          <div class="field"><label>Course duration (months)</label><input class="input" name="durationMonths" type="number" min="0" value="${v('durationMonths', c0 ? c0.durationMonths : '')}"><span class="hint">Fees stop after this. 0 = no end.</span></div>
          <div class="field"><label>Monthly fee</label><div class="input-prefix"><span>${esc(Store.settings().currency)}</span><input class="input" name="monthlyFee" type="number" min="0" value="${v('monthlyFee', c0 ? c0.monthlyFee : '')}"></div><span class="hint">Change it to give a concession.</span></div>
          <div class="field"><label>Admission fee</label><div class="input-prefix"><span>${esc(Store.settings().currency)}</span><input class="input" name="admissionFee" type="number" min="0" value="${v('admissionFee', c0 ? c0.admissionFee : '')}"></div></div>

          <div class="form-section">Status</div>
          <div class="field"><label>Status</label><select class="select" name="status">
            ${Object.entries(STATUS).map(([k, [t]]) => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field" id="leftWrap" ${s.status === 'active' ? 'hidden' : ''}><label>Left / completed on</label><input class="input" name="leftDate" type="date" value="${v('leftDate', UI.today())}"></div>
          <div class="field full"><label>Notes</label><textarea class="textarea" name="notes" rows="2">${v('notes')}</textarea></div>
          <div class="form-error full" id="stuErr"></div>
        </form>`,
        foot: `${isNew ? '' : `<button class="btn btn-danger left" data-del>${icon('trash')} Delete</button>`}
          <button class="btn" data-close>Cancel</button>
          <button class="btn btn-primary" data-save>${isNew ? 'Add student' : 'Save changes'}</button>`,
        onMount(root, close) {
          const f = $('#stuForm', root);
          f.courseId.addEventListener('change', () => {
            const c = Store.get('courses', f.courseId.value);
            f.batchId.innerHTML = batchOpts(f.courseId.value, '');
            if (c) { f.monthlyFee.value = c.monthlyFee || 0; f.admissionFee.value = c.admissionFee || 0; f.durationMonths.value = c.durationMonths || 0; }
          });
          f.status.addEventListener('change', () => { $('#leftWrap', root).hidden = f.status.value === 'active'; });
          const save = async () => {
            const d = UI.formData(f);
            const err = $('#stuErr', root);
            if (!d.name || !d.phone || !d.courseId || !d.admissionDate) { err.textContent = 'Please fill the required fields (marked *).'; return; }
            if (d.status === 'active') d.leftDate = '';
            const saved = await Store.save('students', { ...s, ...d, code: s.code || Logic.nextStudentCode() });
            close();
            UI.toast(isNew ? `${saved.name} added (${saved.code})` : 'Student updated');
            if (isNew) App.go('student/' + saved.id); else App.rerender();
          };
          $('[data-save]', root).addEventListener('click', save);
          f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
          const del = $('[data-del]', root);
          if (del) del.addEventListener('click', async () => {
            const n = Logic.paymentsOf(s.id).length;
            const ok = await UI.confirmBox({ title: `Delete ${s.name}?`, message: n ? `Their ${n} payment receipt(s) will stay in your records. This cannot be undone.` : 'This cannot be undone.' });
            if (!ok) return;
            await Store.remove('students', s.id);
            close();
            UI.toast('Student deleted');
            App.go('students');
          });
        }
      });
    }
  };

  // ───────────── Profile ─────────────
  let tab = 'fees';
  let attMonth = UI.thisMonth();
  let lastId = null;

  window.Pages.student = {
    title: 'Student',
    render(el, [id]) {
      const s = Store.get('students', id);
      if (!s) { el.innerHTML = UI.empty('user', 'Student not found', 'This student may have been deleted.', `<button class="btn" data-nav="students">Back to students</button>`); return; }
      if (lastId !== id) { tab = 'fees'; attMonth = UI.thisMonth(); lastId = id; }
      const c = Logic.courseOf(s), b = Logic.batchOf(s);
      const d = Logic.dues(s);
      const paidTotal = Logic.totalPaidBy(s.id);
      const att = Logic.attendanceStats(s.id);
      const end = Logic.endMonth(s);
      const enrolled = Logic.billableMonths(s).length;
      const wa = UI.waPhone(s.phone || s.guardianPhone);
      const inst = Store.settings().name;
      const reminder = `Dear ${s.name}, this is a gentle reminder that your fee of ${money(d.total)}${d.months.length ? ` (${d.months.map((m) => UI.monthLabel(m.month)).join(', ')})` : ''} is pending at ${inst}. Kindly pay at the earliest. Thank you.`;

      el.innerHTML = `
        <button class="back-link" data-nav="students">${icon('arrowLeft')} Students</button>
        <div class="card" style="margin-bottom:20px">
          <div class="card-body">
            <div class="profile-head">
              <div class="avatar lg">${esc(UI.initials(s.name))}</div>
              <div class="li-main" style="min-width:200px">
                <div class="row-wrap"><h2>${esc(s.name)}</h2>${statusBadge(s)}</div>
                <div class="muted" style="margin-top:4px">${esc(s.code || '')} · ${esc(c ? c.name : 'No course')}${b ? ' · ' + esc(b.name) : ''}</div>
              </div>
              <div class="page-actions">
                ${s.phone ? `<a class="btn" href="tel:${esc(s.phone)}">${icon('phone')}<span class="hide-sm">Call</span></a>` : ''}
                ${wa ? `<a class="btn" href="https://wa.me/${wa}" target="_blank" rel="noopener">${icon('message')}<span class="hide-sm">WhatsApp</span></a>` : ''}
                <button class="btn" data-edit>${icon('edit')}<span class="hide-sm">Edit</span></button>
                <button class="btn btn-primary" data-collect>${icon('wallet')} Collect fee</button>
              </div>
            </div>
          </div>
          <div class="stat-strip">
            <div><div class="v money" style="${d.total ? 'color:var(--danger)' : ''}">${money(d.total)}</div><div class="l">Balance due</div></div>
            <div><div class="v money">${money(paidTotal)}</div><div class="l">Total paid</div></div>
            <div><div class="v">${att.pct == null ? '—' : att.pct + '%'}</div><div class="l">Attendance</div></div>
            <div><div class="v">${enrolled}${s.durationMonths ? `<span class="muted" style="font-size:.7em"> / ${s.durationMonths}</span>` : ''}</div><div class="l">Months enrolled</div></div>
          </div>
        </div>

        <div class="tabs">
          ${[['fees', 'Fee ledger'], ['payments', 'Payments'], ['attendance', 'Attendance'], ['details', 'Details']].map(([k, t]) => `<button class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}
        </div>
        <div id="tabBody"></div>`;

      const body = $('#tabBody', el);
      if (tab === 'fees') {
        const rows = Logic.ledger(s);
        const admFee = Number(s.admissionFee) || 0;
        const admPaid = Logic.admissionPaid(s);
        const sb = (st) => st === 'paid' ? '<span class="badge badge-success">Paid</span>' : st === 'partial' ? '<span class="badge badge-warning">Partial</span>' : '<span class="badge badge-danger">Unpaid</span>';
        const tFee = rows.filter((r) => !r.advance).reduce((a, r) => a + r.fee, 0) + admFee;
        const tPaid = rows.reduce((a, r) => a + r.paid, 0) + admPaid;
        body.innerHTML = `
          ${d.total > 0 && wa ? `<div class="card card-pad row" style="margin-bottom:16px;flex-wrap:wrap">
              <div class="li-main"><div class="strong">${money(d.total)} pending</div><div class="muted small">Send a polite reminder on WhatsApp</div></div>
              <a class="btn" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(reminder)}">${icon('message')} Send reminder</a></div>` : ''}
          <div class="card"><div class="table-wrap"><table class="table stack">
            <thead><tr><th>Month</th><th class="num">Fee</th><th class="num">Paid</th><th class="num">Due</th><th>Status</th></tr></thead>
            <tbody>
              ${admFee ? `<tr><td class="primary">Admission fee</td><td class="num" data-label="Fee">${money(admFee)}</td><td class="num" data-label="Paid">${money(admPaid)}</td><td class="num" data-label="Due">${money(Math.max(0, admFee - admPaid))}</td><td class="pin">${sb(admPaid >= admFee ? 'paid' : admPaid > 0 ? 'partial' : 'unpaid')}</td></tr>` : ''}
              ${rows.slice().reverse().map((r) => `<tr><td class="primary">${UI.monthLabel(r.month, true)}${r.advance ? ' <span class="badge badge-accent plain">Advance</span>' : ''}</td>
                <td class="num" data-label="Fee">${money(r.fee)}</td><td class="num" data-label="Paid">${money(r.paid)}</td><td class="num" data-label="Due">${r.due ? `<span style="color:var(--danger)">${money(r.due)}</span>` : money(0)}</td><td class="pin">${sb(r.status)}</td></tr>`).join('')}
              ${!rows.length && !admFee ? `<tr><td colspan="5" class="span">${UI.empty('calendar', 'Nothing billed yet', 'Monthly fees start from the admission month.')}</td></tr>` : ''}
            </tbody>
            <tfoot><tr><td class="primary">Total</td><td class="num" data-label="Fee">${money(tFee)}</td><td class="num" data-label="Paid">${money(tPaid)}</td><td class="num" data-label="Due">${money(d.total)}</td><td></td></tr></tfoot>
          </table></div></div>
          ${end ? `<p class="muted small" style="margin-top:10px">Course ends ${UI.monthLabel(end, true)}. Monthly fees are not charged after that.</p>` : ''}`;
      } else if (tab === 'payments') {
        const list = Logic.paymentsOf(s.id);
        body.innerHTML = `<div class="card"><div class="list">${list.length ? list.map((p) => `
          <div class="list-item clickable" data-receipt="${p.id}">
            <div class="avatar" style="background:var(--success-bg);color:var(--success)">${icon('receipt')}</div>
            <div class="li-main"><div class="li-title">${esc(p.receiptNo)} · ${UI.fmtDate(p.date)}</div>
              <div class="li-sub">${esc((p.items || []).map((i) => i.type === 'monthly' ? UI.monthLabel(i.month) : i.label).join(', '))} · ${esc(p.mode)}</div></div>
            <div class="li-end strong money">${money(p.total)}</div></div>`).join('')
          : UI.empty('receipt', 'No payments yet', 'Collected fees for this student will appear here.')}</div></div>`;
        $$('[data-receipt]', body).forEach((r) => r.addEventListener('click', () => App.go('receipt/' + r.dataset.receipt)));
      } else if (tab === 'attendance') {
        const ms = Logic.attendanceStats(s.id, attMonth);
        const map = {}; ms.list.forEach((r) => (map[r.date] = r.st));
        const [y, m] = attMonth.split('-').map(Number);
        const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first
        const days = UI.daysInMonth(attMonth);
        let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w) => `<div class="small faint" style="text-align:center">${w}</div>`).join('');
        for (let i = 0; i < firstDow; i++) cells += '<div></div>';
        for (let dd = 1; dd <= days; dd++) {
          const iso = `${attMonth}-${String(dd).padStart(2, '0')}`;
          const st = map[iso];
          cells += `<div style="display:grid;place-items:center;height:38px"><span class="cell ${st || 'none'}" style="width:32px;height:32px;border-radius:9px;font-size:12px">${dd}</span></div>`;
        }
        body.innerHTML = `<div class="card">
          <div class="card-head">
            <div class="row"><button class="icon-btn" data-m="-1">${icon('chevronLeft')}</button>
              <h3 style="min-width:120px;text-align:center">${UI.monthLabel(attMonth, true)}</h3>
              <button class="icon-btn" data-m="1">${icon('chevronRight')}</button></div>
            <div class="strong">${ms.pct == null ? '—' : ms.pct + '%'}</div>
          </div>
          <div class="card-body">
            <div class="row-wrap" style="margin-bottom:16px">
              <span class="badge badge-success">${ms.P} present</span><span class="badge badge-danger">${ms.A} absent</span><span class="badge badge-warning">${ms.L} late</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;max-width:420px">${cells}</div>
          </div></div>`;
        $$('[data-m]', body).forEach((btn) => btn.addEventListener('click', () => { attMonth = UI.addMonths(attMonth, Number(btn.dataset.m)); this.render(el, [id]); }));
      } else {
        const item = (l, val) => `<div class="meta"><dt>${l}</dt><dd>${val ? esc(val) : '<span class="faint">—</span>'}</dd></div>`;
        body.innerHTML = `<div class="card card-body"><dl class="meta-grid" style="margin:0">
          ${item('Student ID', s.code)}${item('Mobile', s.phone)}${item('Email', s.email)}
          ${item('Guardian', s.guardianName)}${item('Guardian mobile', s.guardianPhone)}${item('Date of birth', s.dob && UI.fmtDate(s.dob))}
          ${item('Gender', s.gender)}${item('Course', c && c.name)}${item('Batch', b && `${b.name}${b.time ? ' · ' + b.time : ''}`)}
          ${item('Admission date', UI.fmtDate(s.admissionDate))}${item('Monthly fee', money(s.monthlyFee))}${item('Admission fee', money(s.admissionFee))}
          ${item('Duration', s.durationMonths ? s.durationMonths + ' months' : 'No fixed end')}${s.status !== 'active' ? item('Left on', UI.fmtDate(s.leftDate)) : ''}
          ${item('Address', s.address)}${item('Notes', s.notes)}
        </dl></div>`;
      }

      $$('[data-tab]', el).forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; this.render(el, [id]); }));
      $('[data-edit]', el).addEventListener('click', () => Pages.students.openForm(s));
      $('[data-collect]', el).addEventListener('click', () => App.go('collect?s=' + s.id));
    }
  };
})();

/*
 * Exams & admit cards.
 *  • Exams list → create an exam (Unit Test, Half Yearly …) with its dates, fee deadline,
 *    courses, timetable and instructions.
 *  • Exam page → every student who sits it, whether their fees are cleared, collect / allow.
 *  • Admit cards → printed like receipts (Print / Save as PDF), two per A4 page.
 * A student qualifies once fees up to the deadline month are paid, or when the institute allows it.
 */
window.Pages = window.Pages || {};
(function () {
  const { icon, esc, money, $, $$ } = UI;

  const NAMES = ['Unit Test', 'Monthly Test', 'Half Yearly Examination', 'Annual Examination', 'Final Examination', 'Practical Examination'];
  const DEFAULT_RULES = [
    'Bring this admit card to every exam. Entry is not allowed without it.',
    'Report at the exam centre at least 15 minutes before the reporting time.',
    'Carry your institute ID card. Mobile phones and smart watches are not allowed in the exam hall.',
    'Any use of unfair means will cancel the exam.',
    'This admit card is valid only for the exam named above.'
  ].join('\n');

  const STATE = {
    cleared: ['Fees cleared', 'badge-success'],
    permitted: ['Allowed by institute', 'badge-accent'],
    pending: ['Dues pending', 'badge-warning'],
    blocked: ['Not eligible', 'badge-danger']
  };
  const stateBadge = (st) => `<span class="badge ${STATE[st.state][1]}">${STATE[st.state][0]}</span>`;

  const dateRange = (e) => e.endDate && e.endDate !== e.startDate ? `${UI.fmtDate(e.startDate)} – ${UI.fmtDate(e.endDate)}` : UI.fmtDate(e.startDate);
  const days = (iso) => Math.round((new Date(iso + 'T00:00:00') - new Date(UI.today() + 'T00:00:00')) / 86400000);
  function deadlineText(e) {
    if (!e.duesDeadline) return '';
    const d = days(e.duesDeadline);
    return d > 1 ? `in ${d} days` : d === 1 ? 'tomorrow' : d === 0 ? 'today' : 'passed';
  }
  const courseNames = (e) => {
    const ids = Logic.examCourses(e);
    return ids.length ? ids.map((id) => (Store.get('courses', id) || {}).name).filter(Boolean).join(', ') : 'All courses';
  };
  const rollPrefix = (name, date) => {
    const ini = String(name || '').split(/\s+/).map((w) => (w.match(/[A-Za-z]/) || [''])[0]).join('').toUpperCase().slice(0, 3);
    return (ini || 'EX') + String(date || UI.today()).slice(2, 4) + '-';
  };

  function summary(e) {
    const list = Logic.examStudents(e).map((s) => ({ s, st: Logic.examStanding(e, s) }));
    const c = { total: list.length, eligible: 0, cleared: 0, permitted: 0, due: 0, dueAmt: 0 };
    list.forEach(({ st }) => {
      if (st.eligible) c.eligible++;
      if (st.state === 'cleared') c.cleared++;
      if (st.state === 'permitted') c.permitted++;
      if (st.state === 'pending' || st.state === 'blocked') { c.due++; c.dueAmt += st.due; }
    });
    return { list, c };
  }

  // ───────────── Create / edit ─────────────
  function examForm(existing) {
    const isNew = !existing;
    const courses = Store.all('courses').sort((a, b) => a.name.localeCompare(b.name));
    const e = existing || { startDate: '', duesDeadline: '', courseIds: [], schedule: [], instructions: DEFAULT_RULES };
    const sel = new Set(Logic.examCourses(e));
    const row = (r = {}) => `<div class="sched-row">
        <input class="input" name="subject" placeholder="Subject / paper" value="${esc(r.subject || '')}">
        <input class="input" type="date" name="date" value="${esc(r.date || '')}">
        <input class="input" name="time" placeholder="10:00 AM – 12:00 PM" value="${esc(r.time || '')}">
        <button type="button" class="icon-btn" data-rm aria-label="Remove row">${icon('x')}</button></div>`;

    UI.modal({
      title: isNew ? 'New exam' : 'Edit exam',
      body: `<form id="exForm" class="form-grid" autocomplete="off">
        <div class="field full"><label class="req">Exam name</label>
          <input class="input" name="name" value="${esc(e.name || '')}" placeholder="e.g. Half Yearly Examination 2026" required>
          <div class="chips" style="margin-top:4px">${NAMES.map((n) => `<button type="button" class="chip" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        </div>
        <div class="field"><label class="req">Exam starts on</label><input class="input" type="date" name="startDate" value="${esc(e.startDate || '')}" required></div>
        <div class="field"><label>Exam ends on</label><input class="input" type="date" name="endDate" value="${esc(e.endDate || '')}"><span class="hint">Leave empty for a one-day exam.</span></div>
        <div class="field full"><label class="req">Clear fees by</label><input class="input" type="date" name="duesDeadline" value="${esc(e.duesDeadline || '')}" required>
          <span class="hint" id="feeHint">Fees due up to this month must be paid to get the admit card.</span></div>

        <div class="form-section">Who sits this exam</div>
        <div class="field full">
          <label class="check-row"><input type="checkbox" class="check" id="allCourses" ${sel.size ? '' : 'checked'}> All courses</label>
          <div class="course-picks" id="coursePicks" ${sel.size ? '' : 'hidden'}>
            ${courses.map((c) => `<label class="check-row"><input type="checkbox" class="check" name="courseId" value="${c.id}" ${sel.has(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('') || '<span class="muted small">No courses yet.</span>'}
          </div>
        </div>

        <div class="form-section">Exam details</div>
        <div class="field"><label>Reporting time</label><input class="input" name="reportingTime" value="${esc(e.reportingTime || '')}" placeholder="e.g. 9:30 AM"></div>
        <div class="field"><label>Roll number prefix</label><input class="input" name="rollPrefix" value="${esc(e.rollPrefix || '')}" placeholder="Set automatically"></div>
        <div class="field full"><label>Exam centre</label><input class="input" name="venue" value="${esc(e.venue || '')}" placeholder="Leave empty to use the institute address"></div>
        <div class="field full"><label>Timetable</label>
          <div class="sched" id="sched">${(e.schedule || []).map(row).join('')}</div>
          <button type="button" class="btn btn-sm" id="addRow" style="align-self:flex-start">${icon('plus')} Add paper</button>
          <span class="hint">Optional. Printed on the admit card.</span></div>
        <div class="field full"><label>Instructions for students</label><textarea class="textarea" name="instructions" rows="5">${esc(e.instructions == null ? DEFAULT_RULES : e.instructions)}</textarea><span class="hint">One instruction per line.</span></div>
        <div class="form-error full" id="exErr"></div>
      </form>`,
      foot: `${isNew ? '' : `<button class="btn btn-danger left" data-del>${icon('trash')} Delete</button>`}
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" data-save>${isNew ? 'Create exam' : 'Save changes'}</button>`,
      onMount(root, close) {
        const f = $('#exForm', root);
        const sched = $('#sched', root);
        $$('[data-name]', root).forEach((b) => b.addEventListener('click', () => {
          const yr = (f.startDate.value || UI.today()).slice(0, 4);
          f.name.value = `${b.dataset.name} ${yr}`;
          f.name.focus();
        }));
        const hint = () => {
          const d = f.duesDeadline.value;
          $('#feeHint', root).textContent = d
            ? `Fees up to ${UI.monthLabel(UI.monthOf(d), true)} must be paid by ${UI.fmtDate(d)} to get the admit card.`
            : 'Fees due up to this month must be paid to get the admit card.';
        };
        f.duesDeadline.addEventListener('input', hint); hint();
        f.startDate.addEventListener('change', () => { if (!f.duesDeadline.value) { f.duesDeadline.value = f.startDate.value; hint(); } });
        $('#allCourses', root).addEventListener('change', (ev) => { $('#coursePicks', root).hidden = ev.target.checked; });
        $('#addRow', root).addEventListener('click', () => { sched.insertAdjacentHTML('beforeend', row()); });
        sched.addEventListener('click', (ev) => { const b = ev.target.closest('[data-rm]'); if (b) b.closest('.sched-row').remove(); });

        const save = async () => {
          const err = $('#exErr', root);
          const name = f.name.value.trim(), startDate = f.startDate.value, endDate = f.endDate.value, duesDeadline = f.duesDeadline.value;
          if (!name || !startDate || !duesDeadline) { err.textContent = 'Please fill the exam name, start date and fee deadline.'; return; }
          if (endDate && endDate < startDate) { err.textContent = 'The end date is before the start date.'; return; }
          if (duesDeadline > startDate) { err.textContent = 'The fee deadline should be on or before the exam start date.'; return; }
          const all = $('#allCourses', root).checked;
          const courseIds = all ? [] : $$('input[name=courseId]:checked', root).map((c) => c.value);
          if (!all && !courseIds.length) { err.textContent = 'Choose at least one course, or tick “All courses”.'; return; }
          const schedule = $$('.sched-row', root).map((r) => ({
            subject: $('[name=subject]', r).value.trim(), date: $('[name=date]', r).value, time: $('[name=time]', r).value.trim()
          })).filter((r) => r.subject || r.date || r.time).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          const latest = existing ? Store.get('exams', existing.id) || existing : {};
          const saved = await Store.save('exams', {
            ...latest, name, startDate, endDate: endDate && endDate !== startDate ? endDate : '', duesDeadline, courseIds, schedule,
            reportingTime: f.reportingTime.value.trim(), venue: f.venue.value.trim(),
            rollPrefix: f.rollPrefix.value.trim() || latest.rollPrefix || rollPrefix(name, startDate),
            instructions: f.instructions.value.trim()
          });
          close();
          UI.toast(isNew ? 'Exam created' : 'Exam updated');
          if (isNew) App.go('exam/' + saved.id); else App.rerender();
        };
        $('[data-save]', root).addEventListener('click', save);
        f.addEventListener('submit', (ev) => { ev.preventDefault(); save(); });
        const del = $('[data-del]', root);
        if (del) del.addEventListener('click', async () => {
          const ok = await UI.confirmBox({ title: `Delete ${existing.name}?`, message: 'The exam, its roll numbers and permissions will be removed. Student fees and other records are not affected.' });
          if (!ok) return;
          await Store.remove('exams', existing.id);
          close();
          UI.toast('Exam deleted');
          App.go('exams');
        });
      }
    });
  }

  // ───────────── Exams list ─────────────
  window.Pages.exams = {
    title: 'Exams',
    render(el) {
      const exams = Store.all('exams').sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
      const order = { live: 0, ready: 1, fees: 2, done: 3 };
      exams.sort((a, b) => order[Logic.examPhase(a).key] - order[Logic.examPhase(b).key]);
      el.innerHTML = `
        <div class="page-head">
          <div><h1>Exams</h1><p class="sub">Exams, fee clearance and admit cards</p></div>
          <div class="page-actions"><button class="btn btn-primary" data-new>${icon('plus')} New exam</button></div>
        </div>
        ${exams.length ? `<div class="exam-grid">${exams.map((e) => {
          const ph = Logic.examPhase(e);
          const { c } = summary(e);
          const pct = c.total ? Math.round((c.eligible / c.total) * 100) : 0;
          return `<button class="card exam-card" data-id="${e.id}">
            <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px">
              <div class="exam-ic">${icon('exam')}</div>
              <span class="badge ${ph.cls}">${ph.label}</span>
            </div>
            <h3>${esc(e.name)}</h3>
            <div class="muted small">${dateRange(e)} · ${esc(courseNames(e))}</div>
            <div class="exam-meter"><div style="width:${pct}%"></div></div>
            <div class="row small" style="justify-content:space-between">
              <span><b>${c.eligible}</b> of ${c.total} eligible</span>
              ${ph.key === 'fees' ? `<span class="muted">Fees by ${UI.fmtDate(e.duesDeadline)}</span>` : c.due ? `<span style="color:var(--danger)">${c.due} with dues</span>` : '<span class="muted">All clear</span>'}
            </div>
          </button>`;
        }).join('')}</div>`
        : `<div class="card">${UI.empty('exam', 'No exams yet', 'Create an exam such as a Unit Test or Half Yearly Examination. Students who clear their fees by the deadline get an admit card.', `<button class="btn btn-primary" data-new>${icon('plus')} New exam</button>`)}</div>`}`;
      $$('[data-new]', el).forEach((b) => b.addEventListener('click', () => {
        if (!Store.all('courses').length) { UI.toast('Add a course first', 'error'); App.go('courses'); return; }
        examForm();
      }));
      $$('[data-id]', el).forEach((b) => b.addEventListener('click', () => App.go('exam/' + b.dataset.id)));
    }
  };

  // ───────────── One exam ─────────────
  const ef = { id: null, q: '', show: 'all' };

  function allowStudent(e, s, due) {
    UI.modal({
      title: `Allow ${s.name} to sit the exam?`, size: 'sm',
      body: `<p class="muted" style="margin:0 0 14px">${money(due)} is still due. Allowing gives ${esc(s.name)} an admit card for <b>${esc(e.name)}</b> without clearing the dues. The dues stay on their fee ledger.</p>
        <form id="alForm"><div class="field"><label>Reason (for your records)</label>
          <input class="input" name="note" placeholder="e.g. Will pay after the exam — parent called"></div></form>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>${icon('check')} Allow</button>`,
      onMount(root, close) {
        const go = async () => {
          const latest = Store.get('exams', e.id) || e;
          const permits = { ...(latest.permits || {}), [s.id]: { at: new Date().toISOString(), note: $('#alForm', root).note.value.trim(), due } };
          await Store.save('exams', { ...latest, permits });
          close();
          UI.toast(`${s.name} can now get the admit card`);
        };
        $('[data-ok]', root).addEventListener('click', go);
        $('#alForm', root).addEventListener('submit', (ev) => { ev.preventDefault(); go(); });
      }
    });
  }

  window.Pages.exam = {
    title: 'Exam',
    render(el, [id]) {
      const e = Store.get('exams', id);
      if (!e) { el.innerHTML = UI.empty('exam', 'Exam not found', 'It may have been deleted.', `<button class="btn" data-nav="exams">All exams</button>`); return; }
      if (ef.id !== id) { ef.id = id; ef.q = ''; ef.show = 'all'; }
      const ph = Logic.examPhase(e);
      const { list, c } = summary(e);
      const rolls = e.rolls || {};
      const q = ef.q.toLowerCase();
      const shown = list.filter(({ s, st }) => {
        if (ef.show === 'eligible' && !st.eligible) return false;
        if (ef.show === 'dues' && st.eligible) return false;
        if (ef.show === 'permitted' && st.state !== 'permitted') return false;
        return !q || [s.name, s.code, s.phone].join(' ').toLowerCase().includes(q);
      });
      const chips = [['all', 'All', c.total], ['eligible', 'Eligible', c.eligible], ['dues', 'Dues pending', c.due], ['permitted', 'Allowed', c.permitted]];
      const dl = deadlineText(e);

      el.innerHTML = `
        <button class="back-link" data-nav="exams">${icon('arrowLeft')} Exams</button>
        <div class="page-head">
          <div><div class="row-wrap"><h1>${esc(e.name)}</h1><span class="badge ${ph.cls}">${ph.label}</span></div>
            <p class="sub">${dateRange(e)} · ${esc(courseNames(e))}</p></div>
          <div class="page-actions">
            <button class="btn" data-edit>${icon('edit')} <span class="hide-sm">Edit</span></button>
            <button class="btn" data-csv>${icon('download')} <span class="hide-sm">CSV</span></button>
            <button class="btn btn-primary" data-print-all ${c.eligible ? '' : 'disabled'}>${icon('printer')} Admit cards (${c.eligible})</button>
          </div>
        </div>

        <div class="card exam-facts">
          <div><div class="l">Clear fees by</div><div class="v">${UI.fmtDate(e.duesDeadline)}${dl ? ` <span class="small ${dl === 'passed' ? 'muted' : ''}" style="${dl === 'passed' ? '' : 'color:var(--warning)'}">· ${dl}</span>` : ''}</div></div>
          <div><div class="l">Fees counted up to</div><div class="v">${UI.monthLabel(Logic.examFeeMonth(e), true)}</div></div>
          <div><div class="l">Reporting time</div><div class="v">${esc(e.reportingTime || '—')}</div></div>
          <div><div class="l">Papers</div><div class="v">${(e.schedule || []).length || '—'}</div></div>
        </div>

        <div class="kpis exam-kpis">
          <div class="card kpi"><div class="kpi-label">Students</div><div class="kpi-value">${c.total}</div><div class="kpi-sub">${esc(courseNames(e))}</div></div>
          <div class="card kpi"><div class="kpi-label">Fees cleared</div><div class="kpi-value" style="color:var(--success)">${c.cleared}</div><div class="kpi-sub">get admit cards</div></div>
          <div class="card kpi"><div class="kpi-label">Dues pending</div><div class="kpi-value" style="color:var(--danger)">${c.due}</div><div class="kpi-sub money">${money(c.dueAmt)} outstanding</div></div>
          <div class="card kpi"><div class="kpi-label">Allowed by institute</div><div class="kpi-value">${c.permitted}</div><div class="kpi-sub">admit card despite dues</div></div>
        </div>

        <div class="toolbar">
          <div class="input-group">${icon('search')}<input class="input" id="exSearch" placeholder="Search name, ID or phone" value="${esc(ef.q)}"></div>
        </div>
        <div class="chips" style="margin-bottom:16px">${chips.map(([k, t, n]) => `<button class="chip ${ef.show === k ? 'on' : ''}" data-show="${k}">${t} <span class="count">${n}</span></button>`).join('')}</div>

        <div class="card"><div class="list" id="exList">${shown.length ? shown.map(({ s, st }) => {
          const co = Logic.courseOf(s), b = Logic.batchOf(s);
          return `<div class="list-item exam-row" data-sid="${s.id}">
            ${UI.avatar(s.name, s.photo)}
            <div class="li-main">
              <div class="li-title">${esc(s.name)} <span class="faint small" style="font-weight:400">· ${esc(s.code || '')}${rolls[s.id] ? ` · Roll ${esc(rolls[s.id])}` : ''}</span></div>
              <div class="li-sub">${esc(co ? co.name : '')}${b ? ' · ' + esc(b.name) : ''}${st.permit && st.permit.note ? ` · <i>${esc(st.permit.note)}</i>` : ''}</div>
            </div>
            <div class="exam-row-end">
              <div class="exam-state">${stateBadge(st)}${st.due > 0 ? `<div class="small money" style="color:var(--danger);margin-top:3px">${money(st.due)} due</div>` : ''}</div>
              <div class="row-wrap exam-acts">
                ${st.eligible ? `<button class="btn btn-sm btn-primary" data-admit>${icon('file')} Admit card</button>` : ''}
                ${!st.eligible ? `<button class="btn btn-sm" data-collect>${icon('wallet')} Collect</button><button class="btn btn-sm" data-allow>${icon('check')} Allow</button>` : ''}
                ${st.state === 'permitted' ? `<button class="btn btn-sm btn-ghost" data-revoke>Remove</button>` : ''}
              </div>
            </div>
          </div>`;
        }).join('') : UI.empty('users', list.length ? 'No students here' : 'No students sit this exam', list.length ? 'Try a different filter.' : 'Active students of the chosen courses appear here.')}</div></div>
        <p class="muted small" style="margin-top:10px">Students qualify once fees up to ${UI.monthLabel(Logic.examFeeMonth(e), true)} are paid — collect the fee and the admit card is ready straight away. Use <b>Allow</b> to let a student sit the exam with dues.</p>`;

      $('[data-edit]', el).addEventListener('click', () => examForm(e));
      $('[data-print-all]', el).addEventListener('click', () => App.go('admit/' + e.id));
      $('#exSearch', el).addEventListener('input', (ev) => { ef.q = ev.target.value; this.render(el, [id]); const i = $('#exSearch', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
      $$('[data-show]', el).forEach((b) => b.addEventListener('click', () => { ef.show = b.dataset.show; this.render(el, [id]); }));
      $$('.exam-row', el).forEach((r) => {
        const s = Store.get('students', r.dataset.sid);
        const on = (sel, fn) => { const b = $(sel, r); if (b) b.addEventListener('click', fn); };
        on('[data-admit]', () => App.go(`admit/${e.id}/${s.id}`));
        on('[data-collect]', () => App.go('collect?s=' + s.id));
        on('[data-allow]', () => allowStudent(e, s, Logic.examStanding(e, s).due));
        on('[data-revoke]', async () => {
          if (!(await UI.confirmBox({ title: `Remove permission for ${s.name}?`, message: 'They will need to clear their dues to get the admit card.', okText: 'Remove' }))) return;
          const latest = Store.get('exams', e.id) || e;
          const permits = { ...(latest.permits || {}) };
          delete permits[s.id];
          await Store.save('exams', { ...latest, permits });
          UI.toast('Permission removed');
        });
      });
      $('[data-csv]', el).addEventListener('click', () => {
        const rows = [['Roll no', 'Student ID', 'Name', 'Course', 'Batch', 'Phone', 'Status', 'Due', 'Allowed note']];
        list.forEach(({ s, st }) => rows.push([rolls[s.id] || '', s.code, s.name, (Logic.courseOf(s) || {}).name, (Logic.batchOf(s) || {}).name, s.phone, STATE[st.state][0], st.due, st.permit ? st.permit.note || 'Yes' : '']));
        UI.download(`${e.name.replace(/\W+/g, '-')}-students.csv`, UI.csv(rows), 'text/csv');
      });
    }
  };

  // ───────────── Admit cards ─────────────
  function admitHtml(e, s, st, roll, inst) {
    const co = Logic.courseOf(s), b = Logic.batchOf(s);
    const rules = String(e.instructions == null ? DEFAULT_RULES : e.instructions).split('\n').map((x) => x.trim()).filter(Boolean);
    const sched = (e.schedule || []).filter((r) => r.subject || r.date);
    // [label, value, full width?, bold?] — half-width items pair up two to a row
    const info = [
      ['Roll No.', roll, false, true], ['Student ID', s.code, false],
      ['Name of candidate', s.name, true, true],
      ["Guardian's name", s.guardianName, false], ['Batch', b ? b.name + (b.time ? ' · ' + b.time : '') : '', false],
      ['Course', co ? co.name : '', true],
      ['Exam centre', e.venue || [inst.name, inst.address].filter(Boolean).join(', '), true],
      ['Reporting time', e.reportingTime, false], ['Exam date', dateRange(e), false]
    ].filter((r) => r[1]);
    const cell = ([k, v, full, bold]) => `<th>${esc(k)}</th><td class="${bold ? 'strong' : ''}"${full ? ' colspan="3"' : ''}>${esc(v)}</td>`;
    const infoRows = [];
    for (let i = 0; i < info.length; i++) {
      const a = info[i], next = info[i + 1];
      if (a[2]) infoRows.push(cell(a));
      else if (next && !next[2]) { infoRows.push(cell(a) + cell(next)); i++; }
      else infoRows.push(cell([a[0], a[1], true, a[3]]));
    }
    const fee = st.state === 'cleared'
      ? `<span class="ad-ok">${icon('checkCircle')} Fees cleared up to ${UI.monthLabel(Logic.examFeeMonth(e), true)}</span>`
      : `<span class="ad-perm">${icon('check')} Permitted by the institute</span>`;
    return `<article class="admit">
      <header class="ad-head">
        <div class="ad-logo">${inst.logo ? `<img src="${esc(inst.logo)}" alt="">` : esc(UI.initials(inst.name))}</div>
        <div class="ad-inst">
          <h2>${esc(inst.name)}</h2>
          ${inst.tagline ? `<div>${esc(inst.tagline)}</div>` : ''}
          <div>${esc([inst.address, inst.phone].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="ad-title"><span>ADMIT CARD</span><b>${esc(e.name)}</b><small>${dateRange(e)}</small></div>
      </header>
      <div class="ad-body">
        <table class="ad-info"><tbody>${infoRows.map((r) => `<tr>${r}</tr>`).join('')}</tbody></table>
        <div class="ad-side">
          <div class="ad-photo">${s.photo ? `<img src="${esc(s.photo)}" alt="">` : '<span>Affix recent<br>photograph</span>'}</div>
          <div class="ad-qr" data-qr="${esc(Logic.profileUrl(s) || Logic.cardValue(s))}"></div>
          <div class="ad-qr-cap">Scan to verify</div>
        </div>
      </div>
      ${sched.length ? `<table class="ad-sched"><thead><tr><th>Date</th><th>Day</th><th>Time</th><th>Subject / paper</th><th class="ad-inv">Invigilator</th></tr></thead>
        <tbody>${sched.map((r) => `<tr><td>${r.date ? UI.fmtDate(r.date) : ''}</td><td>${r.date ? UI.weekday(r.date).slice(0, 3) : ''}</td><td>${esc(r.time)}</td><td>${esc(r.subject)}</td><td class="ad-inv"></td></tr>`).join('')}</tbody></table>` : ''}
      <div class="ad-foot">
        <div class="ad-rules">${fee}<ol>${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></div>
        <div class="ad-signs">
          <div class="ad-sign"><div class="ad-sig"></div><span>Candidate's signature</span></div>
          <div class="ad-sign"><div class="ad-sig">${inst.idSignature ? `<img src="${esc(inst.idSignature)}" alt="">` : ''}</div><span>Controller of Examinations</span></div>
        </div>
      </div>
      <div class="ad-issued">Issued on ${UI.fmtDate(UI.today())} · Admit card ${esc(roll)}</div>
    </article>`;
  }

  window.Pages.admit = {
    title: 'Admit card',
    render(el, [examId, sid]) {
      const e = Store.get('exams', examId);
      if (!e) { el.innerHTML = UI.empty('exam', 'Exam not found', 'It may have been deleted.', `<button class="btn" data-nav="exams">All exams</button>`); return; }
      const inst = Store.settings();
      const back = `<button class="back-link" style="margin:0" data-nav="exam/${e.id}">${icon('arrowLeft')} ${esc(e.name)}</button>`;
      let people;
      if (sid) {
        const s = Store.get('students', sid);
        if (!s) { el.innerHTML = UI.empty('user', 'Student not found', '', `<button class="btn" data-nav="exam/${e.id}">Back to exam</button>`); return; }
        const st = Logic.examStanding(e, s);
        if (!st.eligible) {
          el.innerHTML = `<div class="no-print" style="margin-bottom:16px">${back}</div>
            <div class="card card-body" style="max-width:560px">
              <div class="row" style="align-items:flex-start;gap:14px">
                <div class="avatar lg" style="background:var(--danger-bg);color:var(--danger)">${icon('lock')}</div>
                <div class="li-main"><h3>Admit card on hold</h3>
                  <p class="muted" style="margin:6px 0 16px">${esc(s.name)} has <b style="color:var(--danger)">${money(st.due)}</b> due (fees up to ${UI.monthLabel(Logic.examFeeMonth(e), true)}). The admit card is issued once the dues are cleared, or if the institute allows it.</p>
                  <div class="row-wrap"><button class="btn btn-primary" data-collect>${icon('wallet')} Collect fee</button><button class="btn" data-allow>${icon('check')} Allow anyway</button></div></div>
              </div>
            </div>`;
          $('[data-collect]', el).addEventListener('click', () => App.go('collect?s=' + s.id));
          $('[data-allow]', el).addEventListener('click', () => allowStudent(e, s, st.due));
          return;
        }
        people = [{ s, st }];
      } else {
        people = summary(e).list.filter(({ st }) => st.eligible)
          .sort((a, b) => String(a.s.code || '').localeCompare(String(b.s.code || ''), undefined, { numeric: true }));
      }

      // Give roll numbers to anyone who doesn't have one yet (saved on the exam)
      const plan = Logic.planRolls(e, people.map((p) => p.s));
      if (plan.changed) Store.save('exams', { ...(Store.get('exams', e.id) || e), rolls: plan.rolls });

      el.innerHTML = `
        <div class="no-print row" style="justify-content:space-between;flex-wrap:wrap;margin-bottom:16px;gap:10px">
          ${back}
          <div class="page-actions">
            <span class="muted small" style="align-self:center">${people.length} admit card${people.length === 1 ? '' : 's'} · 2 per A4 page</span>
            <button class="btn btn-primary" data-print ${people.length ? '' : 'disabled'}>${icon('printer')} Print / Save PDF</button>
          </div>
        </div>
        ${people.length ? `<div class="admit-sheet" style="--ad:${esc(/^#[0-9a-f]{6}$/i.test(inst.idColor || '') ? inst.idColor : IDCard.DEFAULT_COLOR)}">
          ${people.map(({ s, st }) => admitHtml(e, s, st, plan.rolls[s.id], inst)).join('')}</div>`
        : `<div class="card">${UI.empty('file', 'No admit cards yet', 'Students appear here once their fees are cleared or the institute allows them.')}</div>`}`;

      $('[data-print]', el).addEventListener('click', () => window.print());
      // QR codes (the library loads on first use)
      const boxes = $$('.ad-qr[data-qr]', el);
      if (boxes.length) {
        Promise.all(boxes.map((b) => IDCard.qrSvg(b.dataset.qr).then((svg) => { b.innerHTML = svg; })))
          .catch(() => boxes.forEach((b) => { b.parentElement.querySelector('.ad-qr-cap').hidden = true; b.hidden = true; }));
      }
    }
  };
})();

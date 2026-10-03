/* Attendance: daily marking per batch + monthly register. */
window.Pages = window.Pages || {};
(function () {
  const { icon, esc, $, $$ } = UI;

  const state = { view: 'mark', date: UI.today(), batchId: '', month: UI.thisMonth(), recs: {}, loadedKey: '' };

  function pickBatch(query) {
    const batches = Store.all('batches');
    const q = query && query.get('b');
    if (q && batches.some((b) => b.id === q)) state.batchId = q;
    if (!batches.some((b) => b.id === state.batchId)) state.batchId = batches.length ? sortBatches(batches)[0].id : '';
  }
  const sortBatches = (list) => list.slice().sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.name.localeCompare(b.name));

  function loadRecs() {
    const key = state.date + '_' + state.batchId;
    if (state.loadedKey === key && App.dirty) return;
    const rec = Logic.attendanceFor(state.date, state.batchId);
    state.recs = rec ? { ...rec.records } : {};
    state.loadedKey = key;
  }

  async function switchTo(patch, el) {
    if (App.dirty && !(await UI.confirmBox({ title: 'Discard changes?', message: 'Attendance you marked has not been saved yet.', okText: 'Discard' }))) return;
    App.dirty = false;
    Object.assign(state, patch);
    Pages.attendance.render(el);
  }

  window.Pages.attendance = {
    title: 'Attendance',
    render(el, _p, query) {
      if (query) pickBatch(query); else pickBatch();
      const batches = sortBatches(Store.all('batches'));
      if (!batches.length) {
        el.innerHTML = `<div class="page-head"><div><h1>Attendance</h1></div></div>
          <div class="card">${UI.empty('layers', 'No batches yet', 'Create a batch (e.g. "Morning 8–9 AM") and assign students to it to take attendance.', `<button class="btn btn-primary" data-nav="courses">${icon('plus')} Create batch</button>`)}</div>`;
        return;
      }

      el.innerHTML = `
        <div class="page-head">
          <div><h1>Attendance</h1><p class="sub">${state.view === 'mark' ? `${UI.weekday(state.date)}, ${UI.fmtDate(state.date)}` : UI.monthLabel(state.month, true)}</p></div>
          <div class="seg"><button class="${state.view === 'mark' ? 'on' : ''}" data-view="mark">Mark</button><button class="${state.view === 'register' ? 'on' : ''}" data-view="register">Register</button></div>
        </div>
        <div class="toolbar">
          ${state.view === 'mark'
            ? `<input class="input" type="date" id="attDate" value="${state.date}" max="${UI.today()}" style="width:auto">`
            : `<div class="row" style="gap:4px"><button class="icon-btn" data-m="-1">${icon('chevronLeft')}</button>
                <input class="input" type="month" id="attMonth" value="${state.month}" style="width:auto"><button class="icon-btn" data-m="1">${icon('chevronRight')}</button></div>`}
        </div>
        <div class="chips" style="margin-bottom:16px">
          ${batches.map((b) => `<button class="chip ${b.id === state.batchId ? 'on' : ''}" data-batch="${b.id}">${esc(b.name)}${b.time ? ` <span class="count">${esc(b.time)}</span>` : ''}</button>`).join('')}
        </div>
        <div id="attBody"></div>`;

      $$('[data-view]', el).forEach((b) => b.addEventListener('click', () => switchTo({ view: b.dataset.view }, el)));
      $$('[data-batch]', el).forEach((b) => b.addEventListener('click', () => switchTo({ batchId: b.dataset.batch }, el)));
      const dateIn = $('#attDate', el);
      if (dateIn) dateIn.addEventListener('change', () => { if (dateIn.value) switchTo({ date: dateIn.value }, el); });
      const monthIn = $('#attMonth', el);
      if (monthIn) monthIn.addEventListener('change', () => { if (monthIn.value) { state.month = monthIn.value; this.render(el); } });
      $$('[data-m]', el).forEach((b) => b.addEventListener('click', () => { state.month = UI.addMonths(state.month, Number(b.dataset.m)); this.render(el); }));

      if (state.view === 'mark') this.renderMark($('#attBody', el), el);
      else this.renderRegister($('#attBody', el));
    },

    renderMark(body, el) {
      loadRecs();
      const batch = Store.get('batches', state.batchId);
      const list = Logic.studentsInBatch(state.batchId);
      const existing = Logic.attendanceFor(state.date, state.batchId);

      if (!list.length) {
        body.innerHTML = `<div class="card">${UI.empty('users', 'No students in this batch', 'Assign students to this batch from their profile.', `<button class="btn" data-nav="students">Go to students</button>`)}</div>`;
        return;
      }

      const summary = () => {
        const c = { P: 0, A: 0, L: 0 };
        list.forEach((s) => { const st = state.recs[s.id]; if (c[st] != null) c[st]++; });
        const un = list.length - c.P - c.A - c.L;
        return `<span class="badge badge-success">${c.P} present</span><span class="badge badge-danger">${c.A} absent</span><span class="badge badge-warning">${c.L} late</span>${un ? `<span class="badge">${un} unmarked</span>` : ''}`;
      };

      body.innerHTML = `
        <div class="card">
          <div class="card-head" style="flex-wrap:wrap">
            <div><h3>${esc(batch.name)}</h3><div class="muted small">${esc(batch.time || '')}${batch.time ? ' · ' : ''}${list.length} students</div></div>
            <div class="row-wrap"><button class="btn btn-sm" data-all="P">${icon('check')} All present</button><button class="btn btn-sm btn-ghost" data-all="">Clear</button></div>
          </div>
          <div class="list">
            ${list.map((s) => `<div class="att-row" data-sid="${s.id}">
              ${UI.avatar(s.name, s.photo, 'sm')}
              <div class="li-main"><div class="li-title">${esc(s.name)}</div><div class="li-sub">${esc(s.code || '')}</div></div>
              <div class="att-toggle">${['P', 'A', 'L'].map((k) => `<button class="${k} ${state.recs[s.id] === k ? 'on' : ''}" data-st="${k}" aria-label="${{ P: 'Present', A: 'Absent', L: 'Late' }[k]}">${k}</button>`).join('')}</div>
            </div>`).join('')}
          </div>
        </div>
        <div class="sticky-bar">
          <div class="li-main row-wrap" id="attSummary">${summary()}</div>
          <span class="muted small hide-sm" id="attState">${App.dirty ? 'Unsaved changes' : existing ? 'Saved' : 'Not saved yet'}</span>
          <button class="btn btn-primary" id="attSave">${icon('check')} Save</button>
        </div>`;

      const refresh = () => {
        $$('.att-row', body).forEach((r) => $$('button', r).forEach((b) => b.classList.toggle('on', state.recs[r.dataset.sid] === b.dataset.st)));
        $('#attSummary', body).innerHTML = summary();
        $('#attState', body).textContent = App.dirty ? 'Unsaved changes' : 'Saved';
      };
      $$('.att-row', body).forEach((r) => $$('button', r).forEach((b) => b.addEventListener('click', () => {
        const sid = r.dataset.sid;
        state.recs[sid] = state.recs[sid] === b.dataset.st ? undefined : b.dataset.st;
        if (!state.recs[sid]) delete state.recs[sid];
        App.dirty = true;
        refresh();
      })));
      $$('[data-all]', body).forEach((b) => b.addEventListener('click', () => {
        state.recs = {};
        if (b.dataset.all) list.forEach((s) => (state.recs[s.id] = b.dataset.all));
        App.dirty = true;
        refresh();
      }));
      $('#attSave', body).addEventListener('click', async () => {
        const records = {};
        list.forEach((s) => { if (state.recs[s.id]) records[s.id] = state.recs[s.id]; });
        const id = Logic.attId(state.date, state.batchId);
        if (!Object.keys(records).length) {
          if (existing) await Store.remove('attendance', id);
          App.dirty = false;
          UI.toast('Attendance cleared');
          return;
        }
        await Store.save('attendance', { ...(existing || {}), id, date: state.date, batchId: state.batchId, records });
        App.dirty = false;
        UI.toast(`Attendance saved · ${Object.keys(records).length}/${list.length} marked`);
        Pages.attendance.render(el);
      });
    },

    renderRegister(body) {
      const list = Logic.studentsInBatch(state.batchId);
      const days = UI.daysInMonth(state.month);
      const recs = Store.all('attendance').filter((a) => a.batchId === state.batchId && UI.monthOf(a.date) === state.month);
      const byDate = {}; recs.forEach((a) => (byDate[a.date] = a.records || {}));
      const iso = (d) => `${state.month}-${String(d).padStart(2, '0')}`;
      const classDays = Object.keys(byDate).length;

      if (!list.length) { body.innerHTML = `<div class="card">${UI.empty('users', 'No students in this batch', 'Assign students to this batch first.')}</div>`; return; }

      const rows = list.map((s) => {
        let p = 0, t = 0;
        const cells = Array.from({ length: days }, (_, i) => {
          const st = (byDate[iso(i + 1)] || {})[s.id];
          if (st) { t++; if (st === 'P' || st === 'L') p++; }
          return `<td>${st ? `<span class="cell ${st}">${st}</span>` : `<span class="cell none">${byDate[iso(i + 1)] ? '–' : ''}</span>`}</td>`;
        }).join('');
        const pct = t ? Math.round((p / t) * 100) : null;
        return { s, cells, pct, p, t };
      });

      body.innerHTML = `
        <div class="card">
          <div class="card-head"><div><h3>Monthly register</h3><div class="muted small">${classDays} class day${classDays === 1 ? '' : 's'} recorded</div></div>
            <button class="btn btn-sm" id="regCsv">${icon('download')} CSV</button></div>
          <div class="table-wrap">
            <table class="register">
              <thead><tr><th class="name">Student</th>${Array.from({ length: days }, (_, i) => {
                const dow = new Date(iso(i + 1) + 'T00:00:00').getDay();
                return `<th style="${dow === 0 ? 'color:var(--faint)' : ''}">${i + 1}</th>`;
              }).join('')}<th class="pct">%</th></tr></thead>
              <tbody>${rows.map((r) => `<tr><td class="name">${esc(r.s.name)}</td>${r.cells}<td class="pct" style="${r.pct != null && r.pct < 75 ? 'color:var(--danger)' : ''}">${r.pct == null ? '—' : r.pct + '%'}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
        <p class="muted small" style="margin-top:10px">P = present · A = absent · L = late (counted as present). Below 75% is highlighted.</p>`;

      $('#regCsv', body).addEventListener('click', () => {
        const head = ['Student', 'ID', ...Array.from({ length: days }, (_, i) => i + 1), 'Present', 'Total', '%'];
        const out = [head, ...rows.map((r) => [r.s.name, r.s.code, ...Array.from({ length: days }, (_, i) => (byDate[iso(i + 1)] || {})[r.s.id] || ''), r.p, r.t, r.pct == null ? '' : r.pct])];
        const b = Store.get('batches', state.batchId);
        UI.download(`attendance-${(b && b.name || 'batch').replace(/\W+/g, '-')}-${state.month}.csv`, UI.csv(out), 'text/csv');
      });
    }
  };
})();

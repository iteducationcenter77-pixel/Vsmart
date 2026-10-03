/* Setup pages: courses & batches, expenses, settings (profile, theme, password, backup). */
window.Pages = window.Pages || {};
(function () {
  const { icon, esc, money, $, $$ } = UI;

  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });

  const activeCount = (field, id) => Logic.activeStudents().filter((s) => s[field] === id).length;
  const anyCount = (field, id) => Store.all('students').filter((s) => s[field] === id).length;
  const cur = () => esc(Store.settings().currency);


  // ───────────── Courses & batches ─────────────
  function courseForm(c) {
    const isNew = !c;
    c = c || { durationMonths: 6 };
    UI.modal({
      title: isNew ? 'New course' : 'Edit course', size: 'sm',
      body: `<form id="cf" class="stack">
        <div class="field"><label class="req">Course name</label><input class="input" name="name" value="${esc(c.name || '')}" placeholder="e.g. DCA, Tally Prime, Python" required></div>
        <div class="form-grid">
          <div class="field"><label>Monthly fee</label><div class="input-prefix"><span>${cur()}</span><input class="input" type="number" min="0" name="monthlyFee" value="${c.monthlyFee || ''}"></div></div>
          <div class="field"><label>Admission fee</label><div class="input-prefix"><span>${cur()}</span><input class="input" type="number" min="0" name="admissionFee" value="${c.admissionFee || ''}"></div></div>
          <div class="field full"><label>Duration (months)</label><input class="input" type="number" min="0" name="durationMonths" value="${c.durationMonths || 0}"><span class="hint">Monthly fees stop after this many months. Use 0 for no fixed end.</span></div>
        </div>
        <div class="field"><label>Description</label><textarea class="textarea" name="description" rows="2">${esc(c.description || '')}</textarea></div>
        <div class="form-error" id="cfErr"></div></form>`,
      foot: `${isNew ? '' : `<button class="btn btn-danger left" data-del>${icon('trash')}</button>`}<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-save>${isNew ? 'Add course' : 'Save'}</button>`,
      onMount(root, close) {
        const f = $('#cf', root);
        const save = async () => {
          const d = UI.formData(f);
          if (!d.name) { $('#cfErr', root).textContent = 'Course name is required.'; return; }
          await Store.save('courses', { ...c, ...d });
          close(); UI.toast(isNew ? 'Course added' : 'Course updated');
        };
        $('[data-save]', root).addEventListener('click', save);
        f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
        const del = $('[data-del]', root);
        if (del) del.addEventListener('click', async () => {
          const n = anyCount('courseId', c.id);
          if (n) { UI.toast(`${n} student(s) are in this course — move them first`, 'error'); return; }
          if (!(await UI.confirmBox({ title: `Delete ${c.name}?`, message: 'This cannot be undone.' }))) return;
          await Store.remove('courses', c.id); close(); UI.toast('Course deleted');
        });
      }
    });
  }

  function batchForm(b) {
    const isNew = !b;
    b = b || {};
    const courses = Store.all('courses').sort((x, y) => x.name.localeCompare(y.name));
    UI.modal({
      title: isNew ? 'New batch' : 'Edit batch', size: 'sm',
      body: `<form id="bf" class="stack">
        <div class="field"><label class="req">Batch name</label><input class="input" name="name" value="${esc(b.name || '')}" placeholder="e.g. Morning A" required></div>
        <div class="field"><label>Timing</label><input class="input" name="time" value="${esc(b.time || '')}" placeholder="e.g. 8:00 – 9:00 AM"></div>
        <div class="field"><label>Course</label><select class="select" name="courseId"><option value="">Any course</option>
          ${courses.map((c) => `<option value="${c.id}" ${c.id === b.courseId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="form-grid">
          <div class="field"><label>Days</label><input class="input" name="days" value="${esc(b.days || '')}" placeholder="Mon – Sat"></div>
          <div class="field"><label>Instructor</label><input class="input" name="instructor" value="${esc(b.instructor || '')}"></div>
        </div>
        <div class="form-error" id="bfErr"></div></form>`,
      foot: `${isNew ? '' : `<button class="btn btn-danger left" data-del>${icon('trash')}</button>`}<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-save>${isNew ? 'Add batch' : 'Save'}</button>`,
      onMount(root, close) {
        const f = $('#bf', root);
        const save = async () => {
          const d = UI.formData(f);
          if (!d.name) { $('#bfErr', root).textContent = 'Batch name is required.'; return; }
          await Store.save('batches', { ...b, ...d });
          close(); UI.toast(isNew ? 'Batch added' : 'Batch updated');
        };
        $('[data-save]', root).addEventListener('click', save);
        f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
        const del = $('[data-del]', root);
        if (del) del.addEventListener('click', async () => {
          const n = anyCount('batchId', b.id);
          if (n) { UI.toast(`${n} student(s) are in this batch — move them first`, 'error'); return; }
          if (!(await UI.confirmBox({ title: `Delete ${b.name}?`, message: 'Past attendance for this batch stays in the records.' }))) return;
          await Store.remove('batches', b.id); close(); UI.toast('Batch deleted');
        });
      }
    });
  }

  window.Pages.courses = {
    title: 'Courses & Batches',
    render(el) {
      const courses = Store.all('courses').sort((a, b) => a.name.localeCompare(b.name));
      const batches = Store.all('batches').sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.name.localeCompare(b.name));
      el.innerHTML = `
        <div class="page-head">
          <div><h1>Courses & Batches</h1><p class="sub">Set fees per course and group students into timed batches</p></div>
          <div class="page-actions"><button class="btn" data-nb>${icon('plus')} Batch</button><button class="btn btn-primary" data-nc>${icon('plus')} Course</button></div>
        </div>
        <div class="two-col-even">
          <div class="card">
            <div class="card-head"><h3>Courses</h3><span class="muted small">${courses.length}</span></div>
            <div class="list">${courses.length ? courses.map((c) => `
              <div class="list-item clickable" data-c="${c.id}">
                <div class="avatar" style="border-radius:10px">${icon('book')}</div>
                <div class="li-main"><div class="li-title">${esc(c.name)}</div>
                  <div class="li-sub">${Number(c.durationMonths) ? c.durationMonths + ' months' : 'No fixed duration'} · Admission ${money(c.admissionFee)} · ${activeCount('courseId', c.id)} active</div></div>
                <div class="li-end"><div class="strong money">${money(c.monthlyFee)}</div><div class="small muted">per month</div></div>
              </div>`).join('') : UI.empty('book', 'No courses yet', 'Add courses like DCA, Tally or Python with their fees.', `<button class="btn btn-primary" data-nc>${icon('plus')} Add course</button>`)}</div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Batches</h3><span class="muted small">${batches.length}</span></div>
            <div class="list">${batches.length ? batches.map((b) => {
              const c = Store.get('courses', b.courseId);
              return `<div class="list-item clickable" data-b="${b.id}">
                <div class="avatar" style="border-radius:10px">${icon('clock')}</div>
                <div class="li-main"><div class="li-title">${esc(b.name)}</div>
                  <div class="li-sub">${esc(c ? c.name : 'Any course')}${b.days ? ' · ' + esc(b.days) : ''}${b.instructor ? ' · ' + esc(b.instructor) : ''}</div></div>
                <div class="li-end"><div class="strong">${esc(b.time || '—')}</div><div class="small muted">${activeCount('batchId', b.id)} students</div></div>
              </div>`;
            }).join('') : UI.empty('clock', 'No batches yet', 'Create batches by timing to take attendance.', `<button class="btn" data-nb>${icon('plus')} Add batch</button>`)}</div>
          </div>
        </div>`;
      $$('[data-nc]', el).forEach((b) => b.addEventListener('click', () => courseForm()));
      $$('[data-nb]', el).forEach((b) => b.addEventListener('click', () => batchForm()));
      $$('[data-c]', el).forEach((r) => r.addEventListener('click', () => courseForm(Store.get('courses', r.dataset.c))));
      $$('[data-b]', el).forEach((r) => r.addEventListener('click', () => batchForm(Store.get('batches', r.dataset.b))));
    }
  };

  // ───────────── Expenses ─────────────
  const CATS = ['Rent', 'Salary', 'Electricity', 'Internet', 'Maintenance', 'Marketing', 'Stationery', 'Other'];
  const es = { month: UI.thisMonth() };

  function expenseForm(x) {
    const isNew = !x;
    x = x || { date: UI.today(), category: 'Rent' };
    UI.modal({
      title: isNew ? 'Add expense' : 'Edit expense', size: 'sm',
      body: `<form id="xf" class="form-grid">
        <div class="field"><label class="req">Date</label><input class="input" type="date" name="date" value="${esc(x.date)}" required></div>
        <div class="field"><label class="req">Amount</label><div class="input-prefix"><span>${cur()}</span><input class="input" type="number" min="0" name="amount" value="${x.amount || ''}" required></div></div>
        <div class="field full"><label>Category</label><select class="select" name="category">${CATS.map((c) => `<option ${x.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field full"><label>Paid to / note</label><input class="input" name="note" value="${esc(x.note || '')}" placeholder="e.g. Shop rent for September"></div>
        <div class="form-error full" id="xfErr"></div></form>`,
      foot: `${isNew ? '' : `<button class="btn btn-danger left" data-del>${icon('trash')}</button>`}<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-save>${isNew ? 'Add expense' : 'Save'}</button>`,
      onMount(root, close) {
        const f = $('#xf', root);
        const save = async () => {
          const d = UI.formData(f);
          if (!d.date || !d.amount) { $('#xfErr', root).textContent = 'Date and amount are required.'; return; }
          await Store.save('expenses', { ...x, ...d });
          close(); UI.toast(isNew ? 'Expense added' : 'Expense updated');
        };
        $('[data-save]', root).addEventListener('click', save);
        f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
        const del = $('[data-del]', root);
        if (del) del.addEventListener('click', async () => {
          if (!(await UI.confirmBox({ title: 'Delete expense?', message: 'This cannot be undone.' }))) return;
          await Store.remove('expenses', x.id); close(); UI.toast('Expense deleted');
        });
      }
    });
  }

  window.Pages.expenses = {
    title: 'Expenses',
    render(el) {
      const list = Store.all('expenses').filter((x) => UI.monthOf(x.date) === es.month).sort(Logic.byDateDesc);
      const total = list.reduce((a, x) => a + (Number(x.amount) || 0), 0);
      const fees = Logic.collectedIn(es.month);
      const byCat = CATS.map((c) => [c, list.filter((x) => x.category === c).reduce((a, x) => a + (Number(x.amount) || 0), 0)]).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
      el.innerHTML = `
        <div class="page-head">
          <div><h1>Expenses</h1><p class="sub">${UI.monthLabel(es.month, true)}</p></div>
          <div class="page-actions">
            <div class="row" style="gap:4px"><button class="icon-btn" data-m="-1">${icon('chevronLeft')}</button>
              <input class="input" type="month" id="exMonth" value="${es.month}" style="width:auto"><button class="icon-btn" data-m="1">${icon('chevronRight')}</button></div>
            <button class="btn btn-primary" data-add>${icon('plus')} Add expense</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:16px"><div class="stat-strip" style="border-top:0;grid-template-columns:repeat(3,minmax(0,1fr))">
          <div><div class="v money">${money(fees)}</div><div class="l">Fees collected</div></div>
          <div><div class="v money">${money(total)}</div><div class="l">Expenses</div></div>
          <div style="border-bottom:0"><div class="v money" style="color:${fees - total >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(fees - total)}</div><div class="l">Net</div></div>
        </div></div>
        ${byCat.length ? `<div class="row-wrap" style="margin-bottom:16px">${byCat.map(([c, v]) => `<span class="badge plain">${c}: <b class="money">${money(v)}</b></span>`).join('')}</div>` : ''}
        <div class="card"><div class="list">${list.length ? list.map((x) => `
          <div class="list-item clickable" data-id="${x.id}">
            <div class="avatar" style="border-radius:10px;background:var(--surface-2);color:var(--text-2)">${icon('expense')}</div>
            <div class="li-main"><div class="li-title">${esc(x.category)}</div><div class="li-sub">${UI.fmtDate(x.date)}${x.note ? ' · ' + esc(x.note) : ''}</div></div>
            <div class="li-end strong money">${money(x.amount)}</div></div>`).join('')
          : UI.empty('expense', 'No expenses this month', 'Track rent, salaries and bills to see your real profit.', `<button class="btn" data-add>${icon('plus')} Add expense</button>`)}</div></div>`;
      $$('[data-add]', el).forEach((b) => b.addEventListener('click', () => expenseForm()));
      $$('[data-id]', el).forEach((r) => r.addEventListener('click', () => expenseForm(Store.get('expenses', r.dataset.id))));
      $$('[data-m]', el).forEach((b) => b.addEventListener('click', () => { es.month = UI.addMonths(es.month, Number(b.dataset.m)); this.render(el); }));
      $('#exMonth', el).addEventListener('change', (e) => { if (e.target.value) { es.month = e.target.value; this.render(el); } });
    }
  };

  // ───────────── Settings ─────────────
  window.Pages.settings = {
    title: 'Settings',
    render(el) {
      const s = Store.settings();
      const cloud = Store.mode === 'cloud';
      const theme = App.getTheme();
      const standalone = window.matchMedia('(display-mode: standalone)').matches;
      const fld = (name, label, extra = '') => `<div class="field ${extra}"><label>${label}</label><input class="input" name="${name}" value="${esc(s[name] || '')}"></div>`;

      el.innerHTML = `
        <div class="page-head"><div><h1>Settings</h1><p class="sub">Institute profile, security and data</p></div></div>
        <div class="stack" style="max-width:820px">
          <div class="card">
            <div class="card-head"><h3>Institute profile</h3><span class="muted small">Shown on receipts</span></div>
            <form id="profForm" class="card-body form-grid">
              <div class="field full"><label>Logo</label>
                <div class="logo-row">
                  <div class="logo-preview ${s.logo ? 'has-logo' : ''}" id="logoPreview">${s.logo ? `<img src="${esc(s.logo)}" alt="Institute logo">` : esc(UI.initials(s.name))}</div>
                  <div class="stack" style="gap:8px">
                    <div class="row-wrap">
                      <label class="btn btn-sm" style="cursor:pointer">${icon('upload')} ${s.logo ? 'Change logo' : 'Upload logo'}
                        <input type="file" id="logoIn" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
                      ${s.logo ? `<button type="button" class="btn btn-sm btn-ghost" id="logoRm">Remove</button>` : ''}
                    </div>
                    <span class="hint">PNG or JPG, square works best. Printed on fee receipts and shown in the app.</span>
                  </div>
                </div>
              </div>
              ${fld('name', 'Institute name', 'full')}${fld('tagline', 'Tagline', 'full')}${fld('address', 'Address', 'full')}
              ${fld('phone', 'Phone')}${fld('email', 'Email')}
              ${fld('receiptPrefix', 'Receipt number prefix')}${fld('studentPrefix', 'Student ID prefix')}
              ${fld('currency', 'Currency symbol')}
              <div class="field full"><label>Receipt footer note</label><textarea class="textarea" name="receiptNote" rows="2">${esc(s.receiptNote || '')}</textarea></div>
            </form>
            <div class="card-foot row" style="justify-content:flex-end"><button class="btn btn-primary" id="profSave">Save profile</button></div>
          </div>

          <div class="card card-body row" style="flex-wrap:wrap">
            <div class="li-main"><div class="strong">Appearance</div><div class="muted small">Saved on this device</div></div>
            <div class="seg" id="themeSeg">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, t]) => `<button class="${theme === k ? 'on' : ''}" data-theme="${k}">${t}</button>`).join('')}</div>
          </div>

          <div class="card">
            <div class="card-head"><h3>Change admin password</h3>${cloud ? `<span class="muted small">${esc(Store.userEmail())}</span>` : ''}</div>
            <form id="pwForm" class="card-body form-grid">
              <div class="field full"><label>Current password</label><input class="input" type="password" name="old" autocomplete="current-password"></div>
              <div class="field"><label>New password</label><input class="input" type="password" name="pw" autocomplete="new-password"></div>
              <div class="field"><label>Confirm new password</label><input class="input" type="password" name="pw2" autocomplete="new-password"></div>
              <div class="form-error full" id="pwErr"></div>
            </form>
            <div class="card-foot row" style="justify-content:flex-end"><button class="btn" id="pwSave">${icon('lock')} Update password</button></div>
          </div>

          <div class="card">
            <div class="card-head"><h3>Data & sync</h3>
              ${cloud ? '<span class="badge badge-success">Cloud sync on</span>' : '<span class="badge badge-warning">Local mode</span>'}</div>
            <div class="card-body stack">
              <p class="muted">${cloud
                ? 'Your data is stored in your Supabase database and syncs across every device you log in from. It keeps working offline and uploads changes when you are back online.'
                : 'Data is saved only in this browser on this device. To use the same data on your phone and computer, add your Supabase keys to js/config.js (see README.md). Download a backup regularly.'}</p>
              <div class="row-wrap">
                <button class="btn" id="bkDown">${icon('download')} Download backup</button>
                <label class="btn" style="cursor:pointer">${icon('upload')} Restore backup<input type="file" id="bkUp" accept=".json,application/json" hidden></label>
              </div>
              <p class="muted small">${Store.all('students').length} students · ${Store.all('payments').length} payments · ${Store.all('attendance').length} attendance sheets</p>
            </div>
          </div>

          ${standalone ? '' : `<div class="card card-body row" style="flex-wrap:wrap">
            <div class="avatar" style="border-radius:10px">${icon('device')}</div>
            <div class="li-main" style="min-width:200px"><div class="strong">Install as an app</div>
              <div class="muted small">${installEvt ? 'Add it to your home screen for a full-screen app experience.' : 'On Android: open this site in Chrome → ⋮ menu → "Install app" / "Add to Home screen".'}</div></div>
            ${installEvt ? `<button class="btn btn-primary" id="installBtn">Install</button>` : ''}
          </div>`}

          <div class="card card-body row" style="flex-wrap:wrap">
            <div class="li-main"><div class="strong">Log out</div><div class="muted small">Lock the admin panel on this device</div></div>
            <button class="btn btn-danger" data-action="logout">${icon('logout')} Log out</button>
          </div>
        </div>`;

      const pf = $('#profForm', el);
      pf.addEventListener('input', (e) => { if (e.target.type !== 'file') App.dirty = true; });

      $('#logoIn', el).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          const data = await UI.readImage(file, { max: 320 });
          await Store.saveSettings({ logo: data });
          const box = $('#logoPreview', el);
          box.classList.add('has-logo');
          box.innerHTML = `<img src="${data}" alt="Institute logo">`;
          UI.toast('Logo updated — it will appear on receipts');
        } catch (ex) { UI.toast(ex.message, 'error'); }
      });
      const rm = $('#logoRm', el);
      if (rm) rm.addEventListener('click', async () => {
        await Store.saveSettings({ logo: '' });
        const box = $('#logoPreview', el);
        box.classList.remove('has-logo');
        box.textContent = UI.initials(Store.settings().name);
        rm.remove();
        UI.toast('Logo removed');
      });
      $('#profSave', el).addEventListener('click', async () => {
        const d = UI.formData(pf);
        if (!d.name) { UI.toast('Institute name is required', 'error'); return; }
        if (!d.currency) d.currency = '₹';
        await Store.saveSettings(d);
        App.dirty = false;
        UI.toast('Profile saved');
      });

      $$('[data-theme]', el).forEach((b) => b.addEventListener('click', () => {
        App.setTheme(b.dataset.theme);
        $$('[data-theme]', el).forEach((x) => x.classList.toggle('on', x === b));
      }));

      $('#pwSave', el).addEventListener('click', async () => {
        const d = UI.formData($('#pwForm', el));
        const err = $('#pwErr', el);
        err.textContent = '';
        const min = cloud ? 6 : 4;
        if (!d.old || !d.pw) { err.textContent = 'Enter your current and new password.'; return; }
        if (d.pw.length < min) { err.textContent = `New password must be at least ${min} characters.`; return; }
        if (d.pw !== d.pw2) { err.textContent = 'New passwords do not match.'; return; }
        try {
          await Store.auth.changePassword(d.old, d.pw);
          $('#pwForm', el).reset();
          UI.toast('Password updated');
        } catch (e) { err.textContent = e.message; }
      });

      $('#bkDown', el).addEventListener('click', () => {
        const name = (s.name || 'institute').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        UI.download(`${name}-backup-${UI.today()}.json`, JSON.stringify(Store.exportData(), null, 2));
        UI.toast('Backup downloaded');
      });
      $('#bkUp', el).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (data.app !== 'institute-manager') throw new Error('This is not a valid Institute Manager backup file');
          const ok = await UI.confirmBox({
            title: 'Restore this backup?',
            message: `Backup from ${data.exportedAt ? UI.fmtDate(data.exportedAt.slice(0, 10)) : 'unknown date'} with ${(data.students || []).length} students and ${(data.payments || []).length} payments. ALL current data will be replaced.`,
            okText: 'Replace & restore'
          });
          if (!ok) return;
          UI.toast('Restoring…');
          await Store.importData(data);
          UI.toast('Backup restored');
          App.rerender();
        } catch (ex) { UI.toast(ex.message || 'Could not read file', 'error'); }
      });

      const ib = $('#installBtn', el);
      if (ib) ib.addEventListener('click', async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; this.render(el); });
    }
  };
})();

/*
 * Administrator console (/admin).
 * Signs in with email + password like the app, but only accounts listed in
 * app_superadmins can see anything: every query goes through database functions
 * that check is_superadmin(), so this page is useless to anyone else.
 */
(function () {
  const { icon, esc, money, $, $$ } = UI;
  const cfg = window.IMS_CONFIG || {};
  const SB = cfg.supabase || {};
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
  const PRODUCT = 'Institute Manager';

  const STATUS = {
    approved: ['Active', 'badge-success'],
    pending: ['Pending', 'badge-warning'],
    paused: ['Paused', 'badge-accent'],
    rejected: ['Rejected', 'badge-danger']
  };
  const badge = (st) => { const [t, c] = STATUS[st] || ['Unknown', '']; return `<span class="badge ${c}">${t}</span>`; };
  const logoMark = (r, cls = '') => r.logo
    ? `<div class="avatar has-photo ${cls}" style="border-radius:12px"><img src="${esc(r.logo)}" alt=""></div>`
    : `<div class="avatar ${cls}" style="border-radius:12px">${esc(UI.initials(r.institute_name || r.email || '?'))}</div>`;
  const day = (ts) => (ts ? UI.fmtDate(String(ts).slice(0, 10)) : '—');

  let sb = null;
  let admin = null;        // the signed-in administrator
  let rows = [];
  let filter = 'all';
  let query = '';
  let refreshTimer = null;
  let view = 'list';
  let current = null;      // institute being viewed

  /* The institute's own records, read through admin_institute_data(). Exposed as a
     read-only window.Store so logic.js can work out dues, balances and attendance
     exactly as the app does. */
  const blank = () => ({ students: [], courses: [], batches: [], payments: [], expenses: [], attendance: [] });
  let data = blank();
  let dataSettings = {};
  let dataVersion = 0;
  window.Store = {
    get version() { return dataVersion; },
    all: (c) => data[c] || [],
    get: (c, id) => (data[c] || []).find((o) => o.id === id) || null,
    settings: () => ({ currency: '₹', ...dataSettings })
  };

  // Same per-device theme as the main app
  try {
    const t = localStorage.getItem('ims.theme') || 'system';
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {}

  const show = (html) => { const r = $('#root'); r.innerHTML = html; r.hidden = false; $('#splash').hidden = true; };

  // ───────────── Sign in ─────────────
  function renderLogin(error) {
    view = 'login';
    show(`<div class="auth single">
      <main class="auth-main">
        <div class="auth-mobile-logo" style="display:flex"><img src="icons/icon-192.png" alt=""><span>${PRODUCT}</span></div>
        <div class="auth-card">
          ${error ? `<div class="notice error">${icon('alert')}<span>${esc(error)}</span></div>` : ''}
          <div class="auth-head"><h1>Administrator</h1><p>Sign in to manage institute accounts</p></div>
          <form id="adminForm" class="stack" novalidate>
            <div class="field"><label for="f-email">Email</label>
              <input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>
            <div class="field"><label for="f-password">Password</label>
              <div class="pw-wrap"><input class="input" id="f-password" name="password" type="password" autocomplete="current-password" required>
                <button type="button" class="pw-toggle" aria-label="Show password">${icon('eye')}</button></div></div>
            <div class="form-error" id="adminErr" role="alert"></div>
            <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('lock')} Sign in</button>
          </form>
        </div>
        <p class="auth-legal">Administrator access only.</p>
      </main></div>`);

    const f = $('#adminForm');
    $('.pw-toggle').addEventListener('click', (e) => {
      const i = e.currentTarget.previousElementSibling;
      const showing = i.type === 'password';
      i.type = showing ? 'text' : 'password';
      e.currentTarget.innerHTML = icon(showing ? 'eyeOff' : 'eye');
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = UI.formData(f);
      const err = $('#adminErr');
      const btn = f.querySelector('button[type=submit]');
      err.textContent = '';
      if (!d.email || !d.password) { err.textContent = 'Enter your email and password.'; return; }
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      const { data: res, error: signInError } = await sb.auth.signInWithPassword({ email: d.email, password: d.password });
      if (signInError) {
        err.textContent = /invalid login credentials/i.test(signInError.message) ? 'Incorrect email or password.' : signInError.message;
        btn.disabled = false;
        btn.innerHTML = `${icon('lock')} Sign in`;
        return;
      }
      admin = res.user;
      if (!(await isSuperadmin())) {
        await sb.auth.signOut().catch(() => {});
        admin = null;
        renderLogin('That account is not an administrator.');
        return;
      }
      await load();
    });
    setTimeout(() => { const i = $('#f-email'); if (i && innerWidth > 860) i.focus(); }, 40);
  }

  async function isSuperadmin() {
    const { data: ok, error } = await sb.rpc('is_superadmin');
    return !error && ok === true;
  }

  // ───────────── Institute list ─────────────
  async function load() {
    const { data: list, error } = await sb.rpc('admin_institutes');
    if (error) { renderLogin(error.message); return; }
    rows = list || [];
    if (current) current = rows.find((r) => r.id === current.id) || current;
    if (view === 'institute' && current) renderInstitute(); else renderList();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      const { data: fresh } = await sb.rpc('admin_institutes');
      if (!fresh) return;
      rows = fresh;
      if (view === 'list') renderList();
    }, 60000);
  }

  const topBar = () => `
    <header class="admin-top">
      <img src="icons/icon-192.png" alt="" style="width:30px;height:30px;border-radius:8px">
      <div class="li-main"><div class="strong">${PRODUCT}</div><div class="small muted">Administrator console</div></div>
      <button class="btn btn-sm" data-refresh>${icon('chart')} <span class="hide-sm">Refresh</span></button>
      <button class="btn btn-sm" data-signout>${icon('logout')} <span class="hide-sm">Sign out</span></button>
    </header>`;

  function bindTop() {
    $('[data-refresh]').addEventListener('click', load);
    $('[data-signout]').addEventListener('click', async () => {
      clearInterval(refreshTimer);
      await sb.auth.signOut().catch(() => {});
      admin = null;
      renderLogin();
    });
  }

  function renderList() {
    view = 'list';
    current = null;
    const counts = { all: rows.length, pending: 0, approved: 0, paused: 0, rejected: 0 };
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const q = query.toLowerCase();
    const list = rows
      .filter((r) => filter === 'all' || r.status === filter)
      .filter((r) => !q || [r.institute_name, r.email].join(' ').toLowerCase().includes(q));
    const totals = rows.reduce((a, r) => ({
      students: a.students + (r.students || 0),
      payments: a.payments + (r.payments || 0),
      collected: a.collected + Number(r.collected || 0)
    }), { students: 0, payments: 0, collected: 0 });

    const kpi = (label, value, sub) => `<div class="card kpi"><div class="kpi-label"><span class="truncate">${label}</span></div>
      <div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;

    show(`${topBar()}
      <div class="admin-wrap">
        <div class="page-head"><div><h1>Institutes</h1>
          <p class="sub">${esc(admin ? admin.email : '')}${counts.pending ? ` · <b style="color:var(--warning)">${counts.pending} waiting for approval</b>` : ''}</p></div></div>

        <div class="kpis" style="margin-bottom:16px">
          ${kpi('Institutes', counts.all, `${counts.approved} active · ${counts.pending} pending`)}
          ${kpi('Paused / rejected', counts.paused + counts.rejected, `${counts.paused} paused · ${counts.rejected} rejected`)}
          ${kpi('Students', totals.students, 'across all institutes')}
          ${kpi('Fees collected', money(totals.collected), `${totals.payments} receipts`)}
        </div>

        <div class="toolbar">
          <div class="input-group">${icon('search')}<input class="input" id="adminQ" placeholder="Search institute or email" value="${esc(query)}"></div>
        </div>
        <div class="chips" style="margin-bottom:16px">
          ${[['all', 'All'], ['pending', 'Pending'], ['approved', 'Active'], ['paused', 'Paused'], ['rejected', 'Rejected']]
            .map(([k, t]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${t} <span class="count">${counts[k] || 0}</span></button>`).join('')}
        </div>

        <div class="card"><div class="list">
          ${list.length ? list.map((r) => `
            <div class="list-item clickable" data-id="${r.id}">
              ${logoMark(r)}
              <div class="li-main">
                <div class="li-title">${esc(r.institute_name || 'Unnamed institute')}</div>
                <div class="li-sub">${esc(r.email || '')} · joined ${day(r.created_at)} · ${r.students} students · ${r.payments} receipts</div>
              </div>
              <div class="li-end">${badge(r.status)}<div class="small muted money">${money(r.collected || 0)}</div></div>
            </div>`).join('') : UI.empty('users', 'Nothing here', 'No institute matches this filter.')}
        </div></div>
      </div>`);

    bindTop();
    const qi = $('#adminQ');
    qi.addEventListener('input', () => { query = qi.value; renderList(); $('#adminQ').focus(); });
    $$('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; renderList(); }));
    $$('[data-id]').forEach((el) => el.addEventListener('click', () => openInstitute(rows.find((r) => r.id === el.dataset.id))));
  }

  // ───────────── One institute (read-only) ─────────────
  async function openInstitute(r) {
    if (!r) return;
    current = r;
    view = 'institute';
    show(`${topBar()}<div class="admin-wrap"><div class="card card-body row" style="gap:14px">
      <div class="spinner"></div><div class="li-main">Loading ${esc(r.institute_name || r.email || '')}…</div></div></div>`);
    bindTop();
    const { data: payload, error } = await sb.rpc('admin_institute_data', { target: r.id });
    if (error) { UI.toast(error.message, 'error'); renderList(); return; }
    data = { ...blank(), ...(payload || {}) };
    dataSettings = (payload && payload.settings) || {};
    dataVersion++;
    renderInstitute();
  }

  function renderInstitute() {
    const r = current;
    const month = UI.thisMonth();
    const students = Logic.students();
    const active = Logic.activeStudents();
    const withDues = students.map((s) => ({ s, d: Logic.dues(s) })).filter((x) => x.d.total > 0).sort((a, b) => b.d.total - a.d.total);
    const totalDue = withDues.reduce((a, x) => a + x.d.total, 0);
    const recent = Store.all('payments').slice().sort(Logic.byDateDesc).slice(0, 10);
    const months = Array.from({ length: 6 }, (_, i) => UI.addMonths(month, i - 5));
    const byMonth = months.map((m) => ({ m, v: Logic.collectedIn(m) }));
    const peak = Math.max(1, ...byMonth.map((x) => x.v));
    const courses = Store.all('courses');
    const batches = Store.all('batches');
    const att = Logic.attendanceOnDate(UI.today());
    const kpi = (label, value, sub) => `<div class="card kpi"><div class="kpi-label"><span class="truncate">${label}</span></div>
      <div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;

    show(`${topBar()}
      <div class="admin-wrap">
        <button class="back-link" data-back>${icon('arrowLeft')} All institutes</button>

        <div class="card" style="margin-bottom:16px">
          <div class="card-body profile-head">
            ${logoMark(r, 'lg')}
            <div class="li-main" style="min-width:220px">
              <div class="row-wrap"><h2>${esc(r.institute_name || 'Unnamed institute')}</h2>${badge(r.status)}</div>
              <div class="muted" style="margin-top:4px">${esc(r.email || '')} · joined ${day(r.created_at)} · last activity ${day(r.last_activity)}</div>
              ${r.status_note ? `<div class="small muted" style="margin-top:4px">Note: ${esc(r.status_note)}</div>` : ''}
            </div>
            <div class="page-actions">
              <button class="btn" data-export>${icon('download')} <span class="hide-sm">Export</span></button>
              <button class="btn btn-primary" data-status>${icon('settings')} Manage status</button>
            </div>
          </div>
        </div>

        <div class="kpis" style="margin-bottom:16px">
          ${kpi('Students', active.length, `${students.length} total on the books`)}
          ${kpi(`Collected · ${UI.MONTHS[Number(month.slice(5)) - 1]}`, money(Logic.collectedIn(month)), `${Logic.paymentsInMonth(month).length} receipt${Logic.paymentsInMonth(month).length === 1 ? '' : 's'} this month`)}
          ${kpi('Pending dues', money(totalDue), `${withDues.length} students owing`)}
          ${kpi('Net balance', money(Logic.netUpTo(month)), `${money(Logic.collectedUpTo(month))} in · ${money(Logic.expensesUpTo(month))} out`)}
        </div>

        <div class="two-col" style="margin-bottom:16px">
          <div class="card">
            <div class="card-head"><h3>Students</h3><span class="muted small">${students.length}</span></div>
            <div class="list" style="max-height:460px;overflow:auto">
              ${students.length ? students.map((s) => {
                const c = Logic.courseOf(s), b = Logic.batchOf(s), due = Logic.dues(s).total;
                return `<div class="list-item">
                  ${UI.avatar(s.name, s.photo)}
                  <div class="li-main"><div class="li-title">${esc(s.name)}${s.status !== 'active' ? ` <span class="badge">${esc(s.status)}</span>` : ''}</div>
                    <div class="li-sub">${esc(s.code || '')}${c ? ' · ' + esc(c.name) : ''}${b ? ' · ' + esc(b.name) : ''}${s.phone ? ' · ' + esc(s.phone) : ''}</div></div>
                  <div class="li-end">${due > 0 ? `<div class="strong money" style="color:var(--danger)">${money(due)}</div><div class="small muted">due</div>` : '<span class="badge badge-success">Paid up</span>'}</div>
                </div>`;
              }).join('') : UI.empty('users', 'No students yet', 'This institute has not added anyone.')}
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="card-head"><h3>Collection · last 6 months</h3></div>
              <div class="card-body stack" style="gap:10px">
                ${byMonth.map((x) => `<div>
                  <div class="row" style="justify-content:space-between"><span class="muted small">${UI.monthLabel(x.m)}</span><span class="money small strong">${money(x.v)}</span></div>
                  <div style="height:6px;border-radius:3px;background:var(--surface-3);overflow:hidden;margin-top:4px">
                    <div style="height:100%;width:${Math.round((x.v / peak) * 100)}%;background:var(--accent);border-radius:3px"></div></div>
                </div>`).join('')}
              </div>
            </div>
            <div class="card">
              <div class="card-head"><h3>Today</h3><span class="muted small">${UI.fmtDate(UI.today())}</span></div>
              <div class="stat-strip" style="border-top:0;grid-template-columns:repeat(2,minmax(0,1fr))">
                <div><div class="v">${att.marked ? `${att.present}/${att.marked}` : '—'}</div><div class="l">Attendance marked</div></div>
                <div style="border-right:0"><div class="v">${courses.length} · ${batches.length}</div><div class="l">Courses · batches</div></div>
              </div>
            </div>
          </div>
        </div>

        <div class="two-col">
          <div class="card">
            <div class="card-head"><h3>Recent payments</h3><span class="muted small">${Store.all('payments').length} total</span></div>
            <div class="list">
              ${recent.length ? recent.map((p) => `<div class="list-item">
                <div class="avatar" style="background:var(--success-bg);color:var(--success)">${icon('receipt')}</div>
                <div class="li-main"><div class="li-title">${esc(p.studentName || '')}</div>
                  <div class="li-sub">${esc(p.receiptNo || '')} · ${UI.fmtDate(p.date)} · ${esc(p.mode || '')}</div></div>
                <div class="li-end strong money">${money(p.total)}</div></div>`).join('')
                : UI.empty('receipt', 'No payments yet', 'No fees collected so far.')}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Courses & batches</h3></div>
            <div class="list">
              ${courses.length ? courses.map((c) => `<div class="list-item">
                <div class="avatar" style="border-radius:10px">${icon('book')}</div>
                <div class="li-main"><div class="li-title">${esc(c.name)}</div>
                  <div class="li-sub">${Number(c.durationMonths) ? c.durationMonths + ' months' : 'No fixed duration'} · ${Store.all('students').filter((s) => s.courseId === c.id && s.status === 'active').length} active</div></div>
                <div class="li-end"><div class="strong money">${money(c.monthlyFee)}</div><div class="small muted">per month</div></div></div>`).join('')
                : UI.empty('book', 'No courses yet', 'Nothing set up.')}
              ${batches.map((b) => `<div class="list-item">
                <div class="avatar" style="border-radius:10px">${icon('clock')}</div>
                <div class="li-main"><div class="li-title">${esc(b.name)}</div><div class="li-sub">${esc(b.time || 'No timing')}${b.days ? ' · ' + esc(b.days) : ''}</div></div>
                <div class="li-end small muted">${Logic.studentsInBatch(b.id).length} students</div></div>`).join('')}
            </div>
          </div>
        </div>
      </div>`);

    bindTop();
    $('[data-back]').addEventListener('click', renderList);
    $('[data-status]').addEventListener('click', () => statusModal(r));
    $('[data-export]').addEventListener('click', () => {
      const name = (r.institute_name || r.email || 'institute').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      UI.download(`${name}-${UI.today()}.json`, JSON.stringify({ app: 'institute-manager', format: 1, exportedAt: new Date().toISOString(), settings: dataSettings, ...data }, null, 2));
    });
  }

  // ───────────── Approve / pause / reject ─────────────
  function statusModal(r) {
    const item = (l, v) => `<div class="meta"><dt>${l}</dt><dd>${v || '<span class="faint">—</span>'}</dd></div>`;
    UI.modal({
      title: r.institute_name || 'Institute',
      size: 'sm',
      body: `<dl class="meta-grid" style="margin:0 0 18px">
          ${item('Email', esc(r.email || ''))}
          ${item('Status', badge(r.status))}
          ${item('Signed up', day(r.created_at))}
          ${item('Status changed', day(r.status_changed_at))}
        </dl>
        <div class="field"><label>Note for this institute (optional)</label>
          <input class="input" id="adminNote" value="${esc(r.status_note || '')}" placeholder="e.g. Approved after phone verification">
          <span class="hint">Shown on their sign-in screen while the account is not active.</span></div>
        <div class="form-error" id="adminActionErr"></div>`,
      foot: `<button class="btn btn-danger left" data-set="rejected">Reject</button>
             ${r.status === 'approved'
               ? `<button class="btn" data-set="paused">Pause</button>`
               : `<button class="btn" data-set="pending">Set pending</button>`}
             <button class="btn btn-primary" data-set="approved">${r.status === 'approved' ? 'Keep active' : 'Approve'}</button>`,
      onMount(box, close) {
        $$('[data-set]', box).forEach((b) => b.addEventListener('click', async () => {
          const status = b.dataset.set;
          const note = $('#adminNote', box).value.trim();
          if (status !== 'approved' && !(await UI.confirmBox({
            title: status === 'rejected' ? `Reject ${r.institute_name || r.email}?` : `Pause ${r.institute_name || r.email}?`,
            message: status === 'rejected'
              ? 'They will be signed out of the app and cannot use it. Their data is kept.'
              : 'They will lose access until you approve them again. Their data is kept.',
            okText: status === 'rejected' ? 'Reject' : 'Pause'
          }))) return;
          b.disabled = true;
          const { error } = await sb.rpc('admin_set_status', { target: r.id, new_status: status, note: note || null });
          if (error) { $('#adminActionErr', box).textContent = error.message; b.disabled = false; return; }
          close();
          UI.toast(`${r.institute_name || r.email} · ${(STATUS[status] || [status])[0]}`);
          await load();
        }));
      }
    });
  }

  // ───────────── Start ─────────────
  async function boot() {
    if (!SB.url || !SB.anonKey) {
      show(`<div class="auth single"><main class="auth-main"><div class="auth-card">
        <div class="auth-icon">${icon('alert')}</div>
        <div class="auth-head center"><h1>Not configured</h1><p>Add your Supabase URL and key to js/config.js to use the administrator console.</p></div>
      </div></main></div>`);
      return;
    }
    const { createClient } = await import(SUPABASE_JS);
    // Its own storage key, so signing in here does not disturb an institute signed in on the same browser
    sb = createClient(SB.url, SB.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ims-admin-auth' }
    });
    const { data: session } = await sb.auth.getSession();
    if (session && session.session) {
      admin = session.session.user;
      if (await isSuperadmin()) { await load(); return; }
      await sb.auth.signOut().catch(() => {});
      admin = null;
      renderLogin('That account is not an administrator.');
      return;
    }
    renderLogin();
  }

  // Lets the layout be checked with sample records during development; every real
  // action still goes through the database, which only answers administrators.
  window.__adminPreview = (sample, sampleData) => {
    rows = sample;
    admin = admin || { email: 'preview@example.com' };
    if (sampleData) { data = { ...blank(), ...sampleData }; dataSettings = sampleData.settings || {}; dataVersion++; }
    renderList();
  };
  window.__adminPreviewInstitute = (row) => { current = row; renderInstitute(); };

  boot().catch((e) => { console.error(e); renderLogin(e.message || 'Could not start'); });
})();

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

  let sb = null;
  let admin = null;      // the signed-in administrator
  let rows = [];
  let filter = 'all';
  let query = '';
  let refreshTimer = null;

  // Same per-device theme as the main app
  try {
    const t = localStorage.getItem('ims.theme') || 'system';
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {}

  const root = () => $('#root');
  const show = (html) => { const r = root(); r.innerHTML = html; r.hidden = false; $('#splash').hidden = true; };

  // ── Sign in ──
  function renderLogin(error) {
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
      const { data, error: signInError } = await sb.auth.signInWithPassword({ email: d.email, password: d.password });
      if (signInError) {
        err.textContent = /invalid login credentials/i.test(signInError.message) ? 'Incorrect email or password.' : signInError.message;
        btn.disabled = false;
        btn.innerHTML = `${icon('lock')} Sign in`;
        return;
      }
      admin = data.user;
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
    const { data, error } = await sb.rpc('is_superadmin');
    return !error && data === true;
  }

  // ── Console ──
  async function load() {
    const { data, error } = await sb.rpc('admin_institutes');
    if (error) { renderLogin(error.message); return; }
    rows = data || [];
    renderConsole();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => sb.rpc('admin_institutes').then(({ data: d }) => { if (d) { rows = d; renderConsole(); } }), 60000);
  }

  function renderConsole() {
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

    show(`
      <header class="admin-top">
        <img src="icons/icon-192.png" alt="" style="width:30px;height:30px;border-radius:8px">
        <div class="li-main"><div class="strong">${PRODUCT}</div><div class="small muted">Administrator console</div></div>
        <button class="btn btn-sm" data-refresh>${icon('chart')} <span class="hide-sm">Refresh</span></button>
        <button class="btn btn-sm" data-signout>${icon('logout')} <span class="hide-sm">Sign out</span></button>
      </header>
      <div class="admin-wrap">
        <div class="page-head"><div><h1>Institutes</h1>
          <p class="sub">${esc(admin ? admin.email : '')}${counts.pending ? ` · <b style="color:var(--warning)">${counts.pending} waiting for approval</b>` : ''}</p></div></div>

        <div class="kpis" style="margin-bottom:16px">
          ${kpi('Institutes', counts.all, `${counts.approved} active · ${counts.pending} pending`)}
          ${kpi('Paused / rejected', (counts.paused + counts.rejected), `${counts.paused} paused · ${counts.rejected} rejected`)}
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
              <div class="avatar">${esc(UI.initials(r.institute_name || r.email || '?'))}</div>
              <div class="li-main">
                <div class="li-title">${esc(r.institute_name || 'Unnamed institute')}</div>
                <div class="li-sub">${esc(r.email || '')} · joined ${UI.fmtDate((r.created_at || '').slice(0, 10))} · ${r.students} students · ${r.payments} receipts</div>
              </div>
              <div class="li-end">${badge(r.status)}<div class="small muted money">${money(r.collected || 0)}</div></div>
            </div>`).join('') : UI.empty('users', 'Nothing here', 'No institute matches this filter.')}
        </div></div>
      </div>`);

    $('[data-refresh]').addEventListener('click', load);
    $('[data-signout]').addEventListener('click', async () => {
      clearInterval(refreshTimer);
      await sb.auth.signOut().catch(() => {});
      admin = null;
      renderLogin();
    });
    const qi = $('#adminQ');
    qi.addEventListener('input', () => { query = qi.value; renderConsole(); $('#adminQ').focus(); });
    $$('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; renderConsole(); }));
    $$('[data-id]').forEach((el) => el.addEventListener('click', () => openInstitute(rows.find((r) => r.id === el.dataset.id))));
  }

  // ── One institute ──
  function openInstitute(r) {
    if (!r) return;
    const item = (l, v) => `<div class="meta"><dt>${l}</dt><dd>${v || '<span class="faint">—</span>'}</dd></div>`;
    UI.modal({
      title: r.institute_name || 'Institute',
      body: `<dl class="meta-grid" style="margin:0 0 18px">
          ${item('Email', esc(r.email || ''))}
          ${item('Status', badge(r.status))}
          ${item('Signed up', UI.fmtDate((r.created_at || '').slice(0, 10)))}
          ${item('Status changed', r.status_changed_at ? UI.fmtDate(r.status_changed_at.slice(0, 10)) : '')}
          ${item('Students', r.students)}
          ${item('Receipts', r.payments)}
          ${item('Fees collected', money(r.collected || 0))}
          ${item('Last activity', r.last_activity ? UI.fmtDate(r.last_activity.slice(0, 10)) : '')}
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

  // ── Start ──
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
    const { data } = await sb.auth.getSession();
    if (data && data.session) {
      admin = data.session.user;
      if (await isSuperadmin()) { await load(); return; }
      await sb.auth.signOut().catch(() => {});
      admin = null;
      renderLogin('That account is not an administrator.');
      return;
    }
    renderLogin();
  }

  // Lets the layout be checked with sample rows during development; every real
  // action still goes through the database, which only answers administrators.
  window.__adminPreview = (sample) => { rows = sample; admin = admin || { email: 'preview@example.com' }; renderConsole(); };

  boot().catch((e) => { console.error(e); renderLogin(e.message || 'Could not start'); });
})();

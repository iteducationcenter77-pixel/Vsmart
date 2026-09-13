/* App shell: boot, login, navigation, routing, theme. */
(function () {
  const { icon, esc, $, $$ } = UI;

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'students', label: 'Students', icon: 'users' },
    { id: 'attendance', label: 'Attendance', icon: 'calendar' },
    { id: 'collect', label: 'Collect Fee', icon: 'wallet' },
    { id: 'payments', label: 'Payments', icon: 'receipt' },
    { id: 'reports', label: 'Reports', icon: 'chart' },
    { group: 'Setup' },
    { id: 'courses', label: 'Courses & Batches', icon: 'layers' },
    { id: 'expenses', label: 'Expenses', icon: 'expense' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];
  const BOTTOM = [
    { id: 'dashboard', label: 'Home', icon: 'home' },
    { id: 'students', label: 'Students', icon: 'users' },
    { id: 'attendance', label: 'Attendance', icon: 'calendar' },
    { id: 'collect', label: 'Fees', icon: 'wallet' },
    { id: 'more', label: 'More', icon: 'grid' }
  ];
  // Sub-pages highlight their parent in the nav
  const PARENT = { student: 'students', receipt: 'payments' };

  const App = window.App = {
    dirty: false,     // set by pages holding unsaved input; blocks live re-render
    route: null,
    go(path) { location.hash = '#/' + path; },
    rerender() { render(true); }
  };

  // ── Theme (per-device preference) ──
  const THEME_KEY = 'ims.theme';
  App.getTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; } };
  App.setTheme = (t) => { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} applyTheme(); };
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const t = App.getTheme();
    const dark = t === 'dark' || (t === 'system' && media.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = dark ? '#121826' : '#ffffff';
  }
  media.addEventListener && media.addEventListener('change', applyTheme);

  // ── Routing ──
  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    return { name: parts[0] || 'dashboard', params: parts.slice(1).map(decodeURIComponent), query: new URLSearchParams(qs || '') };
  }

  function render(keepScroll) {
    const r = parseHash();
    const page = window.Pages[r.name];
    if (!page) { App.go('dashboard'); return; }
    const changed = !App.route || App.route.name !== r.name || App.route.params.join('/') !== r.params.join('/');
    App.route = r;
    if (changed) App.dirty = false;
    const y = window.scrollY;
    const view = $('#view');
    const title = typeof page.title === 'function' ? page.title(r) : page.title;
    $('#topTitle').textContent = title;
    document.title = `${title} · ${Store.settings().name}`;
    const active = PARENT[r.name] || r.name;
    $$('.nav-item, .bn-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === active));
    const bottomIds = BOTTOM.map((b) => b.id);
    const moreBtn = $('.bn-item[data-more]');
    if (moreBtn) moreBtn.classList.toggle('active', !bottomIds.includes(active));
    try {
      page.render(view, r.params, r.query);
    } catch (e) {
      console.error(e);
      view.innerHTML = UI.empty('alert', 'Something went wrong', e.message);
    }
    window.scrollTo(0, keepScroll && !changed ? y : 0);
  }

  function onDataChange() {
    refreshChrome();
    if (!$('#app').hidden && !App.dirty) render(true);
  }

  // ── Chrome: nav, brand, sync status ──
  function buildNav() {
    $('#sideNav').innerHTML = NAV.map((n) => n.group
      ? `<div class="nav-group">${esc(n.group)}</div>`
      : `<button class="nav-item" data-nav="${n.id}">${icon(n.icon)}<span>${esc(n.label)}</span></button>`).join('');
    $('#bottomNav').innerHTML = BOTTOM.map((n) => n.id === 'more'
      ? `<button class="bn-item" data-more>${icon(n.icon)}<span>${n.label}</span></button>`
      : `<button class="bn-item" data-nav="${n.id}">${icon(n.icon)}<span>${n.label}</span></button>`).join('');
    $$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
  }

  function refreshChrome() {
    const s = Store.settings();
    const ini = UI.initials(s.name);
    $('#brandName').textContent = s.name;
    $('#brandMark').textContent = ini;
    $('#brandMarkSm').textContent = ini;
    const st = Store.syncState();
    const map = {
      local: ['', 'Local mode · this device'],
      synced: ['on', 'Cloud sync · up to date'],
      pending: ['warn', 'Syncing changes…'],
      offline: ['warn', 'Offline · will sync later']
    };
    const [cls, text] = map[st];
    $('#syncPill').innerHTML = `<span class="dot ${cls}"></span>${esc(text)}`;
  }

  function openMore() {
    const items = [
      { id: 'payments', label: 'Payments & Receipts', icon: 'receipt' },
      { id: 'reports', label: 'Monthly Reports', icon: 'chart' },
      { id: 'courses', label: 'Courses & Batches', icon: 'layers' },
      { id: 'expenses', label: 'Expenses', icon: 'expense' },
      { id: 'settings', label: 'Settings', icon: 'settings' }
    ];
    UI.modal({
      title: 'More',
      body: `<div class="list" style="margin:-8px -22px">
        ${items.map((i) => `<div class="list-item clickable" data-go="${i.id}">
          <div style="width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--surface-2)">${icon(i.icon)}</div>
          <div class="li-main"><div class="li-title">${i.label}</div></div>${icon('chevronRight', 'faint')}</div>`).join('')}
        <div class="list-item clickable" data-logout>
          <div style="width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--danger-bg);color:var(--danger)">${icon('logout')}</div>
          <div class="li-main"><div class="li-title" style="color:var(--danger)">Log out</div></div></div>
      </div>
      <div class="muted small" style="margin-top:18px;display:flex;align-items:center;gap:8px">${$('#syncPill').innerHTML}</div>`,
      onMount(root, close) {
        $$('[data-go]', root).forEach((el) => el.addEventListener('click', () => { close(); App.go(el.dataset.go); }));
        $('[data-logout]', root).addEventListener('click', () => { close(); logout(); });
      }
    });
  }

  async function logout() {
    const ok = await UI.confirmBox({ title: 'Log out?', message: 'You will need the admin password to open the app again.', okText: 'Log out', danger: false });
    if (!ok) return;
    try { await Store.auth.logout(); }
    catch (e) { UI.toast(e.message, 'error'); return; }
    $('#app').hidden = true;
    $('#view').innerHTML = '';
    loginMode = null;
    showLogin();
  }

  // ── Login / first-time setup ──
  let loginMode = null; // null = automatic, 'setup' or 'login' when the user toggles

  function showLogin(notice) {
    const el = $('#login');
    const s = Store.settings();
    const cloud = Store.mode === 'cloud';
    const canSetup = Store.auth.needsSetup();
    const setup = canSetup && loginMode !== 'login';
    const modeNote = cloud
      ? `${icon('cloud')} Cloud sync enabled`
      : `${icon('device')} Local mode · data stays on this device`;
    const emailField = (autocomplete) => `<div class="field"><label class="req">Admin email</label>
      <input class="input" type="email" name="email" value="${esc(Store.lastEmail())}" required autocomplete="${autocomplete}"></div>`;

    let form;
    if (Store.initError) {
      form = `<div class="empty" style="padding:8px 0">
        <div class="empty-ic">${icon('alert')}</div>
        <h4>Can't reach the server</h4>
        <p>Connect to the internet the first time you open the app, then try again.</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
    } else if (setup) {
      form = `<form id="loginForm" class="stack">
        <div class="field"><label class="req">Institute name</label><input class="input" name="name" value="${esc(s.name)}" required></div>
        ${cloud ? emailField('username') : ''}
        <div class="field"><label class="req">Create admin password</label><input class="input" type="password" name="pw" minlength="${cloud ? 6 : 4}" required autocomplete="new-password"></div>
        <div class="field"><label class="req">Confirm password</label><input class="input" type="password" name="pw2" required autocomplete="new-password"></div>
        <div class="form-error" id="loginErr"></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Create & continue</button>
        ${cloud ? `<button type="button" class="btn btn-ghost btn-block" data-mode="login">Already created your account? Sign in</button>` : ''}</form>`;
    } else {
      form = `<form id="loginForm" class="stack">
        ${cloud ? emailField('username') : ''}
        <div class="field"><label>Admin password</label>
          <div class="input-group">${icon('lock')}<input class="input" type="password" name="pw" required autocomplete="current-password" placeholder="Enter password"></div></div>
        <div class="form-error" id="loginErr"></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Unlock</button>
        ${cloud && canSetup ? `<button type="button" class="btn btn-ghost btn-block" data-mode="setup">First time? Create the admin account</button>` : ''}</form>`;
    }

    el.innerHTML = `<div class="login-card">
      <div class="login-head">
        <div class="brand-mark lg">${esc(UI.initials(s.name))}</div>
        <h1>${setup ? 'Welcome' : esc(s.name)}</h1>
        <p>${setup ? 'Set up your institute to get started' : 'Sign in to the admin panel'}</p>
      </div>
      ${notice ? `<div class="notice">${icon('checkCircle')}<span>${esc(notice)}</span></div>` : ''}
      <div class="login-box">${form}</div>
      <div class="login-foot row" style="justify-content:center;gap:6px">${modeNote}</div>
    </div>`;
    el.hidden = false;

    $$('[data-mode]', el).forEach((b) => b.addEventListener('click', () => { loginMode = b.dataset.mode; showLogin(); }));
    const f = $('#loginForm');
    if (!f) return;
    setTimeout(() => {
      const target = f.email && !f.email.value ? f.email : f.querySelector('input[type=password]');
      if (target && !setup) target.focus();
    }, 50);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = UI.formData(f);
      const err = $('#loginErr');
      const btn = f.querySelector('button[type=submit]');
      err.textContent = '';
      if (setup) {
        const min = cloud ? 6 : 4;
        if (d.pw.length < min) { err.textContent = `Use at least ${min} characters`; return; }
        if (d.pw !== d.pw2) { err.textContent = 'Passwords do not match'; return; }
      }
      btn.disabled = true;
      try {
        if (setup) {
          const r = await Store.auth.setup(d.pw, d.email, d.name);
          if (r && r.needsConfirm) {
            loginMode = 'login';
            showLogin(`Account created. We sent a confirmation link to ${d.email} — open it, then sign in here.`);
            return;
          }
          if (!cloud) await Store.saveSettings({ name: d.name || s.name });
        } else {
          await Store.auth.login(d.email, d.pw);
        }
        el.hidden = true;
        startApp();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    });
  }

  // ── Start ──
  let started = false;
  function startApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    if (!started) {
      started = true;
      buildNav();
      Store.onChange(onDataChange);
      window.addEventListener('hashchange', () => render(false));
      document.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-nav]');
        if (nav) { App.go(nav.dataset.nav); return; }
        if (e.target.closest('[data-more]')) { openMore(); return; }
        if (e.target.closest('[data-action=logout]')) logout();
      });
    }
    refreshChrome();
    if (!location.hash || !location.hash.startsWith('#/')) history.replaceState(null, '', '#/dashboard');
    App.route = null;
    render(false);
  }

  async function boot() {
    applyTheme();
    await Store.init();
    $('#splash').hidden = true;
    if (!Store.initError && Store.auth.isLoggedIn()) startApp();
    else showLogin();
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }

  boot();
})();

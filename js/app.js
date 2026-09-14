/* App shell: boot, navigation, routing, theme. Sign-in screens live in auth.js. */
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
    { id: 'more', label: 'Menu', icon: 'menu' }
  ];
  // Sub-pages highlight their parent in the nav
  const PARENT = { student: 'students', receipt: 'payments' };

  const App = window.App = {
    dirty: false,     // set by pages holding unsaved input; blocks live re-render
    route: null,
    go(path) { location.hash = '#/' + path; },
    rerender() { render(true); },
    start() { startApp(); }
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
    onScroll();
  }

  function onScroll() { document.body.classList.toggle('scrolled', window.scrollY > 48); }

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
    const mark = s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc(ini);
    ['#brandMark', '#topAvatar'].forEach((sel) => {
      const el = $(sel);
      el.classList.toggle('has-logo', !!s.logo);
      el.innerHTML = mark;
    });
    const email = Store.userEmail();
    $('#sideUser').innerHTML = email ? `<div class="avatar sm">${esc(email[0].toUpperCase())}</div>
      <div class="li-main"><div class="li-sub">Signed in as</div><div class="li-title">${esc(email)}</div></div>` : '';
    const st = Store.syncState();
    const map = {
      local: ['', 'Local mode · this device'],
      synced: ['on', 'Cloud sync · up to date'],
      pending: ['warn', 'Syncing changes…'],
      offline: ['warn', 'Offline · will sync later']
    };
    const [cls, text] = map[st];
    const who = Store.userEmail();
    $('#syncPill').innerHTML = `<span class="dot ${cls}"></span><span class="truncate" title="${esc(who)}">${esc(text)}</span>`;
  }

  // ── Mobile slide-out menu (the sidebar becomes a drawer under 860px) ──
  const body = document.body;
  const drawer = {
    isOpen: () => body.classList.contains('drawer-open'),
    open() {
      if (drawer.isOpen() || window.innerWidth > 860) return;
      body.classList.add('drawer-open');
      history.pushState({ drawer: true }, '', location.href); // Android Back closes the menu
    },
    close() {
      if (!drawer.isOpen()) return;
      body.classList.remove('drawer-open');
      if (history.state && history.state.drawer) history.back();
    },
    // Close and open a page, replacing the menu's history entry so Back behaves
    closeTo(path) {
      body.classList.remove('drawer-open');
      if (history.state && history.state.drawer) { history.replaceState(null, '', '#/' + path); render(false); }
      else App.go(path);
    }
  };
  window.addEventListener('popstate', () => {
    if (drawer.isOpen() && !(history.state && history.state.drawer)) body.classList.remove('drawer-open');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') drawer.close(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 860 && drawer.isOpen()) drawer.close(); });

  function bindDrawerSwipe() {
    const side = $('.sidebar');
    let startX = null;
    side.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    side.addEventListener('touchmove', (e) => {
      if (startX != null && e.touches[0].clientX - startX < -60) { startX = null; drawer.close(); }
    }, { passive: true });
    side.addEventListener('touchend', () => { startX = null; }, { passive: true });
  }

  async function logout() {
    const ok = await UI.confirmBox({ title: 'Log out?', message: 'You will need to sign in again to open your institute.', okText: 'Log out', danger: false });
    if (!ok) return;
    if (Store.pendingCount()) {
      await Store.syncNow();
      const left = Store.pendingCount();
      if (left && !(await UI.confirmBox({
        title: 'Unsynced changes',
        message: `${left} change${left === 1 ? " hasn't" : "s haven't"} reached the server yet (no internet?). Log out anyway and lose ${left === 1 ? 'it' : 'them'}?`,
        okText: 'Log out anyway'
      }))) return;
    }
    try { await Store.auth.logout(); }
    catch (e) { UI.toast(e.message, 'error'); return; }
    // Fresh page load so nothing from the previous account stays in memory
    location.replace(location.pathname);
  }

  // Accounts created with Google have no institute name yet — ask once.
  function askInstituteName() {
    UI.modal({
      title: 'Name your institute', size: 'sm',
      body: `<p class="muted" style="margin-bottom:16px">This appears on your dashboard and on every fee receipt. You can change it later in Settings.</p>
        <form id="instForm"><div class="field"><label class="req">Institute name</label>
          <input class="input" name="name" required placeholder="e.g. Bright Future Computer Centre"></div></form>`,
      foot: `<button class="btn btn-primary" data-save>Save</button>`,
      onMount(root, close) {
        const f = $('#instForm', root);
        const save = async () => {
          const name = f.name.value.trim();
          if (!name) { f.name.focus(); return; }
          await Store.saveSettings({ name });
          close();
          UI.toast('Institute name saved');
        };
        $('[data-save]', root).addEventListener('click', save);
        f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
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
      bindDrawerSwipe();
      window.addEventListener('scroll', onScroll, { passive: true });
      Store.onChange(onDataChange);
      window.addEventListener('hashchange', () => render(false));
      document.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-nav]');
        if (nav) { if (drawer.isOpen()) drawer.closeTo(nav.dataset.nav); else App.go(nav.dataset.nav); return; }
        if (e.target.closest('[data-more], [data-drawer]')) { drawer.open(); return; }
        if (e.target.closest('[data-drawer-close]')) { drawer.close(); return; }
        if (e.target.closest('[data-action=logout]')) { drawer.close(); logout(); }
      });
    }
    refreshChrome();
    if (!location.hash || !location.hash.startsWith('#/')) history.replaceState(null, '', '#/dashboard');
    App.route = null;
    render(false);

    if (Store.urlState().verified) UI.toast('Email verified — welcome to Institute Manager!');
    Store.clearUrlState();
    if (Store.mode === 'cloud' && !Store.hasInstituteName()) setTimeout(askInstituteName, 400);
  }

  async function boot() {
    applyTheme();
    await Store.init();
    $('#splash').hidden = true;
    if (!Store.initError && Store.auth.isLoggedIn() && !Store.urlState().recovery) startApp();
    else AuthView.show();
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }

  boot();
})();

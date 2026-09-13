/*
 * Data layer. Two interchangeable backends with the same API:
 *   • Local  – localStorage on this device (used while config.js has no Supabase URL)
 *   • Cloud  – Supabase Auth + Postgres with live sync, an offline cache (IndexedDB)
 *              and a queue that uploads changes made offline once back online
 * Pages only ever talk to window.Store.
 */
(function () {
  const COLS = ['students', 'courses', 'batches', 'payments', 'attendance', 'expenses'];
  const cfg = window.IMS_CONFIG || {};
  const SB = cfg.supabase || {};
  const CLOUD = !!(SB.url && SB.anonKey);

  const DEFAULT_SETTINGS = {
    name: 'My Computer Institute',
    tagline: 'Computer Training Centre',
    address: '',
    phone: '',
    email: '',
    currency: '₹',
    receiptPrefix: 'RC-',
    studentPrefix: 'STU-',
    receiptNote: 'Fees once paid are non-refundable. Please keep this receipt for your records.'
  };

  const cache = {};
  COLS.forEach((c) => (cache[c] = new Map()));
  let settings = {};
  let version = 0;
  const listeners = new Set();
  let emitTimer;
  const emit = () => {
    version++;
    clearTimeout(emitTimer);
    emitTimer = setTimeout(() => listeners.forEach((fn) => fn()), 40);
  };
  const clean = (o) => JSON.parse(JSON.stringify(o));

  async function hash(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0x811c9dc5;
    for (let r = 0; r < 2000; r++) for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return 'f' + h.toString(16);
  }

  // ───────────────────────── Local backend ─────────────────────────
  const LS = { data: 'ims.data.v1', auth: 'ims.auth.v1', session: 'ims.session.v1' };
  const Local = {
    async init() {
      try {
        const d = JSON.parse(localStorage.getItem(LS.data) || '{}');
        COLS.forEach((c) => (d[c] || []).forEach((o) => cache[c].set(o.id, o)));
        settings = d.settings || {};
      } catch (e) { console.error('Could not read local data', e); }
    },
    persist() {
      const d = { settings };
      COLS.forEach((c) => (d[c] = [...cache[c].values()]));
      try { localStorage.setItem(LS.data, JSON.stringify(d)); }
      catch (e) { UI.toast('Device storage is full — download a backup', 'error'); }
    },
    async write(col, obj) { cache[col].set(obj.id, obj); this.persist(); emit(); },
    async del(col, id) { cache[col].delete(id); this.persist(); emit(); },
    async writeSettings(s) { settings = s; this.persist(); emit(); },
    async replaceAll(data) {
      COLS.forEach((c) => { cache[c].clear(); (data[c] || []).forEach((o) => cache[c].set(o.id, o)); });
      settings = data.settings || {};
      this.persist(); emit();
    },
    needsSetup() { return !localStorage.getItem(LS.auth); },
    async setup(pw) {
      localStorage.setItem(LS.auth, await hash('ims|' + pw));
      localStorage.setItem(LS.session, '1');
      return {};
    },
    async login(_email, pw) {
      if ((await hash('ims|' + pw)) !== localStorage.getItem(LS.auth)) throw new Error('Incorrect password');
      localStorage.setItem(LS.session, '1');
    },
    isLoggedIn() { return localStorage.getItem(LS.session) === '1' && !!localStorage.getItem(LS.auth); },
    async logout() { localStorage.removeItem(LS.session); },
    async changePassword(oldPw, newPw) {
      if ((await hash('ims|' + oldPw)) !== localStorage.getItem(LS.auth)) throw new Error('Current password is incorrect');
      localStorage.setItem(LS.auth, await hash('ims|' + newPw));
    },
    userEmail() { return ''; },
    pendingCount() { return 0; }
  };

  // ───────────────────────── IndexedDB key-value (offline cache) ─────────────────────────
  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((resolve, reject) => {
        const r = indexedDB.open('ims-cache', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.db = r.result; resolve(this.db); };
        r.onerror = () => reject(r.error);
      });
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', mode);
        const req = fn(tx.objectStore('kv'));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      });
    },
    get(k) { return this.run('readonly', (s) => s.get(k)); },
    set(k, v) { return this.run('readwrite', (s) => s.put(v, k)); },
    del(k) { return this.run('readwrite', (s) => s.delete(k)); }
  };

  // ───────────────────────── Cloud backend (Supabase) ─────────────────────────
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
  const TABLES = [...COLS, 'settings'];
  const LAST_USER = 'ims.cloud.last';
  const isNetErr = (e) => !navigator.onLine || /fetch|network|load failed|timed? ?out/i.test((e && (e.message || e.details)) || '');

  function authMessage(e) {
    const m = (e && e.message) || '';
    if (/invalid login credentials/i.test(m)) return 'Incorrect email or password';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first — open the link we sent to your inbox.';
    if (/already registered|already been registered|already exists/i.test(m)) return 'This email already has an account. Sign in instead.';
    if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (/password/i.test(m) && /least|short|weak|characters/i.test(m)) return 'Password must be at least 6 characters';
    if (isNetErr(e)) return 'No internet connection';
    return m || 'Something went wrong';
  }

  const Cloud = {
    sb: null,
    user: null,
    admin: false,
    adminExists: true,
    queue: [],        // pending writes: { op: 'upsert' | 'delete', col, id, data }
    channel: null,
    flushing: false,
    saveTimer: null,
    key() { return 'ims.cloud.' + this.user.id; },

    async init() {
      const { createClient } = await import(SUPABASE_JS);
      this.sb = createClient(SB.url, SB.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      const { data } = await this.sb.auth.getSession();
      let user = data && data.session ? data.session.user : null;
      if (!user && !navigator.onLine) { try { user = JSON.parse(localStorage.getItem(LAST_USER) || 'null'); } catch (e) {} }
      if (user) {
        this.user = user;
        try { await this.start(); } catch (e) { console.warn(e); this.stop(); }
      }
      if (!this.user && navigator.onLine) {
        const { data: exists, error } = await this.sb.rpc('admin_exists');
        this.adminExists = error ? true : exists !== false;
      }
      this.sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && this.user) this.stop(); });
      window.addEventListener('online', () => { this.flush(); this.fetchAll().catch(() => {}); });
      setInterval(() => { if (this.queue.length) this.flush(); }, 20000);
    },

    // Load the offline cache, verify admin, then sync with the server.
    async start() {
      let saved = null;
      try { saved = await idb.get(this.key()); } catch (e) { console.warn('cache', e); }
      if (saved) {
        COLS.forEach((c) => { cache[c] = new Map((saved.data[c] || []).map((o) => [o.id, o])); });
        settings = saved.settings || {};
        this.queue = saved.queue || [];
        this.admin = !!saved.admin;
      }
      if (navigator.onLine) {
        const { data, error } = await this.sb.rpc('claim_admin');
        if (!error) this.admin = data === true;
        else if (!isNetErr(error)) throw new Error(error.message);
      }
      if (!this.admin) throw new Error('This account does not have admin access to this institute.');
      localStorage.setItem(LAST_USER, JSON.stringify({ id: this.user.id, email: this.user.email }));
      emit();
      this.subscribe();
      this.flush();
      const sync = this.fetchAll().catch((e) => console.warn('sync', e));
      if (!saved) await sync;
    },

    stop() {
      if (this.channel && this.sb) { this.sb.removeChannel(this.channel); this.channel = null; }
      COLS.forEach((c) => cache[c].clear());
      settings = {};
      this.queue = [];
      this.user = null;
      this.admin = false;
      emit();
    },

    persist() {
      clearTimeout(this.saveTimer);
      if (!this.user) return;
      const key = this.key();
      this.saveTimer = setTimeout(() => {
        const data = {};
        COLS.forEach((c) => (data[c] = [...cache[c].values()]));
        idb.set(key, { data, settings, queue: this.queue, admin: this.admin }).catch((e) => console.warn('cache save', e));
      }, 250);
    },

    pending(col, id) { return this.queue.some((o) => o.col === col && o.id === id); },

    async fetchTable(t) {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await this.sb.from(t).select('id,data').range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return rows;
    },

    async fetchAll() {
      if (!this.user || !navigator.onLine) return;
      const results = await Promise.all(TABLES.map((t) => this.fetchTable(t)));
      TABLES.forEach((t, i) => {
        const rows = results[i];
        if (t === 'settings') {
          if (!this.pending('settings', 'settings')) { const r = rows.find((x) => x.id === 'settings'); settings = r ? r.data : {}; }
          return;
        }
        const next = new Map(rows.map((r) => [r.id, { ...r.data, id: r.id }]));
        this.queue.filter((o) => o.col === t).forEach((o) => { if (o.op === 'delete') next.delete(o.id); else next.set(o.id, o.data); });
        cache[t] = next;
      });
      this.persist();
      emit();
    },

    subscribe() {
      if (this.channel || !navigator.onLine) return;
      const ch = this.sb.channel('ims-db');
      TABLES.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => this.onRemote(t, p)));
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') this.fetchAll().catch(() => {}); // catch anything missed while disconnected
      });
      this.channel = ch;
    },

    onRemote(t, p) {
      const id = (p.new && p.new.id) || (p.old && p.old.id);
      if (!id || this.pending(t, id)) return; // an unsynced local edit wins
      if (t === 'settings') { if (p.eventType !== 'DELETE') settings = p.new.data || {}; }
      else if (p.eventType === 'DELETE') cache[t].delete(id);
      else cache[t].set(id, { ...p.new.data, id });
      this.persist();
      emit();
    },

    enqueue(op) {
      this.queue = this.queue.filter((o) => !(o.col === op.col && o.id === op.id));
      this.queue.push(op);
      this.persist();
      emit();
      this.flush();
    },

    async flush() {
      if (this.flushing || !this.user || !navigator.onLine || !this.queue.length) return;
      this.flushing = true;
      try {
        while (this.queue.length) {
          const op = this.queue[0];
          const { error } = op.op === 'delete'
            ? await this.sb.from(op.col).delete().eq('id', op.id)
            : await this.sb.from(op.col).upsert({ id: op.id, data: clean(op.data), updated_at: new Date().toISOString() });
          if (error) {
            if (isNetErr(error)) break; // keep it queued, retry later
            console.error(error);
            UI.toast('Could not save: ' + error.message, 'error');
          }
          if (this.queue[0] === op) this.queue.shift();
          this.persist();
        }
      } finally {
        this.flushing = false;
        emit();
      }
    },

    async write(col, obj) { cache[col].set(obj.id, obj); this.enqueue({ op: 'upsert', col, id: obj.id, data: obj }); },
    async del(col, id) { cache[col].delete(id); this.enqueue({ op: 'delete', col, id }); },
    async writeSettings(s) { settings = s; this.enqueue({ op: 'upsert', col: 'settings', id: 'settings', data: s }); },

    async replaceAll(data) {
      if (!navigator.onLine) throw new Error('Connect to the internet to restore a backup');
      const now = new Date().toISOString();
      for (const c of COLS) {
        const rows = (data[c] || []).map((o) => ({ id: o.id, data: clean(o), updated_at: now }));
        const keep = new Set(rows.map((r) => r.id));
        const remove = [...cache[c].keys()].filter((id) => !keep.has(id));
        for (let i = 0; i < remove.length; i += 200) {
          const { error } = await this.sb.from(c).delete().in('id', remove.slice(i, i + 200));
          if (error) throw error;
        }
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await this.sb.from(c).upsert(rows.slice(i, i + 500));
          if (error) throw error;
        }
      }
      const { error } = await this.sb.from('settings').upsert({ id: 'settings', data: data.settings || {}, updated_at: now });
      if (error) throw error;
      this.queue = [];
      await this.fetchAll();
    },

    needsSetup() { return !this.adminExists; },

    async setup(pw, email, name) {
      const { data, error } = await this.sb.auth.signUp({
        email, password: pw, options: { emailRedirectTo: location.origin + location.pathname }
      });
      if (error) throw new Error(authMessage(error));
      localStorage.setItem('ims.pendingName', name || '');
      localStorage.setItem('ims.lastEmail', email);
      if (!data.session) return { needsConfirm: true };
      this.user = data.session.user;
      await this.start();
      await this.applyPendingName();
      return {};
    },

    async login(email, pw) {
      const { data, error } = await this.sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw new Error(authMessage(error));
      localStorage.setItem('ims.lastEmail', email);
      this.user = data.user;
      try { await this.start(); }
      catch (e) { await this.sb.auth.signOut().catch(() => {}); this.stop(); throw e; }
      await this.applyPendingName();
    },

    async applyPendingName() {
      const n = localStorage.getItem('ims.pendingName');
      if (n == null) return;
      localStorage.removeItem('ims.pendingName');
      if (n && !settings.name) await this.writeSettings({ ...settings, name: n });
    },

    isLoggedIn() { return !!this.user && this.admin; },

    async logout() {
      if (this.queue.length) throw new Error('Some changes have not synced yet. Connect to the internet, wait a moment, then log out.');
      const key = this.user ? this.key() : null;
      await this.sb.auth.signOut().catch(() => {});
      localStorage.removeItem(LAST_USER);
      if (key) await idb.del(key).catch(() => {});
      this.stop();
    },

    async changePassword(oldPw, newPw) {
      const { error: e1 } = await this.sb.auth.signInWithPassword({ email: this.user.email, password: oldPw });
      if (e1) throw new Error(isNetErr(e1) ? 'No internet connection' : 'Current password is incorrect');
      const { error } = await this.sb.auth.updateUser({ password: newPw });
      if (error) throw new Error(authMessage(error));
    },

    userEmail() { return (this.user && this.user.email) || ''; },
    pendingCount() { return this.queue.length; }
  };

  // ───────────────────────── Public API ─────────────────────────
  const B = CLOUD ? Cloud : Local;

  window.Store = {
    COLS,
    mode: CLOUD ? 'cloud' : 'local',
    initError: null,
    get version() { return version; },
    async init() {
      try { await B.init(); }
      catch (e) { console.error(e); this.initError = e; }
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    all(col) { return [...cache[col].values()]; },
    get(col, id) { return (id && cache[col].get(id)) || null; },
    async save(col, obj) {
      const now = new Date().toISOString();
      const o = { ...obj };
      if (!o.id) o.id = UI.uid();
      if (!o.createdAt) o.createdAt = now;
      o.updatedAt = now;
      await B.write(col, o);
      return o;
    },
    async remove(col, id) { await B.del(col, id); },
    settings() { return { ...DEFAULT_SETTINGS, ...settings }; },
    async saveSettings(patch) { await B.writeSettings({ ...settings, ...patch }); },
    syncState() {
      if (!CLOUD) return 'local';
      if (!navigator.onLine) return 'offline';
      return B.pendingCount() ? 'pending' : 'synced';
    },
    userEmail() { return B.userEmail(); },
    lastEmail() { try { return localStorage.getItem('ims.lastEmail') || ''; } catch (e) { return ''; } },
    auth: {
      needsSetup: () => B.needsSetup(),
      setup: (pw, email, name) => B.setup(pw, email, name),
      login: (email, pw) => B.login(email, pw),
      logout: () => B.logout(),
      isLoggedIn: () => B.isLoggedIn(),
      changePassword: (a, b) => B.changePassword(a, b)
    },
    exportData() {
      const d = { app: 'institute-manager', format: 1, exportedAt: new Date().toISOString(), settings };
      COLS.forEach((c) => (d[c] = this.all(c)));
      return d;
    },
    async importData(d) {
      if (!d || d.app !== 'institute-manager') throw new Error('This is not a valid Institute Manager backup file');
      await B.replaceAll(d);
    }
  };

  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
})();

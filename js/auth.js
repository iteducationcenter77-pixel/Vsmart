/* Authentication screens: sign in, create account, email verification, password reset.
 * In local mode (no Supabase config) it falls back to a simple device password lock. */
(function () {
  const { icon, esc, $, $$ } = UI;
  const cfg = window.IMS_CONFIG || {};
  const googleOn = !!(cfg.auth && cfg.auth.google);
  const PRODUCT = 'Institute Manager';

  const GOOGLE_LOGO = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

  let view = 'signin';   // signin | signup | sent | forgot | forgot-sent | reset | local
  let email = '';
  let banner = null;     // { type: 'ok' | 'error', text }
  let resendAt = 0;

  // ── Building blocks ──
  const brandPanel = () => `
    <aside class="auth-brand">
      <div class="auth-logo"><img src="icons/icon-192.png" alt=""><span>${PRODUCT}</span></div>
      <div class="auth-hero">
        <h2>Run your whole institute from one simple dashboard.</h2>
        <p>Admissions, monthly fees, receipts and attendance — on your phone and your computer.</p>
        <ul class="auth-points">
          ${[['wallet', 'Fee collection with printable receipts'], ['calendar', 'Daily attendance & monthly register'], ['chart', 'Dues, reports and expenses at a glance'], ['cloud', 'Works offline, syncs securely']]
            .map(([ic, t]) => `<li><span class="tick">${icon(ic)}</span>${t}</li>`).join('')}
        </ul>
      </div>
      <div class="auth-brand-foot">© ${new Date().getFullYear()} ${PRODUCT}</div>
    </aside>`;

  const tabs = () => `<div class="seg block auth-tabs" role="tablist">
      <button type="button" class="${view === 'signin' ? 'on' : ''}" data-view="signin">Sign in</button>
      <button type="button" class="${view === 'signup' ? 'on' : ''}" data-view="signup">Create account</button></div>`;

  const input = (name, label, type, attrs = '') => `<div class="field"><label for="f-${name}">${label}</label>
      <input class="input" id="f-${name}" name="${name}" type="${type}" ${attrs}></div>`;

  const password = (name, label, autocomplete, side = '', hint = '') => `<div class="field">
      <div class="row" style="justify-content:space-between"><label for="f-${name}">${label}</label>${side}</div>
      <div class="pw-wrap"><input class="input" id="f-${name}" name="${name}" type="password" autocomplete="${autocomplete}" required>
        <button type="button" class="pw-toggle" aria-label="Show password">${icon('eye')}</button></div>
      ${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;

  const google = (label) => googleOn ? `<div class="divider"><span>or</span></div>
      <button type="button" class="btn btn-block btn-lg btn-google" data-google>${GOOGLE_LOGO}<span>${label}</span></button>` : '';

  const submit = (label) => `<div class="form-error" id="authErr" role="alert"></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${label}</button>`;

  // ── Views ──
  function body() {
    if (Store.initError) {
      return `<div class="auth-icon">${icon('alert')}</div>
        <div class="auth-head center"><h1>Can't reach the server</h1><p>Connect to the internet the first time you open ${PRODUCT}, then try again.</p></div>
        <button class="btn btn-primary btn-lg btn-block" onclick="location.reload()">Try again</button>`;
    }
    switch (view) {
      case 'signup':
        return `<div class="auth-head"><h1>Create your account</h1><p>Set up your institute in under a minute</p></div>
          ${tabs()}
          <form id="authForm" class="stack" novalidate>
            ${input('institute', 'Institute name', 'text', 'autocomplete="organization" placeholder="e.g. Bright Future Computer Centre" required')}
            ${input('email', 'Email', 'email', `autocomplete="email" placeholder="you@example.com" value="${esc(email)}" required`)}
            ${password('password', 'Password', 'new-password', '', 'At least 8 characters')}
            ${submit('Create account')}
          </form>
          ${google('Sign up with Google')}
          <p class="auth-note">We'll email you a link to verify your address.</p>
          <p class="auth-switch">Already have an account? <button class="link-btn" data-view="signin">Sign in</button></p>`;
      case 'sent':
        return `<div class="auth-icon">${icon('mail')}</div>
          <div class="auth-head center"><h1>Check your inbox</h1>
            <p>We sent a verification link to <b style="color:var(--text)">${esc(email)}</b>. Open it to activate your account — you'll be signed in automatically.</p></div>
          <button class="btn btn-primary btn-lg btn-block" data-view="signin">Back to sign in</button>
          <p class="auth-switch">Didn't get it? Check spam, or <button class="link-btn" data-resend>resend the email</button></p>`;
      case 'forgot':
        return `<div class="auth-head"><h1>Reset your password</h1><p>Enter your account email and we'll send you a link to set a new password.</p></div>
          <form id="authForm" class="stack" novalidate>
            ${input('email', 'Email', 'email', `autocomplete="email" value="${esc(email)}" required`)}
            ${submit('Send reset link')}
          </form>
          <p class="auth-switch"><button class="link-btn" data-view="signin">${icon('arrowLeft')} Back to sign in</button></p>`;
      case 'forgot-sent':
        return `<div class="auth-icon">${icon('mail')}</div>
          <div class="auth-head center"><h1>Check your inbox</h1>
            <p>If an account exists for <b style="color:var(--text)">${esc(email)}</b>, you'll receive a link to reset your password.</p></div>
          <button class="btn btn-primary btn-lg btn-block" data-view="signin">Back to sign in</button>`;
      case 'reset':
        return `<div class="auth-head"><h1>Set a new password</h1><p>Choose a new password for your account.</p></div>
          <form id="authForm" class="stack" novalidate>
            ${password('password', 'New password', 'new-password', '', 'At least 8 characters')}
            ${password('confirm', 'Confirm new password', 'new-password')}
            ${submit('Update password')}
          </form>`;
      case 'blocked': {
        const st = Store.accountStatus();
        const note = Store.accountNote();
        const info = {
          pending: ['clock', 'Waiting for approval', "Your institute account has been created and verified. An administrator will review it shortly — you'll get access as soon as it is approved."],
          paused: ['alert', 'Account paused', 'This institute account has been paused by the administrator. Please get in touch to have it switched back on.'],
          rejected: ['alert', 'Account not approved', 'This institute account was not approved for use.']
        }[st] || ['alert', 'Account unavailable', 'This account cannot be used right now.'];
        return `<div class="auth-icon">${icon(info[0])}</div>
          <div class="auth-head center"><h1>${info[1]}</h1><p>${esc(info[2])}</p></div>
          ${note ? `<div class="notice">${icon('message')}<span>${esc(note)}</span></div>` : ''}
          <div class="stack">
            <button class="btn btn-primary btn-lg btn-block" data-recheck>${icon('check')} Check again</button>
            <button class="btn btn-block" data-signout>${icon('logout')} Sign out</button>
          </div>
          <p class="auth-note">${icon('mail')} Signed in as ${esc(Store.userEmail())}</p>`;
      }
      case 'local': {
        const setup = Store.auth.needsSetup();
        return `<div class="auth-head"><h1>${setup ? 'Set up this device' : 'Welcome back'}</h1>
            <p>${setup ? 'Create a password to protect the admin panel' : `Enter your password to open ${esc(Store.settings().name)}`}</p></div>
          <form id="authForm" class="stack" novalidate>
            ${setup ? input('institute', 'Institute name', 'text', `value="${esc(Store.settings().name)}" required`) : ''}
            ${password('password', 'Password', setup ? 'new-password' : 'current-password')}
            ${setup ? password('confirm', 'Confirm password', 'new-password') : ''}
            ${submit(setup ? 'Create & continue' : 'Unlock')}
          </form>
          <p class="auth-note">${icon('device')} Local mode · data stays on this device</p>`;
      }
      default:
        return `<div class="auth-head"><h1>Welcome back</h1><p>Sign in to your institute account</p></div>
          ${tabs()}
          <form id="authForm" class="stack" novalidate>
            ${input('email', 'Email', 'email', `autocomplete="email" placeholder="you@example.com" value="${esc(email)}" required`)}
            ${password('password', 'Password', 'current-password', '<button type="button" class="link-btn small" data-view="forgot">Forgot password?</button>')}
            ${submit('Sign in')}
          </form>
          ${google('Continue with Google')}
          <p class="auth-switch">New to ${PRODUCT}? <button class="link-btn" data-view="signup">Create an account</button></p>`;
    }
  }

  function render() {
    const el = $('#login');
    el.innerHTML = `<div class="auth">
      ${brandPanel()}
      <main class="auth-main">
        <div class="auth-mobile-logo"><img src="icons/icon-192.png" alt=""><span>${PRODUCT}</span></div>
        <div class="auth-card">
          ${banner ? `<div class="notice ${banner.type === 'error' ? 'error' : ''}">${icon(banner.type === 'error' ? 'alert' : 'checkCircle')}<span>${esc(banner.text)}</span></div>` : ''}
          ${body()}
        </div>
        <p class="auth-legal">Your data is private to your institute account.</p>
      </main></div>`;
    el.hidden = false;
    bind(el);
    if (view === 'blocked') startPoll(); else stopPoll();
    const first = el.querySelector('#authForm input:not([value]), #authForm input[value=""]');
    if (first && window.innerWidth > 860) first.focus();
  }

  // ── Behaviour ──
  function go(next, keepBanner) {
    const e = $('#f-email');
    if (e && e.value) email = e.value.trim();
    view = next;
    if (!keepBanner) banner = null;
    render();
  }

  function busy(btn, on, text) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${esc(text)}`; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }

  // While an institute waits for approval, look again every 20 seconds
  let pollTimer = null;
  function stopPoll() { clearInterval(pollTimer); pollTimer = null; }
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(async () => {
      if (view !== 'blocked') { stopPoll(); return; }
      if (await Store.auth.recheck().catch(() => false)) { stopPoll(); done(); }
    }, 20000);
  }

  function done() {
    banner = null;
    $('#login').hidden = true;
    App.start();
  }

  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function bind(el) {
    $$('[data-view]', el).forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    $$('.pw-toggle', el).forEach((b) => b.addEventListener('click', () => {
      const i = b.previousElementSibling;
      const show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      b.innerHTML = icon(show ? 'eyeOff' : 'eye');
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }));
    const recheck = $('[data-recheck]', el);
    if (recheck) recheck.addEventListener('click', async () => {
      busy(recheck, true, 'Checking…');
      if (await Store.auth.recheck().catch(() => false)) { done(); return; }
      busy(recheck, false);
      banner = { type: 'error', text: 'Not approved yet. Please check again in a little while.' };
      render();
    });
    const out = $('[data-signout]', el);
    if (out) out.addEventListener('click', async () => {
      await Store.auth.logout().catch(() => {});
      location.replace(location.pathname);
    });
    const g = $('[data-google]', el);
    if (g) g.addEventListener('click', async () => {
      busy(g, true, 'Redirecting to Google…');
      try { await Store.auth.google(); }
      catch (e) { banner = { type: 'error', text: e.message }; render(); }
    });
    const r = $('[data-resend]', el);
    if (r) r.addEventListener('click', async () => {
      const wait = Math.ceil((resendAt - Date.now()) / 1000);
      if (wait > 0) { banner = { type: 'error', text: `Please wait ${wait}s before sending another email.` }; render(); return; }
      try {
        await Store.auth.resend(email);
        resendAt = Date.now() + 60000;
        banner = { type: 'ok', text: `Verification email sent again to ${email}.` };
      } catch (e) { banner = { type: 'error', text: e.message }; }
      render();
    });

    const f = $('#authForm', el);
    if (!f) return;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = UI.formData(f);
      const err = $('#authErr', el);
      const btn = f.querySelector('button[type=submit]');
      const fail = (m) => { err.textContent = m; };
      err.textContent = '';
      if (d.email != null) email = d.email;

      try {
        if (view === 'signin') {
          if (!validEmail(d.email)) return fail('Enter a valid email address.');
          if (!d.password) return fail('Enter your password.');
          busy(btn, true, 'Signing in…');
          await Store.auth.login(d.email, d.password);
          done();
        } else if (view === 'signup') {
          if (!d.institute) return fail('Enter your institute name.');
          if (!validEmail(d.email)) return fail('Enter a valid email address.');
          if (d.password.length < 8) return fail('Password must be at least 8 characters.');
          busy(btn, true, 'Creating account…');
          const res = await Store.auth.signUp(d.email, d.password, d.institute);
          if (res && res.needsConfirm) { resendAt = Date.now() + 60000; go('sent'); }
          else done();
        } else if (view === 'forgot') {
          if (!validEmail(d.email)) return fail('Enter a valid email address.');
          busy(btn, true, 'Sending…');
          await Store.auth.resetPassword(d.email);
          go('forgot-sent');
        } else if (view === 'reset') {
          if (d.password.length < 8) return fail('Password must be at least 8 characters.');
          if (d.password !== d.confirm) return fail('Passwords do not match.');
          busy(btn, true, 'Updating…');
          await Store.auth.updatePassword(d.password);
          UI.toast('Password updated');
          done();
        } else if (view === 'local') {
          if (Store.auth.needsSetup()) {
            if (d.password.length < 4) return fail('Use at least 4 characters.');
            if (d.password !== d.confirm) return fail('Passwords do not match.');
            await Store.auth.setup(d.password);
            await Store.saveSettings({ name: d.institute || Store.settings().name });
          } else {
            await Store.auth.login('', d.password);
          }
          done();
        }
      } catch (e) {
        busy(btn, false);
        if (e.code === 'status') { go('blocked'); return; } // signed in, but not approved yet
        if (e.code === 'unconfirmed') {
          banner = { type: 'error', text: 'Please verify your email before signing in. Check your inbox, or resend the link below.' };
          go('sent', true);
          return;
        }
        fail(e.message);
      }
    });
  }

  window.AuthView = {
    show() {
      const u = Store.urlState();
      email = email || Store.lastEmail();
      banner = null;
      if (Store.mode === 'local') view = 'local';
      else if (Store.accountStatus() && Store.accountStatus() !== 'approved') view = 'blocked';
      else if (u.recovery) view = 'reset';
      else if (u.error) { view = 'signin'; banner = { type: 'error', text: 'That link is invalid or has expired. Please sign in or request a new link.' }; }
      else if (!['signin', 'signup'].includes(view)) view = 'signin';
      render();
    }
  };
})();

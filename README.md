# Institute Manager

This app runs a computer institute: students, courses and batches, monthly fee collection, printable receipts, pending dues, attendance, expenses and monthly reports. It works on a computer and installs on Android as an app (PWA or APK).

**Stack:** plain HTML/CSS/JS (no build step) · **Supabase** (accounts + database + live sync) · **Vercel** (hosting, auto-deploys from GitHub `main`).

---

## Accounts

- **Create account** asks for the institute name, email and password. Supabase sends a verification email. Clicking the link activates the account and signs the user straight in.
- **Sign in** needs email and password. **Forgot password?** emails a reset link that opens a "Set a new password" screen.
- **Every account is its own institute.** Its students, fees and attendance are private to it. The database enforces this with Row Level Security, so one account can never see or change another's data.
- Sign-up details are saved in the `profiles` table (email, institute name, date). The institute name also becomes the name shown on the dashboard and on receipts.

### Supabase dashboard settings (one-time)

1. **Authentication → URL Configuration**
   - **Site URL:** your Vercel address, e.g. `https://vsmart.vercel.app`
   - **Redirect URLs:** add the same address followed by `/**`

   This makes the verification and password-reset emails open your app. Without it they point to `localhost`.
2. *(Optional)* **Authentication → Emails:** customise the "Confirm signup" and "Reset password" templates with your branding.
3. *(Optional)* Supabase's built-in email sender only allows a few emails per hour. If many people will sign up, connect your own SMTP under **Authentication → SMTP Settings** (free options: Resend, Brevo).

### Google sign-in (free, optional)

The **Continue with Google** button is built in but hidden until you set it up:

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create a project → **APIs & Services → OAuth consent screen**. Choose External, fill in the app name "Institute Manager" and your email, and publish it.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - **Authorized JavaScript origins:** your Vercel address
   - **Authorized redirect URIs:** `https://hqvnrwmiefnrkmmhxxyr.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client secret**, then paste them into Supabase → **Authentication → Sign In / Providers → Google**, turn it on, and save.
4. In [`js/config.js`](js/config.js), set `auth: { google: true }`, then commit and push.

People who sign up with Google are asked for their institute name on first login.

---

## How sync works

- Data lives in Supabase (Postgres) and updates live on every device the account is signed in on.
- Each device keeps a copy, so the app **opens and works offline**. Changes made offline are uploaded automatically once you're back online. The sidebar shows *Syncing…* or *Offline* when this is happening.
- **Settings → Download backup** saves everything to a JSON file. **Restore backup** loads it back (this replaces the current data).

## Database

[`supabase/schema.sql`](supabase/schema.sql) builds everything:
- **`profiles`:** one row per account.
- **Data tables:** `students`, `courses`, `batches`, `payments`, `attendance`, `expenses` and `settings`. Each has `owner` (the account), `id` and `data jsonb`.
- **Access rules:** owner-only.
- **Live updates:** turned on for every data table.
- **Sign-up trigger:** fills in `profiles` and the institute name automatically.

To use a different Supabase project, run that file in its SQL editor and update `js/config.js`. The anon key in `config.js` is safe to be public, because the access rules protect the data.

## Deploying

Vercel is connected to the GitHub repo. **Every push to `main` deploys automatically.** No build settings are needed.

```bash
git add -A
git commit -m "Describe your change"
git push origin main
```

---

## Install on Android

### Option A: Install from Chrome (instant)
Open your Vercel link in **Chrome** on the phone → ⋮ menu → **Install app**.

### Option B: Real APK file
1. Go to <https://www.pwabuilder.com>, paste your Vercel link and click **Start**.
2. Click **Package for stores → Android → Generate package** and download it.
3. The zip contains:
   - an **`.apk`** file: copy it to your phone and open it to install.
   - an **`.aab`** file: only needed for the Play Store.
   - **`assetlinks.json`** and a **signing key**. **Keep the signing key safe.**
4. **To hide the address bar inside the APK:** put `assetlinks.json` in a `.well-known/` folder in this repo, then push.

The APK loads your live site, so every push to `main` updates the app on every phone automatically.

---

## Files

| Path | What it is |
|---|---|
| `index.html` | App shell |
| `css/styles.css` | Design system (light and dark), including the sign-in page |
| `js/config.js` | Supabase URL, anon key and the Google sign-in switch |
| `js/auth.js` | Sign in, create account, email verification and password reset screens |
| `js/store.js` | Data layer: Supabase auth and sync, offline cache and upload queue |
| `js/logic.js` | Fee, dues and attendance rules |
| `js/pages/*.js` | Dashboard, Students, Fees, Attendance, Setup pages |
| `supabase/schema.sql` | Database tables, access rules and the sign-up trigger |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and Android install |
| `vercel.json` | Hosting headers |

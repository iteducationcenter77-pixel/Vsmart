# Institute Manager

This app runs a computer institute: students, courses and batches, monthly fee collection, printable receipts, pending dues, attendance, expenses and monthly reports. It works on a computer and installs on Android as an app (PWA or APK).

**Stack:** plain HTML/CSS/JS (no build step) · **Supabase** (accounts + database + live sync) · **Vercel** (hosting, auto-deploys from GitHub `main`).

---

## Accounts

- **Create account** asks for the institute name, email and password (8+ characters). Supabase sends a verification email. Clicking the link activates the account and signs the user straight in.
- **Sign in** needs email and password. **Forgot password?** emails a reset link that opens a "Set a new password" screen.
- **New accounts start as `pending`** and see a "Waiting for approval" screen with no data until an administrator approves them (see below). The screen re-checks every 20 seconds and has a "Check again" button.
- **Every account is its own institute.** Its students, fees and attendance are private to it. The database enforces this with Row Level Security, so one account can never see or change another's data — and it only answers at all while the account is approved.
- Sign-up details are saved in the `profiles` table (email, institute name, date, status). The institute name also becomes the name shown on the dashboard and on receipts.

## Administrator console — `/admin`

`https://your-site.vercel.app/admin` is a separate page, not linked anywhere on the public site and marked "do not index". It signs in with its own email and password.

What it shows: every institute with its email, sign-up date, student and receipt counts, fees collected and last activity — plus totals across all institutes, a search box and status filters.

What you can do to an account:

| Action | Effect |
|---|---|
| **Approve** | The institute can use the app |
| **Pause** | Access stops immediately, even if they are signed in; data is kept |
| **Set pending** | Back to "waiting for approval" |
| **Reject** | Access refused; data is kept |

You can also leave a **note**, shown on that institute's sign-in screen (e.g. "Approved after phone verification").

Approving or pausing takes effect **instantly**: an institute with the app open is switched over within a second.

**Who can open it:** only accounts listed in the `app_superadmins` table. Everyone else is signed out again with "That account is not an administrator", and the database refuses every admin query regardless of the page. To add an administrator, run this in Supabase → SQL Editor:

```sql
insert into public.app_superadmins (user_id, email)
select id, email from auth.users where lower(email) = lower('you@example.com');
```

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

## Day to day

- **Student photos:** edit a student → **Add photo**. Shown in the student list, their profile and attendance; shrunk automatically before saving.
- **Running balance:** Reports shows this month's collection and expenses, and underneath **brought forward + collected − expenses = net balance till date**, so earlier months carry over.
- **Institute logo:** Settings → Institute profile → Upload logo. Printed on every fee receipt.
- **Exports:** Students, Payments, Reports and the Attendance register all download CSV files for Excel.

## Database

[`supabase/schema.sql`](supabase/schema.sql) builds everything:
- **`profiles`:** one row per account.
- **Data tables:** `students`, `courses`, `batches`, `payments`, `attendance`, `expenses` and `settings`. Each has `owner` (the account), `id` and `data jsonb`.
- **Access rules:** owner-only, and only while that account's status is `approved`.
- **`app_superadmins`:** who may open `/admin`; `admin_institutes()` and `admin_set_status()` are the only ways in.
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
| `js/auth.js` | Sign in, create account, email verification, password reset and approval screens |
| `admin.html`, `js/admin.js` | Administrator console at `/admin` |
| `js/store.js` | Data layer: Supabase auth and sync, offline cache and upload queue |
| `js/logic.js` | Fee, dues and attendance rules |
| `js/pages/*.js` | Dashboard, Students, Fees, Attendance, Setup pages |
| `supabase/schema.sql` | Database tables, access rules and the sign-up trigger |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and Android install |
| `vercel.json` | Hosting headers |

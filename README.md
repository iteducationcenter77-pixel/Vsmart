# Institute Manager

This app runs your computer institute: students, courses and batches, monthly fee collection, printable receipts, pending dues, attendance, expenses and monthly reports. You log in to a single admin panel with a password. It works on a computer and installs on Android as an app (PWA or APK).

**Stack:** plain HTML/CSS/JS (no build step) · **Supabase** (login + database + live sync) · **Vercel** (hosting, auto-deploys from GitHub `main`).

---

## First login

1. Open the site and choose **"First time? Create the admin account"**. Enter the institute name, your email and a password (6+ characters).
2. Supabase emails you a confirmation link. Open it; it brings you back to the app, already signed in.
3. **The first account to sign in becomes the admin. After that, nobody else can get access,** even if they create an account. This is enforced in the database (see [`supabase/schema.sql`](supabase/schema.sql)).

**Suggested first steps inside the app:**
1. **Courses & Batches → + Course.** Add each course with its monthly fee, admission fee and duration.
2. **+ Batch.** Add each timing group (e.g. "Morning A · 8–9 AM").
3. **Students → Add student.** Fees fill in from the course, and you can change them for a concession.
4. **Collect Fee.** Pick a student, tick the months being paid, and save. The receipt can be printed, saved as PDF or shared on WhatsApp.
5. **Attendance.** Pick a batch, tap P / A / L, and save. Use **Register** for the monthly sheet.

---

## How sync works

- Data lives in Supabase (Postgres) and updates live on every device you are logged in on.
- The app keeps a copy on each device, so it **opens and works offline**. Changes made offline are queued and uploaded automatically when you're back online. The sidebar shows *Syncing…* or *Offline* when this is happening.
- **Settings → Download backup** saves everything to a JSON file. **Restore backup** loads it back (this replaces the current data).

## Supabase setup (already done for this project)

- The tables `students`, `courses`, `batches`, `payments`, `attendance`, `expenses` and `settings` each have `id text` + `data jsonb`. `app_admins` stores the admin.
- Row Level Security: only the admin can read or write. Realtime is enabled on every table.
- `js/config.js` holds the project URL and the **publishable (anon) key**. Both are safe to be public because RLS protects the data.

To use a different Supabase project, run `supabase/schema.sql` in its SQL editor and update `js/config.js`.

**Recommended in the Supabase dashboard:** in Authentication → URL Configuration, set **Site URL** to your Vercel address, so confirmation emails link back to the live app.

## Deploying

Vercel is connected to the GitHub repo. **Every push to `main` deploys automatically.** No build settings are needed; Vercel serves the files as they are.

```bash
git add -A
git commit -m "Describe your change"
git push origin main
```

---

## Install on Android

### Option A: Install from Chrome (instant)
Open your Vercel link in **Chrome** on the phone → ⋮ menu → **Install app**. It gets its own icon, opens full-screen, and works offline.

### Option B: Real APK file
1. Go to <https://www.pwabuilder.com>, paste your Vercel link and click **Start**.
2. Click **Package for stores → Android → Generate package** and download it.
3. The zip contains:
   - an **`.apk`** file: copy it to your phone and open it to install (allow "Install unknown apps").
   - an **`.aab`** file: only needed for the Google Play Store.
   - **`assetlinks.json`** and a **signing key**. **Keep the signing key safe**, because you need it to publish updates.
4. **To hide the address bar inside the APK:** put `assetlinks.json` in a folder named `.well-known/` in this repo, then push.

The APK loads your live site, so pushing to `main` updates the app on every phone automatically. You don't need to rebuild the APK.

---

## Everyday tips

- **Receipt header:** Settings → Institute profile (name, address, phone, receipt prefix, footer note).
- **Concession:** edit the student's monthly fee, or enter a discount while collecting.
- **Advance fees:** on Collect Fee, tick the upcoming months.
- **Student leaves or finishes:** edit the student → Status = Completed/Dropped. Fees stop from that month.
- **Exports:** Students, Payments, Reports and the Attendance register all download CSV files for Excel.
- **Forgot password:** reset it in the Supabase dashboard → Authentication → Users.

## Files

| Path | What it is |
|---|---|
| `index.html` | App shell |
| `css/styles.css` | Design system (light and dark) |
| `js/config.js` | Supabase URL and publishable key |
| `js/store.js` | Data layer: Supabase sync, offline cache and upload queue (local mode if no config) |
| `js/logic.js` | Fee, dues and attendance rules |
| `js/pages/*.js` | Dashboard, Students, Fees, Attendance, Setup pages |
| `supabase/schema.sql` | Database tables, security rules and the admin claim |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and Android install |
| `vercel.json` | Hosting headers |

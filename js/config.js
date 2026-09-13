/*
 * ─── Cloud sync configuration (Supabase) ────────────────────────────────
 * url     : Supabase → Project Settings → API → Project URL
 * anonKey : Supabase → Project Settings → API Keys → publishable / anon key
 *
 * These two values are safe to publish — every table is protected by
 * Row Level Security so only the admin account can read or write data.
 *
 * Leave url empty to run in LOCAL MODE (data stays on this device only).
 */
window.IMS_CONFIG = {
  supabase: {
    url: "",
    anonKey: ""
  }
};

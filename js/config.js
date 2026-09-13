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
    url: "https://hqvnrwmiefnrkmmhxxyr.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxdm5yd21pZWZucmttbWh4eHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NDI5MTIsImV4cCI6MjA5OTMxODkxMn0.vIY-SCQgrlog1g0Ob1J7gc7eob9uo5_Oqhvf2K73o5k"
  },
  auth: {
    // Set to true after enabling the Google provider in Supabase (see README → "Google sign-in").
    google: false
  }
};

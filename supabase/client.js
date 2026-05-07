// Creates `window.supabaseClient` using `supabase-js` loaded from a CDN.
// Requires `supabase/config.js` to be loaded first.
(function () {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase library not loaded. Add supabase-js <script> before this file.");
    return;
  }
  const url = String(window.SUPABASE_URL || "").trim();
  const anonKey = String(window.SUPABASE_ANON_KEY || "").trim();
  if (
    !url
    || !anonKey
    || url.indexOf("YOUR_PROJECT_REF") >= 0
    || anonKey.indexOf("YOUR_SUPABASE_ANON_KEY") >= 0
    || anonKey.indexOf("PASTE_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE") >= 0
  ) {
    console.error("Supabase config missing. Update supabase/config.js with your project URL and public anon/publishable key.");
    return;
  }
  if (anonKey.indexOf("sb_secret_") === 0) {
    console.error("Supabase config uses a secret key. Use the public anon/publishable key in browser code, never an sb_secret key.");
    return;
  }

  window.supabaseClient = window.supabase.createClient(url, anonKey, {
    auth: {
      // OAuth returns a session in the URL hash; this enables parsing it.
      detectSessionInUrl: true,
      flowType: "implicit",
      persistSession: true,
      autoRefreshToken: true
    }
  });
})();

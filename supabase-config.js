/*
 * Shared Supabase client bootstrap.
 * What this file does:
 * - Stores project URL and anon key used by all pages.
 * - Exposes one reusable client factory on window scope.
 * Why this approach:
 * - Prevents duplicate client creation and session drift across pages.
 * - Keeps connection config centralized for easier maintenance.
 */
// Set these or inject them using a build tool, referencing the .env file.
window.BCH_SUPABASE_URL = "YOUR_PROJECT_ID";
window.BCH_SUPABASE_ANON_KEY = "YOUR_PUBLIC_ANON_KEY";

// Returns a singleton Supabase client used by portal, auth, and admin scripts.
window.getBchSupabaseClient = function getBchSupabaseClient() {
  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase JS SDK is not loaded.");
    return null;
  }

  if (window.BCH_SUPABASE_URL.includes("YOUR_PROJECT_ID") || window.BCH_SUPABASE_ANON_KEY.includes("YOUR_PUBLIC_ANON_KEY")) {
    console.warn("Set BCH_SUPABASE_URL and BCH_SUPABASE_ANON_KEY in supabase-config.js");
    return null;
  }

  if (!window.__bchSupabase) {
    window.__bchSupabase = window.supabase.createClient(window.BCH_SUPABASE_URL, window.BCH_SUPABASE_ANON_KEY);
  }
  return window.__bchSupabase;
};


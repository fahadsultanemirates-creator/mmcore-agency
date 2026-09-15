// M&MCore Agency — Supabase client configuration
// This uses the publishable (anon) key, safe for browser use.
// Security is enforced by Row Level Security (RLS) rules on the database.
const SUPABASE_URL = 'https://bnjbxjvnibotshxpdnsg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3KC3sqeONPkWRlQRYrMSuA_VNFlG6jG';

// Some pages need only the two constants above -- the chat widget calls
// an Edge Function directly and never touches the SDK. Those pages skip
// loading the supabase-js UMD bundle, so creating the client
// unconditionally threw "Cannot read properties of undefined (reading
// 'createClient')" and killed every script after it on the page.
// marketing-services.html was already in exactly that state.
const supabaseClient = (typeof window !== 'undefined' && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

// The SDK is loaded from a public CDN, which can be blocked by a network
// filter, a strict extension, or simply be down. When that happened,
// every page that needs it died on "Cannot read properties of null
// (reading 'auth')" with a blank screen and no explanation. This puts a
// real message on the page instead, and gives callers one line to guard
// with.
function requireSupabase() {
  if (supabaseClient) return true;

  if (!document.getElementById('sdkUnavailableBanner')) {
    const banner = document.createElement('div');
    banner.id = 'sdkUnavailableBanner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:0.9rem 1.2rem;' +
      'background:#2A0A1D;border-top:1px solid #E5169A;color:#F2F0F1;' +
      'font-family:Inter,sans-serif;font-size:0.88rem;line-height:1.5;text-align:center;';
    banner.innerHTML =
      "We couldn't load a script this page needs, so signing in and placing orders won't work right now. " +
      'Check your connection or any content blocker and reload. ' +
      'Need help now? <a href="https://t.me/mmcore_support" target="_blank" rel="noopener" style="color:#E5169A;">Message us on Telegram</a>.';
    document.body.appendChild(banner);
  }
  return false;
}

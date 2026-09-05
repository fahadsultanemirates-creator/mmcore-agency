// M&MCore Agency — Supabase client configuration
// This uses the publishable (anon) key, safe for browser use.
// Security is enforced by Row Level Security (RLS) rules on the database.
// Keep this value in sync with chat-widget.js.
const SUPABASE_URL = 'https://bnjbxjvnibotshxpdnsg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3KC3sqeONPkWRlQRYrMSuA_VNFlG6jG';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

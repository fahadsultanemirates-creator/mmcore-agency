// M&MCore Agency — Supabase client configuration
// This uses the publishable (anon) key, safe for browser use.
// Security is enforced by Row Level Security (RLS) rules on the database.
//
// IMPORTANT: M&MCore needs its OWN Supabase project, separate from
// AgenticCore's -- these are two different businesses with their own
// users, requests, points balances, and Business Pool status, so they
// cannot share a database. Create a new project at supabase.com, run
// every file under supabase/migrations/ against it in order (Dashboard
// > SQL Editor, or `supabase db push`), then replace the two placeholder
// values below with that project's URL and publishable key (Project
// Settings > API). Keep these two values in sync with chat-widget.js.
const SUPABASE_URL = 'REPLACE_WITH_MMCORE_SUPABASE_PROJECT_URL';
const SUPABASE_PUBLISHABLE_KEY = 'REPLACE_WITH_MMCORE_SUPABASE_PUBLISHABLE_KEY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// M&MCore Agency — lightweight page-view logging. Same pattern as
// chat-widget.js: a direct fetch() call authenticated with the publishable
// key, no supabase-js SDK load needed. Logs one row per page view to the
// page_views table (insert-only for anon -- see the create_page_views
// migration) so total/unique visit counts can be queried from the
// Supabase dashboard or a future admin page.

(function () {
  const SUPABASE_URL = 'https://bnjbxjvnibotshxpdnsg.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3KC3sqeONPkWRlQRYrMSuA_VNFlG6jG';
  const VISITOR_ID_KEY = 'ac_visitor_id';

  function getVisitorId() {
    try {
      let id = localStorage.getItem(VISITOR_ID_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(VISITOR_ID_KEY, id);
      }
      return id;
    } catch {
      // Private browsing / blocked storage -- still log the view, just
      // without a stable visitor id to dedupe against.
      return null;
    }
  }

  fetch(`${SUPABASE_URL}/rest/v1/page_views`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      path: location.pathname,
      referrer: document.referrer || null,
      visitor_id: getVisitorId()
    })
  }).catch(() => {
    // Best-effort -- a blocked/failed log must never affect the page.
  });
})();

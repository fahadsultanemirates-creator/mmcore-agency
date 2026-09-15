// M&MCore Agency — shared site chrome: nav scroll state, the mobile
// menu, and the footer year. Loaded by every page that renders the
// standard <nav>/<footer>, including dashboard.html and admin.html
// (which previously skipped it, so their nav never got its scrolled
// border and had no mobile menu at all).

// -------- Nav scroll state --------
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// -------- Mobile menu --------
// Built from the existing .nav-links / .nav-cta contents rather than
// duplicated into all 11 HTML files. Below 860px main.css hides both of
// those and shows the toggle + this drawer instead; above it, the
// drawer is never displayed and the desktop nav is untouched.
(function initMobileNav() {
  if (!nav) return;

  const inner = nav.querySelector('.nav-inner');
  const links = nav.querySelector('.nav-links');
  const cta = nav.querySelector('.nav-cta');
  if (!inner || (!links && !cta)) return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-menu-toggle';
  toggle.id = 'navMenuToggle';
  toggle.setAttribute('aria-label', 'Open menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'navMobileMenu');
  toggle.innerHTML = `
    <svg class="icon-open" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    <svg class="icon-close" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  `;
  inner.appendChild(toggle);

  const menu = document.createElement('div');
  menu.className = 'nav-mobile-menu';
  menu.id = 'navMobileMenu';
  menu.hidden = true;

  if (links) {
    links.querySelectorAll('a').forEach((a) => {
      const copy = a.cloneNode(true);
      copy.className = 'nav-mobile-link';
      menu.appendChild(copy);
    });
  }

  if (cta) {
    const actions = document.createElement('div');
    actions.className = 'nav-mobile-actions';
    // Buttons (e.g. "Log out" on the dashboard) carry real listeners
    // that a clone would drop, so those are moved rather than copied --
    // .nav-cta is hidden on mobile anyway, and on desktop the drawer is
    // never shown. Links are safe to clone.
    Array.from(cta.children).forEach((child) => {
      if (child.tagName === 'BUTTON') {
        const proxy = document.createElement('button');
        proxy.type = 'button';
        proxy.className = child.className;
        proxy.textContent = child.textContent;
        proxy.addEventListener('click', () => child.click());
        actions.appendChild(proxy);
      } else {
        actions.appendChild(child.cloneNode(true));
      }
    });
    menu.appendChild(actions);
  }

  nav.appendChild(menu);

  function setOpen(open) {
    menu.hidden = !open;
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  toggle.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) setOpen(false);
  });
})();

// -------- Footer year --------
// Was hardcoded to 2026 in nine separate footers.
document.querySelectorAll('.footer-year').forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

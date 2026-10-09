// Shared behaviour for oladipupo.com.ng — used by index.html and cv.html
document.querySelectorAll('.year').forEach((el) => { el.textContent = new Date().getFullYear(); });

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scroll reveal: fire once per element.
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.setAttribute('data-visible', ''); io.unobserve(e.target); }
  }
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });
document.querySelectorAll('.reveal, .rows, .cards, .jobs, .chips').forEach((el) => io.observe(el));

// Portrait parallax: slow drift as the page scrolls (decorative, marketing surface).
const portrait = document.querySelector('.portrait');
if (portrait && !reduce && window.matchMedia('(min-width: 1200px)').matches) {
  let ticking = false;
  const update = () => {
    const y = Math.min(window.scrollY * 0.12, 160);
    portrait.style.transform = `translateY(${y}px)`;
    ticking = false;
  };
  window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
}

// Theme toggle: light (lime page) <-> dark (inverted: charcoal page, lime ink).
const root = document.documentElement;
const toggle = document.querySelector('.theme-toggle');
const syncToggle = () => {
  const dark = root.getAttribute('data-theme') === 'dark';
  toggle.setAttribute('aria-pressed', String(dark));
  toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#cddc39' : '#1b1b1b');
};
const applyTheme = (dark) => {
  if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  syncToggle();
};
toggle.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') !== 'dark';
  if (document.startViewTransition && !reduce) document.startViewTransition(() => applyTheme(next));
  else applyTheme(next);
});
syncToggle();

// Mobile menu.
const nav = document.querySelector('.nav');
const burger = document.querySelector('.burger');
burger.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});
nav.querySelectorAll('ul a').forEach((a) => a.addEventListener('click', () => {
  nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false');
}));

// Cursor glow, pointer devices only.
const glow = document.querySelector('.glow');
if (!reduce && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let gx = innerWidth / 2, gy = innerHeight / 2, tx = gx, ty = gy;
  window.addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
  (function loop() {
    gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
    glow.style.transform = `translate(${gx - 260}px, ${gy - 260}px)`;
    requestAnimationFrame(loop);
  })();
}

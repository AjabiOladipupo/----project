// Runs before first paint (loaded synchronously in <head>) so a saved dark
// theme never flashes lime. Kept in a file, not inline, so the CSP can forbid inline scripts.
(function () {
  try {
    if (localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
})();

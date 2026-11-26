// Sets the theme before first paint: the one picked in Spans, else the system's (kept outside the bundle on purpose).
(function () {
  var theme = null;
  try {
    theme = window.localStorage.getItem('spans:theme');
  } catch {
    /* storage unavailable */
  }
  if (theme !== 'light' && theme !== 'dark') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();

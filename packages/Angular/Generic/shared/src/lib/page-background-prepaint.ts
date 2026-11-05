import { PREPAINT_PAGE_ATTR, PRELOAD_OVERLAY_KEY, PRELOAD_PAGE_KEY } from './theme.service';

/**
 * The inline pre-paint snippet for the page background — paste it, wrapped in a `<script>`, in
 * the host's `index.html` `<head>`, AFTER the script that sets `data-theme` and
 * `data-theme-overlay` from localStorage.
 *
 * A production build inlines only the critical CSS until the bundle's stylesheet loads, and that
 * subset drops the `[data-theme="dark"]` override of `--mj-bg-page`, so the frame before the
 * bundle painted the light page for dark-mode users. This snippet sets the background the theme
 * service last resolved ({@link PRELOAD_PAGE_KEY}, written by `ThemeService`) inline on `<html>`
 * before first paint, when it was resolved under the same base theme and brand overlay the head
 * script just restored (`mj-theme-overlay` is {@link PRELOAD_OVERLAY_KEY}). The inline values come
 * off at the window `load` event, once the full stylesheet applies, and `ThemeService` removes
 * them too when it applies a theme, so a later theme change is never held back by them.
 *
 * Exported as a string so hosts carry a versioned copy and the reference host's copy can be
 * pinned by a test. Dependency-free by necessity, and fails open.
 */
export const PAGE_BACKGROUND_PREPAINT_SCRIPT = `(function () {
  try {
    var raw = localStorage.getItem('${PRELOAD_PAGE_KEY}');
    if (!raw) return;
    var page = JSON.parse(raw);
    var root = document.documentElement;
    var scheme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var overlay = root.getAttribute('data-theme-overlay') || null;
    if (!page || typeof page.bg !== 'string' || !page.bg || page.scheme !== scheme || (page.overlay || null) !== overlay) return;
    root.style.setProperty('--mj-bg-page', page.bg);
    root.style.setProperty('background-color', page.bg);
    root.style.setProperty('color-scheme', scheme);
    root.setAttribute('${PREPAINT_PAGE_ATTR}', '');
    window.addEventListener('load', function () {
      if (!root.hasAttribute('${PREPAINT_PAGE_ATTR}')) return;
      root.style.removeProperty('--mj-bg-page');
      root.style.removeProperty('background-color');
      root.style.removeProperty('color-scheme');
      root.removeAttribute('${PREPAINT_PAGE_ATTR}');
    });
  } catch (e) { /* fail open: the critical CSS paints the first frame */ }
})();`;

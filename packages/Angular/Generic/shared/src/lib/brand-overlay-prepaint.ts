import { PRELOAD_OVERLAY_CSS_KEY, PRELOAD_OVERLAY_KEY, PRELOAD_STYLE_ATTR } from './theme.service';

/**
 * The inline pre-paint snippet for the org brand overlay — paste it, wrapped in a `<script>`,
 * at the TOP of the host's `index.html` `<body>`, before the app's root element. Not `<head>`:
 * the snippet appends its `<style>` to the end of `<head>`, and it has to land after the app
 * stylesheet link to win the cascade (the overlay's `[data-theme-overlay]` selectors tie the
 * compiled `:root` tokens on specificity, so source order decides); Angular injects that link
 * just before `</head>`, so from `<head>` the snippet always runs first and loses. It
 * re-injects the overlay CSS that
 * {@link ThemeService.ApplyBrandOverlay} persisted, so the static frame BEFORE the Angular
 * bundle boots already carries the brand. Everything Angular renders is covered by
 * {@link ThemeService.RestorePersistedBrandOverlay} (explorer-app calls it in its constructor);
 * this snippet covers the one frame that runs before any package code can.
 *
 * Exported as a string so hosts carry a versioned copy rather than a hand-written one, and so
 * the reference host's copy can be pinned by a test. Dependency-free by necessity, fails open,
 * and shares the storage keys and the marker attribute with the service, so the two are
 * idempotent and bootstrap's real stylesheet replaces either.
 */
export const BRAND_OVERLAY_PREPAINT_SCRIPT = `(function () {
  try {
    var id = localStorage.getItem('${PRELOAD_OVERLAY_KEY}');
    var raw = id && localStorage.getItem('${PRELOAD_OVERLAY_CSS_KEY}');
    if (!id || !raw) return;
    var entry = JSON.parse(raw);
    if (!entry || entry.id !== id || typeof entry.css !== 'string') return;
    if (document.querySelector('style[${PRELOAD_STYLE_ATTR}]')) return;
    var style = document.createElement('style');
    style.setAttribute('${PRELOAD_STYLE_ATTR}', id);
    style.textContent = entry.css;
    document.head.appendChild(style);
    document.documentElement.setAttribute('data-theme-overlay', id);
  } catch (e) { /* fail open: the stock frame paints, bootstrap brands it later */ }
})();`;

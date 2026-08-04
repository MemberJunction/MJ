/**
 * @fileoverview Pure HTML for the magic-link redemption interstitial. No DB, no
 * MJ runtime imports — deterministic string in, string out.
 * @module @memberjunction/server/auth/magicLink
 */

/** Minimal HTML-escape for safe interpolation into attribute/text content. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the redemption landing page served by `GET /magic-link/redeem`.
 *
 * GET must be SAFE: link prefetchers, email security scanners, and browser
 * preconnect routinely fetch URLs, and a side-effectful GET would let them burn
 * the single-use token before the human ever clicks. So GET renders this page
 * and the actual redemption happens only when the user submits the form (POST).
 * The "Continue" button is NOT auto-submitted — a bot that merely loads the page
 * (even one that executes JS) does not consume the token; a human gesture does.
 *
 * @param token       the raw magic-link token (embedded in a hidden field)
 * @param actionPath  the same-origin path the form POSTs to (e.g. `/magic-link/redeem`)
 */
export function buildRedeemLandingHtml(token: string, actionPath: string): string {
  const t = escapeHtml(token);
  const action = escapeHtml(actionPath);
  // Hardcoded colors are intentional here — this is a standalone server-rendered
  // HTML response, not Angular component CSS, so the design-token rule doesn't apply.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:#f5f5f5; margin:0; display:flex; min-height:100vh; align-items:center; justify-content:center; }
  .card { background:#fff; padding:2.5rem; border-radius:12px; box-shadow:0 1px 4px rgba(0,0,0,.12); max-width:24rem; text-align:center; }
  h1 { font-size:1.25rem; margin:0 0 .5rem; color:#1f2937; }
  p { color:#4b5563; margin:0 0 1.5rem; font-size:.95rem; }
  button { background:#264FAF; color:#fff; border:0; border-radius:8px; padding:.75rem 1.5rem; font-size:1rem; cursor:pointer; width:100%; }
  button:hover { background:#1e3f8c; }
</style>
</head>
<body>
  <div class="card">
    <h1>Sign in to continue</h1>
    <p>Click below to securely sign in with your invitation link.</p>
    <form method="POST" action="${action}">
      <input type="hidden" name="token" value="${t}">
      <button type="submit">Continue to sign in</button>
    </form>
  </div>
</body>
</html>`;
}

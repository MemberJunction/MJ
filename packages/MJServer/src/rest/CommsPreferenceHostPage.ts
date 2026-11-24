/**
 * @fileoverview Public preference center & double opt-in confirmation host pages.
 *
 * Renders strict CSP-nonce HTML documents for:
 *   - `GET /comms/preferences/:token` (hosts `<mj-comms-preference-center>` when `elementSrc`
 *     is provided, or a vanilla JS/HTML fallback form so footer links always work)
 *   - `GET /comms/confirm/:token` (link-scanner-safe confirmation page with a button that POSTs)
 *   - Error pages
 *
 * All per-request values reach the boot script via HTML-escaped `data-*` attributes;
 * nothing attacker-controlled is interpolated into inline `<script>` blocks.
 *
 * @module @memberjunction/server/rest/CommsPreferenceHostPage
 */

export interface CommsPreferenceHostPageOptions {
    /** UUIDv4 unsubscribe / preference token from `GET /comms/preferences/:token`. */
    Token: string;
    /** URL prefix for `/comms` endpoints (e.g. `/comms` or `/api/comms`). */
    ApiRoot: string;
    /** Per-response CSP nonce. Required so a caller cannot emit a nonce-less page. */
    CspNonce: string;
    /** Optional browser tab title. */
    PageTitle?: string;
    /** Optional URL of the `<mj-comms-preference-center>` Angular Element bundle. */
    ElementSrc?: string;
}

export interface CommsConfirmPageOptions {
    /** UUIDv4 confirmation token from `GET /comms/confirm/:token`. */
    Token: string;
    /** URL prefix for `/comms` endpoints (e.g. `/comms` or `/api/comms`). */
    ApiRoot: string;
    /** Per-response CSP nonce. */
    CspNonce: string;
    /** Optional browser tab title. */
    PageTitle?: string;
    /** Optional brand name to display on the confirm card. */
    BrandName?: string;
    /** Whether the confirmation has already been completed (rendered after POST). */
    Confirmed?: boolean;
    /** Optional status message to display. */
    StatusMessage?: string;
}

export interface CommsErrorPageOptions {
    Message: string;
    PageTitle?: string;
    CspNonce: string;
}

/** Strict nonce-based security headers for public communication host pages. */
export function CommsHostSecurityHeaders(nonce: string): Record<string, string> {
    const n = nonce.replace(/[^A-Za-z0-9+/=_-]/g, '');
    const csp = [
        "default-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        `script-src 'nonce-${n}' 'self'`,
        `style-src 'nonce-${n}' 'self'`,
        "img-src 'self' data: https:",
        "connect-src 'self'",
    ].join('; ');
    return {
        'Content-Security-Policy': csp,
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
    };
}

/** Escape a string for safe insertion into HTML text content. */
export function EscapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Escape a string for safe insertion into a double-quoted HTML attribute. */
export function EscapeAttr(value: string): string {
    return EscapeHtml(value).replace(/"/g, '&quot;');
}

/** Renders the public preference center host page (Angular Element or vanilla fallback). */
export function RenderCommsPreferenceHostPage(options: CommsPreferenceHostPageOptions): string {
    const title = EscapeHtml(options.PageTitle ?? 'Communication Preferences');
    const token = EscapeAttr(options.Token);
    const apiRoot = EscapeAttr(options.ApiRoot);
    const nonceAttr = ` nonce="${EscapeAttr(options.CspNonce)}"`;
    const elementSrc = options.ElementSrc ? EscapeAttr(options.ElementSrc) : '';

    if (elementSrc) {
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style${nonceAttr}>${PAGE_CSS}</style>
  <script type="module" src="${elementSrc}"${nonceAttr}></script>
</head>
<body>
  <main class="mj-pc">
    <mj-comms-preference-center token="${token}" api-root="${apiRoot}" csp-nonce="${EscapeAttr(options.CspNonce)}"></mj-comms-preference-center>
  </main>
</body>
</html>`;
    }

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style${nonceAttr}>${PAGE_CSS}</style>
</head>
<body>
  <main class="mj-pc" id="mj-pc" data-token="${token}" data-api-root="${apiRoot}">
    <div class="mj-pc__card">
      <p class="mj-pc__status" role="status">Loading your communication preferences…</p>
    </div>
  </main>
  <script${nonceAttr}>${PREFERENCE_BOOT_SCRIPT}</script>
</body>
</html>`;
}

/**
 * Renders the double opt-in confirmation page.
 * GET renders a button that POSTs to `/comms/confirm/:token` so email link scanners
 * that prefetch GET URLs cannot accidentally confirm opt-in.
 */
export function RenderCommsConfirmPage(options: CommsConfirmPageOptions): string {
    const title = EscapeHtml(options.PageTitle ?? 'Confirm Subscription');
    const token = EscapeAttr(options.Token);
    const apiRoot = EscapeAttr(options.ApiRoot.replace(/\/+$/, ''));
    const nonceAttr = ` nonce="${EscapeAttr(options.CspNonce)}"`;
    const brandHeading = options.BrandName ? EscapeHtml(options.BrandName) : 'Confirm Your Subscription';
    const actionUrl = EscapeAttr(`${options.ApiRoot.replace(/\/+$/, '')}/confirm/${encodeURIComponent(options.Token)}`);

    if (options.Confirmed) {
        const msg = EscapeHtml(options.StatusMessage ?? 'Your subscription has been confirmed. Thank you!');
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style${nonceAttr}>${PAGE_CSS}</style>
</head>
<body>
  <main class="mj-pc">
    <div class="mj-pc__card">
      <h1>${brandHeading}</h1>
      <p class="mj-pc__ok" role="status">${msg}</p>
    </div>
  </main>
</body>
</html>`;
    }

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style${nonceAttr}>${PAGE_CSS}</style>
</head>
<body>
  <main class="mj-pc" id="mj-pc-confirm" data-token="${token}" data-api-root="${apiRoot}">
    <div class="mj-pc__card">
      <h1>${brandHeading}</h1>
      <p>Please click the button below to confirm your communication subscription.</p>
      <form method="POST" action="${actionUrl}" id="mj-pc-confirm-form">
        <button type="submit" class="mj-pc__btn mj-pc__btn--primary" id="mj-pc-confirm-btn">Confirm Subscription</button>
      </form>
      <p class="mj-pc__status" id="mj-pc-confirm-status" role="status" aria-live="polite"></p>
    </div>
  </main>
  <script${nonceAttr}>${CONFIRM_BOOT_SCRIPT}</script>
</body>
</html>`;
}

/** Renders an error page for invalid/expired communication tokens. */
export function RenderCommsErrorPage(options: CommsErrorPageOptions): string {
    const title = EscapeHtml(options.PageTitle ?? 'Preferences Unavailable');
    const message = EscapeHtml(options.Message);
    const nonceAttr = ` nonce="${EscapeAttr(options.CspNonce)}"`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style${nonceAttr}>${PAGE_CSS}</style>
</head>
<body>
  <main class="mj-pc">
    <div class="mj-pc__card">
      <h1>${title}</h1>
      <p class="mj-pc__error" role="alert">${message}</p>
    </div>
  </main>
</body>
</html>`;
}

const PAGE_CSS = `
:root {
  color-scheme: light dark;
  --pc-bg: #f8fafc;
  --pc-surface: #ffffff;
  --pc-text: #0f172a;
  --pc-muted: #475569;
  --pc-border: #cbd5e1;
  --pc-primary: #2563eb;
  --pc-primary-text: #ffffff;
  --pc-danger: #dc2626;
  --pc-ok: #0f7b3b;
  --pc-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --pc-bg: #0f172a;
    --pc-surface: #1e293b;
    --pc-text: #f8fafc;
    --pc-muted: #94a3b8;
    --pc-border: #334155;
  }
}
/* The preference-center element is styled with MJ design tokens. This page is served on its own,
   with no MJ theme loaded, so it supplies those tokens from its own palette. Without them the
   element's colours all fall back to the text colour: a dark button with a dark label. */
:root {
  --mj-brand-primary: var(--pc-primary);
  --mj-text-primary: var(--pc-text);
  --mj-text-secondary: var(--pc-muted);
  --mj-text-muted: var(--pc-muted);
  --mj-text-inverse: var(--pc-primary-text);
  --mj-bg-surface: var(--pc-surface);
  --mj-bg-surface-card: var(--pc-surface);
  --mj-border-default: var(--pc-border);
  --mj-border-subtle: var(--pc-border);
  --mj-status-error: var(--pc-danger);
  --mj-status-error-text: var(--pc-danger);
  --mj-status-success: var(--pc-ok);
  --mj-status-success-text: var(--pc-ok);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; min-height: 100%; }
body {
  background: var(--pc-bg);
  color: var(--pc-text);
  font-family: var(--pc-font);
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}
.mj-pc {
  max-width: 40rem;
  margin: 0 auto;
  padding: clamp(1.25rem, 4vw, 2.5rem) clamp(1rem, 3vw, 1.5rem);
}
.mj-pc__card {
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  border-radius: 12px;
  padding: clamp(1.25rem, 4vw, 2rem);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.mj-pc__header {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--pc-border);
}
.mj-pc__logo {
  max-height: 40px;
  max-width: 140px;
  object-fit: contain;
}
.mj-pc h1 { font-size: 1.375rem; margin: 0; }
.mj-pc__subtitle { color: var(--pc-muted); font-size: 0.9375rem; margin: 0.25rem 0 1.25rem; }
.mj-pc__list { list-style: none; padding: 0; margin: 0 0 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
.mj-pc__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--pc-border);
  border-radius: 8px;
}
.mj-pc__item-title { font-weight: 600; display: block; }
.mj-pc__item-desc { font-size: 0.875rem; color: var(--pc-muted); margin-top: 0.25rem; display: block; }
.mj-pc__badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--pc-border);
  color: var(--pc-muted);
  margin-left: 0.5rem;
}
.mj-pc__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1.25rem;
}
.mj-pc__btn {
  padding: 0.625rem 1.125rem;
  border-radius: 6px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}
.mj-pc__btn[disabled] { opacity: 0.6; cursor: not-allowed; }
.mj-pc__btn--primary { background: var(--pc-primary); color: var(--pc-primary-text); }
.mj-pc__btn--danger { background: transparent; color: var(--pc-danger); border-color: var(--pc-danger); }
.mj-pc__status { color: var(--pc-muted); margin: 0.75rem 0 0; }
.mj-pc__error { color: var(--pc-danger); font-weight: 600; margin: 0.75rem 0 0; }
.mj-pc__ok { color: var(--pc-ok); font-weight: 600; margin: 0.75rem 0 0; }
.mj-pc__footer {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--pc-border);
  font-size: 0.8125rem;
  color: var(--pc-muted);
}
`;

const PREFERENCE_BOOT_SCRIPT = `
(function () {
  var host = document.getElementById('mj-pc');
  if (!host) return;
  var token = host.getAttribute('data-token') || '';
  var apiRoot = (host.getAttribute('data-api-root') || '/comms').replace(/\\/+$/, '');

  function safeUrl(raw) {
    if (typeof raw !== 'string') return '';
    var trimmed = raw.trim();
    if (/^https?:\\/\\//i.test(trimmed) || trimmed.charAt(0) === '/') return trimmed;
    return '';
  }

  function safeColor(raw) {
    if (typeof raw !== 'string') return '';
    var trimmed = raw.trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : '';
  }

  function showError(msg) {
    host.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'mj-pc__card';
    var p = document.createElement('p');
    p.className = 'mj-pc__error';
    p.setAttribute('role', 'alert');
    p.textContent = msg;
    card.appendChild(p);
    host.appendChild(card);
  }

  if (!token) {
    showError('Invalid preference link.');
    return;
  }

  fetch(apiRoot + '/preferences/' + encodeURIComponent(token), {
    headers: { 'Accept': 'application/json' },
    credentials: 'same-origin'
  }).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok) throw new Error((data && data.error) || 'Unable to load preferences.');
      return data;
    });
  }).then(function (data) {
    var sender = data.Sender || {};
    var tc = sender.TemplateContext || {};
    var primary = safeColor(tc.PrimaryColor);
    if (primary) document.documentElement.style.setProperty('--pc-primary', primary);

    host.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'mj-pc__card';

    var header = document.createElement('div');
    header.className = 'mj-pc__header';
    var logoUrl = safeUrl(tc.LogoURL);
    if (logoUrl) {
      var img = document.createElement('img');
      img.className = 'mj-pc__logo';
      img.src = logoUrl;
      img.alt = tc.BrandName || sender.Name || 'Brand logo';
      header.appendChild(img);
    }
    var h1 = document.createElement('h1');
    h1.textContent = tc.BrandName || sender.Name || 'Communication Preferences';
    header.appendChild(h1);
    card.appendChild(header);

    var subtitle = document.createElement('p');
    subtitle.className = 'mj-pc__subtitle';
    subtitle.textContent = 'Manage which communications you receive from us.';
    card.appendChild(subtitle);

    var form = document.createElement('form');
    var list = document.createElement('ul');
    list.className = 'mj-pc__list';
    var prefs = Array.isArray(data.Preferences) ? data.Preferences : [];
    var inputs = [];

    prefs.forEach(function (pref) {
      var li = document.createElement('li');
      li.className = 'mj-pc__item';

      var info = document.createElement('div');
      var titleEl = document.createElement('span');
      titleEl.className = 'mj-pc__item-title';
      titleEl.textContent = pref.Name || 'Preference';

      var badge = document.createElement('span');
      badge.className = 'mj-pc__badge';
      badge.textContent = pref.State || 'Opted Out';
      titleEl.appendChild(badge);
      info.appendChild(titleEl);

      if (pref.Description) {
        var descEl = document.createElement('span');
        descEl.className = 'mj-pc__item-desc';
        descEl.textContent = pref.Description;
        info.appendChild(descEl);
      }

      var label = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = pref.State === 'Opted In';
      cb.setAttribute('aria-label', pref.Name || 'Preference');
      label.appendChild(cb);
      inputs.push({ id: pref.ID, checkbox: cb, badge: badge });

      li.appendChild(info);
      li.appendChild(label);
      list.appendChild(li);
    });

    form.appendChild(list);

    var status = document.createElement('p');
    status.className = 'mj-pc__status';
    status.setAttribute('role', 'status');

    var actions = document.createElement('div');
    actions.className = 'mj-pc__actions';

    var saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'mj-pc__btn mj-pc__btn--primary';
    saveBtn.textContent = 'Save Preferences';

    var unsubBtn = document.createElement('button');
    unsubBtn.type = 'button';
    unsubBtn.className = 'mj-pc__btn mj-pc__btn--danger';
    unsubBtn.textContent = 'Unsubscribe from all';

    actions.appendChild(saveBtn);
    actions.appendChild(unsubBtn);
    form.appendChild(actions);
    form.appendChild(status);
    card.appendChild(form);

    if (tc.FooterText) {
      var footer = document.createElement('div');
      footer.className = 'mj-pc__footer';
      footer.textContent = tc.FooterText;
      card.appendChild(footer);
    }

    host.appendChild(card);

    function submitChoices(unsubscribeAll) {
      saveBtn.disabled = true;
      unsubBtn.disabled = true;
      status.className = 'mj-pc__status';
      status.textContent = 'Saving…';
      var payload = unsubscribeAll
        ? { UnsubscribeAll: true }
        : {
            Preferences: inputs.map(function (item) {
              return {
                PreferenceID: item.id,
                State: item.checkbox.checked ? 'Opted In' : 'Opted Out'
              };
            })
          };
      fetch(apiRoot + '/preferences/' + encodeURIComponent(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().then(function (result) {
          if (!res.ok) throw new Error((result && result.error) || 'Failed to save preferences.');
          return result;
        });
      }).then(function (result) {
        if (unsubscribeAll) {
          inputs.forEach(function (item) {
            item.checkbox.checked = false;
            item.badge.textContent = 'Opted Out';
          });
          status.className = 'mj-pc__ok';
          status.textContent = 'You have been unsubscribed from all communications.';
        } else {
          inputs.forEach(function (item) {
            item.badge.textContent = item.checkbox.checked ? 'Opted In' : 'Opted Out';
          });
          status.className = 'mj-pc__ok';
          status.textContent = 'Preferences saved.';
        }
      }).catch(function (err) {
        status.className = 'mj-pc__error';
        status.textContent = err && err.message ? err.message : 'Unable to save preferences.';
      }).finally(function () {
        saveBtn.disabled = false;
        unsubBtn.disabled = false;
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submitChoices(false);
    });
    unsubBtn.addEventListener('click', function () {
      submitChoices(true);
    });
  }).catch(function (err) {
    showError(err && err.message ? err.message : 'Unable to load preferences.');
  });
})();
`;

const CONFIRM_BOOT_SCRIPT = `
(function () {
  var form = document.getElementById('mj-pc-confirm-form');
  var btn = document.getElementById('mj-pc-confirm-btn');
  var status = document.getElementById('mj-pc-confirm-status');
  var host = document.getElementById('mj-pc-confirm');
  if (!form || !btn || !status || !host) return;
  var token = host.getAttribute('data-token') || '';
  var apiRoot = (host.getAttribute('data-api-root') || '/comms').replace(/\\/+$/, '');

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    btn.disabled = true;
    status.className = 'mj-pc__status';
    status.textContent = 'Confirming…';
    fetch(apiRoot + '/confirm/' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || 'Confirmation failed.');
        return data;
      });
    }).then(function () {
      btn.style.display = 'none';
      status.className = 'mj-pc__ok';
      status.textContent = 'Your subscription is confirmed. Thank you!';
    }).catch(function (err) {
      btn.disabled = false;
      status.className = 'mj-pc__error';
      status.textContent = err && err.message ? err.message : 'Unable to confirm subscription.';
    });
  });
})();
`;

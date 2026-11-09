/**
 * The shell's own styles: just enough to draw the start button, the consent notice and the status surfaces
 * before the call code (and its full MemberJunction design-token layer) has loaded.
 *
 * Every colour is `var(--mj-*, fallback)`: once the page supplies MemberJunction's tokens (an MJ application,
 * `theme-tokens`, or the call chunk's own default layer) they win and the shell follows; the fallbacks only
 * keep a bare page legible. Dark mode is keyed on `[data-theme="dark"]`, as MJ's is. Isolation is by the
 * `mjw-` prefix.
 */
export const SHELL_STYLE_ID = 'mj-realtime-widget-shell-styles';

export const SHELL_CSS = `
mj-realtime-widget{display:block;position:relative;min-height:20rem;background:var(--mj-bg-page,var(--mjw-bg));--mjw-bg:var(--mj-bg-surface,#fff);--mjw-bg-card:var(--mj-bg-surface-card,#f7f8fa);--mjw-text:var(--mj-text-primary,#1f2937);--mjw-muted:var(--mj-text-secondary,#4b5563);--mjw-border:var(--mj-border-default,#d1d5db);--mjw-brand:var(--mj-brand-primary,#264faf);--mjw-brand-hover:var(--mj-brand-primary-hover,#1e3f8c);--mjw-on-brand:var(--mj-text-inverse,#fff);--mjw-success:var(--mj-status-success,#15803d);--mjw-error:var(--mj-status-error,#b91c1c);--mjw-error-bg:var(--mj-status-error-bg,#fef2f2);--mjw-radius:var(--mj-radius-md,8px);font-family:var(--mj-font-family,system-ui,-apple-system,"Segoe UI",sans-serif);color:var(--mjw-text)}
mj-realtime-widget[data-theme="dark"]{--mjw-bg:var(--mj-bg-surface,#1b1f2a);--mjw-bg-card:var(--mj-bg-surface-card,#232938);--mjw-text:var(--mj-text-primary,#e5e7eb);--mjw-muted:var(--mj-text-secondary,#9ca3af);--mjw-border:var(--mj-border-default,#374151);--mjw-brand:var(--mj-brand-primary,#6c8ee8);--mjw-brand-hover:var(--mj-brand-primary-hover,#8aa4ee);--mjw-on-brand:var(--mj-text-inverse,#0b1020);--mjw-success:var(--mj-status-success,#4ade80);--mjw-error:var(--mj-status-error,#f87171);--mjw-error-bg:var(--mj-status-error-bg,#3b1d1d)}
mj-realtime-widget .mjw-root{box-sizing:border-box;min-height:inherit;height:100%}
mj-realtime-widget .mjw-root *,mj-realtime-widget .mjw-root *::before,mj-realtime-widget .mjw-root *::after{box-sizing:border-box}
mj-realtime-widget .mjw-center{display:flex;align-items:center;justify-content:center;padding:16px;min-height:inherit;height:100%}
mj-realtime-widget .mjw-live{position:absolute;inset:0}
mj-realtime-widget .mjw-card{width:100%;max-width:28rem;background:var(--mjw-bg);border:1px solid var(--mjw-border);border-radius:var(--mjw-radius);padding:20px;display:grid;gap:12px}
mj-realtime-widget .mjw-title{margin:0;font-size:1.125rem;font-weight:600;line-height:1.3}
mj-realtime-widget .mjw-message,mj-realtime-widget .mjw-consent__lead,mj-realtime-widget .mjw-consent__foot{margin:0;color:var(--mjw-muted);font-size:.9375rem;line-height:1.5}
mj-realtime-widget .mjw-consent__list{margin:0;padding-left:1.25rem;color:var(--mjw-text);font-size:.9375rem;line-height:1.5}
mj-realtime-widget .mjw-consent__head{display:flex;align-items:center;gap:10px}
mj-realtime-widget .mjw-consent:focus{outline:none}
mj-realtime-widget .mjw-actions{display:flex;flex-wrap:wrap;gap:8px}
mj-realtime-widget .mjw-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:var(--mjw-radius);border:1px solid transparent;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;transition:background-color .15s,border-color .15s}
mj-realtime-widget .mjw-btn:focus-visible{outline:2px solid var(--mj-border-focus,var(--mjw-brand));outline-offset:2px}
mj-realtime-widget .mjw-btn--primary{background:var(--mjw-brand);color:var(--mjw-on-brand)}
mj-realtime-widget .mjw-btn--primary:hover{background:var(--mjw-brand-hover)}
mj-realtime-widget .mjw-btn--success{background:var(--mjw-success);color:var(--mjw-on-brand)}
mj-realtime-widget .mjw-btn--secondary{background:transparent;color:var(--mjw-text);border-color:var(--mjw-border)}
mj-realtime-widget .mjw-btn--secondary:hover{background:var(--mjw-bg-card)}
mj-realtime-widget .mjw-btn svg{width:1.1em;height:1.1em;flex:none}
mj-realtime-widget .mjw-loading{display:flex;align-items:center;gap:10px;color:var(--mjw-muted)}
mj-realtime-widget .mjw-dots{display:inline-flex;gap:4px}
mj-realtime-widget .mjw-dots i{width:8px;height:8px;border-radius:50%;background:var(--mjw-brand);opacity:.35;animation:mjw-pulse 1s ease-in-out infinite}
mj-realtime-widget .mjw-dots i:nth-child(2){animation-delay:.15s}
mj-realtime-widget .mjw-dots i:nth-child(3){animation-delay:.3s}
@keyframes mjw-pulse{0%,100%{opacity:.25}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){mj-realtime-widget .mjw-dots i{animation:none;opacity:.7}}
mj-realtime-widget .mjw-alert{width:100%;max-width:28rem;border:1px solid var(--mjw-error);background:var(--mjw-error-bg);border-radius:var(--mjw-radius);padding:16px;display:grid;gap:8px}
mj-realtime-widget .mjw-alert__title{margin:0;font-weight:600;color:var(--mjw-error)}
mj-realtime-widget .mjw-alert__message{margin:0;color:var(--mjw-text);font-size:.9375rem;line-height:1.5}
mj-realtime-widget .mjw-icon{color:var(--mjw-success);font-size:1.5rem;line-height:1}
mj-realtime-widget .mjw-icon svg{width:1.5rem;height:1.5rem}
`.trim();

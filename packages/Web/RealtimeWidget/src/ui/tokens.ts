/**
 * @fileoverview Design tokens injected into the widget's SHADOW ROOT (not <head>),
 * so the widget is themeable yet fully isolated from — and cannot bleed into — the
 * host page. Mirrors the `--mj-chat-*` token set from
 * `conversations-runtime-bootstrap.service.ts`, plus the minimal base semantic tokens
 * the shadow tree needs (the shadow root does not inherit the host app's `:root`).
 *
 * No hardcoded colors leak into component rules — every rule references a token
 * (CLAUDE design-token rule). Defaults here are the token values; a host can override
 * by setting these custom properties on the mount element.
 *
 * @module @memberjunction/realtime-widget
 */

/** The `:host`-scoped token defaults + component CSS for the widget shadow root. */
export const WIDGET_SHADOW_STYLES = `
:host {
    /* base semantic tokens (shadow root needs its own — it can't see the app :root) */
    --mj-text-primary: #1f2933;
    --mj-text-secondary: #52606d;
    --mj-text-inverse: #ffffff;
    --mj-bg-surface: #ffffff;
    --mj-bg-surface-card: #f5f7fa;
    --mj-bg-surface-sunken: #eef1f5;
    --mj-border-default: #e2e8f0;
    --mj-brand-primary: #264faf;
    --mj-brand-primary-hover: #1d3f8c;
    --mj-status-error: #dc2626;
    --mj-status-error-text: #b91c1c;
    --mj-status-error-bg: #fef2f2;

    /* chat tokens (mirror the Angular bootstrap names) */
    --mj-chat-bubble-user-bg: var(--mj-brand-primary);
    --mj-chat-bubble-user-text: var(--mj-text-inverse);
    --mj-chat-bubble-agent-bg: var(--mj-bg-surface-card);
    --mj-chat-bubble-agent-text: var(--mj-text-primary);
    --mj-chat-composer-bg: var(--mj-bg-surface);
    --mj-chat-composer-border: var(--mj-border-default);

    all: initial;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--mj-text-primary);
}

* { box-sizing: border-box; }

.mj-widget-launcher {
    position: fixed; right: 20px; bottom: 20px;
    width: 56px; height: 56px; border-radius: 50%;
    background: var(--mj-brand-primary); color: var(--mj-text-inverse);
    border: none; cursor: pointer; font-size: 24px;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--mj-text-primary) 25%, transparent);
}
.mj-widget-launcher:hover { background: var(--mj-brand-primary-hover); }

.mj-widget-panel {
    position: fixed; right: 20px; bottom: 88px;
    width: 360px; max-width: calc(100vw - 40px); height: 520px; max-height: calc(100vh - 120px);
    display: flex; flex-direction: column;
    background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default);
    border-radius: 12px; overflow: hidden;
    box-shadow: 0 8px 28px color-mix(in srgb, var(--mj-text-primary) 22%, transparent);
}
.mj-widget-panel[hidden] { display: none; }

.mj-widget-header {
    padding: 12px 16px; background: var(--mj-brand-primary); color: var(--mj-text-inverse);
    display: flex; align-items: center; justify-content: space-between; font-weight: 600;
}
.mj-widget-close { background: none; border: none; color: var(--mj-text-inverse); cursor: pointer; font-size: 18px; }

.mj-widget-transcript {
    flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;
    background: var(--mj-bg-surface-sunken);
}
.mj-widget-empty { color: var(--mj-text-secondary); text-align: center; margin: auto; padding: 16px; }

.mj-widget-msg { max-width: 80%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; word-break: break-word; }
.mj-widget-msg.user { align-self: flex-end; background: var(--mj-chat-bubble-user-bg); color: var(--mj-chat-bubble-user-text); }
.mj-widget-msg.agent { align-self: flex-start; background: var(--mj-chat-bubble-agent-bg); color: var(--mj-chat-bubble-agent-text); }
.mj-widget-msg.system { align-self: center; color: var(--mj-status-error-text); font-size: 0.85em; }

.mj-widget-progress { align-self: flex-start; color: var(--mj-text-secondary); font-size: 0.85em; font-style: italic; }
.mj-widget-progress[hidden] { display: none; }

/* Interactive-channel demonstration surface (Phase 2 — e.g. the Whiteboard the agent draws on during voice). */
.mj-widget-surface { display: flex; flex-direction: column; border-bottom: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); }
.mj-widget-surface[hidden] { display: none; }
.mj-widget-surface-title { padding: 6px 12px; font-size: 0.8em; font-weight: 600; color: var(--mj-text-secondary); background: var(--mj-bg-surface-card); }
.mj-widget-surface-host { height: 200px; width: 100%; background: var(--mj-bg-surface); overflow: hidden; }
.mj-widget-surface-host svg { display: block; width: 100%; height: 100%; }

.mj-widget-composer {
    display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--mj-chat-composer-border);
    background: var(--mj-chat-composer-bg);
}
.mj-widget-input {
    flex: 1; resize: none; padding: 8px 10px; border: 1px solid var(--mj-border-default);
    border-radius: 8px; font: inherit; color: var(--mj-text-primary); background: var(--mj-bg-surface);
}
.mj-widget-send {
    background: var(--mj-brand-primary); color: var(--mj-text-inverse); border: none;
    border-radius: 8px; padding: 0 14px; cursor: pointer; font: inherit;
}
.mj-widget-send:disabled { opacity: 0.5; cursor: default; }

/* Connection-lost banner (graceful degradation, W6) */
.mj-widget-banner {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px;
    background: var(--mj-status-error-bg); color: var(--mj-status-error-text);
    border-bottom: 1px solid color-mix(in srgb, var(--mj-status-error) 35%, transparent);
    font-size: 0.85em;
}
.mj-widget-banner[hidden] { display: none; }
.mj-widget-banner-text { flex: 1; }
.mj-widget-banner-retry {
    background: var(--mj-status-error); color: var(--mj-text-inverse); border: none;
    border-radius: 6px; padding: 4px 10px; cursor: pointer; font: inherit; font-size: 0.95em;
}
.mj-widget-banner-retry:hover { background: var(--mj-status-error-text); }
.mj-widget-memory-notice {
    display: flex; align-items: center; gap: 8px; padding: 6px 12px;
    background: var(--mj-bg-surface-sunken); color: var(--mj-text-secondary);
    border-top: 1px solid var(--mj-border-default);
    font-size: 0.75em;
}
.mj-widget-memory-notice-text { flex: 1; }
.mj-widget-forget {
    background: none; color: var(--mj-text-secondary); border: none;
    padding: 2px 4px; cursor: pointer; font: inherit; font-size: 1em;
    text-decoration: underline; white-space: nowrap;
}
.mj-widget-forget:hover { color: var(--mj-text-primary); }
.mj-widget-forget:disabled { opacity: 0.6; cursor: default; }
`;

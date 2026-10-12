/**
 * Entry of the one-script embed's SHELL: a classic `<script>` of tens of KB that defines `<mj-realtime-widget>`.
 *
 *   <script src="https://cdn.example.com/mj-realtime-widget.js"></script>
 *   <mj-realtime-widget api-url="https://api.example.com" widget-key="pk_live_…"></mj-realtime-widget>
 *
 * It records its own URL (the call chunk, `mj-realtime-widget-session.js`, sits beside it) and defines the
 * element. Nothing heavy is imported here: the call code loads on `start()` (or on `preload`).
 * `scripts/build-element.mjs` bundles this file; `scripts/verify-shell-size.mjs` fails the build if a heavy
 * dependency ever leaks into it.
 */
import { DefineRealtimeWidgetShell } from './shell/shell-element';
import { SetShellScriptUrl } from './shell/session-loader';

const current = document.currentScript;
SetShellScriptUrl(current instanceof HTMLScriptElement ? current.src : null);
DefineRealtimeWidgetShell();

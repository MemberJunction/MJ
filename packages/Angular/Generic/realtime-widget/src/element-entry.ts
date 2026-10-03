/**
 * Bundle ENTRY for the `<mj-realtime-widget>` custom element — compiled by `scripts/build-element.mjs` into a
 * single self-contained browser script a page can drop in with one `<script>` tag (no Angular host app):
 *
 *   <script src="mj-realtime-widget.js"></script>
 *   <mj-realtime-widget api-url="https://api.example.com" widget-key="pk_live_…"></mj-realtime-widget>
 *
 * The build bundles the **ngc output** (`dist/element-entry.js`), never this file directly: esbuild does not
 * compile Angular templates, so bundling the TypeScript would leave every `templateUrl` unresolved and the
 * JIT runtime would throw before `customElements.define` ever ran. And the Angular LINKER runs over the
 * bundle (see the build script), converting the partially-compiled Angular libraries to full AOT, so the page
 * needs no JIT compiler — and therefore no `unsafe-eval` in its CSP.
 *
 * `zone.js` is imported first: `provideZoneChangeDetection()` needs it, and a bare page has none.
 */
import 'zone.js';
import { LogError } from '@memberjunction/core';
import { BootstrapRealtimeWidgetElement } from './lib/realtime-widget.element';

void BootstrapRealtimeWidgetElement().catch((error: unknown) => {
  LogError(`mj-realtime-widget: element bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
});

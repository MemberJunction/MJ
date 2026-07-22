/**
 * @fileoverview Browser EMBED entry — the bundle the host page loads via `<script src="mj-widget.js">`.
 *
 * Deliberately TINY and free of static value-imports of the heavy modules (the runtime transport and
 * the realtime voice stack). It only defines the custom element and auto-bootstraps from the host's
 * `[data-widget-key]` element; the loader then DYNAMICALLY imports the transport (on mount) and the
 * voice controller (only for Voice/Both widgets). Built with `esbuild --splitting`, this keeps
 * `@memberjunction/graphql-dataprovider` + `@memberjunction/conversations-runtime` and
 * `@memberjunction/ai-realtime-client` in separate chunks that load on demand — so the launcher
 * paints fast and a text-only widget never downloads the voice chunk.
 *
 * The npm public API (with static exports for programmatic consumers) remains `index.ts`; this module
 * is purely the self-running browser bundle entry.
 *
 * @module @memberjunction/realtime-widget
 */

import { defineSupportWidgetElement } from './ui/support-widget-element.js';
import { bootstrapFromDocument } from './loader.js';

// When loaded in a browser, register the element and attempt auto-bootstrap from the host's
// [data-widget-key] element. No-ops cleanly server-side or when nothing matches.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    defineSupportWidgetElement();
    const run = (): void => {
        void bootstrapFromDocument();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
}

/**
 * @fileoverview Public API for @memberjunction/web-widget + auto-bootstrap when loaded
 * as a browser bundle. Only exports symbols defined in this package (no cross-package
 * re-exports — CLAUDE rule 5).
 *
 * @module @memberjunction/web-widget
 */

export * from './types.js';
export { WidgetSessionClient, type FetchLike } from './session/widget-session-client.js';
export type { IWidgetTransport, WidgetProgressCallback, WidgetTurnResult } from './transport/widget-transport.js';
export { MockWidgetTransport } from './transport/mock-widget-transport.js';
export { RuntimeWidgetTransport } from './transport/runtime-widget-transport.js';
export { SupportWidgetElement, defineSupportWidgetElement, WIDGET_TAG_NAME } from './ui/support-widget-element.js';
export { WIDGET_SHADOW_STYLES } from './ui/tokens.js';
export { mountWidget, bootstrapFromDocument, type WidgetMountDeps } from './loader.js';

import { defineSupportWidgetElement } from './ui/support-widget-element.js';
import { bootstrapFromDocument } from './loader.js';

// When loaded in a browser, register the element and attempt auto-bootstrap from the
// host's [data-widget-key] element. No-ops cleanly server-side or when nothing matches.
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

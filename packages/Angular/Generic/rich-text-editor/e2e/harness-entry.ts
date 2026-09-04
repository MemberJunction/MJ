/**
 * Browser entry for the Playwright tier. esbuild bundles this (with DOMPurify) into
 * `e2e/.harness/engine.bundle.js`; the specs reach the engine through `window.MJRichText`.
 * Checked in so it is type-checked and greppable, unlike a generated string.
 */
import { RichTextEngine } from '../src/lib/engine/editor';
import { diffHtml } from '../src/lib/engine/testing/semantic-diff';
import { ROUND_TRIP_FIXTURES } from '../src/__tests__/fixtures/round-trip-fixtures';

export interface RichTextHarness {
    RichTextEngine: typeof RichTextEngine;
    diffHtml: typeof diffHtml;
    ROUND_TRIP_FIXTURES: typeof ROUND_TRIP_FIXTURES;
}

declare global {
    interface Window {
        MJRichText: RichTextHarness;
        engine: RichTextEngine;
    }
}

window.MJRichText = { RichTextEngine, diffHtml, ROUND_TRIP_FIXTURES };

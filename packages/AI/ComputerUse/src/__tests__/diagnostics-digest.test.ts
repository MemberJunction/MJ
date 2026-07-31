import { describe, it, expect } from 'vitest';
import { formatDiagnosticsDigest } from '../engine/diagnostics-digest.js';
import type { BrowserDiagnosticEvent } from '../types/browser.js';

function ev(partial: Partial<BrowserDiagnosticEvent>): BrowserDiagnosticEvent {
    return { timestamp: '2026-01-01T00:00:00Z', type: 'console', message: 'm', ...partial };
}

describe('formatDiagnosticsDigest (CU-A7)', () => {
    it('returns empty for no events', () => {
        expect(formatDiagnosticsDigest([])).toBe('');
    });

    it('drops console warnings (noise) but keeps console errors', () => {
        const out = formatDiagnosticsDigest([
            ev({ type: 'console', level: 'warning', message: 'deprecation notice' }),
            ev({ type: 'console', level: 'error', message: 'ChunkLoadError' }),
        ]);
        expect(out).toBe('console.error: ChunkLoadError');
    });

    it('keeps page errors, failed requests, and crashes regardless of level', () => {
        const out = formatDiagnosticsDigest([
            ev({ type: 'pageerror', message: 'TypeError: x is undefined' }),
            ev({ type: 'requestfailed', message: 'POST /graphql net::ERR_ABORTED' }),
            ev({ type: 'crash', message: 'Page crashed' }),
        ]);
        expect(out).toContain('pageerror: TypeError: x is undefined');
        expect(out).toContain('requestfailed: POST /graphql net::ERR_ABORTED');
        expect(out).toContain('crash: Page crashed');
    });

    it('returns empty when only noise (warnings) is present', () => {
        expect(formatDiagnosticsDigest([ev({ type: 'console', level: 'warning', message: 'w' })])).toBe('');
    });

    it('caps the digest and appends an ellipsis when truncated', () => {
        const many = Array.from({ length: 50 }, (_, i) => ev({ type: 'pageerror', message: `error number ${i} with some length` }));
        const out = formatDiagnosticsDigest(many, 200);
        expect(out.length).toBeLessThanOrEqual(200 + 2); // + the trailing "…" line
        expect(out.endsWith('…')).toBe(true);
    });

    it('preserves capture order (oldest first)', () => {
        const out = formatDiagnosticsDigest([
            ev({ type: 'pageerror', message: 'first' }),
            ev({ type: 'pageerror', message: 'second' }),
        ]);
        expect(out).toBe('pageerror: first\npageerror: second');
    });
});

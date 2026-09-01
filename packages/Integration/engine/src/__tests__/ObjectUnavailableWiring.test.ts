/**
 * The engine must recognise an unavailability signal from a connector that never imported the error
 * class — connectors ship on their own release cadence, so requiring the class would mean a peer
 * version bump before any connector could classify one.
 */
import { describe, it, expect } from 'vitest';
import { IsObjectUnavailable, ObjectUnavailableError, IntegrationEngine } from '../IntegrationEngine.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('IsObjectUnavailable', () => {
    it('recognises the exported class', () => {
        expect(IsObjectUnavailable(new ObjectUnavailableError('Estimate', "Record 'estimate' was not found"))).toBe(true);
    });

    it('recognises a duck-typed code, so a connector needs no peer bump', () => {
        expect(IsObjectUnavailable(Object.assign(new Error('nope'), { code: 'OBJECT_UNAVAILABLE' }))).toBe(true);
    });

    it('does not swallow ordinary fetch failures', () => {
        expect(IsObjectUnavailable(new Error('socket hang up'))).toBe(false);
        expect(IsObjectUnavailable(Object.assign(new Error('slow down'), { code: 'RATE_LIMIT_EXCEEDED' }))).toBe(false);
        expect(IsObjectUnavailable(undefined)).toBe(false);
        expect(IsObjectUnavailable(null)).toBe(false);
        expect(IsObjectUnavailable('OBJECT_UNAVAILABLE')).toBe(false);
    });

    it('carries the vendor message through verbatim', () => {
        const err = new ObjectUnavailableError('Estimate', "Record 'estimate' was not found");
        expect(err.VendorMessage).toBe("Record 'estimate' was not found");
        expect(err.message).toContain('Estimate');
    });
});

describe('engine wiring', () => {
    // These pin the decision points themselves: without them a refactor could keep every unit test
    // green while quietly restoring a retry ladder on an object that can never succeed.
    const source = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf8');

    it('classifies unavailability before the rate-limit branch, and ends the map without retrying', () => {
        const unavailableIdx = source.indexOf('if (IsObjectUnavailable(fetchErr)) {');
        const rateLimitIdx = source.indexOf("if (ClassifyError(fetchErr).Code === 'RATE_LIMIT_EXCEEDED') {");
        expect(unavailableIdx).toBeGreaterThan(-1);
        expect(unavailableIdx).toBeLessThan(rateLimitIdx);
        // The branch ends the fetch loop rather than falling into the page-skip/retry machinery.
        expect(source.slice(unavailableIdx, rateLimitIdx)).toMatch(/\bbreak;\s*\}\s*$/m);
    });

    it('warns once instead of erroring, so a dead object is not noise', () => {
        const idx = source.indexOf('if (IsObjectUnavailable(fetchErr)) {');
        const branch = source.slice(idx, idx + 1200);
        expect(branch).toMatch(/logger\?\.warning\(/);
        // Not an error event: 71 of these on one connection is what buried the real failures.
        expect(branch).not.toMatch(/logger\?\.emit\('sync\.record\.error'/);
    });

    it('does NOT persist the verdict — it is re-asked every run', () => {
        // Deliberate. Remembering would buy one probe per object per run, and the object count in
        // any real system is small enough that the trade is bad: a stored verdict is wrong from the
        // moment the account changes, and every scheme for noticing that (a recheck clock, a
        // full-sync override, a manual-run override) is another thing to keep correct. Re-asking is
        // self-healing by construction. If this ever grows a marker again, it needs a new argument.
        expect(source).not.toMatch(/objectUnavailable/);
        expect(source).not.toMatch(/RecordObjectUnavailable|ClearObjectUnavailable|DecideUnavailableSkip/);
        const branch = source.slice(source.indexOf('if (IsObjectUnavailable(fetchErr)) {'), source.indexOf("if (ClassifyError(fetchErr).Code === 'RATE_LIMIT_EXCEEDED') {"));
        expect(branch).not.toMatch(/SaveEntityMapConfiguration|await this\.\w*Save/);
    });
});

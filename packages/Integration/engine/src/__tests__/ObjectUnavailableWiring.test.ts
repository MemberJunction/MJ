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

    it('decides the skip BEFORE loading field maps or touching the source', () => {
        // Matched on the call NAME alone: the argument list is free to wrap or gain arguments, and
        // an assertion that breaks on formatting reports a refactor as a regression.
        const skipIdx = source.indexOf('DecideUnavailableSkip(');
        const fieldMapsIdx = source.indexOf('const fieldMaps = await this.LoadFieldMaps(entityMapID, contextUser);');
        expect(skipIdx).toBeGreaterThan(-1);
        expect(skipIdx).toBeLessThan(fieldMapsIdx);
    });

    it('passes the full-sync flag through, so a full sync re-tests an unavailable object', () => {
        // The skip must not outlive the operator's own "re-read everything" instruction. Pinned
        // here because the flag is threaded at the call site — a unit test of the pure function
        // cannot see whether the engine actually passes it.
        expect(source).toMatch(/DecideUnavailableSkip\([\s\S]{0,200}?fullSync:\s*config\.fullSync/);
    });

    it('classifies unavailability before the rate-limit branch, and ends the map without retrying', () => {
        const unavailableIdx = source.indexOf('if (IsObjectUnavailable(fetchErr)) {');
        const rateLimitIdx = source.indexOf("if (ClassifyError(fetchErr).Code === 'RATE_LIMIT_EXCEEDED') {");
        expect(unavailableIdx).toBeGreaterThan(-1);
        expect(unavailableIdx).toBeLessThan(rateLimitIdx);
        // The branch ends the fetch loop rather than falling into the page-skip/retry machinery.
        expect(source.slice(unavailableIdx, rateLimitIdx)).toMatch(/\bbreak;\s*\}\s*$/m);
    });

    it('clears the marker on a clean fetch, so a re-enabled object heals itself', () => {
        expect(source).toMatch(/if \(fetchCompletedCleanly\) \{\s*\n\s*await this\.ClearObjectUnavailable\(entityMap, contextUser\);/);
    });
});

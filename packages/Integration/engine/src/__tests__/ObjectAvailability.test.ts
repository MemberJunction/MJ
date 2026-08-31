/**
 * An object the vendor's catalog lists but the ACCOUNT cannot serve fails identically on every run.
 * Live evidence: 71 such objects on one connection, each costing a request, an error event and a
 * retry ladder every sync, forever, and telling the operator nothing after the first time.
 *
 * The policy has to be quiet without being permanent — an account can be changed at any time, and
 * nobody will remember to come back and un-suppress anything. These tests pin both halves.
 */
import { describe, it, expect } from 'vitest';
import {
    DecideUnavailableSkip,
    ApplyUnavailableMarker,
    UnavailableRecheckMs,
    DEFAULT_UNAVAILABLE_RECHECK_MS,
} from '../ObjectAvailability.js';

const NOW = Date.parse('2026-08-31T12:00:00.000Z');
const marker = (lastCheckedAt: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ objectUnavailable: { firstSeenAt: '2026-08-01T00:00:00.000Z', lastCheckedAt, message: "Record 'message' was not found", ...extra } });

describe('DecideUnavailableSkip', () => {
    it('skips while the marker is fresh', () => {
        const oneHourAgo = new Date(NOW - 60 * 60 * 1000).toISOString();
        const decision = DecideUnavailableSkip(marker(oneHourAgo), NOW);
        expect(decision.skip).toBe(true);
        expect(decision.marker?.message).toContain("Record 'message' was not found");
        expect(decision.marker?.firstSeenAt).toBe('2026-08-01T00:00:00.000Z');
    });

    it('lets the fetch through once the recheck window has passed — the attempt IS the recheck', () => {
        const twoDaysAgo = new Date(NOW - 48 * 60 * 60 * 1000).toISOString();
        expect(DecideUnavailableSkip(marker(twoDaysAgo), NOW).skip).toBe(false);
    });

    it('never skips without a marker', () => {
        expect(DecideUnavailableSkip(null, NOW).skip).toBe(false);
        expect(DecideUnavailableSkip('', NOW).skip).toBe(false);
        expect(DecideUnavailableSkip(JSON.stringify({ syncConcurrency: 4 }), NOW).skip).toBe(false);
    });

    it('never skips on a marker it cannot trust', () => {
        // Malformed config, a non-object marker, a missing or unparseable clock, and a clock in the
        // future all mean the same thing: we have no evidence, so do the normal thing and fetch.
        expect(DecideUnavailableSkip('{not json', NOW).skip).toBe(false);
        expect(DecideUnavailableSkip(JSON.stringify({ objectUnavailable: 'yes' }), NOW).skip).toBe(false);
        expect(DecideUnavailableSkip(JSON.stringify({ objectUnavailable: {} }), NOW).skip).toBe(false);
        expect(DecideUnavailableSkip(marker('not-a-date'), NOW).skip).toBe(false);
        expect(DecideUnavailableSkip(marker(new Date(NOW + 60_000).toISOString()), NOW).skip).toBe(false);
    });

    it('honours an explicit recheck window', () => {
        const tenMinAgo = new Date(NOW - 10 * 60 * 1000).toISOString();
        expect(DecideUnavailableSkip(marker(tenMinAgo), NOW, 5 * 60 * 1000).skip).toBe(false);
        expect(DecideUnavailableSkip(marker(tenMinAgo), NOW, 60 * 60 * 1000).skip).toBe(true);
    });
});

describe('UnavailableRecheckMs', () => {
    it('defaults to a day and ignores unusable overrides', () => {
        expect(UnavailableRecheckMs({} as NodeJS.ProcessEnv)).toBe(DEFAULT_UNAVAILABLE_RECHECK_MS);
        for (const bad of ['0', '-5', 'soon', '']) {
            expect(UnavailableRecheckMs({ MJ_INTEGRATION_OBJECT_UNAVAILABLE_RECHECK_MS: bad } as NodeJS.ProcessEnv))
                .toBe(DEFAULT_UNAVAILABLE_RECHECK_MS);
        }
        expect(UnavailableRecheckMs({ MJ_INTEGRATION_OBJECT_UNAVAILABLE_RECHECK_MS: '60000' } as NodeJS.ProcessEnv)).toBe(60000);
    });
});

describe('ApplyUnavailableMarker', () => {
    const m = { firstSeenAt: '2026-08-01T00:00:00.000Z', lastCheckedAt: '2026-08-31T12:00:00.000Z', message: 'nope' };

    it('preserves every other setting on the map', () => {
        const out = ApplyUnavailableMarker(JSON.stringify({ syncConcurrency: 4, writeMode: 'batched' }), m);
        const parsed = JSON.parse(out!) as Record<string, unknown>;
        expect(parsed.syncConcurrency).toBe(4);
        expect(parsed.writeMode).toBe('batched');
        expect(parsed.objectUnavailable).toEqual(m);
    });

    it('removes only the marker, leaving the rest', () => {
        const withMarker = ApplyUnavailableMarker(JSON.stringify({ syncConcurrency: 4 }), m)!;
        const cleared = JSON.parse(ApplyUnavailableMarker(withMarker, null)!) as Record<string, unknown>;
        expect(cleared.objectUnavailable).toBeUndefined();
        expect(cleared.syncConcurrency).toBe(4);
    });

    it('returns null rather than an empty document when nothing is left', () => {
        const only = ApplyUnavailableMarker(null, m)!;
        expect(ApplyUnavailableMarker(only, null)).toBeNull();
    });
});

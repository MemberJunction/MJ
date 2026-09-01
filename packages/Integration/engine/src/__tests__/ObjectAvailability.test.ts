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
    ReadUnavailableMarker,
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

describe('ReadUnavailableMarker (§ the rewrite path, no clock judgement)', () => {
    // The regression this exists for: RecordObjectUnavailable reached for DecideUnavailableSkip with
    // sentinel clock arguments (nowMs=0) to read the prior marker. Every real lastCheckedAt parses
    // ABOVE 0, so the `checkedMs > nowMs` untrusted-clock guard fired and returned no marker at all
    // — firstSeenAt was silently reset on every recurrence, erasing how long the object had been
    // unavailable, which is the one fact the marker is kept for.
    const cfg = (m: Record<string, unknown>) => JSON.stringify({ objectUnavailable: m, writeMode: 'batched' });

    it('returns the marker regardless of how old or how future-dated the clock is', () => {
        const old = ReadUnavailableMarker(cfg({ firstSeenAt: '2026-01-01T00:00:00.000Z', lastCheckedAt: '2026-01-02T00:00:00.000Z', message: 'nope' }));
        expect(old?.firstSeenAt).toBe('2026-01-01T00:00:00.000Z');
        // A future clock makes the marker untrustworthy for SUPPRESSION, but it is still what is
        // persisted — the rewrite path must carry its firstSeenAt forward rather than start over.
        const future = ReadUnavailableMarker(cfg({ firstSeenAt: '2099-01-01T00:00:00.000Z', lastCheckedAt: '2099-01-02T00:00:00.000Z', message: 'nope' }));
        expect(future?.firstSeenAt).toBe('2099-01-01T00:00:00.000Z');
    });

    it('is what DecideUnavailableSkip is NOT: that one withholds a future-dated marker', () => {
        const c = cfg({ firstSeenAt: '2099-01-01T00:00:00.000Z', lastCheckedAt: '2099-01-02T00:00:00.000Z', message: 'nope' });
        expect(DecideUnavailableSkip(c, Date.parse('2026-08-31T00:00:00.000Z')).marker).toBeUndefined();
        expect(ReadUnavailableMarker(c)).toBeDefined();
    });

    it('falls back to lastCheckedAt when firstSeenAt was never written, and defaults a missing message', () => {
        const m = ReadUnavailableMarker(cfg({ lastCheckedAt: '2026-03-03T00:00:00.000Z' }));
        expect(m?.firstSeenAt).toBe('2026-03-03T00:00:00.000Z');
        expect(m?.message).toBe('the source reported this object as unavailable');
    });

    it('returns undefined for absent, malformed, non-object and marker-less configuration', () => {
        expect(ReadUnavailableMarker(null)).toBeUndefined();
        expect(ReadUnavailableMarker('')).toBeUndefined();
        expect(ReadUnavailableMarker('{not json')).toBeUndefined();
        expect(ReadUnavailableMarker('"a string"')).toBeUndefined();
        expect(ReadUnavailableMarker(JSON.stringify({ writeMode: 'batched' }))).toBeUndefined();
        expect(ReadUnavailableMarker(JSON.stringify({ objectUnavailable: { message: 'no clock' } }))).toBeUndefined();
    });
});

describe('a full sync re-tests availability (§ the operator\'s lever)', () => {
    // The recheck clock is a COST control, not a claim the account cannot change. Without this an
    // operator who enables a record type at the vendor waits up to the full window before the
    // product notices, with no way to hurry it — the exact "I fixed it, why is it still ignoring
    // the object" trap. A full sync already means "ignore what you know and re-read everything".
    const fresh = JSON.stringify({
        objectUnavailable: {
            firstSeenAt: '2026-08-31T11:00:00.000Z',
            lastCheckedAt: '2026-08-31T11:00:00.000Z',   // one hour old against a 24h window
            message: "Record 'estimate' was not found",
        },
    });

    it('skips on an incremental run while the marker is fresh', () => {
        expect(DecideUnavailableSkip(fresh, NOW).skip).toBe(true);
    });

    it('does NOT skip the same map on a full sync', () => {
        expect(DecideUnavailableSkip(fresh, NOW, DEFAULT_UNAVAILABLE_RECHECK_MS, { fullSync: true }).skip).toBe(false);
    });

    it('fullSync:false is the incremental default, not a bypass', () => {
        expect(DecideUnavailableSkip(fresh, NOW, DEFAULT_UNAVAILABLE_RECHECK_MS, { fullSync: false }).skip).toBe(true);
        expect(DecideUnavailableSkip(fresh, NOW, DEFAULT_UNAVAILABLE_RECHECK_MS, {}).skip).toBe(true);
    });

    it('a full sync of a map with no marker is unaffected', () => {
        expect(DecideUnavailableSkip(null, NOW, DEFAULT_UNAVAILABLE_RECHECK_MS, { fullSync: true }).skip).toBe(false);
    });

    it('a MANUAL run re-tests too — the case that actually happens', () => {
        // The realistic sequence: someone enables the record type at the vendor, comes back and
        // presses "sync now". That is an incremental run. If it honoured the marker, the product
        // would answer a deliberate retry with up to a day of silence.
        expect(DecideUnavailableSkip(fresh, NOW, DEFAULT_UNAVAILABLE_RECHECK_MS, { manual: true }).skip).toBe(false);
        // ...and it does not need to ALSO be a full sync.
        expect(DecideUnavailableSkip(fresh, NOW, DEFAULT_UNAVAILABLE_RECHECK_MS, { manual: true, fullSync: false }).skip).toBe(false);
    });

    it('SCHEDULED and webhook runs still trust the marker — suppressing them is the whole point', () => {
        expect(DecideUnavailableSkip(fresh, NOW, DEFAULT_UNAVAILABLE_RECHECK_MS, { manual: false }).skip).toBe(true);
        expect(DecideUnavailableSkip(fresh, NOW, DEFAULT_UNAVAILABLE_RECHECK_MS, {}).skip).toBe(true);
    });
});

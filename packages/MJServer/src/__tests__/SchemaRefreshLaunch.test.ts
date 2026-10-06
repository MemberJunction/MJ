import { describe, it, expect } from 'vitest';
import { BuildCreateConnectionMessage, BuildDetachedRefreshMessage, BuildUpdateConnectionMessage } from '../integration/SchemaRefreshLaunch.js';
import type { SchemaRefreshSummaryLike } from '../integration/SchemaRefreshLaunch.js';

/**
 * A detached schema refresh returns placeholder zero counts because it hasn't run yet. The one
 * thing this message must never do is report those zeros as findings — "0 created, 0 updated"
 * reads as "the refresh found nothing", which is the opposite of "still running".
 */
function summary(over: Partial<SchemaRefreshSummaryLike> = {}): SchemaRefreshSummaryLike {
    return {
        RunID: 'connector-1783000000000-abc123',
        InProgress: false,
        Succeeded: true,
        ObjectsCreated: 12,
        ObjectsUpdated: 3,
        UnresolvedObjects: ['Widgets'],
        ...over,
    };
}

describe('BuildCreateConnectionMessage', () => {
    it('reports the run ID to tail — and NO counts — for a detached refresh', () => {
        const msg = BuildCreateConnectionMessage(true, summary({
            InProgress: true,
            ObjectsCreated: 0,
            ObjectsUpdated: 0,
            UnresolvedObjects: [],
        }));

        expect(msg).toContain('connector-1783000000000-abc123');
        expect(msg).toMatch(/running/i);
        // The placeholder zeros must not surface as results.
        expect(msg).not.toMatch(/\d+ created/);
        expect(msg).not.toMatch(/\d+ updated/);
        expect(msg).not.toMatch(/PK-unresolved/);
    });

    it('reports real counts once the refresh has completed inline', () => {
        const msg = BuildCreateConnectionMessage(true, summary());

        expect(msg).toContain('12 created');
        expect(msg).toContain('3 updated');
        expect(msg).toContain('1 PK-unresolved');
        expect(msg).not.toMatch(/running/i);
        // A completed refresh needs no run ID in the message — the counts ARE the answer.
        expect(msg).not.toContain('connector-1783000000000-abc123');
    });

    it('omits the test-passed clause when no connection test was requested', () => {
        expect(BuildCreateConnectionMessage(false, summary())).not.toMatch(/test passed/);
        expect(BuildCreateConnectionMessage(true, summary())).toMatch(/test passed/);
    });

    it('falls back to the test-only message when no refresh was requested', () => {
        expect(BuildCreateConnectionMessage(true, undefined)).toBe('Connection created and test passed');
    });

    it('counts PK-unresolved objects, not just reports presence', () => {
        const msg = BuildCreateConnectionMessage(false, summary({ UnresolvedObjects: ['A', 'B', 'C'] }));
        expect(msg).toContain('3 PK-unresolved');
    });
});

/**
 * A pipeline that fails at ConnectionTest RETURNS — it does not throw — with every count at zero.
 * Verified live: a real HubSpot refresh whose credential check failed produced
 * "Updated, schema refresh: 0 created, 0 updated, 0 PK-unresolved", indistinguishable from a clean
 * no-op run. These tests pin the distinction.
 */
describe('failed-refresh reporting', () => {
    const failed = summary({
        Succeeded: false,
        FailureMessage: 'ConnectionTest failed: No HubSpot credentials found',
        ObjectsCreated: 0,
        ObjectsUpdated: 0,
        UnresolvedObjects: [],
    });

    it('never reports a failed refresh as a zero-count success (create)', () => {
        const msg = BuildCreateConnectionMessage(true, failed);
        expect(msg).toMatch(/FAILED/);
        expect(msg).toContain('No HubSpot credentials found');
        expect(msg).not.toMatch(/0 created/);
    });

    it('never reports a failed refresh as a zero-count success (update)', () => {
        const msg = BuildUpdateConnectionMessage(failed);
        expect(msg).toMatch(/FAILED/);
        expect(msg).toContain('No HubSpot credentials found');
        expect(msg).not.toMatch(/0 created/);
    });

    it('points at the run when the pipeline reported no reason', () => {
        const msg = BuildUpdateConnectionMessage(summary({ Succeeded: false, FailureMessage: undefined }));
        expect(msg).toContain('connector-1783000000000-abc123');
        expect(msg).toMatch(/no reason reported/);
    });

    it('still reports counts for a refresh that genuinely succeeded (update)', () => {
        const msg = BuildUpdateConnectionMessage(summary());
        expect(msg).toContain('12 created');
        expect(msg).toContain('3 updated');
        expect(msg).not.toMatch(/FAILED/);
    });
});

describe('BuildDetachedRefreshMessage', () => {
    it('names the run to tail', () => {
        const msg = BuildDetachedRefreshMessage('connector-42-zz');
        expect(msg).toContain('connector-42-zz');
        expect(msg).toMatch(/running/i);
    });
});

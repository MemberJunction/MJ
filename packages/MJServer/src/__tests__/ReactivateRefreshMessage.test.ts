import { describe, it, expect } from 'vitest';
import { BuildReactivateMessage } from '../integration/SchemaRefreshLaunch.js';
import type { SchemaRefreshSummaryLike } from '../integration/SchemaRefreshLaunch.js';

/**
 * Reactivation is committed BEFORE the refresh runs, so no refresh outcome — running, failed, or
 * clean — may ever read as "resume didn't work". These pin that, plus the two reporting bugs the
 * create/update paths already fixed and reactivate had kept its own copy of:
 *
 *   1. A detached run's placeholder zeros must not be reported as findings ("0 created, 0 updated"
 *      tells an operator the source had nothing new, when in fact nothing has been looked at yet).
 *   2. A pipeline that fails RETURNS with every count at zero rather than throwing, so counts alone
 *      read identically to a clean no-op run.
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

describe('BuildReactivateMessage', () => {
    it('leads with the reactivation on every path', () => {
        const paths = [
            BuildReactivateMessage(undefined),
            BuildReactivateMessage(summary({ InProgress: true, ObjectsCreated: 0, ObjectsUpdated: 0, UnresolvedObjects: [] })),
            BuildReactivateMessage(summary()),
            BuildReactivateMessage(summary({ Succeeded: false, FailureMessage: 'boom' })),
        ];
        for (const msg of paths) expect(msg).toMatch(/^Reactivated/);
    });

    it('names the run to tail — and reports NO counts — for a detached refresh', () => {
        const msg = BuildReactivateMessage(summary({
            InProgress: true,
            ObjectsCreated: 0,
            ObjectsUpdated: 0,
            UnresolvedObjects: [],
        }));

        expect(msg).toContain('connector-1783000000000-abc123');
        expect(msg).toMatch(/running/i);
        expect(msg).not.toMatch(/\d+ created/);
        expect(msg).not.toMatch(/\d+ updated/);
        expect(msg).not.toMatch(/PK-unresolved/);
    });

    it('reports real counts when the caller asked to block', () => {
        const msg = BuildReactivateMessage(summary());
        expect(msg).toContain('12 created');
        expect(msg).toContain('3 updated');
        expect(msg).toContain('1 PK-unresolved');
        expect(msg).not.toMatch(/running/i);
    });

    it('never reports a FAILED refresh as a zero-count success', () => {
        // The old inline message formatted counts unconditionally, so a pipeline that failed at
        // ConnectionTest produced "Reactivated, schema refresh: 0 created, 0 updated,
        // 0 PK-unresolved" — indistinguishable from a source with nothing new.
        const msg = BuildReactivateMessage(summary({
            Succeeded: false,
            FailureMessage: 'ConnectionTest failed: No Totara credentials found',
            ObjectsCreated: 0,
            ObjectsUpdated: 0,
            UnresolvedObjects: [],
        }));

        expect(msg).toMatch(/FAILED/);
        expect(msg).toContain('No Totara credentials found');
        expect(msg).not.toMatch(/0 created/);
        // ...and still says the connection is active, because it is.
        expect(msg).toMatch(/^Reactivated/);
    });

    it('says nothing about a refresh that was never requested', () => {
        const msg = BuildReactivateMessage(undefined);
        expect(msg).toBe('Reactivated');
        expect(msg).not.toMatch(/refresh/i);
    });
});

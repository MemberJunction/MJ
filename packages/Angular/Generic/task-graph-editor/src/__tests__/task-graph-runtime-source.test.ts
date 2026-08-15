/**
 * Tests for shaping live rows into the canvas's runtime overlay.
 *
 * The correlation rule carries the most risk, because getting it wrong is not a crash — it is the
 * *wrong node* lighting up green while someone watches. That is worse than nothing rendering,
 * because it is believed.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildNameIndex,
    BuildRuntimeStatus,
    IsRuntimeSettled,
    NormalizeRuntimeState,
    SummarizeRuntime,
} from '../lib/task-graph-runtime-source';

const tasks = [
    { tempId: 'a', name: 'Gather' },
    { tempId: 'b', name: 'Summarize' },
];
const names = BuildNameIndex(tasks);
const ids = new Set(tasks.map((t) => t.tempId));

describe('BuildRuntimeStatus', () => {
    it('correlates a persisted row to a spec node BY NAME', () => {
        // A submitted graph's Task rows carry database IDs while the spec carries producer-assigned
        // tempIds — the two never match, because the producer could not know real IDs at authoring
        // time. The name is the only value that survives submission unchanged.
        const status = BuildRuntimeStatus(
            [{ ID: 'db-guid-1', Name: 'Gather', Status: 'Complete' }],
            names, ids,
        );
        expect(status).toEqual({ a: 'Complete' });
    });

    it('prefers an ID match when the tempIds ARE row ids', () => {
        // Which is exactly what ConvertAgentSpecToTaskGraph produces — its tempIds are step IDs.
        const status = BuildRuntimeStatus([{ ID: 'b', Name: 'Gather', Status: 'Failed' }], names, ids);
        expect(status).toEqual({ b: 'Failed' });
    });

    it('SKIPS a row that matches nothing rather than guessing', () => {
        // A wrong node lighting up green is worse than a node staying grey — the first is believed.
        expect(BuildRuntimeStatus([{ ID: 'x', Name: 'Unrelated', Status: 'Complete' }], names, ids)).toEqual({});
    });

    it('maps several rows at once', () => {
        const status = BuildRuntimeStatus(
            [
                { ID: 'g1', Name: 'Gather', Status: 'Complete' },
                { ID: 'g2', Name: 'Summarize', Status: 'In Progress' },
            ],
            names, ids,
        );
        expect(status).toEqual({ a: 'Complete', b: 'In Progress' });
    });

    it('handles an empty row set', () => {
        expect(BuildRuntimeStatus([], names, ids)).toEqual({});
    });
});

describe('NormalizeRuntimeState', () => {
    it.each(['Pending', 'In Progress', 'Complete', 'Failed', 'Blocked', 'Cancelled', 'Deferred'] as const)(
        'passes through the known state %s', (s) => expect(NormalizeRuntimeState(s)).toBe(s),
    );

    it('degrades an unknown status to Pending rather than throwing', () => {
        // A status the UI has not heard of means the schema moved ahead of the client. That must
        // degrade to "we don't know yet", not to an exception inside a render path.
        expect(NormalizeRuntimeState('Hibernating')).toBe('Pending');
        expect(NormalizeRuntimeState(null)).toBe('Pending');
        expect(NormalizeRuntimeState(undefined)).toBe('Pending');
    });
});

describe('BuildNameIndex', () => {
    it('indexes name to tempId', () => {
        expect(BuildNameIndex(tasks).get('Gather')).toBe('a');
    });

    it('resolves a duplicated name deterministically rather than dropping both', () => {
        // Names are not unique in a spec — only tempId is — so a duplicate is inherently ambiguous.
        const dup = BuildNameIndex([{ tempId: 'x', name: 'Same' }, { tempId: 'y', name: 'Same' }]);
        expect(dup.get('Same')).toBe('y');
    });
});

describe('IsRuntimeSettled', () => {
    it('is false while anything is still running', () => {
        expect(IsRuntimeSettled({ a: 'Complete', b: 'In Progress' }, ['a', 'b'])).toBe(false);
    });

    it('is true once every task reached a terminal state', () => {
        expect(IsRuntimeSettled({ a: 'Complete', b: 'Failed' }, ['a', 'b'])).toBe(true);
    });

    it('counts Cancelled as terminal', () => {
        expect(IsRuntimeSettled({ a: 'Cancelled' }, ['a'])).toBe(true);
    });

    it('does NOT count Blocked as terminal', () => {
        // Blocked can be cleared by a retry upstream, so the graph is not finished.
        expect(IsRuntimeSettled({ a: 'Blocked' }, ['a'])).toBe(false);
    });

    it('treats a task with no reported state as unsettled', () => {
        expect(IsRuntimeSettled({}, ['a'])).toBe(false);
    });

    it('is false for an empty graph, which cannot have settled', () => {
        expect(IsRuntimeSettled({}, [])).toBe(false);
    });
});

describe('SummarizeRuntime', () => {
    it('summarizes counts by state', () => {
        const text = SummarizeRuntime({ a: 'Complete', b: 'In Progress' }, ['a', 'b']);
        expect(text).toContain('2 steps');
        expect(text).toContain('1 complete');
        expect(text).toContain('1 in progress');
    });

    it('counts an unreported task as pending', () => {
        expect(SummarizeRuntime({}, ['a'])).toContain('1 pending');
    });

    it('uses the singular for one step', () => {
        expect(SummarizeRuntime({ a: 'Complete' }, ['a'])).toContain('1 step —');
    });
});

/**
 * `Skipped` and the silent default.
 *
 * `NormalizeRuntimeState` fell back to `Pending` for anything it did not recognise, and it did not
 * recognise `Skipped` — so a branch the workflow declined was reported to the canvas as STILL
 * WAITING TO RUN. That is not a near-miss, it is the opposite of the truth, and every consumer
 * believed it: the node drew as an ordinary pending step, the edges into and out of it drew as live
 * routes, and a settled graph could never satisfy `IsRuntimeSettled`.
 */
describe('a branch that was not taken', () => {
    it('is carried through as Skipped, not flattened to Pending', () => {
        expect(NormalizeRuntimeState('Skipped')).toBe('Skipped');
    });

    it('still falls back to Pending for a status the client has never heard of', () => {
        // The fallback itself is right — a schema ahead of the client should degrade to "we don't
        // know yet" rather than throw in a render path. The defect was what it was swallowing.
        expect(NormalizeRuntimeState('SomethingNew')).toBe('Pending');
        expect(NormalizeRuntimeState(null)).toBe('Pending');
    });

    it('reaches the canvas from a row', () => {
        const status = BuildRuntimeStatus(
            [{ ID: 'a', Name: 'Get Weather', Status: 'Skipped' }],
            new Map(),
            new Set(['a']),
        );
        expect(status['a']).toBe('Skipped');
    });

    it('counts as settled — it is not going to be taken later', () => {
        // Without this a workflow containing a declined branch never reports as finished, so a host
        // polling on it polls a completed run forever.
        const status = { a: 'Complete', b: 'Skipped' } as const;
        expect(IsRuntimeSettled(status, ['a', 'b'])).toBe(true);
    });
});

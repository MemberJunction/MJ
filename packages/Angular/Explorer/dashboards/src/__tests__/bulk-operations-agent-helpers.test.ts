/**
 * Tests for the pure helpers backing the Bulk Operations host components' AI-agent client tools.
 * The hosts themselves are thin, ViewChild-bound wrappers over the generic studio/history components,
 * so the testable logic is the ID-resolution + context-shaping extracted into
 * `bulk-operations-agent-helpers.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
    resolveRowByID,
    resolveRowByIDOrName,
    capNames,
    buildStudioAgentContext,
    buildHistoryAgentContext,
    AGENT_CONTEXT_NAME_LIST_CAP,
    type ProcessSummaryInput,
    type RunSummaryInput,
} from '../BulkOperations/bulk-operations-agent-helpers';

interface Row {
    ID: string;
    Name?: string;
}

const rows: Row[] = [
    { ID: 'AAAAAAAA-1111-2222-3333-444444444444', Name: 'Tag stale contacts' },
    { ID: 'BBBBBBBB-5555-6666-7777-888888888888', Name: 'Recompute scores' },
];

describe('resolveRowByID', () => {
    it('resolves a row by exact ID', () => {
        const r = resolveRowByID(rows, rows[0].ID, 'processID', 'bulk operation');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.Name).toBe('Tag stale contacts');
        }
    });

    it('resolves case-insensitively (SQL Server upper vs PostgreSQL lower)', () => {
        const r = resolveRowByID(rows, rows[0].ID.toLowerCase(), 'processID', 'bulk operation');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.ID).toBe(rows[0].ID);
        }
    });

    it('trims surrounding whitespace before matching', () => {
        const r = resolveRowByID(rows, `  ${rows[1].ID}  `, 'runID', 'bulk operation run');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.Name).toBe('Recompute scores');
        }
    });

    it('returns a structured failure for an unknown ID (never throws)', () => {
        const r = resolveRowByID(rows, 'NO-SUCH-ID', 'processID', 'bulk operation');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.result.Success).toBe(false);
            expect(r.result.ErrorMessage).toContain('No bulk operation found');
            expect(r.result.ErrorMessage).toContain('NO-SUCH-ID');
        }
    });

    it('returns a structured failure for an empty string', () => {
        const r = resolveRowByID(rows, '   ', 'processID', 'bulk operation');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.result.ErrorMessage).toContain('must not be empty');
        }
    });

    it('returns a structured failure for a non-string param', () => {
        const r = resolveRowByID(rows, 42, 'processID', 'bulk operation');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.result.ErrorMessage).toContain('processID must be a string');
        }
    });

    it('returns a structured failure for undefined', () => {
        const r = resolveRowByID(rows, undefined, 'runID', 'bulk operation run');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.result.ErrorMessage).toContain('runID must be a string');
        }
    });

    it('uses the not-found noun in the message', () => {
        const r = resolveRowByID(rows, 'missing', 'runID', 'bulk operation run');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.result.ErrorMessage).toContain('No bulk operation run found');
        }
    });
});

// A small fixed set of process summaries used across the id/name + context tests.
const procRows: ProcessSummaryInput[] = [
    { ID: 'AAAAAAAA-1111-2222-3333-444444444444', Name: 'Tag stale contacts', Entity: 'Contacts', Status: 'Active', WorkType: 'FieldRules', ScopeType: 'View' },
    { ID: 'BBBBBBBB-5555-6666-7777-888888888888', Name: 'Recompute scores', Entity: 'Members', Status: 'Active', WorkType: 'Agent', ScopeType: 'Filter' },
];

const runRows: RunSummaryInput[] = [
    { ID: 'R1-0000-0000-0000-000000000001', ProcessName: 'Tag stale contacts', EntityName: 'Contacts', Status: 'Completed', DryRun: false },
    { ID: 'R2-0000-0000-0000-000000000002', ProcessName: 'Recompute scores', EntityName: 'Members', Status: 'Failed', DryRun: true },
    { ID: 'R3-0000-0000-0000-000000000003', ProcessName: 'Tag stale contacts', EntityName: 'Contacts', Status: 'Completed', DryRun: true },
];

describe('capNames', () => {
    it('returns the input unchanged when under the cap', () => {
        expect(capNames(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('caps to AGENT_CONTEXT_NAME_LIST_CAP by default and does not mutate the input', () => {
        const names = Array.from({ length: 40 }, (_, i) => `n${i}`);
        const out = capNames(names);
        expect(out.length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
        expect(names.length).toBe(40); // unchanged
    });

    it('honors an explicit cap and falls back to the default for invalid caps', () => {
        expect(capNames(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
        expect(capNames(['a', 'b'], -1).length).toBe(2); // invalid cap → default (which exceeds list)
    });
});

describe('resolveRowByIDOrName', () => {
    it('resolves by exact ID (case-insensitive)', () => {
        const r = resolveRowByIDOrName(procRows, procRows[0].ID.toLowerCase(), 'process', 'bulk operation', (p) => p.Name);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.Name).toBe('Tag stale contacts');
    });

    it('resolves by exact name (case-insensitive)', () => {
        const r = resolveRowByIDOrName(procRows, 'recompute scores', 'process', 'bulk operation', (p) => p.Name);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.ID).toBe(procRows[1].ID);
    });

    it('resolves by partial-name contains, first match wins', () => {
        const r = resolveRowByIDOrName(procRows, 'scores', 'process', 'bulk operation', (p) => p.Name);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.Name).toBe('Recompute scores');
    });

    it('prefers an exact ID over a name that would also contains-match', () => {
        const r = resolveRowByIDOrName(procRows, procRows[0].ID, 'process', 'bulk operation', (p) => p.Name);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.ID).toBe(procRows[0].ID);
    });

    it('resolves runs by operation name (most recent, since runs are most-recent-first)', () => {
        const r = resolveRowByIDOrName(runRows, 'Tag stale contacts', 'run', 'bulk operation run', (x) => x.ProcessName ?? '');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.ID).toBe('R1-0000-0000-0000-000000000001');
    });

    it('returns a tolerant failure listing available names on a miss', () => {
        const r = resolveRowByIDOrName(procRows, 'does-not-exist', 'process', 'bulk operation', (p) => p.Name);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.result.Success).toBe(false);
            expect(r.result.ErrorMessage).toContain('No bulk operation found matching "does-not-exist"');
            expect(r.result.ErrorMessage).toContain('Tag stale contacts');
            expect(r.result.ErrorMessage).toContain('Recompute scores');
        }
    });

    it('returns a structured failure for a non-string param', () => {
        const r = resolveRowByIDOrName(procRows, 42, 'process', 'bulk operation', (p) => p.Name);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.result.ErrorMessage).toContain('process must be a string');
    });

    it('returns a structured failure for an empty/whitespace param', () => {
        const r = resolveRowByIDOrName(procRows, '   ', 'process', 'bulk operation', (p) => p.Name);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.result.ErrorMessage).toContain('must not be empty');
    });
});

describe('buildStudioAgentContext', () => {
    it('shapes a list-mode snapshot, defaulting null search to empty string and publishing visible names', () => {
        const ctx = buildStudioAgentContext({
            Mode: 'list',
            ProcessCount: 5,
            Filtered: procRows,
            Search: undefined,
            EditingID: undefined,
            IsRunning: false,
        });
        expect(ctx['CurrentMode']).toBe('list');
        expect(ctx['ProcessCount']).toBe(5);
        expect(ctx['FilteredProcessCount']).toBe(2);
        expect(ctx['SearchQuery']).toBe('');
        expect(ctx['EditingProcessID']).toBe(null);
        expect(ctx['IsRunning']).toBe(false);
        expect(ctx['VisibleProcessNames']).toEqual(['Tag stale contacts', 'Recompute scores']);
        // No editing fields when not editing.
        expect(ctx['EditingProcessName']).toBeUndefined();
    });

    it('bounds visible names and reports a companion total when truncated', () => {
        const many: ProcessSummaryInput[] = Array.from({ length: 40 }, (_, i) => ({ ID: `P${i}`, Name: `Op ${i}` }));
        const ctx = buildStudioAgentContext({
            Mode: 'list', ProcessCount: 40, Filtered: many, Search: '', EditingID: null, IsRunning: false,
        });
        expect((ctx['VisibleProcessNames'] as string[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['VisibleProcessNameCount']).toBe(40);
    });

    it('resolves the editing process name/entity/work-type when the editor is open on an existing row', () => {
        const ctx = buildStudioAgentContext({
            Mode: 'edit',
            ProcessCount: 2,
            Filtered: procRows,
            Search: 'score',
            EditingID: procRows[1].ID,
            IsRunning: true,
        });
        expect(ctx['CurrentMode']).toBe('edit');
        expect(ctx['EditingProcessID']).toBe(procRows[1].ID);
        expect(ctx['EditingProcessName']).toBe('Recompute scores');
        expect(ctx['EditingProcessEntity']).toBe('Members');
        expect(ctx['EditingProcessWorkType']).toBe('Agent');
        expect(ctx['IsRunning']).toBe(true);
    });

    it('reports a null editing name when creating a new process (EditingID set but not in list)', () => {
        const ctx = buildStudioAgentContext({
            Mode: 'edit', ProcessCount: 2, Filtered: procRows, Search: '', EditingID: 'brand-new-unsaved', IsRunning: false,
        });
        expect(ctx['EditingProcessName']).toBe(null);
    });
});

describe('buildHistoryAgentContext', () => {
    it('reports list mode with run summaries, distinct statuses, and dry-run/real counts', () => {
        const ctx = buildHistoryAgentContext({
            Mode: 'list',
            Runs: runRows,
            OpenRunID: null,
            OpenRunStatus: null,
            OpenRunIsDryRun: null,
            OpenRunProcessName: null,
        });
        expect(ctx['IsViewingRunDetail']).toBe(false);
        expect(ctx['RunCount']).toBe(3);
        expect(ctx['OpenRunID']).toBe(null);
        expect(ctx['RunStatuses']).toEqual(['Completed', 'Failed']);
        expect(ctx['DryRunCount']).toBe(2);
        expect(ctx['RealRunCount']).toBe(1);
        const recent = ctx['RecentRuns'] as Array<Record<string, unknown>>;
        expect(recent.length).toBe(3);
        expect(recent[0]).toEqual({ ID: 'R1-0000-0000-0000-000000000001', ProcessName: 'Tag stale contacts', Status: 'Completed', DryRun: false });
    });

    it('reports detail mode with the open run, including the dry-run flag and process name', () => {
        const ctx = buildHistoryAgentContext({
            Mode: 'detail',
            Runs: runRows,
            OpenRunID: 'R2-0000-0000-0000-000000000002',
            OpenRunStatus: 'Failed',
            OpenRunIsDryRun: true,
            OpenRunProcessName: 'Recompute scores',
        });
        expect(ctx['IsViewingRunDetail']).toBe(true);
        expect(ctx['OpenRunID']).toBe('R2-0000-0000-0000-000000000002');
        expect(ctx['OpenRunStatus']).toBe('Failed');
        expect(ctx['OpenRunIsDryRun']).toBe(true);
        expect(ctx['OpenRunProcessName']).toBe('Recompute scores');
    });

    it('bounds the recent-run summaries and reports a companion total when truncated', () => {
        const many: RunSummaryInput[] = Array.from({ length: 30 }, (_, i) => ({ ID: `R${i}`, ProcessName: `Op ${i}`, Status: 'Completed', DryRun: false }));
        const ctx = buildHistoryAgentContext({
            Mode: 'list', Runs: many, OpenRunID: null, OpenRunStatus: null, OpenRunIsDryRun: null, OpenRunProcessName: null,
        });
        expect((ctx['RecentRuns'] as unknown[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['RecentRunCount']).toBe(30);
    });

    it('handles an empty run list (no statuses, zero counts)', () => {
        const ctx = buildHistoryAgentContext({
            Mode: 'list', Runs: [], OpenRunID: null, OpenRunStatus: null, OpenRunIsDryRun: null, OpenRunProcessName: null,
        });
        expect(ctx['RunCount']).toBe(0);
        expect(ctx['RunStatuses']).toEqual([]);
        expect(ctx['DryRunCount']).toBe(0);
        expect(ctx['RealRunCount']).toBe(0);
        expect(ctx['RecentRuns']).toEqual([]);
    });
});

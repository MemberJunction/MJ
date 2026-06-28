/**
 * Tests for the pure helpers backing the Bulk Operations host components' AI-agent client tools.
 * The hosts themselves are thin, ViewChild-bound wrappers over the generic studio/history components,
 * so the testable logic is the ID-resolution + context-shaping extracted into
 * `bulk-operations-agent-helpers.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
    resolveRowByID,
    buildStudioAgentContext,
    buildHistoryAgentContext,
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

describe('buildStudioAgentContext', () => {
    it('shapes a list-mode snapshot, defaulting null search to empty string', () => {
        const ctx = buildStudioAgentContext({
            Mode: 'list',
            ProcessCount: 5,
            FilteredCount: 2,
            Search: undefined,
            EditingID: undefined,
            IsRunning: false,
        });
        expect(ctx).toEqual({
            CurrentMode: 'list',
            ProcessCount: 5,
            FilteredProcessCount: 2,
            SearchQuery: '',
            EditingProcessID: null,
            IsRunning: false,
        });
    });

    it('preserves edit mode, the editing ID, the search query, and the running flag', () => {
        const ctx = buildStudioAgentContext({
            Mode: 'edit',
            ProcessCount: 3,
            FilteredCount: 1,
            Search: 'score',
            EditingID: 'proc-1',
            IsRunning: true,
        });
        expect(ctx['CurrentMode']).toBe('edit');
        expect(ctx['EditingProcessID']).toBe('proc-1');
        expect(ctx['SearchQuery']).toBe('score');
        expect(ctx['IsRunning']).toBe(true);
    });
});

describe('buildHistoryAgentContext', () => {
    it('reports list mode with no open run', () => {
        const ctx = buildHistoryAgentContext({
            Mode: 'list',
            RunCount: 10,
            OpenRunID: null,
            OpenRunStatus: null,
            OpenRunIsDryRun: null,
        });
        expect(ctx).toEqual({
            IsViewingRunDetail: false,
            RunCount: 10,
            OpenRunID: null,
            OpenRunStatus: null,
            OpenRunIsDryRun: null,
        });
    });

    it('reports detail mode with the open run, including the dry-run flag', () => {
        const ctx = buildHistoryAgentContext({
            Mode: 'detail',
            RunCount: 10,
            OpenRunID: 'run-7',
            OpenRunStatus: 'Completed',
            OpenRunIsDryRun: true,
        });
        expect(ctx['IsViewingRunDetail']).toBe(true);
        expect(ctx['OpenRunID']).toBe('run-7');
        expect(ctx['OpenRunStatus']).toBe('Completed');
        expect(ctx['OpenRunIsDryRun']).toBe(true);
    });
});

/**
 * The entry points over `QueryExtractionService`: the `Query.RefreshExtraction` remote operation,
 * CodeGen's re-bind (`RebindQueriesForChangedEntities`), and the printed report.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo, EntityUserPermissionInfo, Metadata, ProviderBase } from '@memberjunction/core';
import type { RemoteOpProgress, RemoteOpServerContext, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { QueryExtractionService } from '../custom/query-refresh/QueryExtractionService';
import { QueryRefreshExtractionServerOperation, RefreshFilterOf } from '../custom/query-refresh/QueryRefreshExtractionServerOperation';
import { RebindQueriesForChangedEntities } from '../custom/query-refresh/queryRebind';
import { FormatQueryRefreshRun } from '../custom/query-refresh/refreshFormat';
import type { QueryRefreshProvider, QueryRefreshReport, QueryRefreshRunReport } from '../custom/query-refresh/refreshTypes';
import type { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';

function double<T>(value: Partial<T>): T {
    return value as T;
}

const USER = double<UserInfo>({ ID: 'U1', Name: 'Tester', Email: 't@example.com', UserRoles: [] });

function entity(name: string, id: string, fields: { ID: string; Name: string }[] = []): EntityInfo {
    return new EntityInfo({ ID: id, Name: name, BaseTable: name, BaseView: `vw${name}`, SchemaName: '__mj', Permissions: [], RelatedEntities: [],
        AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
        Fields: fields.map((f, i) => ({ ...f, EntityID: id, Entity: name, Type: 'nvarchar', Sequence: i + 1, AllowsNull: true, IsPrimaryKey: false, EntityFieldValues: [] })) });
}

const ENTITIES = [
    entity('MJ: Queries', 'E1'), entity('MJ: Query Fields', 'E2'), entity('MJ: Query Parameters', 'E3'),
    entity('MJ: Query Entities', 'E4'), entity('MJ: Query Dependencies', 'E5'),
    entity('Employees', 'C0000000-0000-0000-0000-0000000000C1', [{ ID: 'EF000000-0000-0000-0000-000000000001', Name: 'Salary' }, { ID: 'EF000000-0000-0000-0000-000000000002', Name: 'Name' }]),
];

let canUpdateQueries: boolean;

function report(overrides: Partial<QueryRefreshReport> = {}): QueryRefreshReport {
    return { QueryID: 'Q1', QueryName: 'Payroll', Outcome: 'Refreshed', DryRun: false, ExtractionStatus: 'OK', QueryColumns: [], Added: [], Updated: [], Removed: [], Flagged: [], Diagnostics: [], ...overrides };
}

function run(reports: QueryRefreshReport[], dryRun = false): QueryRefreshRunReport {
    return { DryRun: dryRun, Reports: reports, Cycles: [] };
}

class StubContext implements RemoteOpServerContext {
    public readonly progress: RemoteOpProgress[] = [];
    constructor(public readonly provider: QueryRefreshProvider, public readonly user: UserInfo = USER) {}
    public emitProgress = (p: RemoteOpProgress): void => { this.progress.push(p); };
}

function emptyResult(results: Record<string, unknown>[] = []): RunViewResult {
    return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
}

beforeEach(() => {
    canUpdateQueries = true;
    Metadata.Provider = double<ProviderBase>({ Entities: ENTITIES });
    vi.spyOn(EntityInfo.prototype, 'GetUserPermisions').mockImplementation(function (this: EntityInfo) {
        const p = new EntityUserPermissionInfo();
        p.CanRead = p.CanCreate = p.CanDelete = true;
        p.CanUpdate = this.Name !== 'MJ: Queries' || canUpdateQueries;
        return p;
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Query.RefreshExtraction', () => {
    const provider = double<QueryRefreshProvider>({ Entities: ENTITIES, RunView: async () => emptyResult(), RunViews: async (p: RunViewParams[]) => p.map(() => emptyResult()) });

    it('is long-running and needs the query:refresh scope', () => {
        const op = new QueryRefreshExtractionServerOperation();
        expect([op.OperationKey, op.ExecutionMode, op.RequiredScope]).toEqual(['Query.RefreshExtraction', 'LongRunning', 'query:refresh']);
    });

    it('Authorize refuses a caller without Update on MJ: Queries', async () => {
        canUpdateQueries = false;
        const spy = vi.spyOn(QueryExtractionService.prototype, 'RefreshQueries');
        const result = await new QueryRefreshExtractionServerOperation().ExecuteServer({ all: true }, new StubContext(provider));

        expect([result.Success, result.ResultCode]).toEqual([false, 'FORBIDDEN']);
        expect(spy).not.toHaveBeenCalled();
    });

    it('one query ID alone goes through RefreshQuery, so an unavailable query reads like not found', async () => {
        const single = vi.spyOn(QueryExtractionService.prototype, 'RefreshQuery').mockResolvedValue(report({ Outcome: 'Unavailable', QueryName: '' }));
        const result = await new QueryRefreshExtractionServerOperation().ExecuteServer({ queryIDs: ['Q1'], dryRun: true }, new StubContext(provider));

        expect(single).toHaveBeenCalledWith('Q1', expect.objectContaining({ DryRun: true, WithAI: false }));
        expect(result.Output?.reports.map(r => r.outcome)).toEqual(['Unavailable']);
    });

    it('a selection goes through RefreshQueries, reports progress per query and maps the report', async () => {
        vi.spyOn(QueryExtractionService.prototype, 'RefreshQueries').mockImplementation(async (_filter, options) => {
            const r = report({ Added: [{ Collection: 'Fields', Action: 'Added', Name: 'Salary', ChangedColumns: [], SourceEntityFieldID: 'EF1' }] });
            options?.OnProgress?.({ Processed: 1, Total: 1, Report: r });
            return run([r]);
        });
        const context = new StubContext(provider);
        const result = await new QueryRefreshExtractionServerOperation().ExecuteServer({ categoryPath: 'HR', withAI: true }, context);

        expect(result.Output?.reports[0]).toEqual({ queryID: 'Q1', queryName: 'Payroll', outcome: 'Refreshed', extractionStatus: 'OK', queryColumns: [],
            added: [{ collection: 'Fields', name: 'Salary', changedColumns: [] }], updated: [], removed: [], flagged: [], diagnostics: [] });
        expect(result.Output?.summary).toContain('1 refreshed');
        expect(context.progress.map(p => [p.Processed, p.Total, p.Message])).toEqual([[1, 1, 'Refreshed: Payroll']]);
    });

    it('refuses an input with no selector', async () => {
        const result = await new QueryRefreshExtractionServerOperation().ExecuteServer({ dryRun: true }, new StubContext(provider));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('at least one selector');
    });

    it('builds the service filter from only the selectors given', () => {
        expect(RefreshFilterOf({ queryNames: ['A'], categoryPath: ' ', entityNames: [], all: false })).toEqual({ QueryNames: ['A'] });
    });
});

describe('RebindQueriesForChangedEntities', () => {
    let saved: { Status: string | null; Message: string | null; Override: string }[];

    function rebindProvider(permissionRows: { QueryID: string }[]): QueryRefreshProvider {
        return double<QueryRefreshProvider>({
            Entities: ENTITIES,
            RunView: async () => emptyResult(permissionRows),
            GetEntityObject: async <T,>(): Promise<T> => {
                const query = double<MJQueryEntityServer>({ ExtractionStatus: 'OK', ExtractionMessage: null, ExtractionOverride: 'Auto' });
                query.Load = async () => true;
                query.Save = async () => { saved.push({ Status: query.ExtractionStatus, Message: query.ExtractionMessage, Override: query.ExtractionOverride }); return true; };
                return double<T>(query as Partial<T>);
            },
        });
    }

    beforeEach(() => {
        saved = [];
    });

    it('does nothing when no entity changed', async () => {
        const spy = vi.spyOn(QueryExtractionService.prototype, 'RefreshQueries');
        const result = await RebindQueriesForChangedEntities({ Provider: rebindProvider([]), User: USER }, []);

        expect(spy).not.toHaveBeenCalled();
        expect(result.Run.Reports).toEqual([]);
    });

    it('refreshes the queries that read the changed entities, with no description pass', async () => {
        const spy = vi.spyOn(QueryExtractionService.prototype, 'RefreshQueries').mockResolvedValue(run([report()]));
        await RebindQueriesForChangedEntities({ Provider: rebindProvider([]), User: USER }, ['C0000000-0000-0000-0000-0000000000C1', 'c0000000-0000-0000-0000-0000000000c1']);

        expect(spy).toHaveBeenCalledWith({ EntityIDs: ['c0000000-0000-0000-0000-0000000000c1'] }, { WithAI: false });
    });

    it('warns when a definer\'s-rights query gains a column sourced from a field-restricted field', async () => {
        vi.spyOn(EntityInfo.prototype, 'FieldLevelSecurityApplies', 'get').mockImplementation(function (this: EntityInfo) { return this.Name === 'Employees'; });
        vi.spyOn(QueryExtractionService.prototype, 'RefreshQueries').mockResolvedValue(run([
            report({ Added: [{ Collection: 'Fields', Action: 'Added', Name: 'Salary', ChangedColumns: [], SourceEntityFieldID: 'ef000000-0000-0000-0000-000000000001' }] }),
            report({ QueryID: 'Q2', QueryName: 'Open', Added: [{ Collection: 'Fields', Action: 'Added', Name: 'Salary', ChangedColumns: [], SourceEntityFieldID: 'EF000000-0000-0000-0000-000000000001' }] }),
        ]));
        const result = await RebindQueriesForChangedEntities({ Provider: rebindProvider([{ QueryID: 'Q1' }]), User: USER }, ['C0000000-0000-0000-0000-0000000000C1']);

        expect(result.Drift).toEqual([{ QueryID: 'Q1', QueryName: 'Payroll', Fields: ['Salary'] }]);
        expect(saved).toHaveLength(1);
        expect([saved[0].Status, saved[0].Override]).toEqual(['Warning', 'Skip']);
        expect(saved[0].Message).toContain('"Salary"');
    });

    it('raises no warning for a gained column whose source field is unrestricted', async () => {
        vi.spyOn(QueryExtractionService.prototype, 'RefreshQueries').mockResolvedValue(run([
            report({ Added: [{ Collection: 'Fields', Action: 'Added', Name: 'Name', ChangedColumns: [], SourceEntityFieldID: 'EF000000-0000-0000-0000-000000000002' }] }),
        ]));
        const result = await RebindQueriesForChangedEntities({ Provider: rebindProvider([{ QueryID: 'Q1' }]), User: USER }, ['C0000000-0000-0000-0000-0000000000C1']);

        expect(result.Drift).toEqual([]);
        expect(saved).toEqual([]);
    });
});

describe('FormatQueryRefreshRun', () => {
    it('prints changes, flagged parameters, diagnostics and a summary; hides unchanged queries when asked', () => {
        const lines = FormatQueryRefreshRun(run([
            report({ DryRun: true, QueryColumns: ['ExtractionStatus'], Added: [{ Collection: 'Fields', Action: 'Added', Name: 'A', ChangedColumns: [], SourceEntityFieldID: null }],
                Updated: [{ Collection: 'Parameters', Action: 'Updated', Name: 'P', ChangedColumns: ['Type'], SourceEntityFieldID: null }], Flagged: ['Old'], Diagnostics: ['A note.'] }),
            report({ DryRun: true, QueryID: 'Q2', QueryName: 'Same', Outcome: 'Unchanged' }),
        ], true), true);

        expect(lines).toEqual([
            'WOULD REFRESH "Payroll" (Q1) [OK]',
            '    ~ query (ExtractionStatus)',
            '    + field A',
            '    ~ parameter P (Type)',
            '    ! parameter Old: authored, no longer used by the SQL (kept)',
            '    A note.',
            '2 queries: 1 would be refreshed, 1 unchanged, 0 failed (dry run: nothing was written).',
        ]);
    });
});

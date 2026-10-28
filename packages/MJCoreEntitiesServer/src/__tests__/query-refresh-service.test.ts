/**
 * `QueryExtractionService`: refresh one query or a selection, with its authorization.
 *
 * - The CRUD check (Update on MJ: Queries; Create/Update/Delete on the child entities), dry runs included.
 * - The non-disclosure guard: a refusal of a single query reads exactly like "not found"; bulk runs
 *   report `NotPermitted` with no reason.
 * - Dry runs preview and never apply; applies write through the query entity.
 * - Bulk runs go in dependency order and report a cycle once.
 *
 * The provider and the query entities are test doubles.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo, EntityUserPermissionInfo } from '@memberjunction/core';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { QueryExtractionService } from '../custom/query-refresh/QueryExtractionService';
import { QueryRefreshUnavailableMessage, UserCanRefreshQueries, UserCanSeeQuerySources } from '../custom/query-refresh/refreshAuthorization';
import type { QueryRefreshProvider } from '../custom/query-refresh/refreshTypes';
import type { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';
import type { ChildRowWriteSummary, QueryExtractionResult } from '../custom/query-extraction';

/** A test double: the members a test gives, typed as the whole interface. */
function double<T>(value: Partial<T>): T {
    return value as T;
}

const USER = double<UserInfo>({ ID: 'U1', Name: 'Tester', Email: 't@example.com', UserRoles: [] });
const ENTITY_SOURCE = 'C0000000-0000-0000-0000-0000000000C1';

function entity(name: string, id: string): EntityInfo {
    return new EntityInfo({ ID: id, Name: name, BaseTable: name, BaseView: `vw${name}`, SchemaName: '__mj', Fields: [], Permissions: [], RelatedEntities: [],
        AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true });
}

const ENTITIES = [
    entity('MJ: Queries', 'E1'), entity('MJ: Query Fields', 'E2'), entity('MJ: Query Parameters', 'E3'),
    entity('MJ: Query Entities', 'E4'), entity('MJ: Query Dependencies', 'E5'), entity('Sources', ENTITY_SOURCE),
];

/** Which entity permissions the caller lacks, as `<entity>:<permission>`. */
let denied: Set<string>;

function permissionsFor(this: EntityInfo): EntityUserPermissionInfo {
    const p = new EntityUserPermissionInfo();
    p.CanCreate = !denied.has(`${this.Name}:Create`);
    p.CanRead = !denied.has(`${this.Name}:Read`);
    p.CanUpdate = !denied.has(`${this.Name}:Update`);
    p.CanDelete = !denied.has(`${this.Name}:Delete`);
    return p;
}

function extraction(overrides: Partial<QueryExtractionResult> = {}): QueryExtractionResult {
    return { UsesTemplate: false, Refusal: null, Status: 'OK', Messages: [], Hash: 'new-hash', Fields: [], Parameters: [], Entities: [{ EntityID: ENTITY_SOURCE, AlternateBaseViewID: null }], Dependencies: [], ...overrides };
}

function summary(changes: ChildRowWriteSummary['Changes'] = []): ChildRowWriteSummary {
    return { Added: 0, Updated: 0, Removed: 0, Changes: changes, FlaggedParameters: [], FieldsWithoutDescription: [], ParametersWithoutDescription: [] };
}

interface StoredQuery { ID: string; Name: string; CategoryID: string | null }

let queries: StoredQuery[];
let dependencies: { QueryID: string; DependsOnQueryID: string }[];
let calls: string[];
let applyFailure: string | null;
let storedHash: string;
let previewChanges: boolean;
let readFailure: boolean;

function fakeQuery(stored: StoredQuery): MJQueryEntityServer {
    return double<MJQueryEntityServer>({
        ID: stored.ID, Name: stored.Name, SQL: 'SELECT 1 AS One', UsesTemplate: false, ExtractedSQLHash: storedHash, ExtractionStatus: 'OK', ExtractionMessage: null,
        ComputeRefreshExtractionAsync: async () => { calls.push(`compute ${stored.Name}`); return extraction(); },
        PreviewRefreshAsync: async () => { calls.push(`preview ${stored.Name}`); return summary(previewChanges ? [{ Collection: 'Fields', Action: 'Added', Name: 'X', ChangedColumns: [], SourceEntityFieldID: null }] : []); },
        ApplyRefreshAsync: async (_e: QueryExtractionResult, withAI: boolean) => {
            calls.push(`apply ${stored.Name}${withAI ? ' +ai' : ''}`);
            if (applyFailure) throw new Error(applyFailure);
            return summary();
        },
    });
}

function rows(params: RunViewParams): Record<string, unknown>[] {
    switch (params.EntityName) {
        case 'MJ: Queries': return queries.map(q => ({ ...q }));
        case 'MJ: Query Categories': return [{ ID: 'CAT1', Name: 'Sales', ParentID: null }, { ID: 'CAT2', Name: 'Reports', ParentID: 'CAT1' }];
        case 'MJ: Query Dependencies': return dependencies.map(d => ({ ...d }));
        case 'MJ: Query Entities': return [{ QueryID: 'Q1', EntityID: ENTITY_SOURCE }];
        default: return [];
    }
}

function viewResult(params: RunViewParams): RunViewResult {
    if (readFailure) return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'no read permission', UserViewRunID: '' };
    const results = rows(params);
    return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
}

function provider(): QueryRefreshProvider {
    return double<QueryRefreshProvider>({
        Entities: ENTITIES,
        RunView: async (params: RunViewParams) => viewResult(params),
        RunViews: async (params: RunViewParams[]) => params.map(viewResult),
        GetEntityObject: async <T,>(): Promise<T> => {
            let loaded: MJQueryEntityServer | null = null;
            const loader = double<MJQueryEntityServer>({
                Load: async (id: string) => {
                    const stored = queries.find(q => q.ID === id);
                    if (stored) loaded = fakeQuery(stored);
                    return !!stored;
                },
            });
            return new Proxy(loader, { get: (target, key) => Reflect.get(loaded ?? target, key) }) as T;
        },
    });
}

function service(): QueryExtractionService {
    return new QueryExtractionService({ Provider: provider(), User: USER });
}

beforeEach(() => {
    denied = new Set();
    calls = [];
    applyFailure = null;
    storedHash = 'new-hash';
    previewChanges = true;
    readFailure = false;
    queries = [{ ID: 'Q1', Name: 'Top Customers', CategoryID: 'CAT2' }, { ID: 'Q2', Name: 'Totals', CategoryID: 'CAT1' }];
    dependencies = [];
    vi.spyOn(EntityInfo.prototype, 'GetUserPermisions').mockImplementation(permissionsFor);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('refresh authorization', () => {
    it('needs Update on MJ: Queries and Create/Update/Delete on every child entity', () => {
        expect(UserCanRefreshQueries(USER, ENTITIES)).toBe(true);
        for (const missing of ['MJ: Queries:Update', 'MJ: Query Fields:Create', 'MJ: Query Parameters:Update', 'MJ: Query Entities:Delete', 'MJ: Query Dependencies:Delete']) {
            denied = new Set([missing]);
            expect(UserCanRefreshQueries(USER, ENTITIES), missing).toBe(false);
        }
    });

    it('the guard needs Read on every entity the query reads and no field denied on any', () => {
        expect(UserCanSeeQuerySources(USER, [ENTITY_SOURCE], ENTITIES)).toBe(true);
        denied = new Set(['Sources:Read']);
        expect(UserCanSeeQuerySources(USER, [ENTITY_SOURCE], ENTITIES)).toBe(false);
        denied = new Set();
        vi.spyOn(EntityInfo.prototype, 'FieldLevelSecurityApplies', 'get').mockReturnValue(true);
        vi.spyOn(EntityInfo.prototype, 'GetDeniedReadFields').mockReturnValue(new Set(['salary']));
        expect(UserCanSeeQuerySources(USER, [ENTITY_SOURCE], ENTITIES)).toBe(false);
        expect(UserCanSeeQuerySources(USER, ['F0000000-0000-0000-0000-00000000000F'], ENTITIES), 'an entity not in the catalog').toBe(false);
    });
});

describe('RefreshQuery', () => {
    it('applies the refresh through the query entity, without AI unless asked', async () => {
        const report = await service().RefreshQuery('Q1');
        await service().RefreshQuery('Q1', { WithAI: true });

        expect(calls).toEqual(['compute Top Customers', 'preview Top Customers', 'apply Top Customers', 'compute Top Customers', 'preview Top Customers', 'apply Top Customers +ai']);
        expect([report.Outcome, report.DryRun, report.ExtractionStatus]).toEqual(['Unchanged', false, 'OK']);
    });

    it('does not save a query the refresh would not change', async () => {
        previewChanges = false;
        const report = await service().RefreshQuery('Q1');

        expect(calls).toEqual(['compute Top Customers', 'preview Top Customers']);
        expect(report.Outcome).toBe('Unchanged');
    });

    it('a dry run previews and never applies', async () => {
        const report = await service().RefreshQuery('Q1', { DryRun: true });

        expect(calls).toEqual(['compute Top Customers', 'preview Top Customers']);
        expect([report.Outcome, report.DryRun, report.Added.map(c => c.Name)]).toEqual(['Refreshed', true, ['X']]);
    });

    it('counts a change to the query row alone as a refresh, and names the columns', async () => {
        storedHash = 'old-hash';
        const report = await service().RefreshQuery('Q1');

        expect([report.Outcome, report.QueryColumns]).toEqual(['Refreshed', ['ExtractedSQLHash']]);
    });

    it('a refusal reads exactly like a query that does not exist, for a dry run too', async () => {
        const missing = await service().RefreshQuery('NOPE');
        denied = new Set(['MJ: Query Fields:Delete']);
        const noCrud = await service().RefreshQuery('Q1', { DryRun: true });
        denied = new Set(['Sources:Read']);
        const guarded = await service().RefreshQuery('Q1');

        for (const report of [noCrud, guarded]) {
            expect({ ...report, QueryID: 'NOPE', Diagnostics: report.Diagnostics.map(d => d.replace("'Q1'", "'NOPE'")) }).toEqual({ ...missing, DryRun: report.DryRun });
        }
        expect(missing.Diagnostics).toEqual([QueryRefreshUnavailableMessage('NOPE')]);
        expect(guarded.QueryName).toBe('');
        expect(calls.some(c => c.startsWith('apply') || c.startsWith('preview'))).toBe(false);
    });

    it('a failed write is reported as Failed, with the reason', async () => {
        applyFailure = 'a child-row write failed';
        const report = await service().RefreshQuery('Q1');

        expect(report.Outcome).toBe('Failed');
        expect(report.Diagnostics[0]).toContain('a child-row write failed');
    });
});

describe('RefreshQueries', () => {
    it('refreshes the queries a composition depends on first', async () => {
        queries.push({ ID: 'Q3', Name: 'Base', CategoryID: null });
        dependencies = [{ QueryID: 'Q1', DependsOnQueryID: 'Q2' }, { QueryID: 'Q2', DependsOnQueryID: 'Q3' }];
        const run = await service().RefreshQueries({ All: true }, { DryRun: true });

        expect(run.Reports.map(r => r.QueryName)).toEqual(['Base', 'Totals', 'Top Customers']);
        expect(run.Cycles).toEqual([]);
    });

    it('reports a composition cycle and refreshes each member once', async () => {
        dependencies = [{ QueryID: 'Q1', DependsOnQueryID: 'Q2' }, { QueryID: 'Q2', DependsOnQueryID: 'Q1' }];
        const run = await service().RefreshQueries({ All: true }, { DryRun: true });

        expect(run.Reports.map(r => r.QueryName).sort()).toEqual(['Top Customers', 'Totals']);
        expect(run.Cycles.map(c => [...c].sort())).toEqual([['Top Customers', 'Totals']]);
    });

    it('selects by name, full path, category path and entity read; unmatched names are reported unavailable', async () => {
        const byName = await service().RefreshQueries({ QueryNames: ['totals', 'Sales/Reports/Top Customers', 'Nope'] }, { DryRun: true });
        const byCategory = await service().RefreshQueries({ CategoryPath: 'Sales/Reports' }, { DryRun: true });
        const byEntity = await service().RefreshQueries({ EntityNames: ['Sources'] }, { DryRun: true });

        expect(byName.Reports.map(r => `${r.Outcome}:${r.QueryName || r.QueryID}`)).toEqual(['Unavailable:Nope', 'Refreshed:Totals', 'Refreshed:Top Customers']);
        expect(byCategory.Reports.map(r => r.QueryName)).toEqual(['Top Customers']);
        expect(byEntity.Reports.map(r => r.QueryName)).toEqual(['Top Customers']);
    });

    it('skips a query the caller may not refresh as NotPermitted, with no reason, and keeps going', async () => {
        denied = new Set(['Sources:Read']);
        const progress: number[] = [];
        const run = await service().RefreshQueries({ All: true }, { OnProgress: p => progress.push(p.Processed) });

        expect(run.Reports.map(r => r.Outcome)).toEqual(['NotPermitted', 'NotPermitted']);
        expect(run.Reports[0].Diagnostics).toEqual(['Skipped: not permitted.']);
        expect(progress).toEqual([1, 2]);
    });

    it('a caller who may neither refresh nor read queries gets each named query reported unavailable', async () => {
        denied = new Set(['MJ: Queries:Update', 'MJ: Queries:Read']);
        readFailure = true;
        const run = await service().RefreshQueries({ QueryIDs: ['Q1'], QueryNames: ['Totals'], All: true });

        expect(run.Reports.map(r => [r.Outcome, r.QueryID, r.QueryName])).toEqual([['Unavailable', 'Q1', ''], ['Unavailable', 'Totals', '']]);
        expect(calls).toEqual([]);
    });

    it('writes nothing for a bulk dry run', async () => {
        await service().RefreshQueries({ All: true }, { DryRun: true });

        expect(calls.filter(c => c.startsWith('apply'))).toEqual([]);
    });
});

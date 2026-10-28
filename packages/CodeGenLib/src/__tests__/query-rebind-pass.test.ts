/**
 * CodeGen's query re-bind pass: which entities count as changed (fields added, dropped, or changed
 * in type or nullability), the call into `RebindQueriesForChangedEntities` as the System user, and
 * the summary it prints. The pass never fails the run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { QueryRebindResult, QueryRefreshReport } from '@memberjunction/core-entities-server';

const h = vi.hoisted(() => ({
    rebinds: [] as Array<{ IDs: readonly string[]; User: unknown }>,
    failure: null as string | null,
    reports: null as QueryRefreshReport[] | null,
    logged: [] as string[],
}));

vi.mock('@memberjunction/core-entities-server', () => ({
    IsQueryRefreshProvider: () => true,
    FormatQueryRefreshRun: (run: { Reports: QueryRefreshReport[] }) => run.Reports.map(r => `${r.Outcome} ${r.QueryName}`),
    RebindQueriesForChangedEntities: vi.fn(async (context: { User: unknown }, ids: readonly string[]): Promise<QueryRebindResult> => {
        if (h.failure) throw new Error(h.failure);
        h.rebinds.push({ IDs: ids, User: context.User });
        if (h.reports) return { EntityCount: ids.length, Run: { DryRun: false, Reports: h.reports, Cycles: [] }, Drift: [] };
        const report = { QueryID: 'Q1', QueryName: 'Payroll', Outcome: 'Refreshed' } as QueryRefreshReport;
        return { EntityCount: ids.length, Run: { DryRun: false, Reports: [report], Cycles: [] }, Drift: [{ QueryID: 'Q1', QueryName: 'Payroll', Fields: ['Salary'] }] };
    }),
}));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Instance: { GetSystemUser: () => ({ ID: 'system' }) } } }));
vi.mock('../Misc/status_logging', () => ({
    StartSpinner: () => undefined,
    SucceedSpinner: (m: string) => { h.logged.push(...m.split('\n')); },
    WarnSpinner: (m: string) => { h.logged.push(...m.split('\n').map(l => `WARN ${l}`)); },
    logError: (m: string) => { h.logged.push(`ERROR ${m}`); },
    LogWarning: (m: string) => { h.logged.push(...m.split('\n').map(l => `WARN ${l}`)); },
}));
vi.mock('./../Database/manage-metadata', () => {
    const ids = new Set<string>();
    const names = new Set<string>();
    return {
        ManageMetadataBase: {
            RegisterFieldShapeChange: (e: { EntityID?: string; EntityName?: string }) => { if (e.EntityID) ids.add(e.EntityID.toLowerCase()); if (e.EntityName) names.add(e.EntityName); },
            get FieldShapeChangedEntities() { return { IDs: [...ids], Names: [...names] }; },
            ClearFieldShapeChanges: () => { ids.clear(); names.clear(); },
        },
    };
});

import { ManageMetadataBase } from '../Database/manage-metadata';
import { ChangedEntityIDs, RunQueryRebindPass } from '../Database/queryRebindPass';

const ENTITIES = [
    { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Employees' },
    { ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Departments' },
] as EntityInfo[];
const provider = { Entities: ENTITIES } as IMetadataProvider;
const RUN_USER = { ID: 'owner' } as UserInfo;

beforeEach(() => {
    ManageMetadataBase.ClearFieldShapeChanges();
    h.rebinds.length = 0;
    h.logged.length = 0;
    h.failure = null;
    h.reports = null;
});

/** A report of the shape the refresh service returns, for the outcome and status given. */
function report(id: string, name: string, outcome: QueryRefreshReport['Outcome'], status: QueryRefreshReport['ExtractionStatus'], diagnostics: string[]): QueryRefreshReport {
    return { QueryID: id, QueryName: name, Outcome: outcome, DryRun: false, ExtractionStatus: status, QueryColumns: [], Added: [], Updated: [], Removed: [], Flagged: [], Diagnostics: diagnostics };
}

describe('ChangedEntityIDs', () => {
    it('joins the entities recorded by ID (added or changed fields) and by name (dropped fields), once each', () => {
        ManageMetadataBase.RegisterFieldShapeChange({ EntityID: 'AAAAAAAA-0000-0000-0000-000000000001' });
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Employees' });
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Departments' });
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Gone Entity' });

        expect(ChangedEntityIDs(provider).sort()).toEqual(['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']);
    });
});

describe('RunQueryRebindPass', () => {
    it('does nothing when no entity changed shape', async () => {
        expect(await RunQueryRebindPass(provider, RUN_USER)).toEqual({ Result: null, Warnings: [] });
        expect(h.rebinds).toEqual([]);
    });

    it('re-binds as the System user and prints the summary with the drift warnings', async () => {
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Employees' });
        const { Result: result, Warnings } = await RunQueryRebindPass(provider, RUN_USER);

        expect(Warnings).toEqual([]);
        expect(h.rebinds).toEqual([{ IDs: ['aaaaaaaa-0000-0000-0000-000000000001'], User: { ID: 'system' } }]);
        expect(result?.Run.Reports).toHaveLength(1);
        expect(h.logged[0]).toBe('WARN Query re-bind: 1 entities changed shape; 1 saved queries read them.');
        expect(h.logged).toContain('WARN    Refreshed Payroll');
        expect(h.logged.at(-1)).toContain('definer\'s rights');
    });

    it('warns when the pass cannot complete, says how to retry, and lets the run go on', async () => {
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Employees' });
        h.failure = 'database gone';
        const outcome = await RunQueryRebindPass(provider, RUN_USER);

        expect(outcome.Result).toBeNull();
        expect(outcome.Warnings).toEqual([
            'WARNING Query re-bind did not complete (CodeGen continues): database gone',
            '   The saved queries that read the changed entities were not refreshed. Retry with: mj query refresh --entity "Employees"',
        ]);
        expect(h.logged).toEqual(outcome.Warnings.map(l => `WARN ${l}`));
    });

    it('treats a failure to prepare (the metadata refresh) like a failed pass, without throwing', async () => {
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Departments' });
        const outcome = await RunQueryRebindPass(provider, RUN_USER, async () => { throw new Error('metadata refresh timed out'); });

        expect(h.rebinds).toEqual([]);
        expect(outcome.Warnings[0]).toBe('WARNING Query re-bind did not complete (CodeGen continues): metadata refresh timed out');
        expect(outcome.Warnings[1]).toContain('mj query refresh --entity "Departments"');
    });

    it('names each query it could not refresh, with the server message, and the command that retries them', async () => {
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Employees' });
        h.reports = [
            report('Q1', 'Payroll', 'Refreshed', 'Error', ["Invalid column name 'Salary'."]),
            report('Q2', 'Headcount', 'Failed', null, ['The refresh was not completed and nothing was written: deadlock victim']),
            report('Q3', 'Roster', 'Refreshed', 'OK', []),
        ];
        const outcome = await RunQueryRebindPass(provider, RUN_USER);

        expect(outcome.Warnings).toEqual([
            'WARNING Query re-bind: 2 saved queries could not be refreshed (CodeGen continues):',
            `   "Payroll" (Q1): Invalid column name 'Salary'.`,
            '   "Headcount" (Q2): The refresh was not completed and nothing was written: deadlock victim',
            '   Retry once the cause is fixed: mj query refresh --id Q1 --id Q2 (or --name "<query name>")',
        ]);
        expect(h.logged).toEqual(expect.arrayContaining(outcome.Warnings.map(l => `WARN ${l}`)));
    });

    it('has no warnings when every query refreshed', async () => {
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Employees' });
        h.reports = [report('Q3', 'Roster', 'Refreshed', 'OK', [])];
        expect((await RunQueryRebindPass(provider, RUN_USER)).Warnings).toEqual([]);
    });
});

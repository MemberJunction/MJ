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
    logged: [] as string[],
}));

vi.mock('@memberjunction/core-entities-server', () => ({
    IsQueryRefreshProvider: () => true,
    FormatQueryRefreshRun: (run: { Reports: QueryRefreshReport[] }) => run.Reports.map(r => `${r.Outcome} ${r.QueryName}`),
    RebindQueriesForChangedEntities: vi.fn(async (context: { User: unknown }, ids: readonly string[]): Promise<QueryRebindResult> => {
        if (h.failure) throw new Error(h.failure);
        h.rebinds.push({ IDs: ids, User: context.User });
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
    LogWarning: (m: string) => { h.logged.push(`WARN ${m}`); },
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
});

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
        expect(await RunQueryRebindPass(provider, RUN_USER)).toBeNull();
        expect(h.rebinds).toEqual([]);
    });

    it('re-binds as the System user and prints the summary with the drift warnings', async () => {
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Employees' });
        const result = await RunQueryRebindPass(provider, RUN_USER);

        expect(h.rebinds).toEqual([{ IDs: ['aaaaaaaa-0000-0000-0000-000000000001'], User: { ID: 'system' } }]);
        expect(result?.Run.Reports).toHaveLength(1);
        expect(h.logged[0]).toBe('WARN Query re-bind: 1 entities changed shape; 1 saved queries read them.');
        expect(h.logged).toContain('WARN    Refreshed Payroll');
        expect(h.logged.at(-1)).toContain('definer\'s rights');
    });

    it('logs a failure and lets the run go on', async () => {
        ManageMetadataBase.RegisterFieldShapeChange({ EntityName: 'Employees' });
        h.failure = 'database gone';
        expect(await RunQueryRebindPass(provider, RUN_USER)).toBeNull();
        expect(h.logged).toEqual(['WARN Query re-bind did not complete', 'ERROR Query re-bind failed: database gone']);
    });
});

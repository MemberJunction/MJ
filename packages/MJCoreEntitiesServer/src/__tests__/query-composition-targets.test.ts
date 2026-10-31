/**
 * Composition targets read from the saving provider.
 *
 * A save resolves the queries its SQL composes from the database, bypassing every cache, so a
 * composed query saved earlier in the same transaction (one metadata push creating both) is found
 * although the shared query cache has not heard of it yet. Without that read the composing query
 * is refused with `MJQ_COMPOSITION_NOT_FOUND`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IRunViewProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJQueryCategoryEntity, MJQueryEntity, MJQueryParameterEntity, MJSQLDialectEntity } from '@memberjunction/core-entities';
import { DescribeStatementSuccess } from '@memberjunction/generic-database-provider';
import { MergeCompositionCandidates, ReadCompositionTargetsAsync } from '../custom/query-extraction/compositionTargets';
import type { CompositionCandidate } from '../custom/query-extraction/compositionTargets';
import { ComputeQueryExtraction } from '../custom/query-extraction/extractQuery';
import type { QueryExtractionInput } from '../custom/query-extraction/extractionTypes';

const USER = { ID: 'user-1', Email: 'u@example.com', UserRoles: [] } as Pick<UserInfo, 'ID' | 'Email' | 'UserRoles'> as UserInfo;
const TARGET_ID = 'AAAAAAAA-0000-4000-8000-000000000001';
const ROOT_ID = 'CCCCCCCC-0000-4000-8000-000000000001';
const CHILD_ID = 'CCCCCCCC-0000-4000-8000-000000000002';
const PG_DIALECT_ID = 'DDDDDDDD-0000-4000-8000-000000000001';
const COMPOSING_SQL = 'SELECT a.ID FROM {{query:"Shared/Reports/Active Things(Region=\'West\')"}} a';

type QueryRow = Pick<MJQueryEntity, 'ID' | 'Name' | 'CategoryID' | 'Reusable' | 'SQL' | 'UsesTemplate'>;
type CategoryRow = Pick<MJQueryCategoryEntity, 'ID' | 'Name' | 'ParentID'>;
type ParameterRow = Pick<MJQueryParameterEntity, 'QueryID' | 'Name' | 'Type' | 'IsRequired' | 'IsServerSet' | 'SampleValue' | 'Description' | 'Query' | 'GetAll'>;

const TARGET: QueryRow = { ID: TARGET_ID, Name: 'Active Things', CategoryID: CHILD_ID, Reusable: true, SQL: "SELECT ID FROM __mj.vwThings WHERE Region = {{ Region | sqlString }}", UsesTemplate: true };
const CATEGORIES: CategoryRow[] = [{ ID: ROOT_ID, Name: 'Shared', ParentID: null }, { ID: CHILD_ID, Name: 'Reports', ParentID: ROOT_ID }];

function parameterRow(): ParameterRow {
    const fields = { QueryID: TARGET_ID, Name: 'Region', Type: 'string' as const, IsRequired: true, IsServerSet: false, SampleValue: 'West', Description: 'The region.', Query: 'Active Things' };
    return { ...fields, GetAll: () => ({ ...fields }) };
}

function result<T>(rows: T[]): RunViewResult<T> {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
}

/** A provider whose RunViews answers by entity name, recording each batch. */
function fakeProvider() {
    const batches: RunViewParams[][] = [];
    const rowsFor = (entityName: string | undefined): unknown[] => {
        switch (entityName) {
            case 'MJ: Queries': return [TARGET];
            case 'MJ: Query Categories': return CATEGORIES;
            case 'MJ: Query Parameters': return [parameterRow()];
            case 'MJ: Query SQLs': return [{ QueryID: TARGET_ID, SQLDialectID: PG_DIALECT_ID, SQL: 'SELECT "ID" FROM __mj."vwThings" WHERE "Region" = {{ Region | sqlString }}' }];
            default: return [];
        }
    };
    const RunViews = vi.fn(async (params: RunViewParams[]) => {
        batches.push(params);
        return params.map(p => result(rowsFor(p.EntityName)));
    });
    return { provider: { RunViews } as Pick<IRunViewProvider, 'RunViews'>, batches, RunViews };
}

const DIALECTS = [{ ID: PG_DIALECT_ID, PlatformKey: 'postgresql' }] as Pick<MJSQLDialectEntity, 'ID' | 'PlatformKey'>[] as MJSQLDialectEntity[];

function input(sql: string, queries: readonly CompositionCandidate[], overrides: Partial<QueryExtractionInput> = {}): QueryExtractionInput {
    return {
        QueryID: null, QueryName: 'Composer', QueryPath: 'Tests/Composer', SQL: sql, Platform: 'sqlserver', Mode: 'Save',
        IsExternal: false, KnownParameters: [], ContextUser: USER, Entities: [], Queries: queries, Describe: null, ...overrides,
    };
}

describe('ReadCompositionTargetsAsync', () => {
    it('reads the named queries with every cache bypassed and builds their category paths from the stored categories', async () => {
        const { provider, batches } = fakeProvider();
        const read = await ReadCompositionTargetsAsync(COMPOSING_SQL, 'sqlserver', provider, USER, new Set(), DIALECTS);

        expect(batches.flat().every(p => p.BypassCache === true)).toBe(true);
        expect(batches[0][0]).toMatchObject({ EntityName: 'MJ: Queries', ExtraFilter: "LOWER(Name) IN ('active things')" });
        expect(read.Candidates).toHaveLength(1);
        expect(read.Candidates[0]).toMatchObject({ ID: TARGET_ID, Name: 'Active Things', CategoryPath: 'Shared/Reports', Reusable: true });
        expect(read.Candidates[0].QueryParameters.map(p => p.Name)).toEqual(['Region']);
    });

    it('gives a render spec, with the platform variant, only to a query the cache does not hold', async () => {
        const fresh = await ReadCompositionTargetsAsync(COMPOSING_SQL, 'postgresql', fakeProvider().provider, USER, new Set(), DIALECTS);
        expect(fresh.InlineDependencies).toHaveLength(1);
        expect(fresh.InlineDependencies[0]).toMatchObject({ Name: 'Active Things', CategoryPath: 'Shared/Reports', UsesTemplate: true });
        expect(fresh.InlineDependencies[0].SQL).toContain('"vwThings"');
        expect(fresh.InlineDependencies[0].ParameterDefinitions?.map(p => p.Name)).toEqual(['Region']);

        const cached = await ReadCompositionTargetsAsync(COMPOSING_SQL, 'postgresql', fakeProvider().provider, USER, new Set([TARGET_ID.toLowerCase()]), DIALECTS);
        expect(cached.InlineDependencies).toEqual([]);
    });

    it('reads nothing for SQL that composes nothing', async () => {
        const { provider, RunViews } = fakeProvider();
        const read = await ReadCompositionTargetsAsync('SELECT 1 AS One', 'sqlserver', provider, USER, new Set(), DIALECTS);
        expect(read).toEqual({ Candidates: [], InlineDependencies: [] });
        expect(RunViews).not.toHaveBeenCalled();
    });
});

describe('MergeCompositionCandidates', () => {
    it('puts the database rows first and drops a cached copy of the same query', () => {
        const fromDb: CompositionCandidate = { ID: TARGET_ID, Name: 'Active Things', CategoryPath: 'Shared/Reports', Reusable: true, QueryParameters: [], QueryDependencies: [] };
        const stale: CompositionCandidate = { ...fromDb, ID: TARGET_ID.toLowerCase(), Reusable: false };
        const other: CompositionCandidate = { ...fromDb, ID: 'other', Name: 'Other' };
        expect(MergeCompositionCandidates([fromDb], [stale, other])).toEqual([fromDb, other]);
    });
});

describe('a composing query saved in the same transaction as its target', () => {
    it('is refused with MJQ_COMPOSITION_NOT_FOUND when only the (stale) cache is searched', async () => {
        const extraction = await ComputeQueryExtraction(input(COMPOSING_SQL, []));
        expect(extraction.Refusal).toContain('MJQ_COMPOSITION_NOT_FOUND');
    });

    it('saves, records the dependency and describes the composed render when the target is read from the database', async () => {
        const read = await ReadCompositionTargetsAsync(COMPOSING_SQL, 'sqlserver', fakeProvider().provider, USER, new Set(), DIALECTS);
        const asked: string[] = [];
        const describe = vi.fn(async (sql: string) => {
            asked.push(sql);
            return DescribeStatementSuccess([{ Name: 'ID', Ordinal: 1, SQLFullType: 'uniqueidentifier', SQLBaseType: 'uniqueidentifier', IsNullable: false, IsComputed: false, Source: null }]);
        });
        const extraction = await ComputeQueryExtraction(input(COMPOSING_SQL, MergeCompositionCandidates(read.Candidates, []), {
            CompositionDependencies: read.InlineDependencies, Describe: describe,
        }));

        expect(extraction.Refusal).toBeNull();
        expect(extraction.Dependencies?.map(d => d.DependsOnQueryID)).toEqual([TARGET_ID]);
        expect(extraction.Fields?.map(f => f.Name)).toEqual(['ID']);
        expect(asked.some(sql => sql.includes('vwThings') && sql.includes("'West'"))).toBe(true);
    });
});

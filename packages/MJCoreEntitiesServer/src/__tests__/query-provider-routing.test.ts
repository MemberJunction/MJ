/**
 * The query pipeline must read a query's children through the caller's provider, never
 * through QueryEngine's cache.
 *
 * The cache refreshes on a debounce and its entities are bound to whichever provider loaded
 * the engine. Inside a transaction (one `mj sync push`, say) that is a different connection
 * from the one writing, so the cache can neither see rows the transaction just wrote nor
 * save over the right connection.
 *
 * Each test loads QueryEngine with a STALE cache and makes the row visible only through the
 * supplied provider. Each fails if its code path goes back to the cache:
 *   - SyncParameters' loadExistingRecords
 *   - MJQueryEntityServer.upsertQuerySQLRecord
 *   - MJQuerySQLEntityServer.loadParentQuery
 *
 * See MemberJunction/MJ#4545.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, IRunViewProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import type { MJQueryParameterEntity, MJSQLDialectEntity } from '@memberjunction/core-entities';

const QUERY_ID = '11111111-1111-1111-1111-111111111111';
const DIALECT_ID = '33333333-3333-3333-3333-333333333333';

// A loaded engine whose cache has not caught up: no parameters, and a cached query and
// query SQL bound to some other provider. `vi.hoisted` because `vi.mock` is hoisted above
// every top-level declaration.
const staleEngine = vi.hoisted(() => ({
    Loaded: true,
    Queries: [] as { ID: string; Save: () => Promise<boolean> }[],
    QuerySQLs: [] as { QueryID: string; SQLDialectID: string; SQL: string; Save: () => Promise<boolean> }[],
    QueryEntities: [] as unknown[],
    Dependencies: [] as unknown[],
    SQLDialects: [] as unknown[],
    GetQueryParameters: (): unknown[] => [],
    GetQueryFields: (): unknown[] => [],
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return { ...actual, QueryEngine: { Instance: staleEngine } };
});

import { SyncParameters } from '../custom/query-extraction/sync';
import { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';
import { MJQuerySQLEntityServer } from '../custom/MJQuerySQLEntityServer.server';
import type { ExtractedParameter } from '../custom/query-extraction/types';

const CONTEXT_USER = { ID: 'user-1' } as UserInfo;

/** A RunView provider that answers from a fixed per-entity table. */
function runViewProviderFor(rows: Record<string, unknown[]>): IRunViewProvider {
    return {
        RunView: vi.fn(async (params: RunViewParams) => ({ Success: true, Results: rows[params.EntityName ?? ''] ?? [] })),
    } as unknown as IRunViewProvider;
}

/** A metadata provider whose GetEntityObject records that a NEW record was asked for. */
function metadataProviderSpy(): IMetadataProvider & { GetEntityObject: ReturnType<typeof vi.fn> } {
    return {
        Entities: [],
        GetEntityObject: vi.fn(async () => ({ Save: vi.fn(async () => true) })),
    } as unknown as IMetadataProvider & { GetEntityObject: ReturnType<typeof vi.fn> };
}

describe('query pipeline reads through the caller provider, not the stale QueryEngine cache', () => {
    beforeEach(() => {
        staleEngine.Queries = [];
        staleEngine.QuerySQLs = [];
    });

    it('SyncParameters sees a parameter visible only through the supplied runViewProvider', async () => {
        const visibleOnlyToProvider: Partial<MJQueryParameterEntity> & { Save: () => Promise<boolean> } = {
            ID: '22222222-2222-2222-2222-222222222222',
            QueryID: QUERY_ID,
            Name: 'agentRunID',
            Type: 'string',
            IsRequired: true,
            DetectionMethod: 'Manual',
            Description: 'declared',
            Save: vi.fn(async () => true),
        };
        const runViewProvider = runViewProviderFor({ 'MJ: Query Parameters': [visibleOnlyToProvider] });
        const metadataProvider = metadataProviderSpy();
        const extracted: ExtractedParameter = {
            name: 'agentRunID',
            type: 'string',
            isRequired: true,
            description: 'inferred',
            usage: [],
            defaultValue: null,
            sampleValue: null,
        };

        await SyncParameters(QUERY_ID, [extracted], CONTEXT_USER, metadataProvider, runViewProvider, true);

        // Reading the stale cache would miss the row and create a duplicate.
        expect(metadataProvider.GetEntityObject).not.toHaveBeenCalled();
        expect(visibleOnlyToProvider.Description).toBe('declared');
    });

    it('upsertQuerySQLRecord updates the dialect record the supplied provider returns', async () => {
        const cachedOnOtherProvider = { QueryID: QUERY_ID, SQLDialectID: DIALECT_ID, SQL: 'old', Save: vi.fn(async () => true) };
        staleEngine.QuerySQLs = [cachedOnOtherProvider];
        const fromProvider = { QueryID: QUERY_ID, SQLDialectID: DIALECT_ID, SQL: 'old', Save: vi.fn(async () => true) };
        const metadataProvider = metadataProviderSpy();
        const context = {
            ID: QUERY_ID,
            Name: 'Test Query',
            ContextCurrentUser: CONTEXT_USER,
            ProviderToUse: metadataProvider,
            RunViewProviderToUse: runViewProviderFor({ 'MJ: Query SQLs': [fromProvider] }),
        };
        const upsert = (MJQueryEntityServer.prototype as unknown as {
            upsertQuerySQLRecord: (this: typeof context, dialect: MJSQLDialectEntity, sql: string) => Promise<void>;
        }).upsertQuerySQLRecord;

        await upsert.call(context, { ID: DIALECT_ID, Name: 'PostgreSQL' } as MJSQLDialectEntity, 'SELECT 1');

        expect(fromProvider.Save).toHaveBeenCalledTimes(1);
        expect(fromProvider.SQL).toBe('SELECT 1');
        expect(cachedOnOtherProvider.Save).not.toHaveBeenCalled();
        expect(metadataProvider.GetEntityObject).not.toHaveBeenCalled();
    });

    it('loadParentQuery returns the parent the supplied provider returns', async () => {
        const cachedOnOtherProvider = { ID: QUERY_ID, Save: vi.fn(async () => true) };
        staleEngine.Queries = [cachedOnOtherProvider];
        const fromProvider = { ID: QUERY_ID, Save: vi.fn(async () => true) };
        const context = {
            QueryID: QUERY_ID,
            ContextCurrentUser: CONTEXT_USER,
            ProviderToUse: metadataProviderSpy(),
            RunViewProviderToUse: runViewProviderFor({ 'MJ: Queries': [fromProvider] }),
        };
        const loadParentQuery = (MJQuerySQLEntityServer.prototype as unknown as {
            loadParentQuery: (this: typeof context) => Promise<unknown>;
        }).loadParentQuery;

        const parent = await loadParentQuery.call(context);

        expect(parent).toBe(fromProvider);
    });
});

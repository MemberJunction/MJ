import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserInfo, type IMetadataProvider, type QueryCacheAuthorization, type RunQueryParams } from '@memberjunction/core';
import { QueryEngine, type MJQueryEntityExtended } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '../graphQLDataProvider';

/**
 * The browser's RunQuery cache resolves a request from QueryEngine. The provider's own query
 * metadata (the deprecated `Queries` getters) is empty unless the provider loads it, so resolving
 * from there would leave every request unresolvable: slots keyed by whatever the caller stated, and
 * results that read `Context.*` values reused across users and days.
 */

const FINANCE_ID = '11111111-1111-1111-1111-111111111111';
const SALES_ID = '22222222-2222-2222-2222-222222222222';
const OWNER_ID = '44444444-4444-4444-4444-444444444444';
const DATED_ID = '55555555-5555-5555-5555-555555555555';

interface QueryStub {
    ID: string;
    Name: string;
    CategoryPath: string;
    SQL: string;
    UserCanRun: () => { canRun: boolean; deniedEntities: string[] };
}

function queryStub(id: string, name: string, categoryPath: string, canRun = true, sql = 'SELECT 1'): QueryStub {
    return { ID: id, Name: name, CategoryPath: categoryPath, SQL: sql, UserCanRun: () => ({ canRun, deniedEntities: [] }) };
}

/** A QueryEngine as the provider's connection holds it: two same-named queries, one composing another. */
function engineStub(loaded = true): QueryEngine {
    const queries = [
        queryStub(FINANCE_ID, 'Revenue Summary', '/Finance/'),
        queryStub(SALES_ID, 'Revenue Summary', '/Sales/', false),
        queryStub(OWNER_ID, 'Owner Rows', '/Finance/', true, 'SELECT * FROM {{query:"Finance/Dated Rows"}} d WHERE o = {{ Context.UserID }}'),
        queryStub(DATED_ID, 'Dated Rows', '/Finance/'),
    ] as unknown as MJQueryEntityExtended[];
    return {
        Loaded: loaded,
        Queries: queries,
        QuerySQLs: [{ QueryID: DATED_ID, SQL: "SELECT 1 WHERE d = '{{ Context.Today }}'" }],
        Dependencies: [{ QueryID: OWNER_ID, DependsOnQueryID: DATED_ID }],
    } as unknown as QueryEngine;
}

/** A provider with no query metadata of its own, whose connection's QueryEngine is `engine`. */
function makeProvider(engine: QueryEngine): { provider: GraphQLDataProvider; lookup: ReturnType<typeof vi.spyOn> } {
    const provider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider;
    Object.defineProperty(provider, 'Queries', { get: () => [] });
    const lookup = vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(engine);
    return { provider, lookup };
}

function resolve(provider: GraphQLDataProvider, params: RunQueryParams, user?: UserInfo): QueryCacheAuthorization {
    return (provider as unknown as { ResolveQueryCacheAuthorization(p: RunQueryParams, u?: UserInfo): QueryCacheAuthorization })
        .ResolveQueryCacheAuthorization(params, user);
}

const user = new UserInfo(null as unknown as IMetadataProvider, { ID: 'user-1', Email: 'u@test' });

describe('GraphQLDataProvider.ResolveQueryCacheAuthorization resolves from QueryEngine', () => {
    afterEach(() => vi.restoreAllMocks());

    it('resolves by ID from the engine bound to this provider, with the canonical category path', () => {
        const { provider, lookup } = makeProvider(engineStub());
        expect(resolve(provider, { QueryID: FINANCE_ID }, user)).toEqual({
            resolvable: true, authorized: true, categoryPath: '/Finance/', queryName: 'Revenue Summary', contextTokens: [], queryId: FINANCE_ID,
        });
        expect(lookup).toHaveBeenCalledWith(provider, QueryEngine);
    });

    it('a stated category path picks between same-named queries; the run permission comes from the query', () => {
        const { provider } = makeProvider(engineStub());
        const sales = resolve(provider, { QueryName: ' revenue summary ', CategoryPath: '/Sales/' }, user);
        expect(sales).toMatchObject({ resolvable: true, authorized: false, queryId: SALES_ID, categoryPath: '/Sales/' });
    });

    it('reports the Context tokens the query reads, with what it composes and their platform variants', () => {
        const { provider } = makeProvider(engineStub());
        expect(resolve(provider, { QueryID: OWNER_ID }, user).contextTokens).toEqual(['Context.UserID', 'Context.Today']);
    });

    it('with no user there is nothing to authorize against', () => {
        const { provider } = makeProvider(engineStub());
        expect(resolve(provider, { QueryID: SALES_ID }).authorized).toBe(true);
    });

    it('is unresolvable while the engine is not loaded, and for a query it does not hold', () => {
        expect(resolve(makeProvider(engineStub(false)).provider, { QueryID: FINANCE_ID }, user)).toEqual({ resolvable: false, authorized: false });
        vi.restoreAllMocks();
        expect(resolve(makeProvider(engineStub()).provider, { QueryName: 'Nope' }, user)).toEqual({ resolvable: false, authorized: false });
    });
});

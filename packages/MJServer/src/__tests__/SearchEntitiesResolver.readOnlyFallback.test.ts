// type-graphql decorators on the resolver need the Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { DatabaseProviderBase, EntitySearchResult, SearchEntityParams } from '@memberjunction/core';
import { SearchEntitiesResolver } from '../resolvers/SearchEntitiesResolver.js';
import type { AppContext, ProviderInfo } from '../types.js';

/**
 * `SearchEntities` must run on a server that has no read-only database login.
 *
 * The read-only pool exists only when `dbReadOnlyUsername`/`dbReadOnlyPassword` are configured,
 * and most deployments leave them unset. The resolver asked for the read-only provider without
 * allowing a fallback, got `null`, and threw inside its own try/catch — so every client-side
 * `SearchEntity`/`SearchEntities` call over GraphQL came back `Success: false` with no results.
 * Nothing surfaced it: the client maps a failed batch to empty groups, which looks exactly like
 * "no matches". Found by IT52 (SR2) during the 6.2.0-edge.0 release gate.
 */

const USER_EMAIL = 'searcher@test';

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        Instance: { get Users() { return [{ ID: 'u-1', Email: USER_EMAIL }]; } },
    },
}));

const HIT: EntitySearchResult = {
    entityRecordDocumentId: null,
    recordId: 'E1238F34-0000-0000-0000-000000000001',
    score: 1,
    matchType: 'lexical',
    components: { lexical: 1 },
} as EntitySearchResult;

/** A database provider whose search returns one hit per requested entity. */
function searchingProvider(): DatabaseProviderBase & { SearchEntities: ReturnType<typeof vi.fn> } {
    const search = vi.fn(async (params: SearchEntityParams[]) => params.map(() => [HIT]));
    return { SearchEntities: search } as unknown as DatabaseProviderBase & { SearchEntities: typeof search };
}

function contextWith(providers: ProviderInfo[]): AppContext {
    return { providers, userPayload: { email: USER_EMAIL } } as unknown as AppContext;
}

const PARAMS = [{ EntityName: 'MJ: Entities', SearchText: 'MJ: Users', Mode: 'lexical' }];

describe('SearchEntitiesResolver — provider selection', () => {
    it('searches on the read-write provider when no read-only pool is configured', async () => {
        const readWrite = searchingProvider();

        const result = await new SearchEntitiesResolver().SearchEntities(
            contextWith([{ provider: readWrite, type: 'Read-Write' }]),
            PARAMS as never,
        );

        expect(result.ErrorMessage).toBeUndefined();
        expect(result.Success).toBe(true);
        expect(readWrite.SearchEntities).toHaveBeenCalledTimes(1);
        expect(result.Groups[0].Results.map(r => r.RecordID)).toEqual(['E1238F34-0000-0000-0000-000000000001']);
    });

    it('still prefers the read-only provider when one is configured', async () => {
        const readWrite = searchingProvider();
        const readOnly = searchingProvider();

        const result = await new SearchEntitiesResolver().SearchEntities(
            contextWith([
                { provider: readWrite, type: 'Read-Write' },
                { provider: readOnly, type: 'Read-Only' },
            ]),
            PARAMS as never,
        );

        expect(result.Success).toBe(true);
        expect(readOnly.SearchEntities).toHaveBeenCalledTimes(1);
        expect(readWrite.SearchEntities).not.toHaveBeenCalled();
    });
});

/**
 * A saved query reads its related metadata from the QueryEngine bound to the provider it was loaded
 * through. In a process connected to more than one database, the global engine belongs to whichever
 * provider configured it first, so reading it would give a query another database's fields,
 * parameters or platform SQL.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { QueryEngine } from '../engines/QueryEngine';
import { MJQueryEntityExtended } from '../custom/MJQueryEntityExtended';

const QUERY_ID = '11111111-0000-0000-0000-000000000001';

/** An engine stand-in holding one query's fields, parameters and platform SQL under `tag`. */
function engineWith(tag: string, loaded = true): QueryEngine {
    return {
        Loaded: loaded,
        GetQueryFields: (id: string) => (id === QUERY_ID ? [{ Name: `${tag}Field` }] : []),
        GetQueryParameters: (id: string) => (id === QUERY_ID ? [{ Name: `${tag}Param` }] : []),
        SQLDialects: [{ ID: 'd-pg', PlatformKey: 'postgresql' }],
        QuerySQLs: [{ QueryID: QUERY_ID, SQLDialectID: 'd-pg', SQL: `SELECT '${tag}'` }],
    } as unknown as QueryEngine;
}

/** A query entity loaded through `provider`, with only the members the getters read. */
function queryLoadedThrough(provider: IMetadataProvider | undefined): MJQueryEntityExtended {
    const query = Object.create(MJQueryEntityExtended.prototype) as MJQueryEntityExtended;
    Object.defineProperty(query, 'ID', { get: () => QUERY_ID });
    Object.defineProperty(query, 'SQL', { get: () => 'SELECT base' });
    Object.defineProperty(query, 'ProviderToUse', { get: () => provider });
    return query;
}

describe('MJQueryEntityExtended reads the QueryEngine of its own provider', () => {
    const providerB = { InstanceConnectionString: 'mssql://b' } as unknown as IMetadataProvider;

    afterEach(() => vi.restoreAllMocks());

    it("reads fields, parameters and platform SQL from the engine bound to the query's provider", () => {
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue(engineWith('global'));
        const lookup = vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(engineWith('b'));
        const query = queryLoadedThrough(providerB);

        expect(query.QueryFields.map(f => f.Name)).toEqual(['bField']);
        expect(query.QueryParameters.map(p => p.Name)).toEqual(['bParam']);
        expect(query.GetPlatformSQL('postgresql')).toBe("SELECT 'b'");
        expect(lookup).toHaveBeenCalledWith(providerB, QueryEngine);
    });

    it('falls back to the global engine while the bound one is not loaded, or without a provider', () => {
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue(engineWith('global'));
        vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(engineWith('b', false));

        expect(queryLoadedThrough(providerB).QueryFields.map(f => f.Name)).toEqual(['globalField']);
        expect(queryLoadedThrough(undefined).QueryFields.map(f => f.Name)).toEqual(['globalField']);
    });
});

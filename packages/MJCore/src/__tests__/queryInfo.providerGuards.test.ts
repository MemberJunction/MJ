/**
 * Query metadata Info objects resolve their sibling lookups through the owning provider
 * (MetadataProviderFor), which is `undefined` when an Info object was built outside any provider and no
 * global provider is registered either.
 *
 * - QueryFieldInfo.QueryInfo matched the parent query's ID against the FIELD's own ID instead of its
 *   QueryID, so it always returned undefined.
 * - Every getter dereferenced the resolved provider unconditionally and threw a TypeError when none was
 *   bound; they now return undefined / [] instead. The lazily cached collection getters (Fields,
 *   Parameters, Entities, Dependencies) must not cache that empty answer: once a provider is bound the
 *   real rows appear.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Metadata } from '../generic/metadata';
import { IMetadataProvider } from '../generic/interfaces';
import {
    QueryCategoryInfo,
    QueryDependencyInfo,
    QueryEntityInfo,
    QueryFieldInfo,
    QueryInfo,
    QueryParameterInfo,
    QueryPermissionInfo,
    QuerySQLInfo,
    SQLDialectInfo,
} from '../generic/queryInfo';

interface QueryProviderShape {
    Queries: QueryInfo[];
    QueryFields: QueryFieldInfo[];
    QueryPermissions: QueryPermissionInfo[];
    QueryParameters: QueryParameterInfo[];
    QueryEntities: QueryEntityInfo[];
    QueryCategories: QueryCategoryInfo[];
    QueryDependencies: QueryDependencyInfo[];
    SQLDialects: SQLDialectInfo[];
    Entities: [];
}

const QUERY_ID = 'q-guard-1';
const OTHER_QUERY_ID = 'q-guard-2';

/** A provider-shaped object carrying only the query collections the getters read. */
function createQueryProvider(): IMetadataProvider & QueryProviderShape {
    const provider: QueryProviderShape = {
        Queries: [],
        QueryFields: [],
        QueryPermissions: [],
        QueryParameters: [],
        QueryEntities: [],
        QueryCategories: [],
        QueryDependencies: [],
        SQLDialects: [],
        Entities: [],
    };
    const typed = provider as unknown as IMetadataProvider & QueryProviderShape;
    typed.Queries = [
        new QueryInfo({ ID: QUERY_ID, Name: 'Guarded', CategoryID: 'qc-1' }, typed),
        new QueryInfo({ ID: OTHER_QUERY_ID, Name: 'Other' }, typed),
    ];
    typed.QueryFields = [new QueryFieldInfo({ ID: 'qf-1', QueryID: QUERY_ID, Name: 'Total' }, typed)];
    typed.QueryPermissions = [new QueryPermissionInfo({ ID: 'qp-1', QueryID: QUERY_ID }, typed)];
    typed.QueryParameters = [new QueryParameterInfo({ ID: 'qpar-1', QueryID: QUERY_ID, Name: 'Year' }, typed)];
    typed.QueryEntities = [new QueryEntityInfo({ ID: 'qe-1', QueryID: QUERY_ID }, typed)];
    typed.QueryCategories = [new QueryCategoryInfo({ ID: 'qc-1', Name: 'Sales' }, typed)];
    typed.QueryDependencies = [new QueryDependencyInfo({ ID: 'qd-1', QueryID: QUERY_ID, DependsOnQueryID: OTHER_QUERY_ID }, typed)];
    typed.SQLDialects = [new SQLDialectInfo({ ID: 'd-1', Name: 'T-SQL', PlatformKey: 'sqlserver' }, typed)];
    return typed;
}

let previousGlobal: IMetadataProvider;

beforeEach(() => {
    previousGlobal = Metadata.Provider;
    Metadata.Provider = null as unknown as IMetadataProvider;
});

afterEach(() => {
    Metadata.Provider = previousGlobal;
});

describe('QueryFieldInfo.QueryInfo', () => {
    it('resolves the parent query by QueryID through the owning provider', () => {
        const provider = createQueryProvider();
        const field = provider.QueryFields[0];
        expect(field.ID).not.toBe(QUERY_ID);
        expect(field.QueryInfo?.ID).toBe(QUERY_ID);
    });

    it('does not match a query whose ID equals the field ID', () => {
        const provider = createQueryProvider();
        // A field whose own ID happens to equal another query's ID must still resolve to its QueryID.
        const field = new QueryFieldInfo({ ID: OTHER_QUERY_ID, QueryID: QUERY_ID, Name: 'Clash' }, provider);
        expect(field.QueryInfo?.ID).toBe(QUERY_ID);
    });
});

describe('query Info getters with no provider bound and no global provider', () => {
    it('return undefined for single lookups instead of throwing', () => {
        expect(new QueryFieldInfo({ ID: 'qf-x', QueryID: QUERY_ID }).QueryInfo).toBeUndefined();
        expect(new QueryFieldInfo({ ID: 'qf-x', QueryID: QUERY_ID, SourceEntityID: 'e-1' }).SourceEntityInfo).toBeUndefined();
        expect(new QuerySQLInfo({ ID: 'qs-x', QueryID: QUERY_ID, SQLDialectID: 'd-1' }).QueryInfo).toBeUndefined();
        expect(new QuerySQLInfo({ ID: 'qs-x', QueryID: QUERY_ID, SQLDialectID: 'd-1' }).SQLDialectInfo).toBeUndefined();
        expect(new QueryInfo({ ID: QUERY_ID, CategoryID: 'qc-1' }).CategoryInfo).toBeUndefined();
        expect(new QueryCategoryInfo({ ID: 'qc-1', ParentID: 'qc-0' }).ParentCategoryInfo).toBeUndefined();
        expect(new QueryPermissionInfo({ ID: 'qp-x', QueryID: QUERY_ID }).QueryInfo).toBeUndefined();
        expect(new QueryEntityInfo({ ID: 'qe-x', QueryID: QUERY_ID }).QueryInfo).toBeUndefined();
        expect(new QueryEntityInfo({ ID: 'qe-x', QueryID: QUERY_ID, EntityID: 'e-1' }).EntityInfo).toBeUndefined();
        expect(new QueryParameterInfo({ ID: 'qpar-x', QueryID: QUERY_ID }).QueryInfo).toBeUndefined();
        const dependency = new QueryDependencyInfo({ ID: 'qd-x', QueryID: QUERY_ID, DependsOnQueryID: OTHER_QUERY_ID });
        expect(dependency.QueryInfo).toBeUndefined();
        expect(dependency.DependsOnQueryInfo).toBeUndefined();
    });

    it('return [] for collections instead of throwing', () => {
        const query = new QueryInfo({ ID: QUERY_ID, Name: 'Orphan' });
        expect(query.Fields).toEqual([]);
        expect(query.Permissions).toEqual([]);
        expect(query.Parameters).toEqual([]);
        expect(query.Entities).toEqual([]);
        expect(query.Dependencies).toEqual([]);
        expect(query.Dependents).toEqual([]);
        expect(new QueryCategoryInfo({ ID: 'qc-1' }).Queries).toEqual([]);
    });

    it('do not cache the empty answer: binding a provider afterwards yields the real rows', () => {
        const query = new QueryInfo({ ID: QUERY_ID, Name: 'Late bound', CategoryID: 'qc-1' });
        expect(query.Fields).toEqual([]);
        expect(query.Parameters).toEqual([]);
        expect(query.Entities).toEqual([]);
        expect(query.Dependencies).toEqual([]);

        query.SetOwningProvider(createQueryProvider());
        expect(query.Fields.map(f => f.ID)).toEqual(['qf-1']);
        expect(query.Parameters.map(p => p.ID)).toEqual(['qpar-1']);
        expect(query.Entities.map(e => e.ID)).toEqual(['qe-1']);
        expect(query.Dependencies.map(d => d.ID)).toEqual(['qd-1']);
        expect(query.Permissions.map(p => p.ID)).toEqual(['qp-1']);
        expect(query.CategoryInfo?.Name).toBe('Sales');
    });

    it('fall back to the global provider when one is registered', () => {
        const provider = createQueryProvider();
        Metadata.Provider = provider;
        const orphanField = new QueryFieldInfo({ ID: 'qf-y', QueryID: QUERY_ID });
        expect(orphanField.QueryInfo?.ID).toBe(QUERY_ID);
        const orphanDependency = new QueryDependencyInfo({ ID: 'qd-y', QueryID: QUERY_ID, DependsOnQueryID: OTHER_QUERY_ID });
        expect(orphanDependency.DependsOnQueryInfo?.ID).toBe(OTHER_QUERY_ID);
    });
});

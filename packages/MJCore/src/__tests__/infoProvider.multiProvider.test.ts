/**
 * Multi-provider resolution for metadata Info objects.
 *
 * Info getters that resolve SIBLING metadata — EntityInfo.ChildEntities / ParentEntityInfo, an
 * entity permission's RLS filter, QueryInfo.Fields / CategoryInfo, AuthorizationInfo.Roles — used
 * to read the process-global `Metadata.Provider`. In a multi-provider process (several
 * GraphQLDataProvider instances with separateConnection and no global provider, or a global that
 * holds a DIFFERENT server's metadata) they resolved against the wrong metadata or nothing, and
 * `BaseEntity.EnsureISAChild` threw "'X' is not a declared IsA child entity of 'Y'" even for the
 * system user. They now resolve through the provider that built the Info object.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo, EntityPermissionInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase, MetadataFromSimpleObjectWithoutUser } from '../generic/providerBase';
import { AuthorizationInfo, AuthorizationRoleInfo, RowLevelSecurityFilterInfo, UserInfo } from '../generic/securityInfo';
import { QueryCategoryInfo, QueryFieldInfo, QueryInfo } from '../generic/queryInfo';
import { IMetadataProvider } from '../generic/interfaces';
import {
    ALL_ENTITY_DATA,
    PRODUCT_ENTITY_ID,
    MEETING_ENTITY_ID,
    WEBINAR_ENTITY_ID,
    PUBLICATION_ENTITY_ID,
    MOCK_ROLE_ID,
} from './mocks/MockEntityData';

class MultiProviderTestEntity extends BaseEntity {}

interface MockProviderShape {
    Entities: EntityInfo[];
    RowLevelSecurityFilters: RowLevelSecurityFilterInfo[];
    QueryFields: QueryFieldInfo[];
    QueryCategories: QueryCategoryInfo[];
    AuthorizationRoles: AuthorizationRoleInfo[];
    CurrentUser: UserInfo;
    EntityByID(id: string): EntityInfo | undefined;
    GetEntityObject(name: string, user?: UserInfo): Promise<BaseEntity | null>;
}

function createUser(): UserInfo {
    return new UserInfo(null, {
        ID: 'user-mp-001', Name: 'System', Email: 'system@example.com', IsActive: true,
        UserRoles: [{ UserID: 'user-mp-001', RoleID: MOCK_ROLE_ID, RoleName: 'Admin' }],
    });
}

/** A provider-shaped mock whose metadata is built the way real providers build it: `new X(row, provider)`. */
function createProvider(entityRows: Record<string, unknown>[]): IMetadataProvider & MockProviderShape {
    const user = createUser();
    const provider = {
        Entities: [] as EntityInfo[],
        RowLevelSecurityFilters: [] as RowLevelSecurityFilterInfo[],
        QueryFields: [] as QueryFieldInfo[],
        QueryCategories: [] as QueryCategoryInfo[],
        AuthorizationRoles: [] as AuthorizationRoleInfo[],
        CurrentUser: user,
        EntityByID(id: string): EntityInfo | undefined {
            return provider.Entities.find(e => e.ID === id);
        },
        async GetEntityObject(name: string, contextUser?: UserInfo): Promise<BaseEntity | null> {
            const info = provider.Entities.find(e => e.Name.toLowerCase() === name.toLowerCase());
            if (!info) return null;
            const entity = new MultiProviderTestEntity(info, provider as unknown as ProviderBase);
            entity.ContextCurrentUser = contextUser ?? user;
            await entity.InitializeParentEntity();
            return entity;
        },
    };
    const typed = provider as unknown as IMetadataProvider & MockProviderShape;
    provider.Entities = entityRows.map(row => new EntityInfo(row, typed));
    return typed;
}

/** Another server's metadata: same entity names, no IS-A hierarchy at all. */
function flattenedRows(): Record<string, unknown>[] {
    return ALL_ENTITY_DATA.map(d => ({ ...d, ParentID: null }));
}

let previousGlobal: IMetadataProvider;
let previousEntityProvider: unknown;

beforeEach(() => {
    previousGlobal = Metadata.Provider;
    previousEntityProvider = BaseEntity.Provider;
    BaseEntity.ClearSubtypeLookupCache();
});

afterEach(() => {
    Metadata.Provider = previousGlobal;
    BaseEntity.Provider = previousEntityProvider as ProviderBase;
    BaseEntity.ClearSubtypeLookupCache();
});

describe('EntityInfo IS-A getters resolve through the owning provider', () => {
    it('resolves ChildEntities / ParentEntityInfo with NO global provider', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        Metadata.Provider = null as unknown as IMetadataProvider;

        const products = a.Entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
        const meetings = a.Entities.find(e => e.ID === MEETING_ENTITY_ID)!;

        expect(products.OwningProvider).toBe(a);
        expect(products.ChildEntities.map(e => e.ID).sort()).toEqual([MEETING_ENTITY_ID, PUBLICATION_ENTITY_ID].sort());
        expect(meetings.ParentEntityInfo?.ID).toBe(PRODUCT_ENTITY_ID);
        expect(meetings.ChildEntities.map(e => e.ID)).toEqual([WEBINAR_ENTITY_ID]);
    });

    it('resolves through its own provider when the global provider holds a DIFFERENT metadata set', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        const b = createProvider(flattenedRows());
        Metadata.Provider = b;

        const productsA = a.Entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
        const productsB = b.Entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
        expect(productsA.ChildEntities).toHaveLength(2);
        expect(productsA.ChildEntities.every(c => a.Entities.includes(c))).toBe(true);
        expect(productsB.ChildEntities).toHaveLength(0);
    });

    it('falls back to the global provider for an EntityInfo built outside any provider (unchanged behavior)', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        Metadata.Provider = a;
        const orphan = new EntityInfo(ALL_ENTITY_DATA.find(d => d.ID === PRODUCT_ENTITY_ID));
        expect(orphan.OwningProvider).toBeUndefined();
        expect(orphan.ChildEntities).toHaveLength(2);
    });

    it('hands the provider to nested fields and permissions', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        const products = a.Entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
        expect(products.Fields.length).toBeGreaterThan(0);
        expect(products.Fields.every(f => f.OwningProvider === a)).toBe(true);
        expect(products.Permissions.every(p => p.OwningProvider === a)).toBe(true);
    });

    it('never serializes the provider back-reference, and a re-instantiation takes the new owner', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        const b = createProvider(ALL_ENTITY_DATA);
        const products = a.Entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
        const json = JSON.stringify(products);
        expect(Object.keys(JSON.parse(json))).not.toContain('OwningProvider');
        expect(Object.keys(products)).not.toContain('OwningProvider');

        const copy = new EntityInfo(products, b);
        expect(copy.OwningProvider).toBe(b);
        expect(products.OwningProvider).toBe(a);
    });

    it('MetadataFromSimpleObjectWithoutUser stamps the provider on every Info object it builds', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        const all = MetadataFromSimpleObjectWithoutUser({
            AllEntities: ALL_ENTITY_DATA,
            AllQueries: [{ ID: 'q-1', Name: 'Q' }],
            AllAuthorizations: [{ ID: 'auth-1', Name: 'Run' }],
        }, a);
        expect(all).toBeDefined();
        expect(all!.AllEntities.every(e => e.OwningProvider === a)).toBe(true);
        expect(all!.AllQueries[0].OwningProvider).toBe(a);
        expect(all!.AllAuthorizations[0].OwningProvider).toBe(a);
    });
});

describe('BaseEntity IS-A child resolution in a multi-provider process', () => {
    it('EnsureISAChild finds the declared child with no global provider (system user)', async () => {
        const a = createProvider(ALL_ENTITY_DATA);
        Metadata.Provider = null as unknown as IMetadataProvider;
        BaseEntity.Provider = null as unknown as ProviderBase;

        const products = a.Entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
        const product = new MultiProviderTestEntity(products, a as unknown as ProviderBase);
        product.ContextCurrentUser = a.CurrentUser;
        product.NewRecord();

        const child = await product.EnsureISAChild('Meetings');
        expect(child).not.toBeNull();
        expect(child!.EntityInfo.ID).toBe(MEETING_ENTITY_ID);
    });

    it('EnsureISAChild ignores a global provider whose metadata has no such hierarchy', async () => {
        const a = createProvider(ALL_ENTITY_DATA);
        Metadata.Provider = createProvider(flattenedRows());
        BaseEntity.Provider = null as unknown as ProviderBase;

        const products = a.Entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
        const product = new MultiProviderTestEntity(products, a as unknown as ProviderBase);
        product.ContextCurrentUser = a.CurrentUser;
        product.NewRecord();

        await expect(product.EnsureISAChild('Meetings')).resolves.not.toBeNull();
    });
});

describe('Other sibling lookups resolve through the owning provider', () => {
    it('EntityPermissionInfo.RLSFilter', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        a.RowLevelSecurityFilters = [new RowLevelSecurityFilterInfo({ ID: 'rls-1', Name: 'Mine', FilterText: '1=1' })];
        Metadata.Provider = createProvider(ALL_ENTITY_DATA); // no filters
        const perm = new EntityPermissionInfo({ ID: 'p-1', ReadRLSFilterID: 'rls-1' }, a);
        expect(perm.ReadRLSFilterObject?.ID).toBe('rls-1');
    });

    it('QueryInfo.Fields and CategoryInfo', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        a.QueryFields = [new QueryFieldInfo({ ID: 'qf-1', QueryID: 'q-1', Name: 'Total' }, a)];
        a.QueryCategories = [new QueryCategoryInfo({ ID: 'qc-1', Name: 'Sales' }, a)];
        Metadata.Provider = null as unknown as IMetadataProvider;
        const query = new QueryInfo({ ID: 'q-1', Name: 'Q', CategoryID: 'qc-1' }, a);
        expect(query.Fields.map(f => f.ID)).toEqual(['qf-1']);
        expect(query.CategoryInfo?.Name).toBe('Sales');
    });

    it('QueryInfo built with Fields in its init data keeps each field (not the whole array)', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        const query = new QueryInfo({ ID: 'q-2', Name: 'Q2', Fields: [{ ID: 'f-1', Name: 'A' }, { ID: 'f-2', Name: 'B' }] }, a);
        expect(query.Fields.map(f => f.Name)).toEqual(['A', 'B']);
        expect(query.Fields.every(f => f.OwningProvider === a)).toBe(true);
    });

    it('AuthorizationInfo.Roles', () => {
        const a = createProvider(ALL_ENTITY_DATA);
        a.AuthorizationRoles = [new AuthorizationRoleInfo({ ID: 'ar-1', AuthorizationID: 'auth-1', RoleID: MOCK_ROLE_ID, Type: 'Allow' })];
        Metadata.Provider = null as unknown as IMetadataProvider;
        const auth = new AuthorizationInfo({ ID: 'auth-1', Name: 'Run' }, a);
        expect(auth.Roles.map(r => r.ID)).toEqual(['ar-1']);
    });
});

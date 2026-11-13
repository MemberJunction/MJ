/**
 * Regression tests for #6598: `ProviderBase.GetAllMetadata()`, `PostProcessEntityMetadata()`,
 * and `EntityInfo` must never mutate raw `MJ_Metadata` dataset arrays or row objects in place.
 *
 * When a reference-sharing storage provider (or caller) hands `GetAllMetadata()` deep-frozen
 * dataset items — or freezes the dataset inside `CacheDataset('MJ_Metadata', ...)` right before
 * `PostProcessEntityMetadata()` runs — in-place `.sort()` or child-property assignment throws
 * `TypeError: Cannot assign to read only property '0' of object '[object Array]'`, causing
 * `GetAllMetadata()` to return `undefined` and the server to boot with zero metadata.
 */
import { describe, it, expect } from 'vitest';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import type { AllMetadata, DatasetResultType, ILocalStorageProvider } from '../generic/interfaces';

function deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }
    if (Array.isArray(value)) {
        for (const element of value) {
            deepFreeze(element);
        }
    } else {
        for (const key of Object.keys(value)) {
            const prop = Reflect.get(value, key);
            deepFreeze(prop);
        }
    }
    return Object.freeze(value);
}

class FreezingStorageProvider implements ILocalStorageProvider {
    public readonly SharesReferences = true;
    private readonly _store = new Map<string, string | DatasetResultType>();

    public async GetItem(key: string, category?: string): Promise<string | null> {
        const val = this._store.get(`${category ?? 'default'}:${key}`);
        return typeof val === 'string' ? val : null;
    }

    public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        deepFreeze(value);
        if (typeof value === 'string') {
            this._store.set(`${category ?? 'default'}:${key}`, value);
        }
    }

    public async Remove(key: string, category?: string): Promise<void> {
        this._store.delete(`${category ?? 'default'}:${key}`);
    }

    public async ClearCategory(category?: string): Promise<void> {
        const prefix = `${category ?? 'default'}:`;
        for (const k of Array.from(this._store.keys())) {
            if (k.startsWith(prefix)) {
                this._store.delete(k);
            }
        }
    }

    public async GetCategoryKeys(category?: string): Promise<string[]> {
        const prefix = `${category ?? 'default'}:`;
        return Array.from(this._store.keys())
            .filter(k => k.startsWith(prefix))
            .map(k => k.slice(prefix.length));
    }
}

class FrozenDatasetMetadataProvider extends TestMetadataProvider {
    private readonly _dataset: DatasetResultType;
    private readonly _storage: ILocalStorageProvider;

    public constructor(dataset: DatasetResultType, storage: ILocalStorageProvider) {
        super();
        this._dataset = dataset;
        this._storage = storage;
    }

    public override get LocalStorageProvider(): ILocalStorageProvider {
        return this._storage;
    }

    public override async GetDatasetByName(datasetName: string): Promise<DatasetResultType> {
        if (datasetName !== 'MJ_Metadata') {
            throw new Error(`Unexpected dataset request: ${datasetName}`);
        }
        return this._dataset;
    }

    public async loadAllMetadata(): Promise<AllMetadata> {
        return this.GetAllMetadata();
    }
}

const ENTITY_ZETA_ID = '11111111-1111-4111-8111-111111111111';
const ENTITY_ALPHA_ID = '22222222-2222-4222-8222-222222222222';
const FIELD_ALPHA_NAME_ID = '33333333-3333-4333-8333-333333333333';
const FIELD_ALPHA_ID_ID = '44444444-4444-4444-8444-444444444444';
const FIELD_ZETA_ID_ID = '55555555-5555-4555-8555-555555555555';
const ORGANIC_KEY_ID = '66666666-6666-4666-8666-666666666666';
const APP_ID = '77777777-7777-4777-8777-777777777777';
const ROLE_ID = '88888888-8888-4888-8888-888888888888';

function buildMetadataDataset(): DatasetResultType {
    return {
        DatasetID: '99999999-9999-4999-8999-999999999999',
        DatasetName: 'MJ_Metadata',
        Success: true,
        Status: 'Success',
        LatestUpdateDate: new Date('2026-11-12T06:00:00.000Z'),
        Results: [
            {
                Code: 'Entities',
                EntityName: 'MJ: Entities',
                EntityID: 'e-meta-1',
                // Deliberately reverse-sorted so in-place .sort() attempts to swap indices 0 and 1
                Results: [
                    { ID: ENTITY_ZETA_ID, Name: 'Zeta Records', SchemaName: 'dbo', BaseTable: 'ZetaRecord', BaseView: 'vwZetaRecords' },
                    { ID: ENTITY_ALPHA_ID, Name: 'Alpha Records', SchemaName: 'dbo', BaseTable: 'AlphaRecord', BaseView: 'vwAlphaRecords' },
                ],
            },
            {
                Code: 'EntityFields',
                EntityName: 'MJ: Entity Fields',
                EntityID: 'e-meta-2',
                // Deliberately out of Sequence order so field sorting is exercised
                Results: [
                    { ID: FIELD_ALPHA_NAME_ID, EntityID: ENTITY_ALPHA_ID, Name: 'Status', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2, ValueListType: 'List' },
                    { ID: FIELD_ALPHA_ID_ID, EntityID: ENTITY_ALPHA_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                    { ID: FIELD_ZETA_ID_ID, EntityID: ENTITY_ZETA_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                ],
            },
            {
                Code: 'EntityFieldValues',
                EntityName: 'MJ: Entity Field Values',
                EntityID: 'e-meta-3',
                Results: [
                    { ID: 'efv-1', EntityFieldID: FIELD_ALPHA_NAME_ID, Value: 'Active', Code: 'Active', Sequence: 1 },
                    { ID: 'efv-2', EntityFieldID: FIELD_ALPHA_NAME_ID, Value: 'Archived', Code: 'Archived', Sequence: 2 },
                ],
            },
            {
                Code: 'EntityFieldPermissions',
                EntityName: 'MJ: Entity Field Permissions',
                EntityID: 'e-meta-4',
                Results: [
                    { ID: 'efp-1', EntityFieldID: FIELD_ALPHA_NAME_ID, RoleID: ROLE_ID, CanRead: true, CanUpdate: false },
                ],
            },
            {
                Code: 'EntityPermissions',
                EntityName: 'MJ: Entity Permissions',
                EntityID: 'e-meta-5',
                Results: [
                    { ID: 'ep-1', EntityID: ENTITY_ALPHA_ID, RoleID: ROLE_ID, RoleName: 'UI', CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: false },
                ],
            },
            {
                Code: 'EntityRelationships',
                EntityName: 'MJ: Entity Relationships',
                EntityID: 'e-meta-6',
                // Non-zero Sequence values exercise EntityInfo's sequence-sorting branch
                Results: [
                    { ID: 'er-2', EntityID: ENTITY_ALPHA_ID, RelatedEntityID: ENTITY_ZETA_ID, RelatedEntity: 'Zeta Records', Sequence: 20, Type: 'One To Many' },
                    { ID: 'er-1', EntityID: ENTITY_ALPHA_ID, RelatedEntityID: ENTITY_ZETA_ID, RelatedEntity: 'Zeta Records', Sequence: 10, Type: 'One To Many' },
                ],
            },
            {
                Code: 'EntitySettings',
                EntityName: 'MJ: Entity Settings',
                EntityID: 'e-meta-7',
                Results: [
                    { ID: 'es-1', EntityID: ENTITY_ALPHA_ID, Name: 'DefaultForNewUser', Value: 'true' },
                ],
            },
            {
                Code: 'EntityOrganicKeys',
                EntityName: 'MJ: Entity Organic Keys',
                EntityID: 'e-meta-8',
                Results: [
                    { ID: ORGANIC_KEY_ID, EntityID: ENTITY_ALPHA_ID, Name: 'StatusKey', MatchFieldNames: 'Status', Status: 'Active', Sequence: 1 },
                ],
            },
            {
                Code: 'EntityOrganicKeyRelatedEntities',
                EntityName: 'MJ: Entity Organic Key Related Entities',
                EntityID: 'e-meta-9',
                Results: [
                    { ID: 'okre-2', EntityOrganicKeyID: ORGANIC_KEY_ID, RelatedEntityID: ENTITY_ZETA_ID, RelatedEntity: 'Zeta Records', Sequence: 2 },
                    { ID: 'okre-1', EntityOrganicKeyID: ORGANIC_KEY_ID, RelatedEntityID: ENTITY_ZETA_ID, RelatedEntity: 'Zeta Records', Sequence: 1 },
                ],
            },
            {
                Code: 'EntityAlternateBaseViews',
                EntityName: 'MJ: Entity Alternate Base Views',
                EntityID: 'e-meta-10',
                Results: [
                    { ID: 'abv-1', EntityID: ENTITY_ALPHA_ID, Name: 'Active Alpha', ViewName: 'vwAlphaActive', Sequence: 1, Status: 'Active' },
                ],
            },
            {
                Code: 'EntityUniqueKeys',
                EntityName: 'MJ: Entity Unique Keys',
                EntityID: 'e-meta-11',
                Results: [
                    { ID: 'uk-1', EntityID: ENTITY_ALPHA_ID, Name: 'UQ_Alpha_Status', FieldNames: 'Status', Sequence: 1 },
                ],
            },
            {
                Code: 'Applications',
                EntityName: 'MJ: Applications',
                EntityID: 'e-meta-12',
                Results: [
                    { ID: APP_ID, Name: 'Core App', Status: 'Active' },
                ],
            },
            {
                Code: 'ApplicationEntities',
                EntityName: 'MJ: Application Entities',
                EntityID: 'e-meta-13',
                Results: [
                    { ID: 'ae-1', ApplicationID: APP_ID, EntityID: ENTITY_ALPHA_ID, Sequence: 1 },
                ],
            },
            {
                Code: 'ApplicationSettings',
                EntityName: 'MJ: Application Settings',
                EntityID: 'e-meta-14',
                Results: [
                    { ID: 'as-1', ApplicationID: APP_ID, Name: 'Theme', Value: 'dark' },
                ],
            },
            { Code: 'Roles', EntityName: 'MJ: Roles', EntityID: 'e-meta-15', Results: [{ ID: ROLE_ID, Name: 'UI' }] },
            { Code: 'RowLevelSecurityFilters', EntityName: 'MJ: Row Level Security Filters', EntityID: 'e-meta-16', Results: [] },
            { Code: 'AuditLogTypes', EntityName: 'MJ: Audit Log Types', EntityID: 'e-meta-17', Results: [] },
            { Code: 'Authorizations', EntityName: 'MJ: Authorizations', EntityID: 'e-meta-18', Results: [] },
            { Code: 'AuthorizationRoles', EntityName: 'MJ: Authorization Roles', EntityID: 'e-meta-19', Results: [] },
            { Code: 'QueryCategories', EntityName: 'MJ: Query Categories', EntityID: 'e-meta-20', Results: [] },
            { Code: 'Queries', EntityName: 'MJ: Queries', EntityID: 'e-meta-21', Results: [] },
            { Code: 'QueryFields', EntityName: 'MJ: Query Fields', EntityID: 'e-meta-22', Results: [] },
            { Code: 'QueryPermissions', EntityName: 'MJ: Query Permissions', EntityID: 'e-meta-23', Results: [] },
            { Code: 'QueryEntities', EntityName: 'MJ: Query Entities', EntityID: 'e-meta-24', Results: [] },
            { Code: 'QueryParameters', EntityName: 'MJ: Query Parameters', EntityID: 'e-meta-25', Results: [] },
            { Code: 'QueryDependencies', EntityName: 'MJ: Query Dependencies', EntityID: 'e-meta-26', Results: [] },
            { Code: 'SQLDialects', EntityName: 'MJ: SQL Dialects', EntityID: 'e-meta-27', Results: [] },
            { Code: 'QuerySQLs', EntityName: 'MJ: Query SQLs', EntityID: 'e-meta-28', Results: [] },
            { Code: 'EntityDocumentTypes', EntityName: 'MJ: Entity Document Types', EntityID: 'e-meta-29', Results: [] },
            { Code: 'Libraries', EntityName: 'MJ: Libraries', EntityID: 'e-meta-30', Results: [] },
            { Code: 'ExplorerNavigationItems', EntityName: 'MJ: Explorer Navigation Items', EntityID: 'e-meta-31', Results: [] },
        ],
    };
}

describe('ProviderBase.GetAllMetadata with deep-frozen MJ_Metadata dataset (#6598)', () => {
    it('hydrates entities, fields, organic keys, relationships, and applications across cold and warm loads without mutating frozen dataset rows', async () => {
        const frozenDataset = deepFreeze(buildMetadataDataset());
        const storage = new FreezingStorageProvider();
        const provider = new FrozenDatasetMetadataProvider(frozenDataset, storage);

        // Cold load + warm reload against the exact same deep-frozen DatasetResultType
        const first = await provider.loadAllMetadata();
        const second = await provider.loadAllMetadata();

        expect(provider.LastMetadataLoadError).toBeNull();
        expect(first).toBeDefined();
        expect(second).toBeDefined();

        for (const loaded of [first, second]) {
            expect(loaded.AllEntities.map(e => e.Name)).toEqual(['Alpha Records', 'Zeta Records']);

            const alpha = loaded.AllEntities[0];
            expect(alpha.Fields.map(f => f.Name)).toEqual(['ID', 'Status']);
            expect(alpha.Fields[1].EntityFieldValues.map(v => v.Value)).toEqual(['Active', 'Archived']);
            expect(alpha.Fields[1].FieldPermissions).toHaveLength(1);
            expect(alpha.Permissions).toHaveLength(1);
            expect(alpha.RelatedEntities.map(r => r.ID)).toEqual(['er-1', 'er-2']);
            expect(alpha.Settings).toHaveLength(1);
            expect(alpha.OrganicKeys).toHaveLength(1);
            expect(alpha.OrganicKeys[0].RelatedEntities.map(re => re.ID)).toEqual(['okre-1', 'okre-2']);
            expect(alpha.AlternateBaseViews.map(v => v.ID)).toEqual(['abv-1']);
            expect(alpha.UniqueKeySets.map(u => u.ID)).toEqual(['uk-1']);

            expect(loaded.AllApplications).toHaveLength(1);
            expect(loaded.AllApplications[0].ApplicationEntities.map(ae => ae.ID)).toEqual(['ae-1']);
            expect(loaded.AllApplications[0].ApplicationSettings.map(as => as.ID)).toEqual(['as-1']);
        }

        // Verify the input dataset array order and raw row keys were never mutated
        const rawEntities = frozenDataset.Results.find(r => r.Code === 'Entities')!.Results;
        expect(rawEntities.map((r: { Name: string }) => r.Name)).toEqual(['Zeta Records', 'Alpha Records']);
        expect('EntityFields' in rawEntities[0]).toBe(false);

        const rawApps = frozenDataset.Results.find(r => r.Code === 'Applications')!.Results;
        expect('ApplicationEntities' in rawApps[0]).toBe(false);
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { LocalCacheManager } from '../generic/localCacheManager';
import { ProviderConfigDataBase, ILocalStorageProvider } from '../generic/interfaces';
import { MJGlobal } from '@memberjunction/global';

describe('Core Performance Optimizations', () => {
    describe('PostProcessEntityMetadata Map Lookups', () => {
        let provider: TestMetadataProvider;

        beforeEach(() => {
            provider = new TestMetadataProvider();
            // Provide GetItems to prevent warning in logs
            vi.spyOn(provider, 'LocalStorageProvider', 'get').mockReturnValue({
                GetItem: async (key: string) => null,
                SetItem: async (key: string, value: string) => {},
                Remove: async (key: string) => {},
                GetItems: async (keys: string[]) => new Map()
            } as any);
        });

        it('should correctly build entities and link fields, fieldValues, permissions, relationships, settings and organicKeys', async () => {
            const entityId = 'e-1';
            const fieldId = 'f-1';
            
            const mockData = {
                Applications: [],
                Entities: [
                    {
                        ID: entityId,
                        Name: 'TestEntity',
                        SchemaName: 'dbo',
                        BaseView: 'vwTestEntity',
                        BaseTable: 'MJTestEntity'
                    }
                ],
                EntityFields: [
                    {
                        ID: fieldId,
                        EntityID: entityId,
                        Name: 'ID',
                        Type: 'uniqueidentifier',
                        IsPrimaryKey: true,
                        Sequence: 1
                    }
                ],
                EntityFieldValues: [
                    {
                        ID: 'fv-1',
                        EntityFieldID: fieldId,
                        Value: 'DefaultValue'
                    }
                ],
                EntityPermissions: [
                    {
                        ID: 'p-1',
                        EntityID: entityId,
                        Role: 'Public',
                        CanRead: true
                    }
                ],
                EntityRelationships: [
                    {
                        ID: 'r-1',
                        EntityID: entityId,
                        RelatedEntityID: 'e-2',
                        Type: 'One to Many'
                    }
                ],
                EntitySettings: [
                    {
                        ID: 's-1',
                        EntityID: entityId,
                        Name: 'SettingKey',
                        Value: 'SettingValue'
                    }
                ],
                EntityOrganicKeys: [
                    {
                        ID: 'ok-1',
                        EntityID: entityId,
                        Status: 'Active'
                    }
                ],
                EntityOrganicKeyRelatedEntities: [],
                Roles: [],
                RowLevelSecurityFilters: [],
                AuditLogTypes: [],
                Authorizations: [],
                QueryCategories: [],
                Queries: [],
                QueryFields: [],
                QueryPermissions: [],
                QueryEntities: [],
                QueryParameters: [],
                EntityDocumentTypes: [],
                Libraries: [],
                ExplorerNavigationItems: [],
            };

            provider.setMockMetadata(mockData);

            const config = new ProviderConfigDataBase(
                {}, // data
                '__mj', // MJCoreSchemaName
                [], // includeSchemas
                [], // excludeSchemas
                true // ignoreExistingMetadata
            );

            const success = await provider.Config(config);
            expect(success).toBe(true);

            expect(provider.Entities).toHaveLength(1);
            const entity = provider.Entities[0];
            expect(entity.Name).toBe('TestEntity');
            
            // Fields checking
            expect(entity.Fields).toHaveLength(1);
            expect(entity.Fields[0].Name).toBe('ID');
            expect(entity.Fields[0].EntityFieldValues).toHaveLength(1);
            expect(entity.Fields[0].EntityFieldValues[0].Value).toBe('DefaultValue');

            // Permissions checking
            expect(entity.Permissions).toHaveLength(1);
            expect(entity.Permissions[0].Role).toBe('Public');

            // Relationships checking
            expect(entity.RelatedEntities).toHaveLength(1);
            expect(entity.RelatedEntities[0].RelatedEntityID).toBe('e-2');

            // Settings checking
            expect(entity.Settings).toHaveLength(1);
            expect(entity.Settings[0].Name).toBe('SettingKey');

            // Organic Keys checking
            expect(entity.OrganicKeys).toHaveLength(1);
            expect(entity.OrganicKeys[0].Status).toBe('Active');
        });
    });

    describe('LocalCacheManager InvalidateEntityCaches Index Lookups', () => {
        let storage: Record<string, any>;
        let mockStorageProvider: ILocalStorageProvider;

        beforeEach(async () => {
            storage = {};
            mockStorageProvider = {
                GetItem: async (key: string) => storage[key] || null,
                SetItem: async (key: string, value: any) => { storage[key] = value; },
                Remove: async (key: string) => { delete storage[key]; },
                GetItems: async (keys: string[]) => {
                    const map = new Map();
                    for (const k of keys) {
                        map.set(k, storage[k] || null);
                    }
                    return map;
                }
            } as any;

            // Reset singleton and initialize
            const store = {};
            vi.spyOn(MJGlobal.Instance, 'GetGlobalObjectStore').mockReturnValue(store);
            await LocalCacheManager.Instance.Initialize(mockStorageProvider, { enabled: true });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should correctly register and invalidate entity cache fingerprints using index lookups', async () => {
            const fingerprint1 = 'Users|filter1|order1|entity_object|10|0|agg1';
            const fingerprint2 = 'Roles|filter2|order2|entity_object|10|0|agg2';

            const runViewParams1 = { EntityName: 'Users' } as any;
            const runViewParams2 = { EntityName: 'Roles' } as any;

            // Store some mock run view results (this triggers addToEntityIndex)
            await LocalCacheManager.Instance.SetRunViewResult(
                fingerprint1,
                runViewParams1,
                [{ ID: 1, Name: 'John' }],
                '2026-05-24T12:00:00Z'
            );

            await LocalCacheManager.Instance.SetRunViewResult(
                fingerprint2,
                runViewParams2,
                [{ ID: 1, Name: 'Admin' }],
                '2026-05-24T12:00:00Z'
            );

            // Verify they are in the index
            const usersFps = Array.from(LocalCacheManager.Instance.GetFingerprintsForEntity('Users'));
            expect(usersFps).toContain(fingerprint1);
            expect(usersFps).not.toContain(fingerprint2);

            // Invalidate caches for "Users"
            await LocalCacheManager.Instance.InvalidateEntityCaches('Users');

            // fingerprint1 should be removed, fingerprint2 should remain
            const usersFpsPost = Array.from(LocalCacheManager.Instance.GetFingerprintsForEntity('Users'));
            expect(usersFpsPost).not.toContain(fingerprint1);

            const rolesFpsPost = Array.from(LocalCacheManager.Instance.GetFingerprintsForEntity('Roles'));
            expect(rolesFpsPost).toContain(fingerprint2);
        });
    });
});

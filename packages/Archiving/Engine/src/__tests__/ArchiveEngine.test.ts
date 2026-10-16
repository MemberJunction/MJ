import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BaseEntity, UserInfo } from '@memberjunction/core';

// ---- Mock state ----

interface MockBaseEntity {
    ID: string;
    EntityInfo: { Name: string; ID: string };
    PrimaryKey: { KeyValuePairs: Array<{ FieldName: string; Value: string }> };
    LatestResult: { Message: string } | null;
    Get: ReturnType<typeof vi.fn>;
    Set: ReturnType<typeof vi.fn>;
    GetAll: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    InnerLoad: ReturnType<typeof vi.fn>;
    StorageMode?: string;
    DefaultMode?: string;
    Entity?: string;
    Mode?: string | null;
    DriverClass?: string | null;
}

function createMockEntity(overrides?: Partial<MockBaseEntity>): MockBaseEntity {
    return {
        ID: 'entity-1',
        EntityInfo: { Name: 'Test Entity', ID: 'entity-id-1' },
        PrimaryKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'entity-1' }] },
        LatestResult: null,
        Get: vi.fn(),
        Set: vi.fn(),
        GetAll: vi.fn().mockReturnValue({}),
        Save: vi.fn().mockResolvedValue(true),
        InnerLoad: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

// Track what RunView returns for different entity queries
let mockRunViewHandler: (params: { EntityName: string; ExtraFilter?: string }) => {
    Success: boolean;
    Results: MockBaseEntity[];
    ErrorMessage?: string;
};

// Track what Metadata.GetEntityObject returns
let mockGetEntityObjectHandler: (entityName: string) => MockBaseEntity;

interface MockRelationship {
    Type: string;
    RelatedEntityID: string;
    RelatedEntity: string;
    RelatedEntityJoinField: string;
}

interface MockEntityInfo {
    ID: string;
    Name: string;
    TrackRecordChanges: boolean;
    RelatedEntities: MockRelationship[];
}

let mockEntityByNameHandler: (name: string) => MockEntityInfo | undefined;

function mockEntityInfo(name: string, overrides: Partial<MockEntityInfo> = {}): MockEntityInfo {
    return { ID: `${name}-id`, Name: name, TrackRecordChanges: false, RelatedEntities: [], ...overrides };
}

function oneToMany(parent: MockEntityInfo, childName: string): MockRelationship {
    return { Type: 'One To Many', RelatedEntityID: `${childName}-id`, RelatedEntity: childName, RelatedEntityJoinField: `${parent.Name}ID` };
}

/**
 * Builds a metadata lookup for a cascade: Parent -> Child -> Grandchild, where Parent also
 * has a self reference that must be ignored. Only the grandchild tracks Record Changes.
 */
function buildTrackedCascade(parentName: string): (name: string) => MockEntityInfo | undefined {
    const parent = mockEntityInfo(parentName);
    const child = mockEntityInfo('Child Entity');
    const grandchild = mockEntityInfo('Grandchild Entity', { TrackRecordChanges: true });
    parent.RelatedEntities = [
        { Type: 'One To Many', RelatedEntityID: parent.ID, RelatedEntity: parentName, RelatedEntityJoinField: 'ParentRunID' },
        oneToMany(parent, child.Name),
    ];
    child.RelatedEntities = [oneToMany(child, grandchild.Name)];
    const byName = new Map([parent, child, grandchild].map(e => [e.Name, e]));
    return (name: string) => byName.get(name);
}

const mockResolveArchiveDriver = vi.fn();

// Track ArchiveProcessor.ProcessEntity results
const mockProcessEntity = vi.fn();

// Track ArchiveStorageManager.Initialize
const mockStorageInitialize = vi.fn().mockResolvedValue(undefined);
const mockStorageDriver = { PutObject: vi.fn(), GetObject: vi.fn() };

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: (() => {
        class MockMetadata {
            GetEntityObject = vi.fn().mockImplementation((entityName: string) =>
                Promise.resolve(mockGetEntityObjectHandler(entityName))
            );
            // Multi-provider migration: ArchiveEngine uses this.ProviderToUse, which falls back
            // to Metadata.Provider. Mirror the helper instance shape on the static Provider so
            // GetEntityObject calls find the same handler.
            static Provider: {
                GetEntityObject: (entityName: string) => Promise<unknown>;
                EntityByName: (name: string) => unknown;
            };
        }
        MockMetadata.Provider = {
            GetEntityObject: (entityName: string) =>
                Promise.resolve(mockGetEntityObjectHandler(entityName)),
            EntityByName: (name: string) => mockEntityByNameHandler(name),
        };
        return MockMetadata;
    })(),
    RunView: class MockRunView {
        RunView = vi.fn().mockImplementation((params: { EntityName: string; ExtraFilter?: string }) =>
            Promise.resolve(mockRunViewHandler(params))
        );
    },
    CompositeKey: class MockCompositeKey {
        KeyValuePairs: Array<{ FieldName: string; Value: string }>;
        constructor(pairs: Array<{ FieldName: string; Value: string }>) {
            this.KeyValuePairs = pairs ?? [];
        }
        static FromKeyValuePair(fieldName: string, value: string) {
            return new MockCompositeKey([{ FieldName: fieldName, Value: value }]);
        }
        static FromID(value: string) {
            return new MockCompositeKey([{ FieldName: 'ID', Value: value }]);
        }
    },
}));

vi.mock('@memberjunction/global', () => {
    // Minimal BaseSingleton mock for ArchiveEngine
    class MockBaseSingleton {
        private static _instances = new Map<string, unknown>();
        protected constructor() {}
        protected static getInstance<T>(): T {
            const className = this.name;
            if (!MockBaseSingleton._instances.has(className)) {
                MockBaseSingleton._instances.set(className, new (this as unknown as new () => T)());
            }
            return MockBaseSingleton._instances.get(className) as T;
        }
        public static _resetForTest(): void {
            MockBaseSingleton._instances.clear();
        }
    }

    return {
        BaseSingleton: MockBaseSingleton,
        MJGlobal: { Instance: { ClassFactory: { CreateInstance: vi.fn() } } },
        RegisterClass: () => (_target: unknown) => {},
    };
});

vi.mock('../ArchiveProcessor', () => ({
    ArchiveProcessor: class MockArchiveProcessor {
        ProcessEntity = mockProcessEntity;
    },
}));

vi.mock('../ArchiveStorageManager', () => ({
    ArchiveStorageManager: class MockArchiveStorageManager {
        Initialize = mockStorageInitialize;
        Driver = mockStorageDriver;
    },
}));

vi.mock('../ArchiveRecovery', () => ({
    ArchiveRecovery: class MockArchiveRecovery {},
}));

vi.mock('../ArchiveDriverResolver', () => ({
    ResolveArchiveDriver: (...args: unknown[]) => mockResolveArchiveDriver(...args),
}));

// ---- Tests ----

describe('ArchiveEngine', () => {
    let ArchiveEngine: typeof import('../ArchiveEngine').ArchiveEngine;
    const contextUser = { ID: 'user-1' } as unknown as UserInfo;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Reset singleton for test isolation
        const globalMock = await import('@memberjunction/global');
        (globalMock.BaseSingleton as unknown as { _resetForTest: () => void })._resetForTest();

        // Default handlers
        mockRunViewHandler = () => ({
            Success: true,
            Results: [],
        });

        mockGetEntityObjectHandler = () => createMockEntity();
        mockEntityByNameHandler = (name: string) => mockEntityInfo(name);
        mockResolveArchiveDriver.mockReturnValue({ SupportsPurge: true });

        mockProcessEntity.mockResolvedValue({
            Archived: 0,
            Failed: 0,
            Skipped: 0,
            Bytes: 0,
        });

        const mod = await import('../ArchiveEngine');
        ArchiveEngine = mod.ArchiveEngine;
    });

    describe('Singleton', () => {
        it('should return the same instance on repeated access', () => {
            const instance1 = ArchiveEngine.Instance;
            const instance2 = ArchiveEngine.Instance;
            expect(instance1).toBe(instance2);
        });

        it('should be an instance of ArchiveEngine', () => {
            expect(ArchiveEngine.Instance).toBeInstanceOf(ArchiveEngine);
        });
    });

    describe('RunArchive', () => {
        it('should load config, create run, process entities, and finalize with totals', async () => {
            // Setup: config loads successfully
            const configRecord = createMockEntity({ ID: 'config-1', StorageMode: 'Store' });
            configRecord.InnerLoad.mockResolvedValue(true);
            configRecord.Get.mockImplementation((field: string) => {
                if (field === 'ID') return 'config-1';
                if (field === 'IsActive') return true;
                if (field === 'Status') return 'Idle';
                if (field === 'Name') return 'Test Config';
                if (field === 'StorageAccountID') return 'storage-account-1';
                if (field === 'RootPath') return 'archives';
                if (field === 'DefaultBatchSize') return 100;
                if (field === 'DefaultMode') return 'StripFields';
                return null;
            });

            const archiveRunRecord = createMockEntity({ ID: 'run-1' });
            archiveRunRecord.Get.mockImplementation((field: string) => {
                if (field === 'ID') return 'run-1';
                return null;
            });

            const configEntityRecord = createMockEntity({ ID: 'config-entity-1' });
            configEntityRecord.Get.mockImplementation((field: string) => {
                if (field === 'EntityName') return 'Test Entity';
                return null;
            });

            mockGetEntityObjectHandler = (entityName: string) => {
                if (entityName === 'MJ: Archive Configurations') return configRecord;
                if (entityName === 'MJ: Archive Runs') return archiveRunRecord;
                return createMockEntity();
            };

            mockRunViewHandler = (params) => {
                if (params.EntityName === 'MJ: Archive Configuration Entities') {
                    return {
                        Success: true,
                        Results: [configEntityRecord],
                    };
                }
                return { Success: true, Results: [] };
            };

            mockProcessEntity.mockResolvedValue({
                Archived: 10,
                Failed: 1,
                Skipped: 3,
                Bytes: 5000,
            });

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.ArchiveRunId).toBe('run-1');
            expect(result.ArchivedRecords).toBe(10);
            expect(result.FailedRecords).toBe(1);
            expect(result.SkippedRecords).toBe(3);
            expect(result.TotalRecords).toBe(14);
            expect(result.TotalBytesArchived).toBe(5000);
            // Has failures, so Success should be false
            expect(result.Success).toBe(false);

            // Verify run was finalized
            expect(archiveRunRecord.Set).toHaveBeenCalledWith('Status', 'PartialSuccess');
            expect(archiveRunRecord.Set).toHaveBeenCalledWith('ArchivedRecords', 10);
            expect(archiveRunRecord.Set).toHaveBeenCalledWith('FailedRecords', 1);
            expect(archiveRunRecord.Save).toHaveBeenCalled();
            expect(archiveRunRecord.StorageMode).toBe('Store');
            expect(mockStorageInitialize).toHaveBeenCalledOnce();
        });

        it('should return success true when all records archive without failures', async () => {
            const configRecord = createMockEntity({ ID: 'config-1' });
            configRecord.InnerLoad.mockResolvedValue(true);
            configRecord.Get.mockImplementation((field: string) => {
                if (field === 'IsActive') return true;
                if (field === 'Status') return 'Idle';
                if (field === 'Name') return 'Test Config';
                if (field === 'StorageAccountID') return 'storage-account-1';
                return null;
            });

            const archiveRunRecord = createMockEntity({ ID: 'run-1' });
            const configEntityRecord = createMockEntity({ ID: 'config-entity-1' });
            configEntityRecord.Get.mockReturnValue('Test Entity');

            mockGetEntityObjectHandler = (entityName: string) => {
                if (entityName === 'MJ: Archive Configurations') return configRecord;
                if (entityName === 'MJ: Archive Runs') return archiveRunRecord;
                return createMockEntity();
            };

            mockRunViewHandler = (params) => {
                if (params.EntityName === 'MJ: Archive Configuration Entities') {
                    return { Success: true, Results: [configEntityRecord] };
                }
                return { Success: true, Results: [] };
            };

            mockProcessEntity.mockResolvedValue({
                Archived: 5,
                Failed: 0,
                Skipped: 2,
                Bytes: 2500,
            });

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(true);
            expect(result.ArchivedRecords).toBe(5);
            expect(result.FailedRecords).toBe(0);

            // Verify run was finalized as Complete (not PartialSuccess)
            expect(archiveRunRecord.Set).toHaveBeenCalledWith('Status', 'Complete');
        });

        it('should process multiple entities and aggregate totals', async () => {
            const configRecord = createMockEntity({ ID: 'config-1' });
            configRecord.InnerLoad.mockResolvedValue(true);
            configRecord.Get.mockImplementation((field: string) => {
                if (field === 'IsActive') return true;
                if (field === 'Status') return 'Idle';
                if (field === 'Name') return 'Test Config';
                if (field === 'StorageAccountID') return 'storage-account-1';
                return null;
            });

            const archiveRunRecord = createMockEntity({ ID: 'run-1' });

            const entity1 = createMockEntity({ ID: 'ce-1' });
            entity1.Get.mockReturnValue('Entity One');
            const entity2 = createMockEntity({ ID: 'ce-2' });
            entity2.Get.mockReturnValue('Entity Two');

            mockGetEntityObjectHandler = (entityName: string) => {
                if (entityName === 'MJ: Archive Configurations') return configRecord;
                if (entityName === 'MJ: Archive Runs') return archiveRunRecord;
                return createMockEntity();
            };

            mockRunViewHandler = (params) => {
                if (params.EntityName === 'MJ: Archive Configuration Entities') {
                    return { Success: true, Results: [entity1, entity2] };
                }
                return { Success: true, Results: [] };
            };

            let processCallCount = 0;
            mockProcessEntity.mockImplementation(() => {
                processCallCount++;
                if (processCallCount === 1) {
                    return Promise.resolve({ Archived: 5, Failed: 0, Skipped: 1, Bytes: 1000 });
                }
                return Promise.resolve({ Archived: 3, Failed: 2, Skipped: 0, Bytes: 800 });
            });

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.ArchivedRecords).toBe(8);
            expect(result.FailedRecords).toBe(2);
            expect(result.SkippedRecords).toBe(1);
            expect(result.TotalBytesArchived).toBe(1800);
            expect(result.TotalRecords).toBe(11);
            expect(mockProcessEntity).toHaveBeenCalledTimes(2);
        });
    });

    describe('Error handling', () => {
        it('should return failure when configuration is not found', async () => {
            const configRecord = createMockEntity({ ID: 'config-1' });
            configRecord.InnerLoad.mockResolvedValue(false);

            mockGetEntityObjectHandler = () => configRecord;

            const result = await ArchiveEngine.Instance.RunArchive('nonexistent-id', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('not found');
            expect(result.TotalRecords).toBe(0);
            expect(result.ArchivedRecords).toBe(0);
        });

        it('should return failure when no entity configurations are found', async () => {
            const configRecord = createMockEntity({ ID: 'config-1' });
            configRecord.InnerLoad.mockResolvedValue(true);
            configRecord.Get.mockImplementation((field: string) => {
                if (field === 'IsActive') return true;
                if (field === 'Status') return 'Idle';
                if (field === 'Name') return 'Test Config';
                return null;
            });

            mockGetEntityObjectHandler = (entityName: string) => {
                if (entityName === 'MJ: Archive Configurations') return configRecord;
                return createMockEntity();
            };

            mockRunViewHandler = (params) => {
                if (params.EntityName === 'MJ: Archive Configuration Entities') {
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            };

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('No entity configurations');
            expect(result.TotalRecords).toBe(0);
        });

        it('should return failure when storage initialization fails', async () => {
            const configRecord = createMockEntity({ ID: 'config-1' });
            configRecord.InnerLoad.mockResolvedValue(true);
            configRecord.Get.mockImplementation((field: string) => {
                if (field === 'IsActive') return true;
                if (field === 'Status') return 'Idle';
                if (field === 'Name') return 'Test Config';
                if (field === 'StorageAccountID') return 'bad-storage-id';
                return null;
            });

            const archiveRunRecord = createMockEntity({ ID: 'run-1' });
            const configEntityRecord = createMockEntity({ ID: 'ce-1' });

            mockGetEntityObjectHandler = (entityName: string) => {
                if (entityName === 'MJ: Archive Configurations') return configRecord;
                if (entityName === 'MJ: Archive Runs') return archiveRunRecord;
                return createMockEntity();
            };

            mockRunViewHandler = (params) => {
                if (params.EntityName === 'MJ: Archive Configuration Entities') {
                    return { Success: true, Results: [configEntityRecord] };
                }
                return { Success: true, Results: [] };
            };

            mockStorageInitialize.mockRejectedValue(new Error('Storage account not found'));

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Storage account not found');
        });

        it('should return failure when configuration has no StorageAccountID', async () => {
            const configRecord = createMockEntity({ ID: 'config-1' });
            configRecord.InnerLoad.mockResolvedValue(true);
            // StorageAccountID returns null/falsy but config is active
            configRecord.Get.mockImplementation((field: string) => {
                if (field === 'IsActive') return true;
                if (field === 'Status') return 'Idle';
                if (field === 'Name') return 'Test Config';
                return null;
            });

            const archiveRunRecord = createMockEntity({ ID: 'run-1' });
            const configEntityRecord = createMockEntity({ ID: 'ce-1' });

            mockGetEntityObjectHandler = (entityName: string) => {
                if (entityName === 'MJ: Archive Configurations') return configRecord;
                if (entityName === 'MJ: Archive Runs') return archiveRunRecord;
                return createMockEntity();
            };

            mockRunViewHandler = (params) => {
                if (params.EntityName === 'MJ: Archive Configuration Entities') {
                    return { Success: true, Results: [configEntityRecord] };
                }
                return { Success: true, Results: [] };
            };

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('StorageAccountID');
        });
    });

    describe('StorageMode Purge', () => {
        function setupPurgeRun(
            configEntityOverrides: Partial<MockBaseEntity> = {},
            configOverrides: Partial<MockBaseEntity> = {}
        ): { archiveRunRecord: MockBaseEntity; configEntityRecord: MockBaseEntity } {
            const configRecord = createMockEntity({
                ID: 'config-1',
                StorageMode: 'Purge',
                DefaultMode: 'StripFields',
                ...configOverrides,
            });
            configRecord.InnerLoad.mockResolvedValue(true);
            configRecord.Get.mockImplementation((field: string) => {
                if (field === 'IsActive') return true;
                if (field === 'Status') return 'Idle';
                if (field === 'Name') return 'Purge Config';
                if (field === 'StorageAccountID') return 'storage-account-1';
                return null;
            });

            const archiveRunRecord = createMockEntity({ ID: 'run-1' });
            const configEntityRecord = createMockEntity({
                ID: 'ce-1',
                Entity: 'MJ: AI Prompt Runs',
                Mode: null,
                DriverClass: null,
                ...configEntityOverrides,
            });

            mockGetEntityObjectHandler = (entityName: string) => {
                if (entityName === 'MJ: Archive Configurations') return configRecord;
                if (entityName === 'MJ: Archive Runs') return archiveRunRecord;
                return createMockEntity();
            };
            mockRunViewHandler = (params) => params.EntityName === 'MJ: Archive Configuration Entities'
                ? { Success: true, Results: [configEntityRecord] }
                : { Success: true, Results: [] };

            return { archiveRunRecord, configEntityRecord };
        }

        function expectRefusedBeforeRun(archiveRunRecord: MockBaseEntity): void {
            expect(archiveRunRecord.Save).not.toHaveBeenCalled();
            expect(mockStorageInitialize).not.toHaveBeenCalled();
            expect(mockProcessEntity).not.toHaveBeenCalled();
        }

        it('should run without a storage account and pass no storage manager to the processor', async () => {
            const { archiveRunRecord } = setupPurgeRun();
            mockProcessEntity.mockResolvedValue({ Archived: 4, Failed: 0, Skipped: 0, Bytes: 0 });

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(true);
            expect(result.ArchivedRecords).toBe(4);
            expect(mockStorageInitialize).not.toHaveBeenCalled();
            expect(mockProcessEntity.mock.calls[0][3]).toBeNull();
            expect(archiveRunRecord.StorageMode).toBe('Purge');
        });

        it('should refuse an entity in ArchiveOnly mode', async () => {
            setupPurgeRun({ Mode: 'ArchiveOnly' });

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('ArchiveOnly');
            expect(mockProcessEntity).not.toHaveBeenCalled();
        });

        it('should refuse an entity that inherits ArchiveOnly from the configuration', async () => {
            setupPurgeRun({ Mode: null }, { DefaultMode: 'ArchiveOnly' });

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('ArchiveOnly');
        });

        it('should refuse an entity that tracks Record Changes', async () => {
            setupPurgeRun();
            mockEntityByNameHandler = (name: string) => mockEntityInfo(name, { TrackRecordChanges: true });

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('tracks Record Changes');
            expect(mockProcessEntity).not.toHaveBeenCalled();
        });

        it('should refuse an entity that is missing from metadata', async () => {
            setupPurgeRun();
            mockEntityByNameHandler = () => undefined;

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('not found in metadata');
        });

        it('should refuse an entity whose driver does not support purge', async () => {
            setupPurgeRun({ DriverClass: 'CustomDriver' });
            mockResolveArchiveDriver.mockReturnValue({ SupportsPurge: false });

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support StorageMode Purge');
            expect(mockResolveArchiveDriver).toHaveBeenCalledWith('CustomDriver');
        });

        it('should refuse an entity whose DriverClass is not registered', async () => {
            const { archiveRunRecord } = setupPurgeRun({ DriverClass: 'MissingDriver' });
            mockResolveArchiveDriver.mockReturnValue(null);

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Archive driver "MissingDriver" for entity "MJ: AI Prompt Runs" is not registered');
            expectRefusedBeforeRun(archiveRunRecord);
        });

        it('should refuse the whole run when any one entity is blocked', async () => {
            const { archiveRunRecord, configEntityRecord } = setupPurgeRun();
            const blockedEntity = createMockEntity({ ID: 'ce-2', Entity: 'MJ: Blocked Entity', Mode: 'ArchiveOnly', DriverClass: null });
            mockRunViewHandler = (params) => params.EntityName === 'MJ: Archive Configuration Entities'
                ? { Success: true, Results: [configEntityRecord, blockedEntity] }
                : { Success: true, Results: [] };

            const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('"MJ: Blocked Entity" uses ArchiveOnly');
            expectRefusedBeforeRun(archiveRunRecord);
        });

        describe('HardDelete cascade', () => {
            it('should refuse when a level-2 dependent entity tracks Record Changes', async () => {
                const { archiveRunRecord } = setupPurgeRun({ Mode: 'HardDelete' });
                mockEntityByNameHandler = buildTrackedCascade('MJ: AI Prompt Runs');

                const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

                expect(result.Success).toBe(false);
                expect(result.ErrorMessage).toContain('Entity "MJ: AI Prompt Runs" cannot be purged with HardDelete');
                expect(result.ErrorMessage).toContain('dependent entity "Grandchild Entity" tracks Record Changes');
                expectRefusedBeforeRun(archiveRunRecord);
            });

            it('should refuse when a dependent entity is missing from metadata', async () => {
                const { archiveRunRecord } = setupPurgeRun({ Mode: 'HardDelete' });
                const parent = mockEntityInfo('MJ: AI Prompt Runs');
                parent.RelatedEntities = [oneToMany(parent, 'Unknown Child')];
                mockEntityByNameHandler = (name: string) => (name === parent.Name ? parent : undefined);

                const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

                expect(result.Success).toBe(false);
                expect(result.ErrorMessage).toContain('dependent entity "Unknown Child" was not found in metadata');
                expectRefusedBeforeRun(archiveRunRecord);
            });

            it('should allow the same cascade in StripFields mode', async () => {
                setupPurgeRun({ Mode: 'StripFields' });
                mockEntityByNameHandler = buildTrackedCascade('MJ: AI Prompt Runs');

                const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

                expect(result.Success).toBe(true);
                expect(mockProcessEntity).toHaveBeenCalledOnce();
            });

            it('should allow the same cascade when StorageMode is Store', async () => {
                setupPurgeRun({ Mode: 'HardDelete' }, { StorageMode: 'Store' });
                mockEntityByNameHandler = buildTrackedCascade('MJ: AI Prompt Runs');

                const result = await ArchiveEngine.Instance.RunArchive('config-1', contextUser);

                expect(mockProcessEntity).toHaveBeenCalledOnce();
                expect(mockStorageInitialize).toHaveBeenCalledOnce();
                expect(result.ErrorMessage).toBeUndefined();
            });
        });
    });
});

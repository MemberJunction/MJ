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
            static Provider: { GetEntityObject: (entityName: string) => Promise<unknown> };
        }
        MockMetadata.Provider = {
            GetEntityObject: (entityName: string) =>
                Promise.resolve(mockGetEntityObjectHandler(entityName)),
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
            const configRecord = createMockEntity({ ID: 'config-1' });
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
});

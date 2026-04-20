import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BaseEntity, UserInfo, RunView } from '@memberjunction/core';
import type { ArchiveFieldConfiguration } from '../types';
import type { ArchiveStorageManager } from '../ArchiveStorageManager';
import type { FileStorageBase } from '@memberjunction/storage';

// ---- Mocks ----

const mockRunViewResults: { Success: boolean; Results: MockBaseEntity[]; ErrorMessage?: string } = {
    Success: true,
    Results: [],
};

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class MockMetadata {
        GetEntityObject = vi.fn().mockResolvedValue(createMockEntity());
    },
    RunView: class MockRunView {
        RunView = vi.fn().mockImplementation(() => Promise.resolve(mockRunViewResults));
    },
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: vi.fn().mockReturnValue(null),
            },
        },
    },
    RegisterClass: () => (_target: unknown) => {},
}));

// Mock DefaultArchiveDriver to control its behavior
const mockShouldArchive = vi.fn().mockReturnValue(true);
const mockArchiveRecord = vi.fn().mockResolvedValue({
    Success: true,
    StoragePath: 'test/path.json',
    BytesArchived: 256,
});

vi.mock('../DefaultArchiveDriver', () => {
    return {
        DefaultArchiveDriver: class MockDefaultArchiveDriver {
            ShouldArchiveRecord = mockShouldArchive;
            ArchiveRecord = mockArchiveRecord;
        },
    };
});

// ---- Helper factories ----

interface MockBaseEntity {
    ID: string;
    EntityInfo: { Name: string; ID: string };
    PrimaryKey: { KeyValuePairs: Array<{ FieldName: string; Value: string }>; Values: (delimiter?: string) => string };
    LatestResult: { Message: string } | null;
    Get: ReturnType<typeof vi.fn>;
    Set: ReturnType<typeof vi.fn>;
    GetAll: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
}

function createMockPrimaryKey(id: string) {
    return {
        KeyValuePairs: [{ FieldName: 'ID', Value: id }],
        Values: (delimiter?: string) => id,
    };
}

function createMockEntity(overrides?: Partial<MockBaseEntity>): MockBaseEntity {
    const id = overrides?.ID ?? 'entity-1';
    return {
        ID: id,
        EntityInfo: { Name: 'Test Entity', ID: 'entity-id-1' },
        PrimaryKey: createMockPrimaryKey(id),
        LatestResult: null,
        Get: vi.fn(),
        Set: vi.fn(),
        GetAll: vi.fn().mockReturnValue({}),
        Save: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

function createMockConfigEntity(fieldConfigJson: string): MockBaseEntity {
    const entity = createMockEntity({ ID: 'config-entity-1' });
    entity.Get.mockImplementation((field: string) => {
        switch (field) {
            case 'EntityName': return 'Test Entity';
            case 'DriverClass': return null;
            case 'FieldConfiguration': return fieldConfigJson;
            case 'RetentionDays': return null;
            case 'DateField': return null;
            case 'FilterExpression': return null;
            case 'BatchSize': return null;
            default: return null;
        }
    });
    return entity;
}

function createMockConfig(): MockBaseEntity {
    const config = createMockEntity({ ID: 'config-1' });
    config.Get.mockImplementation((field: string) => {
        switch (field) {
            case 'RootPath': return 'archives';
            case 'DefaultBatchSize': return 100;
            case 'DefaultMode': return 'StripFields';
            default: return null;
        }
    });
    return config;
}

function createMockStorageManager(): { Driver: MockStorageDriver } {
    return {
        Driver: {
            PutObject: vi.fn().mockResolvedValue(true),
            GetObject: vi.fn().mockResolvedValue(Buffer.from('{}', 'utf8')),
        },
    };
}

interface MockStorageDriver {
    PutObject: ReturnType<typeof vi.fn>;
    GetObject: ReturnType<typeof vi.fn>;
}

const validFieldConfigJson = JSON.stringify({
    Fields: [
        { FieldName: 'Description', IsActive: true },
        { FieldName: 'Notes', IsActive: true },
    ],
    ArchiveFullRecord: false,
} satisfies ArchiveFieldConfiguration);

// ---- Tests ----

describe('ArchiveProcessor', () => {
    let processor: import('../ArchiveProcessor').ArchiveProcessor;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockRunViewResults.Success = true;
        mockRunViewResults.Results = [];
        mockRunViewResults.ErrorMessage = undefined;
        mockShouldArchive.mockReturnValue(true);
        mockArchiveRecord.mockResolvedValue({
            Success: true,
            StoragePath: 'test/path.json',
            BytesArchived: 256,
        });

        // Dynamic import to get fresh instance after mocks are set up
        const { ArchiveProcessor } = await import('../ArchiveProcessor');
        processor = new ArchiveProcessor();
    });

    describe('ProcessEntity', () => {
        it('should process records for an entity and return aggregated totals', async () => {
            const record1 = createMockEntity({ ID: 'rec-1' });
            record1.Get.mockReturnValue('value');
            const record2 = createMockEntity({ ID: 'rec-2' });
            record2.Get.mockReturnValue('value');

            mockRunViewResults.Results = [record1, record2] as unknown as MockBaseEntity[];

            const configEntity = createMockConfigEntity(validFieldConfigJson);
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            const result = await processor.ProcessEntity(
                configEntity as unknown as BaseEntity,
                config as unknown as BaseEntity,
                archiveRun as unknown as BaseEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            );

            expect(result.Archived).toBe(2);
            expect(result.Failed).toBe(0);
            expect(result.Skipped).toBe(0);
            expect(result.Bytes).toBe(512);
        });

        it('should count skipped records when driver says not to archive', async () => {
            const record1 = createMockEntity({ ID: 'rec-1' });
            mockRunViewResults.Results = [record1] as unknown as MockBaseEntity[];
            mockShouldArchive.mockReturnValue(false);

            const configEntity = createMockConfigEntity(validFieldConfigJson);
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            const result = await processor.ProcessEntity(
                configEntity as unknown as BaseEntity,
                config as unknown as BaseEntity,
                archiveRun as unknown as BaseEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            );

            expect(result.Skipped).toBe(1);
            expect(result.Archived).toBe(0);
        });

        it('should count failed records when archive operation fails', async () => {
            const record1 = createMockEntity({ ID: 'rec-1' });
            mockRunViewResults.Results = [record1] as unknown as MockBaseEntity[];
            mockArchiveRecord.mockResolvedValue({
                Success: false,
                StoragePath: null,
                BytesArchived: 0,
                ErrorMessage: 'Storage error',
            });

            const configEntity = createMockConfigEntity(validFieldConfigJson);
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            const result = await processor.ProcessEntity(
                configEntity as unknown as BaseEntity,
                config as unknown as BaseEntity,
                archiveRun as unknown as BaseEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            );

            expect(result.Failed).toBe(1);
            expect(result.Archived).toBe(0);
        });

        it('should return zero totals when no eligible records found', async () => {
            mockRunViewResults.Results = [];

            const configEntity = createMockConfigEntity(validFieldConfigJson);
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            const result = await processor.ProcessEntity(
                configEntity as unknown as BaseEntity,
                config as unknown as BaseEntity,
                archiveRun as unknown as BaseEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            );

            expect(result.Archived).toBe(0);
            expect(result.Failed).toBe(0);
            expect(result.Skipped).toBe(0);
            expect(result.Bytes).toBe(0);
        });
    });

    describe('Batch processing', () => {
        it('should process records in batches respecting configured batch size', async () => {
            // Create 5 records with a batch size of 2
            const records = Array.from({ length: 5 }, (_, i) => {
                const r = createMockEntity({ ID: `rec-${i}` });
                r.Get.mockReturnValue('value');
                return r;
            });
            mockRunViewResults.Results = records as unknown as MockBaseEntity[];

            const configEntity = createMockConfigEntity(validFieldConfigJson);
            // Override BatchSize to 2
            configEntity.Get.mockImplementation((field: string) => {
                if (field === 'BatchSize') return 2;
                if (field === 'EntityName') return 'Test Entity';
                if (field === 'DriverClass') return null;
                if (field === 'FieldConfiguration') return validFieldConfigJson;
                if (field === 'RetentionDays') return null;
                if (field === 'DateField') return null;
                if (field === 'FilterExpression') return null;
                return null;
            });

            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            const result = await processor.ProcessEntity(
                configEntity as unknown as BaseEntity,
                config as unknown as BaseEntity,
                archiveRun as unknown as BaseEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            );

            // All 5 records should be archived across 3 batches (2+2+1)
            expect(result.Archived).toBe(5);
            expect(result.Bytes).toBe(5 * 256);
        });

        it('should accumulate totals correctly across batches with mixed results', async () => {
            const records = Array.from({ length: 3 }, (_, i) => {
                const r = createMockEntity({ ID: `rec-${i}` });
                r.Get.mockReturnValue('value');
                return r;
            });
            mockRunViewResults.Results = records as unknown as MockBaseEntity[];

            // First call: archive, second: skip, third: fail
            let callCount = 0;
            mockShouldArchive.mockImplementation(() => {
                callCount++;
                return callCount !== 2; // skip second record
            });

            let archiveCallCount = 0;
            mockArchiveRecord.mockImplementation(() => {
                archiveCallCount++;
                if (archiveCallCount === 2) {
                    return Promise.resolve({
                        Success: false,
                        StoragePath: null,
                        BytesArchived: 0,
                        ErrorMessage: 'Error',
                    });
                }
                return Promise.resolve({
                    Success: true,
                    StoragePath: 'path.json',
                    BytesArchived: 100,
                });
            });

            const configEntity = createMockConfigEntity(validFieldConfigJson);
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            const result = await processor.ProcessEntity(
                configEntity as unknown as BaseEntity,
                config as unknown as BaseEntity,
                archiveRun as unknown as BaseEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            );

            expect(result.Archived).toBe(1);
            expect(result.Skipped).toBe(1);
            expect(result.Failed).toBe(1);
            expect(result.Bytes).toBe(100);
        });
    });

    describe('Driver resolution', () => {
        it('should fall back to DefaultArchiveDriver when DriverClass is null', async () => {
            mockRunViewResults.Results = [];

            const configEntity = createMockConfigEntity(validFieldConfigJson);
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            // Should not throw - falls back to DefaultArchiveDriver
            const result = await processor.ProcessEntity(
                configEntity as unknown as BaseEntity,
                config as unknown as BaseEntity,
                archiveRun as unknown as BaseEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            );

            expect(result).toBeDefined();
        });

        it('should fall back to DefaultArchiveDriver when ClassFactory returns null for unknown class', async () => {
            mockRunViewResults.Results = [];

            const configEntity = createMockConfigEntity(validFieldConfigJson);
            // Override to provide a DriverClass that won't resolve
            configEntity.Get.mockImplementation((field: string) => {
                if (field === 'DriverClass') return 'NonExistentDriver';
                if (field === 'EntityName') return 'Test Entity';
                if (field === 'FieldConfiguration') return validFieldConfigJson;
                if (field === 'RetentionDays') return null;
                if (field === 'DateField') return null;
                if (field === 'FilterExpression') return null;
                if (field === 'BatchSize') return null;
                return null;
            });

            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            // Should not throw - ClassFactory returns null, so falls back
            const result = await processor.ProcessEntity(
                configEntity as unknown as BaseEntity,
                config as unknown as BaseEntity,
                archiveRun as unknown as BaseEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            );

            expect(result).toBeDefined();
        });
    });

    describe('Field config parsing', () => {
        it('should throw on invalid JSON in FieldConfiguration', async () => {
            const configEntity = createMockConfigEntity('NOT VALID JSON {{{');
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            await expect(
                processor.ProcessEntity(
                    configEntity as unknown as BaseEntity,
                    config as unknown as BaseEntity,
                    archiveRun as unknown as BaseEntity,
                    storageManager as unknown as ArchiveStorageManager,
                    contextUser
                )
            ).rejects.toThrow('Invalid FieldConfiguration JSON');
        });

        it('should throw when FieldConfiguration is missing', async () => {
            const configEntity = createMockEntity({ ID: 'config-entity-1' });
            configEntity.Get.mockImplementation((field: string) => {
                if (field === 'EntityName') return 'Test Entity';
                if (field === 'DriverClass') return null;
                if (field === 'FieldConfiguration') return null;
                return null;
            });

            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            await expect(
                processor.ProcessEntity(
                    configEntity as unknown as BaseEntity,
                    config as unknown as BaseEntity,
                    archiveRun as unknown as BaseEntity,
                    storageManager as unknown as ArchiveStorageManager,
                    contextUser
                )
            ).rejects.toThrow('has no FieldConfiguration');
        });

        it('should throw when Fields array is empty and ArchiveFullRecord is false', async () => {
            const emptyFieldsJson = JSON.stringify({ Fields: [], ArchiveFullRecord: false });
            const configEntity = createMockConfigEntity(emptyFieldsJson);
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            await expect(
                processor.ProcessEntity(
                    configEntity as unknown as BaseEntity,
                    config as unknown as BaseEntity,
                    archiveRun as unknown as BaseEntity,
                    storageManager as unknown as ArchiveStorageManager,
                    contextUser
                )
            ).rejects.toThrow('must have at least one field');
        });

        it('should allow empty Fields array when ArchiveFullRecord is true', async () => {
            const fullRecordJson = JSON.stringify({ Fields: [], ArchiveFullRecord: true });
            const configEntity = createMockConfigEntity(fullRecordJson);
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            // Should not throw - ArchiveFullRecord:true with empty Fields is valid
            await expect(
                processor.ProcessEntity(
                    configEntity as unknown as BaseEntity,
                    config as unknown as BaseEntity,
                    archiveRun as unknown as BaseEntity,
                    storageManager as unknown as ArchiveStorageManager,
                    contextUser
                )
            ).resolves.not.toThrow();
        });

        it('should throw when a field has no FieldName', async () => {
            const badFieldJson = JSON.stringify({ Fields: [{ FieldName: '' }] });
            const configEntity = createMockConfigEntity(badFieldJson);
            const config = createMockConfig();
            const archiveRun = createMockEntity({ ID: 'run-1' });
            const storageManager = createMockStorageManager();
            const contextUser = { ID: 'user-1' } as unknown as UserInfo;

            await expect(
                processor.ProcessEntity(
                    configEntity as unknown as BaseEntity,
                    config as unknown as BaseEntity,
                    archiveRun as unknown as BaseEntity,
                    storageManager as unknown as ArchiveStorageManager,
                    contextUser
                )
            ).rejects.toThrow('non-empty FieldName');
        });
    });
});

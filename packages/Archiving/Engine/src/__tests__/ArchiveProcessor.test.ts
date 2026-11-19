import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BaseEntity, UserInfo, RunView } from '@memberjunction/core';
import type { ArchiveFieldConfiguration, ArchiveRecordContext } from '../types';
import type { ArchiveStorageManager } from '../ArchiveStorageManager';
import type { FileStorageBase } from '@memberjunction/storage';
import type { MJArchiveConfigurationEntity, MJArchiveConfigurationEntityEntity, MJArchiveRunEntity } from '@memberjunction/core-entities';

// ---- Mocks ----

const mockRunViewResults: { Success: boolean; Results: MockBaseEntity[]; ErrorMessage?: string } = {
    Success: true,
    Results: [],
};

interface MockRunViewParams {
    EntityName: string;
    ExtraFilter?: string;
    OrderBy?: string;
    MaxRows?: number;
    StartRow?: number;
    AfterKey?: { KeyValuePairs: Array<{ FieldName: string; Value: string }> };
    BypassCache?: boolean;
}

const mockRunViewCalls: MockRunViewParams[] = [];

/** The row cap the view applies whatever MaxRows asks for, as UserViewMaxRows can. */
const MOCK_USER_VIEW_MAX_ROWS = 1000;

/** Queries after which the mock refuses to answer, so a paging loop that never ends fails fast. */
const MOCK_RUNAWAY_QUERY_LIMIT = 200;

/**
 * Whether a row still matches the filter. Tests replace it to model rows that leave the
 * filter once archived (stripped or deleted). Every row matches by default.
 */
let mockRowMatchesFilter: (record: MockBaseEntity) => boolean = () => true;

/** The first ID literal of a composite-key seek filter (`[ID] > N'rec-0099'`), if any. */
function seekAfterId(extraFilter: string | undefined): string | undefined {
    return extraFilter?.match(/\[ID\] > N?'([^']*)'/)?.[1];
}

/**
 * Serves mockRunViewResults.Results as a table ordered by ID: applies the filter predicate,
 * then AfterKey or a composite-key seek (rows with a greater ID) or StartRow (1-based), then
 * MaxRows, never returning more than the UserViewMaxRows cap.
 */
function serveRunView(params: MockRunViewParams): { Success: boolean; Results: MockBaseEntity[]; ErrorMessage?: string } {
    if (mockRunViewCalls.length > MOCK_RUNAWAY_QUERY_LIMIT) {
        throw new Error(`runaway paging: more than ${MOCK_RUNAWAY_QUERY_LIMIT} queries`);
    }
    if (!mockRunViewResults.Success) {
        return mockRunViewResults;
    }
    const afterId = params.AfterKey?.KeyValuePairs[0]?.Value ?? seekAfterId(params.ExtraFilter);
    let rows = [...mockRunViewResults.Results]
        .filter(r => mockRowMatchesFilter(r))
        .sort((a, b) => (a.ID < b.ID ? -1 : a.ID > b.ID ? 1 : 0));
    if (afterId !== undefined) {
        rows = rows.filter(r => r.ID > afterId);
    }
    if (params.StartRow) {
        rows = rows.slice(params.StartRow - 1);
    }
    return { Success: true, Results: rows.slice(0, Math.min(params.MaxRows ?? MOCK_USER_VIEW_MAX_ROWS, MOCK_USER_VIEW_MAX_ROWS)) };
}

const mockDetailSave = vi.fn(() => Promise.resolve(true));

interface MockKeyField {
    Name: string;
    Type: string;
    TSType: 'string' | 'number' | 'Date' | 'boolean';
}

/** Primary keys of the entity being archived; tests set two to exercise composite-key paging. */
let mockPrimaryKeys: MockKeyField[] = [{ Name: 'ID', Type: 'uniqueidentifier', TSType: 'string' }];
/** The platform the processor resolves from its provider. */
let mockPlatform: 'sqlserver' | 'postgresql' = 'sqlserver';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    IsKeysetPaginationOrderableType: (type: string) => ['uniqueidentifier', 'int', 'nvarchar'].includes(type),
    ResolvePlatformKey: () => mockPlatform,
    EntityFieldTSType: { String: 'string', Number: 'number', Date: 'Date', Boolean: 'boolean' },
    CompositeKey: class MockCompositeKey {
        KeyValuePairs: Array<{ FieldName: string; Value: unknown }>;
        constructor(pairs: Array<{ FieldName: string; Value: unknown }>) {
            this.KeyValuePairs = pairs;
        }
        GetValueByFieldName(name: string): unknown {
            return this.KeyValuePairs.find(kvp => kvp.FieldName === name)?.Value;
        }
    },
    Metadata: class MockMetadata {
        GetEntityObject = vi.fn().mockResolvedValue(createMockEntity());
        static Provider = {
            GetEntityObject: vi.fn(() =>
                Promise.resolve({ Set: vi.fn(), Save: mockDetailSave })
            ),
            EntityByName: vi.fn((name: string) => ({
                Name: name,
                PrimaryKeys: mockPrimaryKeys,
                // Every field exists except NotAField; FieldByName is case-insensitive like the real one.
                FieldByName: (field: string) => (field && field.toLowerCase() !== 'notafield' ? { Name: field } : undefined),
            })),
        };
    },
    RunView: class MockRunView {
        RunView = vi.fn().mockImplementation((params: MockRunViewParams) => {
            mockRunViewCalls.push(params);
            return Promise.resolve(serveRunView(params));
        });
    },
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                TryCreateInstance: vi.fn(() => ({ Resolved: false, Instance: null, Reason: 'not registered' })),
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
const mockBuildEligibilityFilter = vi.fn().mockReturnValue(null);

vi.mock('../DefaultArchiveDriver', () => {
    return {
        DefaultArchiveDriver: class MockDefaultArchiveDriver {
            ShouldArchiveRecord = mockShouldArchive;
            ArchiveRecord = mockArchiveRecord;
            BuildEligibilityFilter = mockBuildEligibilityFilter;
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
    RetentionDays?: number | null;
    Entity?: string;
    DateField?: string;
    FilterExpression?: string | null;
    DefaultRetentionDays?: number;
    StorageMode?: 'Store' | 'Purge';
    Mode?: 'StripFields' | 'HardDelete' | 'ArchiveOnly' | null;
    DefaultMode?: 'StripFields' | 'HardDelete' | 'ArchiveOnly';
    DriverClass?: string | null;
    FieldConfiguration?: string;
    BatchSize?: number | null;
    RootPath?: string;
    DefaultBatchSize?: number;
}

/** A key over mockPrimaryKeys: ID holds `id`; any other key column holds 1. */
function createMockPrimaryKey(id: string) {
    return {
        KeyValuePairs: mockPrimaryKeys.map(k => ({ FieldName: k.Name, Value: k.Name === 'ID' ? id : '1' })),
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

function createMockConfigEntity(fieldConfigJson: string, overrides?: Partial<MockBaseEntity>): MockBaseEntity {
    const entity = createMockEntity({
        ID: 'config-entity-1',
        RetentionDays: null,
        DateField: '__mj_CreatedAt',
        FilterExpression: null,
        ...overrides,
    });
    entity.Get.mockImplementation((field: string) => {
        switch (field) {
            case 'EntityName': return 'Test Entity';
            case 'DriverClass': return null;
            case 'FieldConfiguration': return fieldConfigJson;
            case 'BatchSize': return null;
            default: return null;
        }
    });
    return readTypedFieldsThroughGet(entity, ['Entity', 'DriverClass', 'FieldConfiguration', 'BatchSize', 'Mode'], overrides);
}

function createMockConfig(overrides?: Partial<MockBaseEntity>): MockBaseEntity {
    const config = createMockEntity({ ID: 'config-1', DefaultRetentionDays: 365, StorageMode: 'Store', ...overrides });
    config.Get.mockImplementation((field: string) => {
        switch (field) {
            case 'RootPath': return 'archives';
            case 'DefaultBatchSize': return 100;
            case 'DefaultMode': return 'StripFields';
            default: return null;
        }
    });
    return readTypedFieldsThroughGet(config, ['RootPath', 'DefaultBatchSize', 'DefaultMode'], overrides);
}

/**
 * Generated entity getters read through `Get`, so the mock's typed fields do the same: a test that
 * stubs `Get` for a field sees the value through the property as well. An override, or a later
 * assignment, wins over `Get`.
 */
function readTypedFieldsThroughGet(
    entity: MockBaseEntity,
    fields: ReadonlyArray<keyof MockBaseEntity>,
    overrides?: Partial<MockBaseEntity>
): MockBaseEntity {
    for (const field of fields) {
        if (overrides && field in overrides) continue;
        let assigned = false;
        let value = entity[field];
        Object.defineProperty(entity, field, {
            get: () => (assigned ? value : entity.Get(field) ?? value),
            set: (next: MockBaseEntity[typeof field]) => {
                assigned = true;
                value = next;
            },
            configurable: true,
            enumerable: true,
        });
    }
    return entity;
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
        mockRunViewCalls.length = 0;
        mockRowMatchesFilter = () => true;
        mockPrimaryKeys = [{ Name: 'ID', Type: 'uniqueidentifier', TSType: 'string' }];
        mockPlatform = 'sqlserver';
        mockBuildEligibilityFilter.mockReturnValue(null);
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
                configEntity as unknown as MJArchiveConfigurationEntityEntity,
                config as unknown as MJArchiveConfigurationEntity,
                archiveRun as unknown as MJArchiveRunEntity,
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
                configEntity as unknown as MJArchiveConfigurationEntityEntity,
                config as unknown as MJArchiveConfigurationEntity,
                archiveRun as unknown as MJArchiveRunEntity,
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
                configEntity as unknown as MJArchiveConfigurationEntityEntity,
                config as unknown as MJArchiveConfigurationEntity,
                archiveRun as unknown as MJArchiveRunEntity,
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
                configEntity as unknown as MJArchiveConfigurationEntityEntity,
                config as unknown as MJArchiveConfigurationEntity,
                archiveRun as unknown as MJArchiveRunEntity,
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
                configEntity as unknown as MJArchiveConfigurationEntityEntity,
                config as unknown as MJArchiveConfigurationEntity,
                archiveRun as unknown as MJArchiveRunEntity,
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
                configEntity as unknown as MJArchiveConfigurationEntityEntity,
                config as unknown as MJArchiveConfigurationEntity,
                archiveRun as unknown as MJArchiveRunEntity,
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
                configEntity as unknown as MJArchiveConfigurationEntityEntity,
                config as unknown as MJArchiveConfigurationEntity,
                archiveRun as unknown as MJArchiveRunEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            );

            expect(result).toBeDefined();
        });

        it('should reject before reading records when the DriverClass is not registered', async () => {
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

            await expect(processor.ProcessEntity(
                configEntity as unknown as MJArchiveConfigurationEntityEntity,
                config as unknown as MJArchiveConfigurationEntity,
                archiveRun as unknown as MJArchiveRunEntity,
                storageManager as unknown as ArchiveStorageManager,
                contextUser
            )).rejects.toThrow('Archive driver "NonExistentDriver" is not registered');
            expect(mockRunViewCalls).toHaveLength(0);
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
                    configEntity as unknown as MJArchiveConfigurationEntityEntity,
                    config as unknown as MJArchiveConfigurationEntity,
                    archiveRun as unknown as MJArchiveRunEntity,
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
                    configEntity as unknown as MJArchiveConfigurationEntityEntity,
                    config as unknown as MJArchiveConfigurationEntity,
                    archiveRun as unknown as MJArchiveRunEntity,
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
                    configEntity as unknown as MJArchiveConfigurationEntityEntity,
                    config as unknown as MJArchiveConfigurationEntity,
                    archiveRun as unknown as MJArchiveRunEntity,
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
                    configEntity as unknown as MJArchiveConfigurationEntityEntity,
                    config as unknown as MJArchiveConfigurationEntity,
                    archiveRun as unknown as MJArchiveRunEntity,
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
                    configEntity as unknown as MJArchiveConfigurationEntityEntity,
                    config as unknown as MJArchiveConfigurationEntity,
                    archiveRun as unknown as MJArchiveRunEntity,
                    storageManager as unknown as ArchiveStorageManager,
                    contextUser
                )
            ).rejects.toThrow('non-empty FieldName');
        });
    });

    describe('Retention filter', () => {
        const now = new Date('2026-10-15T00:00:00.000Z');

        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(now);
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        async function filterFor(configEntity: MockBaseEntity, config: MockBaseEntity): Promise<string | undefined> {
            await processor.ProcessEntity(
                configEntity as unknown as MJArchiveConfigurationEntityEntity,
                config as unknown as MJArchiveConfigurationEntity,
                createMockEntity({ ID: 'run-1' }) as unknown as MJArchiveRunEntity,
                createMockStorageManager() as unknown as ArchiveStorageManager,
                { ID: 'user-1' } as unknown as UserInfo
            );
            return mockRunViewCalls[0]?.ExtraFilter;
        }

        it('should use the configuration DefaultRetentionDays when the entity RetentionDays is null', async () => {
            const filter = await filterFor(
                createMockConfigEntity(validFieldConfigJson, { RetentionDays: null }),
                createMockConfig({ DefaultRetentionDays: 30 })
            );
            expect(filter).toBe("[__mj_CreatedAt] < '2026-09-15T00:00:00.000Z'");
        });

        it('should use the entity RetentionDays over the configuration default', async () => {
            const filter = await filterFor(
                createMockConfigEntity(validFieldConfigJson, { RetentionDays: 7 }),
                createMockConfig({ DefaultRetentionDays: 30 })
            );
            expect(filter).toBe("[__mj_CreatedAt] < '2026-10-08T00:00:00.000Z'");
        });

        it('should append the FilterExpression to the retention cutoff', async () => {
            const filter = await filterFor(
                createMockConfigEntity(validFieldConfigJson, { RetentionDays: 7, FilterExpression: "Status = 'Closed'" }),
                createMockConfig()
            );
            expect(filter).toBe("[__mj_CreatedAt] < '2026-10-08T00:00:00.000Z' AND (Status = 'Closed')");
        });

        it('should refuse a negative retention period without reading any records', async () => {
            await expect(filterFor(
                createMockConfigEntity(validFieldConfigJson, { Entity: 'MJ: AI Prompt Runs', RetentionDays: -5 }),
                createMockConfig()
            )).rejects.toThrow('Entity "MJ: AI Prompt Runs" has a negative retention period (-5 days)');
            expect(mockRunViewCalls).toHaveLength(0);
        });

        it('should build the cutoff at the current time when RetentionDays is 0', async () => {
            const filter = await filterFor(
                createMockConfigEntity(validFieldConfigJson, { RetentionDays: 0 }),
                createMockConfig({ DefaultRetentionDays: 30 })
            );
            expect(filter).toBe("[__mj_CreatedAt] < '2026-10-15T00:00:00.000Z'");
        });

        it('should refuse to select records when the entity has no DateField', async () => {
            await expect(filterFor(
                createMockConfigEntity(validFieldConfigJson, { DateField: '' }),
                createMockConfig()
            )).rejects.toThrow('has no DateField');
        });
    });

    describe('StorageMode', () => {
        async function processOneRecord(
            storageMode: 'Store' | 'Purge',
            storageManager: ReturnType<typeof createMockStorageManager> | null
        ): Promise<ArchiveRecordContext> {
            mockRunViewResults.Results = [createMockEntity({ ID: 'rec-1' })];
            await processor.ProcessEntity(
                createMockConfigEntity(validFieldConfigJson) as unknown as MJArchiveConfigurationEntityEntity,
                createMockConfig({ StorageMode: storageMode }) as unknown as MJArchiveConfigurationEntity,
                createMockEntity({ ID: 'run-1' }) as unknown as MJArchiveRunEntity,
                storageManager as unknown as ArchiveStorageManager | null,
                { ID: 'user-1' } as unknown as UserInfo
            );
            return mockArchiveRecord.mock.calls[0][0] as ArchiveRecordContext;
        }

        it('should pass no storage driver and the Purge mode to the driver', async () => {
            const context = await processOneRecord('Purge', null);
            expect(context.StorageDriver).toBeNull();
            expect(context.StorageMode).toBe('Purge');
        });

        it('should not log a run detail for a purged record', async () => {
            mockArchiveRecord.mockResolvedValue({ Success: true, StoragePath: null, BytesArchived: 0 });
            await processOneRecord('Purge', null);
            expect(mockDetailSave).not.toHaveBeenCalled();
        });

        it('should log a run detail for a record that fails to purge', async () => {
            mockArchiveRecord.mockResolvedValue({ Success: false, StoragePath: null, BytesArchived: 0, ErrorMessage: 'save blocked' });
            await processOneRecord('Purge', null);
            expect(mockDetailSave).toHaveBeenCalledOnce();
        });

        it('should pass the storage driver and log a run detail for every stored record', async () => {
            const storageManager = createMockStorageManager();
            const context = await processOneRecord('Store', storageManager);
            expect(context.StorageDriver).toBe(storageManager.Driver);
            expect(context.StorageMode).toBe('Store');
            expect(mockDetailSave).toHaveBeenCalledOnce();
        });
    });

    describe('Paging', () => {
        /** Records rec-0000, rec-0001, … so the mock table orders them by ID. */
        function createRecords(count: number): MockBaseEntity[] {
            return Array.from({ length: count }, (_, i) => createMockEntity({ ID: `rec-${String(i).padStart(4, '0')}` }));
        }

        async function runEntity(options: {
            records: MockBaseEntity[];
            batchSize: number;
            mode?: 'StripFields' | 'HardDelete' | 'ArchiveOnly';
            storageMode?: 'Store' | 'Purge';
        }): Promise<import('../ArchiveProcessor').EntityProcessingResult> {
            mockRunViewResults.Results = options.records;
            return processor.ProcessEntity(
                createMockConfigEntity(validFieldConfigJson, { Entity: 'Test Entity', BatchSize: options.batchSize, Mode: options.mode ?? 'StripFields' }) as unknown as MJArchiveConfigurationEntityEntity,
                createMockConfig({ StorageMode: options.storageMode ?? 'Purge' }) as unknown as MJArchiveConfigurationEntity,
                createMockEntity({ ID: 'run-1' }) as unknown as MJArchiveRunEntity,
                null,
                { ID: 'user-1' } as unknown as UserInfo
            );
        }

        /** IDs of the records handed to the driver, in order, read when the driver receives them. */
        const handedIds: string[] = [];

        beforeEach(() => {
            handedIds.length = 0;
            mockArchiveRecord.mockImplementation((context: ArchiveRecordContext) => {
                handedIds.push(context.Record.PrimaryKey.Values());
                return Promise.resolve({ Success: true, StoragePath: null, BytesArchived: 0 });
            });
        });

        /** Makes processed records leave the filter, as a StripFields run with an eligibility filter does. */
        function archivedRecordsLeaveFilter(): void {
            const archived = new Set<string>();
            mockArchiveRecord.mockImplementation((context: ArchiveRecordContext) => {
                handedIds.push(context.Record.PrimaryKey.Values());
                archived.add(context.Record.PrimaryKey.Values());
                return Promise.resolve({ Success: true, StoragePath: null, BytesArchived: 0 });
            });
            mockRowMatchesFilter = record => !archived.has(record.ID);
        }

        /**
         * Models a HardDelete: the row leaves the table, and the entity object clears its key the
         * way BaseEntity.Delete() does (NewRecord() gives it a fresh key, or none).
         */
        function deletesClearTheKey(freshKey: (id: string) => string | null): void {
            const deleted = new Set<string>();
            mockArchiveRecord.mockImplementation((context: ArchiveRecordContext) => {
                const id = context.Record.PrimaryKey.Values();
                handedIds.push(id);
                deleted.add(id);
                const record = context.Record as unknown as MockBaseEntity;
                record.PrimaryKey = { KeyValuePairs: [{ FieldName: 'ID', Value: freshKey(id) as string }], Values: () => String(freshKey(id)) };
                return Promise.resolve({ Success: true, StoragePath: null, BytesArchived: 0 });
            });
            mockRowMatchesFilter = record => !deleted.has(record.ID);
        }

        it('should process every eligible record in one run, beyond the batch size and the view row cap', async () => {
            const result = await runEntity({ records: createRecords(2500), batchSize: 100 });

            expect(result.Archived).toBe(2500);
            expect(new Set(handedIds).size).toBe(2500);
            expect(mockRunViewCalls.every(call => call.MaxRows === 100 && call.BypassCache === true)).toBe(true);
        });

        it('should load one batch per query, ordered by primary key, after the last key of the previous page', async () => {
            await runEntity({ records: createRecords(250), batchSize: 100 });

            expect(mockRunViewCalls.map(call => call.AfterKey?.KeyValuePairs[0].Value)).toEqual([undefined, 'rec-0099', 'rec-0199', 'rec-0249']);
            expect(mockRunViewCalls.every(call => call.OrderBy === 'ID' && call.StartRow === undefined)).toBe(true);
        });

        it('should stop at the first empty page', async () => {
            await runEntity({ records: createRecords(150), batchSize: 100 });
            expect(mockRunViewCalls.map(call => call.AfterKey?.KeyValuePairs[0].Value)).toEqual([undefined, 'rec-0099', 'rec-0149']);
        });

        it('should keep paging when the view returns fewer rows than the batch size asks for', async () => {
            const result = await runEntity({ records: createRecords(2500), batchSize: 5000 });

            expect(result.Archived).toBe(2500);
            expect(new Set(handedIds).size).toBe(2500);
        });

        it('should add the driver eligibility filter so stripped records are not loaded again', async () => {
            mockBuildEligibilityFilter.mockReturnValue('[Description] IS NOT NULL OR [Notes] IS NOT NULL');
            archivedRecordsLeaveFilter();

            const result = await runEntity({ records: createRecords(250), batchSize: 100 });

            expect(result.Archived).toBe(250);
            expect(handedIds).toHaveLength(250);
            expect(mockRunViewCalls[0].ExtraFilter).toContain(' AND ([Description] IS NOT NULL OR [Notes] IS NOT NULL)');
        });

        it('should hand the driver the field configuration, entity metadata and configuration records', async () => {
            await runEntity({ records: createRecords(1), batchSize: 100 });

            const context = mockBuildEligibilityFilter.mock.calls[0][0] as import('../types').EligibilityFilterContext;
            expect(context.FieldConfig.Fields.map(f => f.FieldName)).toEqual(['Description', 'Notes']);
            expect(context.EntityInfo.Name).toBe('Test Entity');
            expect(context.ConfigEntity).toBeDefined();
            expect(context.Config).toBeDefined();
        });

        it('should count a failed record, keep going, and not load the failed record again', async () => {
            mockArchiveRecord.mockImplementation((context: ArchiveRecordContext) => {
                const id = context.Record.PrimaryKey.Values();
                handedIds.push(id);
                return Promise.resolve(id === 'rec-1500'
                    ? { Success: false, StoragePath: null, BytesArchived: 0, ErrorMessage: 'save blocked' }
                    : { Success: true, StoragePath: null, BytesArchived: 0 });
            });

            const result = await runEntity({ records: createRecords(2500), batchSize: 100 });

            expect(result.Failed).toBe(1);
            expect(result.Archived).toBe(2499);
            expect(handedIds).toHaveLength(2500);
        });

        it('should advance through ArchiveOnly records, which never leave the filter', async () => {
            const result = await runEntity({ records: createRecords(2500), batchSize: 100, mode: 'ArchiveOnly', storageMode: 'Store' });

            expect(result.Archived).toBe(2500);
            expect(new Set(handedIds).size).toBe(2500);
        });

        it.each([
            ['a fresh UUID that sorts after every row', () => 'zzzz-new-record'],
            ['no key at all', () => null],
        ])('should page from the key it loaded when a HardDelete leaves the record with %s', async (_label, freshKey) => {
            deletesClearTheKey(freshKey);

            const result = await runEntity({ records: createRecords(250), batchSize: 100, mode: 'HardDelete' });

            expect(result.Archived).toBe(250);
            expect(new Set(handedIds).size).toBe(250);
            expect(mockRunViewCalls.map(call => call.AfterKey?.KeyValuePairs[0].Value)).toEqual([undefined, 'rec-0099', 'rec-0199', 'rec-0249']);
        });

        it('should throw when a later page fails to load, keeping the existing behavior', async () => {
            let calls = 0;
            mockArchiveRecord.mockImplementation(() => {
                calls++;
                if (calls === 100) {
                    mockRunViewResults.Success = false;
                    mockRunViewResults.ErrorMessage = 'connection lost';
                }
                return Promise.resolve({ Success: true, StoragePath: null, BytesArchived: 0 });
            });

            await expect(runEntity({ records: createRecords(250), batchSize: 100 })).rejects.toThrow('connection lost');
        });

        it('should quote the DateField and refuse one that is not a field of the entity', async () => {
            await runEntity({ records: createRecords(1), batchSize: 100 });
            expect(mockRunViewCalls[0].ExtraFilter).toMatch(/^\[__mj_CreatedAt\] < '/);

            mockRunViewCalls.length = 0;
            await expect(processor.ProcessEntity(
                createMockConfigEntity(validFieldConfigJson, { Entity: 'Test Entity', DateField: 'NotAField' }) as unknown as MJArchiveConfigurationEntityEntity,
                createMockConfig() as unknown as MJArchiveConfigurationEntity,
                createMockEntity({ ID: 'run-1' }) as unknown as MJArchiveRunEntity,
                null,
                { ID: 'user-1' } as unknown as UserInfo
            )).rejects.toThrow('DateField "NotAField" is not a field of entity "Test Entity"');
            expect(mockRunViewCalls).toHaveLength(0);
        });

        describe('with a composite primary key (seek paging)', () => {
            beforeEach(() => {
                mockPrimaryKeys = [
                    { Name: 'ID', Type: 'nvarchar', TSType: 'string' },
                    { Name: 'Version', Type: 'int', TSType: 'number' },
                ];
            });

            it('should order by every key column and seek past the last key of the previous page', async () => {
                await runEntity({ records: createRecords(150), batchSize: 100, mode: 'ArchiveOnly', storageMode: 'Store' });

                expect(mockRunViewCalls.map(call => call.OrderBy)).toEqual(['[ID], [Version]', '[ID], [Version]', '[ID], [Version]']);
                expect(mockRunViewCalls.every(call => call.AfterKey === undefined && call.StartRow === undefined)).toBe(true);
                expect(mockRunViewCalls[1].ExtraFilter).toMatch(/\) AND \(\(\[ID\] > N'rec-0099'\) OR \(\[ID\] = N'rec-0099' AND \[Version\] > 1\)\)$/);
            });

            it("should write plain '' string literals on PostgreSQL", async () => {
                mockPlatform = 'postgresql';
                await runEntity({ records: createRecords(150), batchSize: 100, mode: 'ArchiveOnly', storageMode: 'Store' });
                expect(mockRunViewCalls[1].ExtraFilter).toContain("([ID] > 'rec-0099') OR ([ID] = 'rec-0099' AND [Version] > 1)");
            });

            it('should end when processed records still match the filter (SkipIfAllNullFields names a column the run does not clear)', async () => {
                mockBuildEligibilityFilter.mockReturnValue('[Notes] IS NOT NULL');

                const result = await runEntity({ records: createRecords(250), batchSize: 100 });

                expect(result.Archived).toBe(250);
                expect(handedIds).toHaveLength(250);
            });

            it('should not skip records when the driver also deletes a record on the page it is processing', async () => {
                const deleted = new Set<string>();
                mockArchiveRecord.mockImplementation((context: ArchiveRecordContext) => {
                    const id = context.Record.PrimaryKey.Values();
                    handedIds.push(id);
                    if (deleted.has(id)) {
                        return Promise.resolve({ Success: false, StoragePath: null, BytesArchived: 0, ErrorMessage: 'already deleted' });
                    }
                    deleted.add(id);
                    if (id === 'rec-0010') {
                        deleted.add('rec-0011'); // a cascade reaches another row of the same entity
                    }
                    return Promise.resolve({ Success: true, StoragePath: null, BytesArchived: 0 });
                });
                mockRowMatchesFilter = record => !deleted.has(record.ID);

                const result = await runEntity({ records: createRecords(250), batchSize: 100, mode: 'HardDelete' });

                expect(new Set(handedIds).size).toBe(250);
                expect(result).toMatchObject({ Archived: 249, Failed: 1 });
            });

            it('should refuse before reading when a key column is a date', async () => {
                mockPrimaryKeys = [
                    { Name: 'ID', Type: 'nvarchar', TSType: 'string' },
                    { Name: 'ValidFrom', Type: 'datetimeoffset', TSType: 'Date' },
                ];

                await expect(runEntity({ records: createRecords(10), batchSize: 100 }))
                    .rejects.toThrow('primary key column "ValidFrom" is not a string or number column');
                expect(mockRunViewCalls).toHaveLength(0);
            });
        });
    });
});

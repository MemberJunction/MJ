import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultArchiveDriver } from '../DefaultArchiveDriver';
import {
    ArchiveRecordContext,
    ArchiveFieldConfiguration,
    ArchiveDocument,
    RestoreRecordContext,
} from '../types';

// ---- Mock state for Metadata ----

let mockGetEntityObjectResult: MockBaseEntity;
let mockChildRunViewResult: { Success: boolean; Results: unknown[] } = { Success: true, Results: [] };

vi.mock('@memberjunction/core', () => {
    return {
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        Metadata: (() => {
            class MockMetadata {
                GetEntityObject = vi.fn().mockImplementation(() => Promise.resolve(mockGetEntityObjectResult));
                // Multi-provider migration: DefaultArchiveDriver uses this.ProviderToUse, which
                // falls back to Metadata.Provider. Mirror the helper instance shape on the static
                // Provider so GetEntityObject calls find the same handler.
                static Provider: { GetEntityObject: () => Promise<unknown> };
            }
            MockMetadata.Provider = {
                GetEntityObject: () => Promise.resolve(mockGetEntityObjectResult),
            };
            return MockMetadata;
        })(),
        RunView: class MockRunView {
            RunView = vi.fn().mockImplementation(() => Promise.resolve(mockChildRunViewResult));
        },
        CompositeKey: class MockCompositeKey {
            KeyValuePairs: Array<{ FieldName: string; Value: string }>;
            constructor(pairs: Array<{ FieldName: string; Value: string }>) {
                this.KeyValuePairs = pairs;
            }
        },
    };
});

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (_target: unknown) => {},
}));

// ---- Helper factories ----

interface MockFieldInfo {
    Name: string;
    AllowsNull: boolean;
}

interface MockBaseEntity {
    ID: string;
    EntityInfo: { Name: string; ID: string; Fields: MockFieldInfo[] };
    PrimaryKey: { KeyValuePairs: Array<{ FieldName: string; Value: string }> };
    LatestResult: { Message: string } | null;
    Get: ReturnType<typeof vi.fn>;
    Set: ReturnType<typeof vi.fn>;
    GetAll: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    InnerLoad: ReturnType<typeof vi.fn>;
}

function createMockRecord(overrides?: Partial<MockBaseEntity>): MockBaseEntity {
    return {
        ID: 'record-1',
        EntityInfo: {
            Name: 'Test Entity',
            ID: 'entity-id-1',
            Fields: [
                { Name: 'Description', AllowsNull: true },
                { Name: 'Notes', AllowsNull: true },
            ],
            FieldByName: (name: string) => {
                const fields = [
                    { Name: 'Description', AllowsNull: true },
                    { Name: 'Notes', AllowsNull: true },
                ];
                return fields.find(f => f.Name === name);
            }
        },
        PrimaryKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'record-1' }] },
        LatestResult: null,
        Get: vi.fn(),
        Set: vi.fn(),
        GetAll: vi.fn().mockReturnValue({ ID: 'record-1', Name: 'Test', Description: 'Some text' }),
        Save: vi.fn().mockResolvedValue(true),
        InnerLoad: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

interface MockRelatedEntity {
    Type: string;
    RelatedEntityID: string;
    RelatedEntity: string;
    RelatedEntityJoinField: string;
}

function createDeletableRecord(id: string, entityId: string, relatedEntities: MockRelatedEntity[]) {
    const record = createMockRecord({ ID: id });
    return Object.assign(record, {
        EntityInfo: { ...record.EntityInfo, ID: entityId, RelatedEntities: relatedEntities },
        PrimaryKey: { KeyValuePairs: [{ FieldName: 'ID', Value: id }], Values: () => id },
        Delete: vi.fn().mockResolvedValue(true),
    });
}

interface MockStorageDriver {
    PutObject: ReturnType<typeof vi.fn>;
    GetObject: ReturnType<typeof vi.fn>;
}

function createMockStorageDriver(overrides?: Partial<MockStorageDriver>): MockStorageDriver {
    return {
        PutObject: vi.fn().mockResolvedValue(true),
        GetObject: vi.fn().mockResolvedValue(Buffer.from('{}', 'utf8')),
        ...overrides,
    };
}

function createFieldConfig(overrides?: Partial<ArchiveFieldConfiguration>): ArchiveFieldConfiguration {
    return {
        Fields: [
            { FieldName: 'Description', IsActive: true },
            { FieldName: 'Notes', IsActive: true },
        ],
        ArchiveFullRecord: false,
        ...overrides,
    };
}

function createArchiveContext(overrides?: Partial<{
    record: MockBaseEntity;
    fieldConfig: ArchiveFieldConfiguration;
    storageDriver: MockStorageDriver | null;
    storageMode: 'Store' | 'Purge';
    mode: 'StripFields' | 'HardDelete' | 'ArchiveOnly';
}>): ArchiveRecordContext {
    const record = overrides?.record ?? createMockRecord();
    const configEntity = createMockRecord({ ID: 'config-entity-1' });
    configEntity.Get.mockImplementation((field: string) => {
        if (field === 'Mode') return overrides?.mode ?? 'StripFields';
        return null;
    });

    const config = createMockRecord({ ID: 'config-1' });
    config.Get.mockImplementation((field: string) => {
        if (field === 'DefaultMode') return 'StripFields';
        return null;
    });

    const storageDriver = overrides?.storageDriver === undefined ? createMockStorageDriver() : overrides.storageDriver;

    return {
        Record: record as unknown as import('@memberjunction/core').BaseEntity,
        FieldConfig: overrides?.fieldConfig ?? createFieldConfig(),
        ConfigEntity: configEntity as unknown as import('@memberjunction/core').BaseEntity,
        Config: config as unknown as import('@memberjunction/core').BaseEntity,
        StorageDriver: storageDriver as unknown as import('@memberjunction/storage').FileStorageBase | null,
        StorageMode: overrides?.storageMode ?? 'Store',
        BasePath: 'archives',
        ContextUser: { ID: 'user-1' } as unknown as import('@memberjunction/core').UserInfo,
        ArchiveRun: createMockRecord({ ID: 'run-1' }) as unknown as import('@memberjunction/core').BaseEntity,
    };
}

// ---- Tests ----

describe('DefaultArchiveDriver', () => {
    let driver: DefaultArchiveDriver;

    beforeEach(() => {
        vi.clearAllMocks();
        driver = new DefaultArchiveDriver();
        // Reset the shared mock state
        mockGetEntityObjectResult = createMockRecord();
        mockChildRunViewResult = { Success: true, Results: [] };
    });

    describe('ShouldArchiveRecord', () => {
        it('should return true when at least one configured field has a non-null value', () => {
            const record = createMockRecord();
            record.Get.mockImplementation((field: string) => {
                if (field === 'Description') return 'Some description';
                if (field === 'Notes') return null;
                return null;
            });

            const context = createArchiveContext({ record });

            expect(driver.ShouldArchiveRecord(context)).toBe(true);
        });

        it('should return false when all configured fields are null', () => {
            const record = createMockRecord();
            record.Get.mockReturnValue(null);

            const context = createArchiveContext({ record });

            expect(driver.ShouldArchiveRecord(context)).toBe(false);
        });

        it('should return false when all configured fields are undefined', () => {
            const record = createMockRecord();
            record.Get.mockReturnValue(undefined);

            const context = createArchiveContext({ record });

            expect(driver.ShouldArchiveRecord(context)).toBe(false);
        });

        it('should use SkipIfAllNullFields when configured instead of field list', () => {
            const record = createMockRecord();
            record.Get.mockImplementation((field: string) => {
                if (field === 'CustomCheckField') return 'has value';
                return null;
            });

            const fieldConfig = createFieldConfig({
                SkipIfAllNullFields: ['CustomCheckField'],
            });

            const context = createArchiveContext({ record, fieldConfig });

            expect(driver.ShouldArchiveRecord(context)).toBe(true);
            expect(record.Get).toHaveBeenCalledWith('CustomCheckField');
        });

        it('should skip inactive fields when checking without SkipIfAllNullFields', () => {
            const record = createMockRecord();
            record.Get.mockReturnValue(null);

            const fieldConfig: ArchiveFieldConfiguration = {
                Fields: [
                    { FieldName: 'Description', IsActive: true },
                    { FieldName: 'Notes', IsActive: false },
                ],
            };

            const context = createArchiveContext({ record, fieldConfig });

            // Only Description (active) is checked, and it's null => false
            expect(driver.ShouldArchiveRecord(context)).toBe(false);
            expect(record.Get).toHaveBeenCalledWith('Description');
            expect(record.Get).not.toHaveBeenCalledWith('Notes');
        });

        it('should treat zero and empty string as non-null values', () => {
            const record = createMockRecord();
            record.Get.mockReturnValue(0);

            const context = createArchiveContext({ record });

            expect(driver.ShouldArchiveRecord(context)).toBe(true);
        });
    });

    describe('ArchiveRecord', () => {
        it('should build a document, write to storage, nullify fields, and save the record', async () => {
            const record = createMockRecord();
            record.Get.mockImplementation((field: string) => {
                if (field === 'Description') return 'Some text';
                if (field === 'Notes') return 'Some notes';
                return null;
            });

            const storageDriver = createMockStorageDriver();
            const context = createArchiveContext({ record, storageDriver });

            const result = await driver.ArchiveRecord(context);

            expect(result.Success).toBe(true);
            expect(result.StoragePath).toBeTruthy();
            expect(result.StoragePath).toContain('Test_Entity');
            expect(result.StoragePath).toMatch(/\.json$/);
            expect(result.BytesArchived).toBeGreaterThan(0);

            // Verify storage was written
            expect(storageDriver.PutObject).toHaveBeenCalledOnce();
            const [, buffer, contentType] = storageDriver.PutObject.mock.calls[0] as [string, Buffer, string];
            expect(contentType).toBe('application/json');

            // Verify the document content
            const writtenDoc = JSON.parse(buffer.toString('utf8')) as ArchiveDocument;
            expect(writtenDoc.archiveVersion).toBe(1);
            expect(writtenDoc.entityName).toBe('Test Entity');
            expect(writtenDoc.recordId).toBe('record-1');
            expect(writtenDoc.archivedFields).toHaveProperty('Description', 'Some text');
            expect(writtenDoc.archivedFields).toHaveProperty('Notes', 'Some notes');

            // Verify fields were nullified
            expect(record.Set).toHaveBeenCalledWith('Description', null);
            expect(record.Set).toHaveBeenCalledWith('Notes', null);

            // Verify record was saved
            expect(record.Save).toHaveBeenCalledOnce();
        });

        it('should include fullRecord when ArchiveFullRecord is true', async () => {
            const record = createMockRecord();
            record.Get.mockReturnValue('value');
            record.GetAll.mockReturnValue({ ID: 'record-1', Name: 'Test', Description: 'value' });

            const storageDriver = createMockStorageDriver();
            const fieldConfig = createFieldConfig({ ArchiveFullRecord: true });
            const context = createArchiveContext({ record, storageDriver, fieldConfig });

            const result = await driver.ArchiveRecord(context);
            expect(result.Success).toBe(true);

            const writtenDoc = JSON.parse(
                (storageDriver.PutObject.mock.calls[0] as [string, Buffer, string])[1].toString('utf8')
            ) as ArchiveDocument;
            expect(writtenDoc.fullRecord).toEqual({ ID: 'record-1', Name: 'Test', Description: 'value' });
        });

        it('should set fullRecord to null when ArchiveFullRecord is false', async () => {
            const record = createMockRecord();
            record.Get.mockReturnValue('value');

            const storageDriver = createMockStorageDriver();
            const fieldConfig = createFieldConfig({ ArchiveFullRecord: false });
            const context = createArchiveContext({ record, storageDriver, fieldConfig });

            const result = await driver.ArchiveRecord(context);
            expect(result.Success).toBe(true);

            const writtenDoc = JSON.parse(
                (storageDriver.PutObject.mock.calls[0] as [string, Buffer, string])[1].toString('utf8')
            ) as ArchiveDocument;
            expect(writtenDoc.fullRecord).toBeNull();
        });

        it('should return failure when storage write fails', async () => {
            const record = createMockRecord();
            record.Get.mockReturnValue('value');

            const storageDriver = createMockStorageDriver({ PutObject: vi.fn().mockResolvedValue(false) });
            const context = createArchiveContext({ record, storageDriver });

            const result = await driver.ArchiveRecord(context);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Failed to write archive document');
            expect(record.Set).not.toHaveBeenCalledWith('Description', null);
            expect(record.Save).not.toHaveBeenCalled();
        });

        it('should return failure when record save fails after nullification', async () => {
            const record = createMockRecord({
                Save: vi.fn().mockResolvedValue(false),
                LatestResult: { Message: 'Save failed' },
            });
            record.Get.mockReturnValue('value');

            const storageDriver = createMockStorageDriver();
            const context = createArchiveContext({ record, storageDriver });

            const result = await driver.ArchiveRecord(context);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Failed to save record');
        });

        it('should return failure when an unexpected error is thrown', async () => {
            const record = createMockRecord();
            record.Get.mockImplementation(() => { throw new Error('Unexpected boom'); });

            const storageDriver = createMockStorageDriver();
            const context = createArchiveContext({ record, storageDriver });

            const result = await driver.ArchiveRecord(context);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('Unexpected boom');
        });

        it('should skip inactive fields when nullifying', async () => {
            const record = createMockRecord();
            record.Get.mockReturnValue('value');

            const storageDriver = createMockStorageDriver();
            const fieldConfig: ArchiveFieldConfiguration = {
                Fields: [
                    { FieldName: 'Description', IsActive: true },
                    { FieldName: 'Notes', IsActive: false },
                ],
            };
            const context = createArchiveContext({ record, storageDriver, fieldConfig });

            await driver.ArchiveRecord(context);

            expect(record.Set).toHaveBeenCalledWith('Description', null);
            expect(record.Set).not.toHaveBeenCalledWith('Notes', null);
        });

        it('should write the parent document and the cascade batch before deleting leaf-first in HardDelete mode', async () => {
            const child = createDeletableRecord('child-1', 'child-entity-id', []);
            child.EntityInfo.Name = 'Child Entity';
            mockChildRunViewResult = { Success: true, Results: [child] };
            const parent = createDeletableRecord('record-1', 'entity-id-1', [
                { Type: 'One To Many', RelatedEntityID: 'child-entity-id', RelatedEntity: 'Child Entity', RelatedEntityJoinField: 'ParentID' },
            ]);
            parent.Get.mockReturnValue('value');
            const storageDriver = createMockStorageDriver();
            const context = createArchiveContext({ record: parent, storageDriver, storageMode: 'Store', mode: 'HardDelete' });

            const result = await driver.ArchiveRecord(context);

            expect(result.Success).toBe(true);
            expect(storageDriver.PutObject).toHaveBeenCalledTimes(2);
            const [parentPath] = storageDriver.PutObject.mock.calls[0] as [string, Buffer, string];
            const [batchPath, batchBuffer] = storageDriver.PutObject.mock.calls[1] as [string, Buffer, string];
            expect(parentPath).toContain('Test_Entity/record-1/');
            expect(batchPath).toContain('Child_Entity/cascade_record-1_');
            expect(JSON.parse(batchBuffer.toString('utf8'))).toMatchObject({ batchType: 'cascade-delete', recordCount: 1 });

            const [parentWriteOrder, batchWriteOrder] = storageDriver.PutObject.mock.invocationCallOrder;
            const childDeleteOrder = child.Delete.mock.invocationCallOrder[0];
            const parentDeleteOrder = parent.Delete.mock.invocationCallOrder[0];
            expect(parentWriteOrder).toBeLessThan(batchWriteOrder);
            expect(batchWriteOrder).toBeLessThan(childDeleteOrder);
            expect(childDeleteOrder).toBeLessThan(parentDeleteOrder);
        });
    });

    describe('RestoreRecord', () => {
        it('should read the archive document, restore fields, and save the record', async () => {
            const archivedDoc: ArchiveDocument = {
                archiveVersion: 1,
                entityName: 'Test Entity',
                entityId: 'entity-id-1',
                recordId: 'record-1',
                primaryKey: [{ FieldName: 'ID', Value: 'record-1' }],
                versionStamp: '2025-01-01T00:00:00.000Z',
                archivedAt: '2025-01-01T00:00:00.000Z',
                archiveConfigurationEntityId: 'config-entity-1',
                archiveConfigurationId: 'config-1',
                mode: 'StripFields',
                archivedFields: { Description: 'Original text', Notes: 'Original notes' },
                fullRecord: null,
            };

            const restoredRecord = createMockRecord();
            mockGetEntityObjectResult = restoredRecord;

            const archiveRunDetail = createMockRecord();
            archiveRunDetail.Get.mockImplementation((field: string) => {
                if (field === 'StoragePath') return 'archives/Test_Entity/record-1/2025-01-01.json';
                return null;
            });

            const storageDriver = createMockStorageDriver({
                GetObject: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(archivedDoc), 'utf8')),
            });

            const context: RestoreRecordContext = {
                ArchiveRunDetail: archiveRunDetail as unknown as import('@memberjunction/core').BaseEntity,
                StorageDriver: storageDriver as unknown as import('@memberjunction/storage').FileStorageBase,
                ContextUser: { ID: 'user-1' } as unknown as import('@memberjunction/core').UserInfo,
            };

            const result = await driver.RestoreRecord(context);

            expect(result.Success).toBe(true);
            expect(result.RestoredFields).toEqual(['Description', 'Notes']);

            // Verify fields were set back
            expect(restoredRecord.Set).toHaveBeenCalledWith('Description', 'Original text');
            expect(restoredRecord.Set).toHaveBeenCalledWith('Notes', 'Original notes');
            expect(restoredRecord.Save).toHaveBeenCalledOnce();
        });

        it('should return failure when StoragePath is missing on ArchiveRunDetail', async () => {
            const archiveRunDetail = createMockRecord();
            archiveRunDetail.Get.mockReturnValue(null);

            const context: RestoreRecordContext = {
                ArchiveRunDetail: archiveRunDetail as unknown as import('@memberjunction/core').BaseEntity,
                StorageDriver: createMockStorageDriver() as unknown as import('@memberjunction/storage').FileStorageBase,
                ContextUser: { ID: 'user-1' } as unknown as import('@memberjunction/core').UserInfo,
            };

            const result = await driver.RestoreRecord(context);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('No StoragePath');
            expect(result.RestoredFields).toEqual([]);
        });

        it('should return failure when record load fails during restore', async () => {
            const archivedDoc: ArchiveDocument = {
                archiveVersion: 1,
                entityName: 'Test Entity',
                entityId: 'entity-id-1',
                recordId: 'record-1',
                primaryKey: [{ FieldName: 'ID', Value: 'record-1' }],
                versionStamp: '2025-01-01T00:00:00.000Z',
                archivedAt: '2025-01-01T00:00:00.000Z',
                archiveConfigurationEntityId: 'config-entity-1',
                archiveConfigurationId: 'config-1',
                mode: 'StripFields',
                archivedFields: { Description: 'text' },
                fullRecord: null,
            };

            const restoredRecord = createMockRecord({
                InnerLoad: vi.fn().mockResolvedValue(false),
            });
            mockGetEntityObjectResult = restoredRecord;

            const archiveRunDetail = createMockRecord();
            archiveRunDetail.Get.mockImplementation((field: string) => {
                if (field === 'StoragePath') return 'archives/path.json';
                return null;
            });

            const storageDriver = createMockStorageDriver({
                GetObject: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(archivedDoc), 'utf8')),
            });

            const context: RestoreRecordContext = {
                ArchiveRunDetail: archiveRunDetail as unknown as import('@memberjunction/core').BaseEntity,
                StorageDriver: storageDriver as unknown as import('@memberjunction/storage').FileStorageBase,
                ContextUser: { ID: 'user-1' } as unknown as import('@memberjunction/core').UserInfo,
            };

            const result = await driver.RestoreRecord(context);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Failed to load record');
            expect(result.RestoredFields).toEqual([]);
        });
    });

    describe('ArchiveRecord with StorageMode Purge', () => {
        it('should report that it supports purge', () => {
            expect(driver.SupportsPurge).toBe(true);
        });

        it('should clear the fields and save without writing to storage', async () => {
            const record = createMockRecord();
            record.Get.mockImplementation((field: string) => (field === 'Description' ? 'Some text' : null));
            const context = createArchiveContext({ record, storageDriver: null, storageMode: 'Purge' });

            const result = await driver.ArchiveRecord(context);

            expect(result).toEqual({ Success: true, StoragePath: null, BytesArchived: 0 });
            expect(record.Set).toHaveBeenCalledWith('Description', null);
            expect(record.Set).toHaveBeenCalledWith('Notes', null);
            expect(record.Save).toHaveBeenCalledOnce();
        });

        it('should return failure when the record save fails', async () => {
            const record = createMockRecord({ Save: vi.fn().mockResolvedValue(false) });
            const context = createArchiveContext({ record, storageDriver: null, storageMode: 'Purge' });

            const result = await driver.ArchiveRecord(context);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Failed to save record after nullifying');
        });

        it('should delete the record and its children without writing to storage in HardDelete mode', async () => {
            const child = createDeletableRecord('child-1', 'child-entity-id', []);
            mockChildRunViewResult = { Success: true, Results: [child] };
            const parent = createDeletableRecord('record-1', 'entity-id-1', [
                { Type: 'One To Many', RelatedEntityID: 'child-entity-id', RelatedEntity: 'Child Entity', RelatedEntityJoinField: 'ParentID' },
            ]);
            const context = createArchiveContext({ record: parent, storageDriver: null, storageMode: 'Purge', mode: 'HardDelete' });

            const result = await driver.ArchiveRecord(context);

            expect(result).toEqual({ Success: true, StoragePath: null, BytesArchived: 0 });
            expect(child.Delete).toHaveBeenCalledOnce();
            expect(parent.Delete).toHaveBeenCalledOnce();
        });
    });
});

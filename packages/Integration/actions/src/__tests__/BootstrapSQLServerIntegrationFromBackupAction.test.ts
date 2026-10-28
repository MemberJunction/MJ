import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { RunActionParams, ActionParam } from '@memberjunction/actions-base';
import {
    BootstrapSQLServerIntegrationFromBackupAction,
    SqlBackupFileListEntry,
    SqlColumnInfo
} from '../BootstrapSQLServerIntegrationFromBackupAction.js';

// --- Mocks ---

let mockWatermarkUpdateFn: ReturnType<typeof vi.fn>;
let mockRunViewFn: ReturnType<typeof vi.fn>;
let mockCredentialConfigFn: ReturnType<typeof vi.fn>;
let mockGetCredentialByIdFn: ReturnType<typeof vi.fn>;
let mockGetCredentialFn: ReturnType<typeof vi.fn>;
let mockEntityByIDFn: ReturnType<typeof vi.fn>;
let mockEntityByNameFn: ReturnType<typeof vi.fn>;
let mockInvalidateEntityCachesFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/integration-engine', () => {
    return {
        WatermarkService: class {
            public Update(...args: unknown[]) {
                return mockWatermarkUpdateFn(...args);
            }
        },
    };
});

let mockGetCompanyIntegrationObjectFn: ReturnType<typeof vi.fn>;
let mockGetIntegrationObjectFn: ReturnType<typeof vi.fn>;

/** Every call made on the progress emitter, in order, so tests can assert the stream a detached run sees. */
let progressCalls: Array<{ Method: string; Args: unknown[] }> = [];

vi.mock('@memberjunction/integration-progress-artifacts', () => {
    class FakeEmitter {
        constructor(manifest: unknown) { progressCalls.push({ Method: 'constructor', Args: [manifest] }); }
        public RunStart(...args: unknown[]) { progressCalls.push({ Method: 'RunStart', Args: args }); }
        public StageStart(...args: unknown[]) { progressCalls.push({ Method: 'StageStart', Args: args }); }
        public StageComplete(...args: unknown[]) { progressCalls.push({ Method: 'StageComplete', Args: args }); }
        public StageError(...args: unknown[]) { progressCalls.push({ Method: 'StageError', Args: args }); }
        public Heartbeat(...args: unknown[]) { progressCalls.push({ Method: 'Heartbeat', Args: args }); }
        public Emit(...args: unknown[]) { progressCalls.push({ Method: 'Emit', Args: args }); }
        public async Complete(...args: unknown[]) { progressCalls.push({ Method: 'Complete', Args: args }); }
        public async Fail(...args: unknown[]) { progressCalls.push({ Method: 'Fail', Args: args }); }
    }
    return { IntegrationProgressEmitter: FakeEmitter };
});

vi.mock('@memberjunction/integration-engine-base', () => {
    return {
        IntegrationEngineBase: {
            Instance: {
                Config: () => Promise.resolve(),
                GetCompanyIntegrationObject: (...args: unknown[]) => mockGetCompanyIntegrationObjectFn(...args),
                GetIntegrationObject: (...args: unknown[]) => mockGetIntegrationObjectFn(...args),
                GetCompanyIntegrationByID: () => ({ IntegrationID: 'int-001' }),
            },
        },
    };
});

vi.mock('@memberjunction/credentials', () => {
    const instance = {
        Config: (...args: unknown[]) => mockCredentialConfigFn(...args),
        getCredentialById: (...args: unknown[]) => mockGetCredentialByIdFn(...args),
        GetCredential: (...args: unknown[]) => mockGetCredentialFn(...args),
    };
    return {
        CredentialEngine: {
            Instance: instance,
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: class {
            public static FromMetadataProvider() {
                return new this();
            }
            public RunView(...args: unknown[]) {
                return mockRunViewFn(...args);
            }
        },
        LocalCacheManager: {
            Instance: {
                InvalidateEntityCaches: (...args: unknown[]) => mockInvalidateEntityCachesFn(...args),
            },
        },
        Metadata: class {
            public EntityByID(...args: unknown[]) {
                return mockEntityByIDFn(...args);
            }
        },
    };
});

// --- Test Helpers ---

function makeUser(id = 'user-1'): UserInfo {
    return { ID: id, Name: 'Test Admin', Email: 'admin@example.com' } as unknown as UserInfo;
}

function makeParams(inputs: Record<string, string | number | boolean>): RunActionParams {
    const params = new RunActionParams();
    params.ContextUser = makeUser();
    params.Params = Object.entries(inputs).map(([Name, Value]) => {
        const p = new ActionParam();
        p.Name = Name;
        p.Type = 'Input';
        p.Value = Value;
        return p;
    });
    params.Filters = [];
    return params;
}

interface MockSqlOptions {
    totalRows?: number;
    failOnInsert?: boolean;
    targetHasRows?: boolean;
    pkType?: string;
    compositePk?: boolean;
    stagingDbExists?: boolean;
    failOnHeader?: boolean;
}

function createMockSqlExecutor(options: MockSqlOptions = {}): {
    executor: DatabaseProviderBase;
    executedSql: string[];
    mockExecuteSql: ReturnType<typeof vi.fn>;
} {
    const executedSql: string[] = [];
    const mockExecuteSql = vi.fn().mockImplementation((sql: string) => {
        executedSql.push(sql);

        if (options.failOnInsert && sql.includes('INSERT INTO')) {
            return Promise.reject(new Error('Target table disk full error'));
        }

        if (sql.includes('SELECT TOP 1 1 AS HasRows')) {
            return Promise.resolve(options.targetHasRows ? [{ HasRows: 1 }] : []);
        }

        if (sql.includes('AS DatabaseId')) {
            return Promise.resolve([{ DatabaseId: options.stagingDbExists ? 7 : null }]);
        }

        if (sql.includes('COUNT_BIG(*) AS RowsInserted')) {
            return Promise.resolve([{ RowsInserted: options.totalRows ?? 1500 }]);
        }

        if (sql.includes('RESTORE HEADERONLY')) {
            if (options.failOnHeader) {
                return Promise.reject(new Error('Cannot open backup device: 403 Server failed to authenticate the request'));
            }
            return Promise.resolve([{
                BackupStartDate: new Date('2026-10-26T01:00:00.000Z'),
                BackupFinishDate: new Date('2026-10-26T04:00:00.000Z'),
                DatabaseName: 'AdventureWorks_Prod',
                FirstLSN: '100000000001',
                LastLSN: '100000000050',
                CheckpointLSN: '100000000020',
                BackupSize: 104857600,
            }]);
        }

        if (sql.includes('RESTORE FILELISTONLY')) {
            const files: SqlBackupFileListEntry[] = [
                { LogicalName: 'AdventureWorks_Data', PhysicalName: 'D:\\Data\\AW.mdf', Type: 'D', SizeBytes: 83886080 },
                { LogicalName: 'AdventureWorks_Log', PhysicalName: 'L:\\Log\\AW.ldf', Type: 'L', SizeBytes: 20971520 },
            ];
            return Promise.resolve(files);
        }

        if (sql.includes('InstanceDefaultDataPath')) {
            return Promise.resolve([{
                DataPath: 'F:\\SQLData',
                LogPath: 'L:\\SQLLog',
            }]);
        }

        if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
            const pkDataType = options.pkType ?? 'int';
            const columns: SqlColumnInfo[] = [
                { COLUMN_NAME: 'CustomerID', DATA_TYPE: pkDataType, IS_NULLABLE: 'NO' },
                { COLUMN_NAME: 'CustomerName', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'YES' },
                { COLUMN_NAME: 'EmailAddress', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'YES' },
                { COLUMN_NAME: 'ModifiedAt', DATA_TYPE: 'datetime2', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: 'ID', DATA_TYPE: 'uniqueidentifier', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: '__mj_integration_SyncStatus', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: '__mj_integration_LastSyncedAt', DATA_TYPE: 'datetimeoffset', IS_NULLABLE: 'YES' },
                { COLUMN_NAME: '__mj_integration_LastSeenModifiedValue', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'YES' },
            ];
            if (options.compositePk) {
                columns.push({ COLUMN_NAME: 'TenantID', DATA_TYPE: 'int', IS_NULLABLE: 'NO' });
            }
            return Promise.resolve(columns);
        }

        if (sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) {
            if (options.compositePk) {
                return Promise.resolve([{ COLUMN_NAME: 'CustomerID' }, { COLUMN_NAME: 'TenantID' }]);
            }
            return Promise.resolve([{ COLUMN_NAME: 'CustomerID' }]);
        }

        if (sql.includes('sys.partitions')) {
            return Promise.resolve([{ TotalRows: options.totalRows ?? 1500 }]);
        }

        return Promise.resolve([]);
    });

    const executor = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
    executor.ExecuteSQL = mockExecuteSql;
    executor.EntityByID = (id: string) => mockEntityByIDFn(id);
    executor.EntityByName = (name: string) => mockEntityByNameFn(name);

    return { executor, executedSql, mockExecuteSql };
}

// --- Tests ---

describe('BootstrapSQLServerIntegrationFromBackupAction', () => {
    let action: BootstrapSQLServerIntegrationFromBackupAction;
    let mockSql: ReturnType<typeof createMockSqlExecutor>;

    beforeEach(() => {
        action = new BootstrapSQLServerIntegrationFromBackupAction();
        mockSql = createMockSqlExecutor();
        action.CustomDatabaseProvider = mockSql.executor;

        mockWatermarkUpdateFn = vi.fn().mockResolvedValue(undefined);
        mockCredentialConfigFn = vi.fn().mockResolvedValue(undefined);
        mockGetCredentialByIdFn = vi.fn();
        mockGetCredentialFn = vi.fn();
        mockInvalidateEntityCachesFn = vi.fn().mockResolvedValue(undefined);

        mockRunViewFn = vi.fn().mockResolvedValue({
            Success: true,
            Results: [
                {
                    ID: 'map-cust-001',
                    CompanyIntegrationID: 'ci-001',
                    ExternalObjectName: 'sales.Customer',
                    EntityID: 'entity-cust-001',
                    SyncEnabled: true,
                    SyncDirection: 'Pull',
                    Priority: 1,
                    Configuration: JSON.stringify({ IncrementalWatermarkField: 'ModifiedAt' }),
                },
            ],
        });

        mockEntityByIDFn = vi.fn().mockImplementation((id: string) => {
            if (id === 'entity-cust-001') {
                return {
                    ID: 'entity-cust-001',
                    Name: 'Customer',
                    SchemaName: 'raw_erp',
                    BaseTable: 'Customer',
                    AllowDirectSQLInsert: true,
                    FirstPrimaryKey: { Name: 'ID' },
                    PrimaryKeys: [{ Name: 'ID' }],
                };
            }
            return undefined;
        });

        mockGetCompanyIntegrationObjectFn = vi.fn().mockImplementation((_ciID: string, objectName: string) =>
            objectName === 'sales.Customer' ? { ID: 'obj-cust', Name: 'sales.Customer', IncrementalWatermarkField: 'ModifiedAt' } : undefined
        );

        mockGetIntegrationObjectFn = vi.fn().mockReturnValue(undefined);

        mockEntityByNameFn = vi.fn().mockImplementation((name: string) => {
            if (name === 'MJ: Company Integration Record Maps') {
                return {
                    ID: 'entity-record-maps',
                    Name: 'MJ: Company Integration Record Maps',
                    SchemaName: '__mj',
                    BaseTable: 'CompanyIntegrationRecordMap',
                    AllowDirectSQLInsert: true,
                    AllowDirectSQLDelete: true,
                };
            }
            return undefined;
        });
    });

    describe('Parameter Validation', () => {
        it('returns MISSING_PARAMETER when CompanyIntegrationID is absent', async () => {
            const params = makeParams({ BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_PARAMETER');
            expect(result.Message).toContain('CompanyIntegrationID');
        });

        it('returns MISSING_PARAMETER when BackupUrls is absent', async () => {
            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_PARAMETER');
            expect(result.Message).toContain('BackupUrls');
        });

        it('returns INVALID_PARAMETER when BackupUrls is empty or whitespace', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: ' , , ',
            });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMETER');
        });

        it('returns BOOTSTRAP_FAILED when neither SasToken nor StorageCredentialID is provided for blob URL', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
            });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('BOOTSTRAP_FAILED');
            expect(result.Message).toContain('SasToken');
        });
    });

    describe('Credential Resolution', () => {
        it('resolves direct SasToken parameter and strips leading question mark', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: '?sp=rl&st=2026-10-26T00:00:00Z&se=2026-10-27T00:00:00Z&sig=secretToken123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const credSql = mockSql.executedSql.find(s => s.includes('CREATE CREDENTIAL'));
            expect(credSql).toBeDefined();
            expect(credSql).toContain('sp=rl&st=2026-10-26');
            expect(credSql).not.toContain('?sp=rl');
        });

        it('resolves SAS token from CredentialEngine via StorageCredentialID', async () => {
            mockGetCredentialByIdFn.mockReturnValue({
                ID: 'cred-123',
                Name: 'Azure Blob Backup Credential',
            });
            mockGetCredentialFn.mockResolvedValue({
                values: { SasToken: 'sp=r&sig=engineToken456' },
                status: 'valid',
            });

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                StorageCredentialID: 'cred-123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(mockGetCredentialByIdFn).toHaveBeenCalledWith('cred-123');
            expect(mockGetCredentialFn).toHaveBeenCalledWith('Azure Blob Backup Credential', expect.anything());

            const credSql = mockSql.executedSql.find(s => s.includes('CREATE CREDENTIAL'));
            expect(credSql).toContain('sp=r&sig=engineToken456');
        });

        it('fails with clear error when StorageCredentialID is not found in CredentialEngine', async () => {
            mockGetCredentialByIdFn.mockReturnValue(undefined);

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                StorageCredentialID: 'cred-missing',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('BOOTSTRAP_FAILED');
            expect(result.Message).toContain("Credential with ID 'cred-missing' was not found");
        });
    });

    describe('Multi-Stripe Inspection (Msg 3132 Prevention)', () => {
        it('passes ALL stripes in RESTORE HEADERONLY and RESTORE FILELISTONLY', async () => {
            const stripes = [
                'https://storage.blob.core.windows.net/backups/stripe1.bak',
                'https://storage.blob.core.windows.net/backups/stripe2.bak',
                'https://storage.blob.core.windows.net/backups/stripe3.bak',
            ];
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: stripes.join(', '),
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);
            expect(result.Success).toBe(true);

            const headerSql = mockSql.executedSql.find(s => s.includes('RESTORE HEADERONLY'));
            expect(headerSql).toBeDefined();
            expect(headerSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe1.bak'");
            expect(headerSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe2.bak'");
            expect(headerSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe3.bak'");

            const fileListSql = mockSql.executedSql.find(s => s.includes('RESTORE FILELISTONLY'));
            expect(fileListSql).toBeDefined();
            expect(fileListSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe1.bak'");
            expect(fileListSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe2.bak'");
            expect(fileListSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe3.bak'");
        });
    });

    describe('Staging database safety', () => {
        it('refuses to restore over an existing database and never uses WITH REPLACE', async () => {
            mockSql = createMockSqlExecutor({ stagingDbExists: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Prod',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Database [MJ_Prod] already exists');
            expect(mockSql.executedSql.some(s => s.includes('RESTORE DATABASE'))).toBe(false);
            // The failure happened before any restore, so nothing is dropped.
            expect(mockSql.executedSql.some(s => s.includes('DROP DATABASE'))).toBe(false);
        });

        it('returns the staging database name on the caller-supplied param as Both, never as a duplicate', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_TestDB',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const staging = result.Params?.filter(p => p.Name === 'StagingDatabaseName') ?? [];
            expect(staging).toHaveLength(1);
            expect(staging[0].Type).toBe('Both');
            expect(staging[0].Value).toBe('MJ_Staging_TestDB');
            expect(result.Params?.filter(p => p.Name === 'TotalRowsTransferred')).toHaveLength(1);
        });

        it('restores without REPLACE once the name is known to be free', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_TestDB',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const restoreSql = mockSql.executedSql.find(s => s.includes('RESTORE DATABASE [MJ_Staging_TestDB]'));
            expect(restoreSql).toBeDefined();
            expect(restoreSql).not.toContain('REPLACE');
        });
    });

    describe('Fast Local In-Engine ETL (one atomic batch per table)', () => {
        const findLoadBatch = () => mockSql.executedSql.find(s => s.includes('MERGE INTO [raw_erp].[Customer] WITH (TABLOCK)'));

        it('loads via MERGE ... OUTPUT inside a single BEGIN/COMMIT batch and seeds record maps from the captured keys', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_TestDB',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const batch = findLoadBatch();
            expect(batch).toBeDefined();

            // Transaction control lives INSIDE the batch, so every statement shares one connection.
            expect(batch).toContain('BEGIN TRANSACTION;');
            expect(batch).toContain('COMMIT TRANSACTION;');
            expect(batch).toContain('IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;');
            expect(mockSql.executedSql.filter(s => s.trim() === 'BEGIN TRANSACTION;')).toHaveLength(0);

            // Generated target key + integration bookkeeping, never the invented columns.
            expect(batch).toContain('NEWID() AS [ID]');
            expect(batch).not.toContain('NEWSEQUENTIALID()');
            expect(batch).not.toContain('[SourceRecordID]');
            expect(batch).not.toContain('[SourceObject]');
            expect(batch).not.toContain('[SyncedAt]');
            expect(batch).toContain("N'Active' AS [__mj_integration_SyncStatus]");
            expect(batch).toContain('@RestoreTimestamp AS [__mj_integration_LastSyncedAt]');
            // The watermark column comes from MJ: Integration Objects, where the engine reads it.
            expect(mockGetCompanyIntegrationObjectFn).toHaveBeenCalledWith('ci-001', 'sales.Customer');
            expect(batch).toContain('CAST(s.[ModifiedAt] AS NVARCHAR(255)) AS [__mj_integration_LastSeenModifiedValue]');
            expect(batch).toContain('[MJ_Staging_TestDB].[sales].[Customer] s WITH (NOLOCK)');

            // The record map pairs the generated key with the source key of the same row via OUTPUT.
            expect(batch).toContain('ISNULL(CAST(s.[CustomerID] AS NVARCHAR(450)), N\'\') AS [__MJExternalID]');
            expect(batch).toContain('OUTPUT CAST(inserted.[ID] AS NVARCHAR(750)), src.[__MJExternalID]');
            expect(batch).toContain('INSERT INTO [__mj].[CompanyIntegrationRecordMap]');
            expect(batch).not.toContain('[Company Integration Record Maps]');
            expect(batch).toContain("'ci-001'");
            expect(batch).toContain("'entity-cust-001'");
            expect(batch).toContain('SELECT COUNT_BIG(*) AS RowsInserted FROM #MJRecordMap');

            expect(result.Message).toContain('1,500 rows');
            expect(mockInvalidateEntityCachesFn).toHaveBeenCalledWith('Customer');
        });

        it('seeds LastSeenModifiedValue from the shared catalog when no per-connection object exists', async () => {
            mockGetCompanyIntegrationObjectFn.mockReturnValue(undefined);
            mockGetIntegrationObjectFn.mockImplementation((integrationID: string, name: string) =>
                integrationID === 'int-001' && name === 'sales.Customer'
                    ? { ID: 'obj-shared', Name: 'sales.Customer', IncrementalWatermarkField: 'ModifiedAt' }
                    : undefined);

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_TestDB',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(findLoadBatch()).toContain('CAST(s.[ModifiedAt] AS NVARCHAR(255)) AS [__mj_integration_LastSeenModifiedValue]');
        });

        it('joins composite source keys with | exactly as the connector builds external IDs', async () => {
            mockSql = createMockSqlExecutor({ compositePk: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(findLoadBatch()).toContain("ISNULL(CAST(s.[CustomerID] AS NVARCHAR(450)), N'') + N'|' + ISNULL(CAST(s.[TenantID] AS NVARCHAR(450)), N'') AS [__MJExternalID]");
        });

        it('fails clearly when the target entity has a composite primary key', async () => {
            mockEntityByIDFn = vi.fn().mockReturnValue({
                ID: 'entity-cust-001',
                Name: 'Customer',
                SchemaName: 'raw_erp',
                BaseTable: 'Customer',
                AllowDirectSQLInsert: true,
                FirstPrimaryKey: { Name: 'TenantID' },
                PrimaryKeys: [{ Name: 'TenantID' }, { Name: 'CustomerID' }],
            });

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('composite primary key');
        });

        it('fails clearly when record maps do not sanction direct SQL insert', async () => {
            mockEntityByNameFn = vi.fn().mockReturnValue({
                Name: 'MJ: Company Integration Record Maps',
                SchemaName: '__mj',
                BaseTable: 'CompanyIntegrationRecordMap',
                AllowDirectSQLInsert: false,
                AllowDirectSQLDelete: false,
            });

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.Message).toContain("'MJ: Company Integration Record Maps' does not have AllowDirectSQLInsert enabled");
        });

        it('executes chunked ETL when totalRows exceeds BatchSize and PK is integer', async () => {
            mockSql = createMockSqlExecutor({ totalRows: 1200000, pkType: 'bigint' });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                BatchSize: 500000,
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const chunkedSql = mockSql.executedSql.find(s => s.includes('WHILE @LastID < @MaxID'));
            expect(chunkedSql).toBeDefined();
            expect(chunkedSql).toContain('@ChunkSize BIGINT = 500000');
            // Pages are bounded by row count (TOP n keys after the last one), not by key range, so
            // sparse identity/snowflake keys cost rows / BatchSize iterations, never (max - min) / BatchSize.
            expect(chunkedSql).toContain('SELECT TOP (@ChunkSize) [CustomerID] FROM [MJ_Staging_');
            expect(chunkedSql).toContain('WHERE s.[CustomerID] > @LastID AND s.[CustomerID] <= @NextID');
            expect(chunkedSql).not.toContain('@CurrentID + @ChunkSize');
            expect(chunkedSql).toContain('MERGE INTO [raw_erp].[Customer] WITH (TABLOCK)');
            expect(chunkedSql).toContain('NEWID()');
            expect(chunkedSql).not.toContain('NEWSEQUENTIALID()');
        });

        it('falls back to single set-based INSERT when PK is non-integer (e.g. uniqueidentifier) even if totalRows > BatchSize', async () => {
            mockSql = createMockSqlExecutor({ totalRows: 1200000, pkType: 'uniqueidentifier' });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                BatchSize: 500000,
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const chunkedSql = mockSql.executedSql.find(s => s.includes('WHILE @LastID < @MaxID'));
            expect(chunkedSql).toBeUndefined(); // Must NOT chunk on UUID PK

            const singleSql = mockSql.executedSql.find(s => s.includes('MERGE INTO [raw_erp].[Customer] WITH (TABLOCK)'));
            expect(singleSql).toBeDefined();
        });

        it('falls back to single set-based INSERT when composite PK exists', async () => {
            mockSql = createMockSqlExecutor({ totalRows: 1200000, pkType: 'int', compositePk: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                BatchSize: 500000,
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const chunkedSql = mockSql.executedSql.find(s => s.includes('WHILE @LastID < @MaxID'));
            expect(chunkedSql).toBeUndefined(); // Must NOT chunk on composite PK
        });
    });

    describe('Re-run Safety & TruncateTargetBeforeLoad', () => {
        it('fails with informative error when target table has rows and TruncateTargetBeforeLoad is false', async () => {
            mockSql = createMockSqlExecutor({ targetHasRows: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                TruncateTargetBeforeLoad: false,
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('BOOTSTRAP_FAILED');
            expect(result.Message).toContain("Target table '[raw_erp].[Customer]' already contains data and 'TruncateTargetBeforeLoad' is false");
        });

        it('truncates target table and clears record maps when TruncateTargetBeforeLoad is true and target has rows', async () => {
            mockSql = createMockSqlExecutor({ targetHasRows: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                TruncateTargetBeforeLoad: true,
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const batch = mockSql.executedSql.find(s => s.includes('TRUNCATE TABLE [raw_erp].[Customer]'));
            expect(batch).toBeDefined();
            // Truncate, record-map clear and the load are one transaction in one batch.
            expect(batch).toContain("DELETE FROM [__mj].[CompanyIntegrationRecordMap] WHERE CompanyIntegrationID = 'ci-001' AND EntityID = 'entity-cust-001'");
            expect(batch).toContain('MERGE INTO [raw_erp].[Customer]');
            expect(batch?.indexOf('BEGIN TRANSACTION;')).toBeLessThan(batch!.indexOf('TRUNCATE TABLE'));
        });

        it('refuses a re-run that must clear record maps when the entity does not sanction direct SQL delete', async () => {
            mockSql = createMockSqlExecutor({ targetHasRows: true });
            action.CustomDatabaseProvider = mockSql.executor;
            mockEntityByNameFn = vi.fn().mockReturnValue({
                Name: 'MJ: Company Integration Record Maps',
                SchemaName: '__mj',
                BaseTable: 'CompanyIntegrationRecordMap',
                AllowDirectSQLInsert: true,
                AllowDirectSQLDelete: false,
            });

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                TruncateTargetBeforeLoad: true,
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('AllowDirectSQLDelete');
        });
    });

    describe('Data Access Rule (AllowDirectSQLInsert)', () => {
        it('fails with clear error if target entity has AllowDirectSQLInsert = false', async () => {
            mockEntityByIDFn = vi.fn().mockImplementation((id: string) => {
                if (id === 'entity-cust-001') {
                    return {
                        ID: 'entity-cust-001',
                        Name: 'Customer',
                        SchemaName: 'raw_erp',
                        BaseTable: 'Customer',
                        AllowDirectSQLInsert: false, // Disallowed!
                        FirstPrimaryKey: { Name: 'ID' },
                    };
                }
                return undefined;
            });

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('BOOTSTRAP_FAILED');
            expect(result.Message).toContain('AllowDirectSQLInsert enabled');
        });
    });

    describe('Detached progress reporting (ProgressRunID)', () => {
        beforeEach(() => {
            progressCalls = [];
        });

        it('reports no progress at all when no ProgressRunID is supplied', async () => {
            await action['InternalRunAction'](makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
            }));
            expect(progressCalls).toHaveLength(0);
        });

        it('opens the run on the company integration, reports every stage, and completes with the outputs', async () => {
            const result = await action['InternalRunAction'](makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_TestDB',
                ProgressRunID: 'bootstrap-run-1',
            }));
            expect(result.Success).toBe(true);

            const manifest = progressCalls[0].Args[0] as { runID: string; companyIntegrationID: string; runKind: string };
            expect(progressCalls[0].Method).toBe('constructor');
            expect(manifest).toMatchObject({ runID: 'bootstrap-run-1', companyIntegrationID: 'ci-001', runKind: 'Other' });
            expect(progressCalls[1].Method).toBe('RunStart');

            const stages = progressCalls.filter(c => c.Method === 'StageStart').map(c => c.Args[0]);
            expect(stages).toEqual(['Credential', 'Inspect', 'Restore', 'Load Customer', 'Watermarks', 'Cleanup']);
            const loadDone = progressCalls.find(c => c.Method === 'StageComplete' && c.Args[0] === 'Load Customer');
            expect(loadDone?.Args[1]).toEqual({ processed: 1500, succeeded: 1500 });

            const summary = progressCalls.find(c => c.Method === 'Emit');
            expect(summary?.Args[0]).toBe('stage.complete');
            expect(summary?.Args[1]).toMatchObject({
                stage: 'Summary',
                data: { BackupStartDate: '2026-10-26T01:00:00.000Z', StagingDatabaseName: 'MJ_Staging_TestDB', TablesProcessed: 1, TotalRowsTransferred: 1500, StagingDatabaseDropped: 1 },
            });
            expect(progressCalls[progressCalls.length - 1].Method).toBe('Complete');
            expect(progressCalls.some(c => c.Method === 'Fail')).toBe(false);
        });

        it('terminates the run as failed, attributed to the running stage, when a load fails', async () => {
            mockSql = createMockSqlExecutor({ failOnInsert: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const result = await action['InternalRunAction'](makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                ProgressRunID: 'bootstrap-run-2',
            }));
            expect(result.Success).toBe(false);

            const stageError = progressCalls.find(c => c.Method === 'StageError');
            expect(stageError?.Args[0]).toBe('Load Customer');
            expect(String(stageError?.Args[1])).toContain('Target table disk full error');
            expect(progressCalls[progressCalls.length - 1].Method).toBe('Fail');
            expect(progressCalls.some(c => c.Method === 'Complete')).toBe(false);
        });

        it('terminates the run on a parameter failure so a detached caller is not left waiting', async () => {
            const result = await action['InternalRunAction'](makeParams({
                CompanyIntegrationID: 'ci-001',
                ProgressRunID: 'bootstrap-run-3',
            }));
            expect(result.ResultCode).toBe('MISSING_PARAMETER');
            expect(progressCalls.map(c => c.Method)).toEqual(['constructor', 'RunStart', 'StageError', 'Fail']);
        });
    });

    describe('Storage credential handling', () => {
        it('creates or alters the credential with this run\'s token and keeps the secret out of SQL logging', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'sv=2024&sig=secret',
            });

            await action['InternalRunAction'](params);

            const credentialCall = mockSql.mockExecuteSql.mock.calls.find(call => String(call[0]).includes('CREATE CREDENTIAL'));
            expect(credentialCall).toBeDefined();
            const [sql, , options] = credentialCall!;
            // An existing credential (left by an earlier run) gets THIS token instead of being kept.
            expect(sql).toContain('ALTER CREDENTIAL [https://storage.blob.core.windows.net/backups]');
            expect(sql).toContain('CREATE CREDENTIAL [https://storage.blob.core.windows.net/backups]');
            expect(sql).not.toContain('IF NOT EXISTS');
            expect(options).toMatchObject({ ignoreLogging: true, isMutation: true });
        });

        it('drops the credential when the run fails before the restore (bad SAS token at HEADERONLY)', async () => {
            mockSql = createMockSqlExecutor({ failOnHeader: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'bad-token',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('failed to authenticate');
            expect(mockSql.executedSql.some(s => s.includes('DROP CREDENTIAL [https://storage.blob.core.windows.net/backups]'))).toBe(true);
            // No restore was started, so nothing is dropped.
            expect(mockSql.executedSql.some(s => s.includes('DROP DATABASE'))).toBe(false);
        });

        it('can drop a staging database left in RESTORING state by a failed restore', async () => {
            mockSql = createMockSqlExecutor({ failOnInsert: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_FailDb',
            });

            await action['InternalRunAction'](params);

            const dropSql = mockSql.executedSql.find(s => s.includes('DROP DATABASE [MJ_Staging_FailDb]'));
            expect(dropSql).toContain("state_desc = 'ONLINE'");
            expect(dropSql?.indexOf("state_desc = 'ONLINE'")).toBeLessThan(dropSql!.indexOf('SET SINGLE_USER'));
        });
    });

    describe('Watermark Seeding (Zero-Gap Invariant)', () => {
        it('does not seed a map whose table was skipped, so its pre-backup rows are not lost', async () => {
            mockRunViewFn = vi.fn().mockResolvedValue({
                Success: true,
                Results: [
                    { ID: 'map-cust-001', CompanyIntegrationID: 'ci-001', ExternalObjectName: 'sales.Customer', EntityID: 'entity-cust-001', SyncEnabled: true, SyncDirection: 'Pull', Priority: 1 },
                    { ID: 'map-orphan-002', CompanyIntegrationID: 'ci-001', ExternalObjectName: 'sales.Orphan', EntityID: 'entity-missing', SyncEnabled: true, SyncDirection: 'Pull', Priority: 2 },
                ],
            });

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(mockWatermarkUpdateFn).toHaveBeenCalledTimes(1);
            expect(mockWatermarkUpdateFn).toHaveBeenCalledWith('map-cust-001', expect.any(String), expect.anything(), 'Pull');
        });

        it('seeds WatermarkService with BackupStartDate for each processed EntityMap', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(mockWatermarkUpdateFn).toHaveBeenCalledWith(
                'map-cust-001',
                '2026-10-26T01:00:00.000Z',
                expect.anything(),
                'Pull'
            );
        });
    });

    describe('Post-Restore Cleanup Options', () => {
        it('drops staging database and credential by default (DropStagingDbOnComplete = true)', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_DropMe',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const dropDbSql = mockSql.executedSql.find(s => s.includes('DROP DATABASE [MJ_Staging_DropMe]'));
            expect(dropDbSql).toBeDefined();
            expect(dropDbSql).toContain('ALTER DATABASE [MJ_Staging_DropMe] SET SINGLE_USER WITH ROLLBACK IMMEDIATE');

            const dropCredSql = mockSql.executedSql.find(s => s.includes('DROP CREDENTIAL'));
            expect(dropCredSql).toBeDefined();

            const droppedParam = result.Params?.find(p => p.Name === 'StagingDatabaseDropped');
            expect(droppedParam?.Value).toBe(1);
        });

        it('retains staging database and credential when DropStagingDbOnComplete = false', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_KeepMe',
                DropStagingDbOnComplete: 'false',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const dropDbSql = mockSql.executedSql.find(s => s.includes('DROP DATABASE [MJ_Staging_KeepMe]'));
            expect(dropDbSql).toBeUndefined();

            const droppedParam = result.Params?.find(p => p.Name === 'StagingDatabaseDropped');
            expect(droppedParam?.Value).toBe(0);
        });
    });

    describe('Local Disk File Support', () => {
        it('correctly identifies URLs vs local disk paths via IsUrl', () => {
            expect(action.IsUrl('https://account.blob.core.windows.net/container/backup.bak')).toBe(true);
            expect(action.IsUrl('http://storage.local/container/backup.bak')).toBe(true);
            expect(action.IsUrl('C:\\backups\\AdventureWorks.bak')).toBe(false);
            expect(action.IsUrl('/var/opt/mssql/backup/AdventureWorks.bak')).toBe(false);
            expect(action.IsUrl('D:/sql_backups/stripe1.bak')).toBe(false);
        });

        it('executes RESTORE HEADERONLY and FILELISTONLY using FROM DISK for local files', async () => {
            const header = await action['inspectBackupHeader'](mockSql.executor, ['/var/opt/mssql/backup/mydb.bak'], makeUser());
            expect(header.DatabaseName).toBe('AdventureWorks_Prod');

            const headerSql = mockSql.executedSql.find(s => s.includes('RESTORE HEADERONLY'));
            expect(headerSql).toContain("FROM\n    DISK = N'/var/opt/mssql/backup/mydb.bak';");

            const fileList = await action['inspectBackupFileList'](mockSql.executor, ['/var/opt/mssql/backup/mydb.bak'], makeUser());
            expect(fileList).toHaveLength(2);

            const fileListSql = mockSql.executedSql.find(s => s.includes('RESTORE FILELISTONLY'));
            expect(fileListSql).toContain("FROM\n    DISK = N'/var/opt/mssql/backup/mydb.bak';");
        });

        it('formats multi-stripe local restores using DISK clause', async () => {
            const runner = await action['createLongRunningRunner'](mockSql.executor, makeUser());
            await action['executeDatabaseRestore'](
                runner,
                'StagingDb',
                ['C:\\backups\\part1.bak', 'C:\\backups\\part2.bak'],
                ["MOVE N'Data' TO N'C:\\data\\StagingDb.mdf'"]
            );

            const restoreSql = mockSql.executedSql.find(s => s.includes('RESTORE DATABASE [StagingDb]'));
            expect(restoreSql).toBeDefined();
            expect(restoreSql).toContain("DISK = N'C:\\backups\\part1.bak'");
            expect(restoreSql).toContain("DISK = N'C:\\backups\\part2.bak'");
            expect(restoreSql).not.toContain('URL =');
        });

        it('formats mixed stripe restores correctly', async () => {
            const runner = await action['createLongRunningRunner'](mockSql.executor, makeUser());
            await action['executeDatabaseRestore'](
                runner,
                'StagingDb',
                ['https://blob.core.windows.net/b/part1.bak', 'C:\\backups\\part2.bak'],
                ["MOVE N'Data' TO N'C:\\data\\StagingDb.mdf'"]
            );

            const restoreSql = mockSql.executedSql.find(s => s.includes('RESTORE DATABASE [StagingDb]'));
            expect(restoreSql).toBeDefined();
            expect(restoreSql).toContain("URL = N'https://blob.core.windows.net/b/part1.bak'");
            expect(restoreSql).toContain("DISK = N'C:\\backups\\part2.bak'");
        });

        it('executes full action end-to-end with local disk file without requiring credentials', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: '/var/opt/mssql/backup/AdventureWorks2022.bak',
                StagingDatabaseName: 'MJ_Staging_LocalTest',
                DropStagingDbOnComplete: 'true',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
            expect(result.Message).toContain('Successfully bootstrapped 1 table(s)');

            // Credential resolution must NOT have been called
            expect(mockGetCredentialByIdFn).not.toHaveBeenCalled();
            expect(mockCredentialConfigFn).not.toHaveBeenCalled();

            // SQL must NOT contain CREATE CREDENTIAL or DROP CREDENTIAL
            const credSql = mockSql.executedSql.find(s => s.includes('CREDENTIAL'));
            expect(credSql).toBeUndefined();

            // SQL must contain RESTORE with FROM DISK
            const restoreSql = mockSql.executedSql.find(s => s.includes('RESTORE DATABASE [MJ_Staging_LocalTest]'));
            expect(restoreSql).toBeDefined();
            expect(restoreSql).toContain("DISK = N'/var/opt/mssql/backup/AdventureWorks2022.bak'");

            // Staging database should still be dropped
            const dropDbSql = mockSql.executedSql.find(s => s.includes('DROP DATABASE [MJ_Staging_LocalTest]'));
            expect(dropDbSql).toBeDefined();
        });
    });

    describe('Error Handling and Rollback Cleanup', () => {
        it('attempts to clean up staging database when an error occurs during ETL', async () => {
            mockSql = createMockSqlExecutor({ failOnInsert: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_FailDb',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('BOOTSTRAP_FAILED');
            expect(result.Message).toContain('Target table disk full error');

            // Verify fail-safe drop was invoked
            const dropDbSql = mockSql.executedSql.find(s => s.includes('DROP DATABASE [MJ_Staging_FailDb]'));
            expect(dropDbSql).toBeDefined();
        });
    });
});

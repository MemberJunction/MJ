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

        if (sql.includes('RESTORE HEADERONLY')) {
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

    describe('Fast Local In-Engine ETL with NEWID() and TABLOCK', () => {
        it('uses NEWID() (never NEWSEQUENTIALID()) in SELECT and generates Record Maps insert', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_TestDB',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);

            // Assert transaction commands were executed
            expect(mockSql.executedSql.some(s => s.includes('BEGIN TRANSACTION'))).toBe(true);
            expect(mockSql.executedSql.some(s => s.includes('COMMIT TRANSACTION'))).toBe(true);

            // Assert ETL insert SQL
            const etlSql = mockSql.executedSql.find(s => s.includes('INSERT INTO [raw_erp].[Customer] WITH (TABLOCK)'));
            expect(etlSql).toBeDefined();
            expect(etlSql).toContain('NEWID()');
            expect(etlSql).not.toContain('NEWSEQUENTIALID()');
            expect(etlSql).not.toContain('[SourceRecordID]');
            expect(etlSql).not.toContain('[SourceObject]');
            expect(etlSql).not.toContain('[SyncedAt]');
            expect(etlSql).toContain('[__mj_integration_SyncStatus]');
            expect(etlSql).toContain('[__mj_integration_LastSyncedAt]');
            expect(etlSql).toContain('[raw_erp].[Customer]');
            expect(etlSql).toContain('[MJ_Staging_TestDB].[sales].[Customer] s WITH (NOLOCK)');

            // Assert Record Maps insert
            const recordMapsSql = mockSql.executedSql.find(s => s.includes('INSERT INTO __mj.[Company Integration Record Maps]'));
            expect(recordMapsSql).toBeDefined();
            expect(recordMapsSql).toContain("'ci-001'");
            expect(recordMapsSql).toContain("'entity-cust-001'");
            expect(recordMapsSql).toContain('CAST(t.[ID] AS NVARCHAR(750))');

            // Assert RunView cache was invalidated for target entity
            expect(mockInvalidateEntityCachesFn).toHaveBeenCalledWith('Customer');
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
            const chunkedSql = mockSql.executedSql.find(s => s.includes('WHILE @CurrentID <= @MaxID'));
            expect(chunkedSql).toBeDefined();
            expect(chunkedSql).toContain('@ChunkSize BIGINT = 500000');
            expect(chunkedSql).toContain('s.[CustomerID] >= @CurrentID AND s.[CustomerID] < @CurrentID + @ChunkSize');
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
            const chunkedSql = mockSql.executedSql.find(s => s.includes('WHILE @CurrentID <= @MaxID'));
            expect(chunkedSql).toBeUndefined(); // Must NOT chunk on UUID PK

            const singleSql = mockSql.executedSql.find(s => s.includes('INSERT INTO [raw_erp].[Customer] WITH (TABLOCK)'));
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
            const chunkedSql = mockSql.executedSql.find(s => s.includes('WHILE @CurrentID <= @MaxID'));
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
            const truncateSql = mockSql.executedSql.find(s => s.includes('TRUNCATE TABLE [raw_erp].[Customer]'));
            expect(truncateSql).toBeDefined();

            const clearMapsSql = mockSql.executedSql.find(s => s.includes('DELETE FROM __mj.[Company Integration Record Maps]'));
            expect(clearMapsSql).toBeDefined();
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

    describe('Watermark Seeding (Zero-Gap Invariant)', () => {
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
            const header = await action.readBackupHeader(mockSql.executor, '/var/opt/mssql/backup/mydb.bak', makeUser());
            expect(header.DatabaseName).toBe('AdventureWorks_Prod');

            const headerSql = mockSql.executedSql.find(s => s.includes('RESTORE HEADERONLY'));
            expect(headerSql).toContain("FROM\n    DISK = N'/var/opt/mssql/backup/mydb.bak';");

            const fileList = await action.readBackupFileList(mockSql.executor, '/var/opt/mssql/backup/mydb.bak', makeUser());
            expect(fileList).toHaveLength(2);

            const fileListSql = mockSql.executedSql.find(s => s.includes('RESTORE FILELISTONLY'));
            expect(fileListSql).toContain("FROM\n    DISK = N'/var/opt/mssql/backup/mydb.bak';");
        });

        it('formats multi-stripe local restores using DISK clause', async () => {
            await action['executeDatabaseRestore'](
                mockSql.executor,
                'StagingDb',
                ['C:\\backups\\part1.bak', 'C:\\backups\\part2.bak'],
                ["MOVE N'Data' TO N'C:\\data\\StagingDb.mdf'"],
                makeUser()
            );

            const restoreSql = mockSql.executedSql.find(s => s.includes('RESTORE DATABASE [StagingDb]'));
            expect(restoreSql).toBeDefined();
            expect(restoreSql).toContain("DISK = N'C:\\backups\\part1.bak'");
            expect(restoreSql).toContain("DISK = N'C:\\backups\\part2.bak'");
            expect(restoreSql).not.toContain('URL =');
        });

        it('formats mixed stripe restores correctly', async () => {
            await action['executeDatabaseRestore'](
                mockSql.executor,
                'StagingDb',
                ['https://blob.core.windows.net/b/part1.bak', 'C:\\backups\\part2.bak'],
                ["MOVE N'Data' TO N'C:\\data\\StagingDb.mdf'"],
                makeUser()
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

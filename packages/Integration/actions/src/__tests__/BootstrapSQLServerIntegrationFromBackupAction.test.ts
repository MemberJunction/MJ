import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { RunActionParams, ActionParam } from '@memberjunction/actions-base';
import {
    BootstrapSQLServerIntegrationFromBackupAction,
    ISqlExecutor,
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
            public RunView(...args: unknown[]) {
                return mockRunViewFn(...args);
            }
        },
        Metadata: class {
            public static Provider = {};
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
}

function createMockSqlExecutor(options: MockSqlOptions = {}): {
    executor: ISqlExecutor;
    executedSql: string[];
    mockExecuteSql: ReturnType<typeof vi.fn>;
} {
    const executedSql: string[] = [];
    const mockExecuteSql = vi.fn().mockImplementation((sql: string) => {
        executedSql.push(sql);

        if (options.failOnInsert && sql.includes('INSERT INTO')) {
            return Promise.reject(new Error('Target table disk full error'));
        }

        if (sql.includes('RESTORE HEADERONLY')) {
            return Promise.resolve([{
                BackupStartDate: new Date('2026-10-26T01:00:00.000Z'),
                BackupFinishDate: new Date('2026-10-26T04:00:00.000Z'),
                DatabaseName: 'AdventureWorks_Prod',
                FirstLSN: '100000000001',
                LastLSN: '100000000050',
                CheckpointLSN: '100000000020',
            }]);
        }

        if (sql.includes('RESTORE FILELISTONLY')) {
            const files: SqlBackupFileListEntry[] = [
                { LogicalName: 'AdventureWorks_Data', PhysicalName: 'D:\\Data\\AW.mdf', Type: 'D' },
                { LogicalName: 'AdventureWorks_Log', PhysicalName: 'L:\\Log\\AW.ldf', Type: 'L' },
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
            const columns: SqlColumnInfo[] = [
                { COLUMN_NAME: 'CustomerID', DATA_TYPE: 'int', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: 'CustomerName', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'YES' },
                { COLUMN_NAME: 'EmailAddress', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'YES' },
                { COLUMN_NAME: 'ID', DATA_TYPE: 'uniqueidentifier', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: 'SourceRecordID', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: 'SourceObject', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: 'SyncedAt', DATA_TYPE: 'datetimeoffset', IS_NULLABLE: 'NO' },
            ];
            return Promise.resolve(columns);
        }

        if (sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) {
            return Promise.resolve([{ COLUMN_NAME: 'CustomerID' }]);
        }

        if (sql.includes('sys.partitions')) {
            return Promise.resolve([{ TotalRows: options.totalRows ?? 1500 }]);
        }

        return Promise.resolve([]);
    });

    const executor: ISqlExecutor = {
        ExecuteSQL: mockExecuteSql,
    };

    return { executor, executedSql, mockExecuteSql };
}

// --- Tests ---

describe('BootstrapSQLServerIntegrationFromBackupAction', () => {
    let action: BootstrapSQLServerIntegrationFromBackupAction;
    let mockSql: ReturnType<typeof createMockSqlExecutor>;

    beforeEach(() => {
        action = new BootstrapSQLServerIntegrationFromBackupAction();
        mockSql = createMockSqlExecutor();
        action.CustomSqlExecutor = mockSql.executor;

        mockWatermarkUpdateFn = vi.fn().mockResolvedValue(undefined);
        mockCredentialConfigFn = vi.fn().mockResolvedValue(undefined);
        mockGetCredentialByIdFn = vi.fn();
        mockGetCredentialFn = vi.fn();

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

        it('returns BOOTSTRAP_FAILED when neither SasToken nor StorageCredentialID is provided', async () => {
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

    describe('Staging Restore & Header Extraction', () => {
        it('executes RESTORE HEADERONLY and extracts BackupStartDate correctly', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const headerSql = mockSql.executedSql.find(s => s.includes('RESTORE HEADERONLY'));
            expect(headerSql).toBeDefined();

            const backupStartDateParam = result.Params?.find(p => p.Name === 'BackupStartDate');
            expect(backupStartDateParam?.Value).toBe('2026-10-26T01:00:00.000Z');
        });

        it('constructs RESTORE DATABASE statement with correct MOVE clauses and multiple striped URLs', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/stripe1.bak, https://storage.blob.core.windows.net/backups/stripe2.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_TestDB',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const restoreSql = mockSql.executedSql.find(s => s.includes('RESTORE DATABASE [MJ_Staging_TestDB]'));
            expect(restoreSql).toBeDefined();
            expect(restoreSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe1.bak'");
            expect(restoreSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe2.bak'");
            expect(restoreSql).toContain("MOVE N'AdventureWorks_Data' TO N'F:\\SQLData\\MJ_Staging_TestDB_data.mdf'");
            expect(restoreSql).toContain("MOVE N'AdventureWorks_Log' TO N'L:\\SQLLog\\MJ_Staging_TestDB_log.ldf'");
            expect(restoreSql).toContain('REPLACE');
            expect(restoreSql).toContain('RECOVERY');
        });
    });

    describe('Fast Local In-Engine ETL with TABLOCK', () => {
        it('generates and executes minimally-logged INSERT INTO Target WITH (TABLOCK) statement', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
                StagingDatabaseName: 'MJ_Staging_TestDB',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            const etlSql = mockSql.executedSql.find(s => s.includes('INSERT INTO [raw_erp].[Customer] WITH (TABLOCK)'));
            expect(etlSql).toBeDefined();
            expect(etlSql).toContain('NEWSEQUENTIALID()');
            expect(etlSql).toContain("ISNULL(CAST(s.[CustomerID] AS NVARCHAR(450)), N'')");
            expect(etlSql).toContain("N'Customer'");
            expect(etlSql).toContain('@RestoreTimestamp');
            expect(etlSql).toContain('[raw_erp].[Customer]');
            expect(etlSql).toContain('[MJ_Staging_TestDB].[sales].[Customer] s WITH (NOLOCK)');
        });

        it('executes chunked ETL when totalRows exceeds BatchSize and numeric PK exists', async () => {
            mockSql = createMockSqlExecutor({ totalRows: 1200000 });
            action.CustomSqlExecutor = mockSql.executor;

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

    describe('Error Handling and Rollback Cleanup', () => {
        it('attempts to clean up staging database when an error occurs during ETL', async () => {
            mockSql = createMockSqlExecutor({ failOnInsert: true });
            action.CustomSqlExecutor = mockSql.executor;

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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { SqlBackupFileListEntry, SqlColumnInfo } from '../BootstrapSQLServerIntegrationFromBackupAction.js';
import { RestoreSQLServerBackupToStagingAction } from '../RestoreSQLServerBackupToStagingAction.js';
import { LoadSQLServerIntegrationFromStagingAction } from '../LoadSQLServerIntegrationFromStagingAction.js';
import { DropSQLServerStagingDatabaseAction } from '../DropSQLServerStagingDatabaseAction.js';

// --- Mocks (same set as the bootstrap action's tests) ---

let mockWatermarkUpdateFn: ReturnType<typeof vi.fn>;
let mockRunViewFn: ReturnType<typeof vi.fn>;
let mockEntityByIDFn: ReturnType<typeof vi.fn>;
let mockEntityByNameFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/integration-engine', () => {
    return {
        WatermarkService: class {
            public Update(...args: unknown[]) {
                return mockWatermarkUpdateFn(...args);
            }
        },
    };
});

/** Every call made on the progress emitter, in order, so tests can assert the stream a detached run sees. */
let progressCalls: Array<{ Method: string; Args: unknown[] }> = [];

vi.mock('@memberjunction/integration-progress-artifacts', () => {
    class FakeEmitter {
        public IsResumed = false;
        constructor(manifest: unknown) { progressCalls.push({ Method: 'constructor', Args: [manifest] }); }
        public RunStart(...args: unknown[]) { progressCalls.push({ Method: 'RunStart', Args: args }); }
        public StageStart(...args: unknown[]) { progressCalls.push({ Method: 'StageStart', Args: args }); }
        public StageComplete(...args: unknown[]) { progressCalls.push({ Method: 'StageComplete', Args: args }); }
        public StageError(...args: unknown[]) { progressCalls.push({ Method: 'StageError', Args: args }); }
        public Heartbeat(...args: unknown[]) { progressCalls.push({ Method: 'Heartbeat', Args: args }); }
        public Emit(...args: unknown[]) { progressCalls.push({ Method: 'Emit', Args: args }); }
        public async Complete(...args: unknown[]) { progressCalls.push({ Method: 'Complete', Args: args }); }
        public async Fail(...args: unknown[]) { progressCalls.push({ Method: 'Fail', Args: args }); }
        public async Flush(...args: unknown[]) { progressCalls.push({ Method: 'Flush', Args: args }); }
    }
    return { IntegrationProgressEmitter: FakeEmitter };
});

vi.mock('@memberjunction/integration-engine-base', () => {
    return {
        IntegrationEngineBase: {
            Instance: {
                Config: () => Promise.resolve(),
                GetCompanyIntegrationObject: (_ciID: string, objectName: string) =>
                    objectName === 'sales.Customer' ? { ID: 'obj-cust', Name: 'sales.Customer', IncrementalWatermarkField: 'ModifiedAt' } : undefined,
                GetIntegrationObject: () => undefined,
                GetCompanyIntegrationByID: () => ({ IntegrationID: 'int-001' }),
            },
        },
    };
});

vi.mock('@memberjunction/credentials', () => {
    return {
        CredentialEngine: {
            Instance: {
                Config: () => Promise.resolve(),
                getCredentialById: () => undefined,
                GetCredential: () => undefined,
            },
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
                InvalidateEntityCaches: () => Promise.resolve(),
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

/** The action's output parameters by name. */
function outputs(result: ActionResultSimple): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const p of result.Params ?? []) {
        if (p.Type === 'Output' || p.Type === 'Both') {
            out[p.Name] = p.Value;
        }
    }
    return out;
}

interface MockSqlOptions {
    stagingDbExists?: boolean;
    failOnRestore?: boolean;
    /** The post-restore access check (`[staging].sys.tables`) fails as the login cannot open the database. */
    failOnStagingAccess?: boolean;
    /** `DB_NAME()` the drop guard sees (default 'MJ_Main'). */
    currentDatabase?: string;
    /** The target's `create_date` in UTC the drop guard sees (default 2026-10-28T12:00Z); null means absent. */
    createdAtUtc?: Date | null;
}

/** SQL text of every call, in order. */
let sqlCalls: string[] = [];

function createMockSqlExecutor(options: MockSqlOptions = {}): DatabaseProviderBase {
    const mockExecuteSql = vi.fn().mockImplementation((sql: string) => {
        const text = sql.trim();
        sqlCalls.push(text);

        if (text.startsWith('RESTORE DATABASE') && options.failOnRestore) {
            return Promise.reject(new Error('RESTORE DATABASE is terminating abnormally'));
        }
        if (sql.includes('].sys.tables')) {
            return options.failOnStagingAccess
                ? Promise.reject(new Error("The server principal \"MJ_Connect\" is not able to access the database \"MJ_Staging_X\" under the current security context."))
                : Promise.resolve([{ TableCount: 12 }]);
        }
        if (sql.includes('SELECT TOP 1 1 AS HasRows')) {
            return Promise.resolve([]);
        }
        if (sql.includes('AS DatabaseId')) {
            return Promise.resolve([{ DatabaseId: options.stagingDbExists ? 7 : null }]);
        }
        if (sql.includes('AS CurrentDatabase')) {
            return Promise.resolve([{ CurrentDatabase: options.currentDatabase ?? 'MJ_Main', CreatedAtUtc: options.createdAtUtc === undefined ? new Date('2026-10-28T12:00:00.000Z') : options.createdAtUtc }]);
        }
        if (sql.includes('COUNT_BIG(*) AS RowsInserted')) {
            return Promise.resolve([{ RowsInserted: 1500 }]);
        }
        if (sql.includes('RESTORE HEADERONLY')) {
            return Promise.resolve([{
                BackupStartDate: new Date('2026-10-01T00:00:00.000Z'),
                BackupFinishDate: new Date('2026-10-01T03:00:00.000Z'),
                DatabaseName: 'AdventureWorks2022',
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
            return Promise.resolve([{ DataPath: '/var/opt/mssql/data', LogPath: '/var/opt/mssql/log' }]);
        }
        if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
            const columns: SqlColumnInfo[] = [
                { COLUMN_NAME: 'CustomerID', DATA_TYPE: 'int', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: 'CustomerName', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'YES' },
                { COLUMN_NAME: 'ModifiedAt', DATA_TYPE: 'datetime2', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: 'ID', DATA_TYPE: 'uniqueidentifier', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: '__mj_integration_SyncStatus', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'NO' },
                { COLUMN_NAME: '__mj_integration_LastSyncedAt', DATA_TYPE: 'datetimeoffset', IS_NULLABLE: 'YES' },
                { COLUMN_NAME: '__mj_integration_LastSeenModifiedValue', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'YES' },
            ];
            return Promise.resolve(columns);
        }
        if (sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) {
            return Promise.resolve([{ COLUMN_NAME: 'CustomerID' }]);
        }
        if (sql.includes('sys.partitions')) {
            return Promise.resolve([{ TotalRows: 1500 }]);
        }
        return Promise.resolve([]);
    });

    const executor = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
    executor.ExecuteSQL = mockExecuteSql;
    executor.EntityByID = (id: string) => mockEntityByIDFn(id);
    executor.EntityByName = (name: string) => mockEntityByNameFn(name);
    return executor;
}

function resetMocks(): void {
    sqlCalls = [];
    progressCalls = [];
    mockWatermarkUpdateFn = vi.fn().mockResolvedValue(undefined);
    mockRunViewFn = vi.fn().mockResolvedValue({
        Success: true,
        Results: [{
            ID: 'map-cust-001',
            CompanyIntegrationID: 'ci-001',
            ExternalObjectName: 'sales.Customer',
            EntityID: 'entity-cust-001',
            SyncEnabled: true,
            SyncDirection: 'Pull',
            Priority: 1,
            Configuration: JSON.stringify({ IncrementalWatermarkField: 'ModifiedAt' }),
        }],
    });
    mockEntityByIDFn = vi.fn().mockImplementation((id: string) => id === 'entity-cust-001'
        ? { ID: 'entity-cust-001', Name: 'Customer', SchemaName: 'raw_erp', BaseTable: 'Customer', AllowDirectSQLInsert: true, FirstPrimaryKey: { Name: 'ID' }, PrimaryKeys: [{ Name: 'ID' }] }
        : undefined);
    mockEntityByNameFn = vi.fn().mockImplementation((name: string) => name === 'MJ: Company Integration Record Maps'
        ? { ID: 'entity-record-maps', Name: name, SchemaName: '__mj', BaseTable: 'CompanyIntegrationRecordMap', AllowDirectSQLInsert: true, AllowDirectSQLDelete: true }
        : undefined);
}

const progressMethods = (): string[] => progressCalls.map(c => c.Method);

// --- Tests ---

describe('RestoreSQLServerBackupToStagingAction', () => {
    let restore: RestoreSQLServerBackupToStagingAction;

    beforeEach(() => {
        resetMocks();
        restore = new RestoreSQLServerBackupToStagingAction();
        restore.CustomDatabaseProvider = createMockSqlExecutor();
    });

    it('Restore action restores into the named staging database and reports header outputs', async () => {
        const r = await restore.Run(makeParams({ CompanyIntegrationID: 'ci-001', BackupUrls: '/var/opt/mssql/backup/x.bak', StagingDatabaseName: 'MJ_Staging_X' }));

        expect(r.Success).toBe(true);
        expect(r.ResultCode).toBe('SUCCESS');
        expect(sqlCalls.some(s => s.startsWith('RESTORE DATABASE [MJ_Staging_X]'))).toBe(true);
        expect(outputs(r).BackupDatabaseName).toBe('AdventureWorks2022');
        expect(outputs(r).BackupStartDate).toBe('2026-10-01T00:00:00.000Z');
        expect(outputs(r).StagingDatabaseName).toBe('MJ_Staging_X');
        expect(outputs(r).ContainerUrl).toBe('');
        expect(sqlCalls.some(s => s.includes('DROP DATABASE'))).toBe(false);
        expect(sqlCalls.some(s => s.includes('MERGE INTO'))).toBe(false);
    });

    it('Restore action refuses a missing StagingDatabaseName', async () => {
        const r = await restore.Run(makeParams({ CompanyIntegrationID: 'ci-001', BackupUrls: '/var/opt/mssql/backup/x.bak' }));

        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('MISSING_PARAMETER');
        expect(r.Message).toContain('StagingDatabaseName');
        expect(sqlCalls).toHaveLength(0);
    });

    it('Restore action cleans up when the restore fails', async () => {
        restore.CustomDatabaseProvider = createMockSqlExecutor({ failOnRestore: true });
        const r = await restore.Run(makeParams({ CompanyIntegrationID: 'ci-001', BackupUrls: '/var/opt/mssql/backup/x.bak', StagingDatabaseName: 'MJ_Staging_X' }));

        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('RESTORE_FAILED');
        expect(sqlCalls.some(s => s.includes('DROP DATABASE [MJ_Staging_X]'))).toBe(true);
    });

    it('Restore action checks the restored database can be opened before reporting the restore complete', async () => {
        const r = await restore.Run(makeParams({ CompanyIntegrationID: 'ci-001', BackupUrls: '/var/opt/mssql/backup/x.bak', StagingDatabaseName: 'MJ_Staging_X' }));

        expect(r.Success).toBe(true);
        const restoreAt = sqlCalls.findIndex(s => s.startsWith('RESTORE DATABASE [MJ_Staging_X]'));
        const checkAt = sqlCalls.findIndex(s => s.includes('[MJ_Staging_X].sys.tables'));
        expect(checkAt).toBeGreaterThan(restoreAt);
    });

    it('Restore action fails with STAGING_NOT_ACCESSIBLE, naming the remedy, and drops the staging database when the login cannot open it', async () => {
        restore.CustomDatabaseProvider = createMockSqlExecutor({ failOnStagingAccess: true });
        const r = await restore.Run(makeParams({ CompanyIntegrationID: 'ci-001', BackupUrls: '/var/opt/mssql/backup/x.bak', StagingDatabaseName: 'MJ_Staging_X', ProgressRunID: 'run-A' }));

        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('STAGING_NOT_ACCESSIBLE');
        expect(r.Message).toContain('Restored [MJ_Staging_X], but the SQL login MJAPI runs with cannot open it');
        expect(r.Message).toContain('not able to access the database');
        expect(r.Message).toContain('CONNECT ANY DATABASE and SELECT ALL USER SECURABLES');
        expect(sqlCalls.some(s => s.includes('DROP DATABASE [MJ_Staging_X]'))).toBe(true);
        const stageError = progressCalls.find(c => c.Method === 'StageError');
        expect(stageError?.Args[0]).toBe('Restore');
        expect(stageError?.Args[2]).toEqual({ code: 'STAGING_NOT_ACCESSIBLE' });
        expect(progressMethods()).not.toContain('Fail');
    });

    it('Restore action reports the restore stage, never completes the run, and flushes the stream', async () => {
        const r = await restore.Run(makeParams({ CompanyIntegrationID: 'ci-001', BackupUrls: '/var/opt/mssql/backup/x.bak', StagingDatabaseName: 'MJ_Staging_X', ProgressRunID: 'run-A' }));

        expect(r.Success).toBe(true);
        expect(progressCalls.some(c => c.Method === 'StageComplete' && c.Args[0] === 'Restore')).toBe(true);
        expect(progressMethods()).not.toContain('Complete');
        expect(progressMethods()).not.toContain('Fail');
        expect(progressMethods().at(-1)).toBe('Flush');
    });

    it('Restore action reports a stage error, never terminates the run, and flushes when the restore fails', async () => {
        restore.CustomDatabaseProvider = createMockSqlExecutor({ failOnRestore: true });
        await restore.Run(makeParams({ CompanyIntegrationID: 'ci-001', BackupUrls: '/var/opt/mssql/backup/x.bak', StagingDatabaseName: 'MJ_Staging_X', ProgressRunID: 'run-A' }));

        const stageError = progressCalls.find(c => c.Method === 'StageError');
        expect(stageError?.Args[0]).toBe('Restore');
        expect(stageError?.Args[2]).toEqual({ code: 'RESTORE_FAILED' });
        expect(progressMethods()).not.toContain('Fail');
        expect(progressMethods()).not.toContain('Complete');
        expect(progressMethods().at(-1)).toBe('Flush');
    });

    it('Restore action reports a refused input as a stage error with its result code', async () => {
        await restore.Run(makeParams({ CompanyIntegrationID: 'ci-001', BackupUrls: '/var/opt/mssql/backup/x.bak', ProgressRunID: 'run-A' }));

        expect(progressCalls.find(c => c.Method === 'StageError')?.Args[2]).toEqual({ code: 'MISSING_PARAMETER' });
        expect(progressMethods()).not.toContain('Fail');
    });
});

describe('LoadSQLServerIntegrationFromStagingAction', () => {
    let load: LoadSQLServerIntegrationFromStagingAction;

    beforeEach(() => {
        resetMocks();
        load = new LoadSQLServerIntegrationFromStagingAction();
        load.CustomDatabaseProvider = createMockSqlExecutor({ stagingDbExists: true });
    });

    it('Load action loads mapped tables from an existing staging database and seeds watermarks', async () => {
        const r = await load.Run(makeParams({ CompanyIntegrationID: 'ci-001', StagingDatabaseName: 'MJ_Staging_X', BackupStartDate: '2026-10-01T00:00:00.000Z' }));

        expect(r.Success).toBe(true);
        expect(r.ResultCode).toBe('SUCCESS');
        expect(sqlCalls.some(s => s.includes('MERGE INTO [raw_erp].[Customer]'))).toBe(true);
        expect(mockWatermarkUpdateFn).toHaveBeenCalledWith('map-cust-001', '2026-10-01T00:00:00.000Z', expect.anything(), 'Pull');
        expect(sqlCalls.some(s => s.startsWith('RESTORE'))).toBe(false);
        const out = outputs(r);
        expect(out.TablesProcessed).toBe(1);
        expect(out.TotalRowsTransferred).toBe(1500);
        expect(out.StagingDatabaseDropped).toBe(0);
        expect(out.BackupStartDate).toBe('2026-10-01T00:00:00.000Z');
        expect(out.StagingDatabaseName).toBe('MJ_Staging_X');
        expect(typeof out.DurationSeconds).toBe('number');
        expect(sqlCalls.some(s => s.includes('DROP DATABASE'))).toBe(false);
    });

    it('Load action fails with STAGING_NOT_FOUND when DB_ID returns null', async () => {
        load.CustomDatabaseProvider = createMockSqlExecutor({ stagingDbExists: false });
        const r = await load.Run(makeParams({ CompanyIntegrationID: 'ci-001', StagingDatabaseName: 'MJ_Staging_X', BackupStartDate: '2026-10-01T00:00:00.000Z' }));

        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('STAGING_NOT_FOUND');
        expect(sqlCalls.some(s => s.includes('MERGE INTO'))).toBe(false);
        expect(mockWatermarkUpdateFn).not.toHaveBeenCalled();
    });

    it('Load action refuses a BackupStartDate that is not a date', async () => {
        const r = await load.Run(makeParams({ CompanyIntegrationID: 'ci-001', StagingDatabaseName: 'MJ_Staging_X', BackupStartDate: 'yesterday-ish' }));

        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('INVALID_PARAMETER');
    });

    it('Load action drops staging and the storage credential only when asked', async () => {
        const containerUrl = 'https://acct.blob.core.windows.net/backups';
        const kept = await load.Run(makeParams({ CompanyIntegrationID: 'ci-001', StagingDatabaseName: 'MJ_Staging_X', BackupStartDate: '2026-10-01T00:00:00.000Z', ContainerUrl: containerUrl }));
        expect(kept.Success).toBe(true);
        expect(sqlCalls.some(s => s.includes('DROP DATABASE'))).toBe(false);
        expect(sqlCalls.some(s => s.includes('DROP CREDENTIAL'))).toBe(false);

        sqlCalls = [];
        const dropped = await load.Run(makeParams({ CompanyIntegrationID: 'ci-001', StagingDatabaseName: 'MJ_Staging_X', BackupStartDate: '2026-10-01T00:00:00.000Z', ContainerUrl: containerUrl, DropStagingDbOnComplete: true }));
        expect(dropped.Success).toBe(true);
        expect(sqlCalls.some(s => s.includes('DROP DATABASE [MJ_Staging_X]'))).toBe(true);
        expect(sqlCalls.some(s => s.includes(`DROP CREDENTIAL [${containerUrl}]`))).toBe(true);
        expect(outputs(dropped).StagingDatabaseDropped).toBe(1);
    });

    it('Load action refuses DropStagingDbOnComplete for a name outside MJ_Staging_ before loading anything', async () => {
        const r = await load.Run(makeParams({ CompanyIntegrationID: 'ci-001', StagingDatabaseName: 'Payroll', BackupStartDate: '2026-10-01T00:00:00.000Z', DropStagingDbOnComplete: true }));

        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('DROP_REFUSED');
        expect(sqlCalls).toHaveLength(0);
    });

    it('Load action reports DROP_REFUSED when the drop-on-complete targets the server database', async () => {
        load.CustomDatabaseProvider = createMockSqlExecutor({ stagingDbExists: true, currentDatabase: 'Payroll' });
        const r = await load.Run(makeParams({ CompanyIntegrationID: 'ci-001', StagingDatabaseName: 'Payroll', BackupStartDate: '2026-10-01T00:00:00.000Z', DropStagingDbOnComplete: true, AllowAnyName: true }));

        expect(r.ResultCode).toBe('DROP_REFUSED');
        expect(sqlCalls.some(s => s.includes('DROP DATABASE'))).toBe(false);
    });

    it('Load action reports STAGING_NOT_FOUND as a stage error and never terminates the run', async () => {
        load.CustomDatabaseProvider = createMockSqlExecutor({ stagingDbExists: false });
        await load.Run(makeParams({ CompanyIntegrationID: 'ci-001', StagingDatabaseName: 'MJ_Staging_X', BackupStartDate: '2026-10-01T00:00:00.000Z', ProgressRunID: 'run-A' }));

        expect(progressCalls.find(c => c.Method === 'StageError')?.Args[2]).toEqual({ code: 'STAGING_NOT_FOUND' });
        expect(progressMethods()).not.toContain('Fail');
        expect(progressMethods()).not.toContain('Complete');
    });

    it('Load action never completes the run and flushes the stream', async () => {
        const r = await load.Run(makeParams({ CompanyIntegrationID: 'ci-001', StagingDatabaseName: 'MJ_Staging_X', BackupStartDate: '2026-10-01T00:00:00.000Z', ProgressRunID: 'run-A' }));

        expect(r.Success).toBe(true);
        expect(progressMethods()).not.toContain('Complete');
        expect(progressMethods().at(-1)).toBe('Flush');
    });
});

describe('DropSQLServerStagingDatabaseAction', () => {
    let drop: DropSQLServerStagingDatabaseAction;

    beforeEach(() => {
        resetMocks();
        drop = new DropSQLServerStagingDatabaseAction();
        drop.CustomDatabaseProvider = createMockSqlExecutor({ stagingDbExists: true });
    });

    it('Drop action drops the staging database and the credential', async () => {
        const containerUrl = 'https://acct.blob.core.windows.net/backups';
        const r = await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Staging_X', ContainerUrl: containerUrl }));

        expect(r.Success).toBe(true);
        expect(r.ResultCode).toBe('SUCCESS');
        expect(sqlCalls.some(s => s.includes('DROP DATABASE [MJ_Staging_X]'))).toBe(true);
        expect(sqlCalls.some(s => s.includes(`DROP CREDENTIAL [${containerUrl}]`))).toBe(true);
        expect(outputs(r).StagingDatabaseDropped).toBe(1);
    });

    it('Drop action leaves credentials alone without a ContainerUrl', async () => {
        const r = await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Staging_X' }));

        expect(r.Success).toBe(true);
        expect(sqlCalls.some(s => s.includes('DROP CREDENTIAL'))).toBe(false);
    });

    it('Drop action refuses a missing StagingDatabaseName', async () => {
        const r = await drop.Run(makeParams({ ContainerUrl: 'https://acct.blob.core.windows.net/backups' }));

        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('MISSING_PARAMETER');
        expect(sqlCalls).toHaveLength(0);
    });

    it('Drop action flushes the stream', async () => {
        await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Staging_X', ProgressRunID: 'run-A', CompanyIntegrationID: 'ci-001' }));

        expect(progressMethods().at(-1)).toBe('Flush');
    });

    it('Drop action refuses a database created before CreatedAfter and never drops it', async () => {
        drop.CustomDatabaseProvider = createMockSqlExecutor({ createdAtUtc: new Date('2026-01-01T00:00:00.000Z') });
        const r = await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Staging_X', CreatedAfter: '2026-10-28T11:00:00.000Z' }));

        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('DROP_REFUSED');
        expect(r.Message).toContain('[MJ_Staging_X]');
        expect(sqlCalls.some(s => s.includes('DROP DATABASE'))).toBe(false);
    });

    it('Drop action drops a database created after CreatedAfter', async () => {
        const r = await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Staging_X', CreatedAfter: '2026-10-28T11:00:00.000Z' }));

        expect(r.Success).toBe(true);
        expect(sqlCalls.some(s => s.includes('DROP DATABASE [MJ_Staging_X]'))).toBe(true);
    });

    it('Drop action is a no-op success for a database that does not exist', async () => {
        drop.CustomDatabaseProvider = createMockSqlExecutor({ createdAtUtc: null });
        const r = await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Staging_X', CreatedAfter: '2026-10-28T11:00:00.000Z' }));

        expect(r.Success).toBe(true);
        expect(sqlCalls.some(s => s.includes('DROP DATABASE'))).toBe(false);
    });

    it.each(['master', 'MODEL', 'msdb', 'TempDB'])('Drop action always refuses the system database %s', async name => {
        const r = await drop.Run(makeParams({ StagingDatabaseName: name, AllowAnyName: 'true' }));

        expect(r.ResultCode).toBe('DROP_REFUSED');
        expect(r.Message).toContain('system database');
        expect(sqlCalls.some(s => s.includes('DROP DATABASE'))).toBe(false);
    });

    it('Drop action always refuses the database the server runs on', async () => {
        drop.CustomDatabaseProvider = createMockSqlExecutor({ currentDatabase: 'mj_main' });
        const r = await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Main', AllowAnyName: 'true' }));

        expect(r.ResultCode).toBe('DROP_REFUSED');
        expect(r.Message).toContain('[MJ_Main]');
        expect(sqlCalls.some(s => s.includes('DROP DATABASE'))).toBe(false);
    });

    it('Drop action refuses a name outside MJ_Staging_ unless AllowAnyName is true', async () => {
        const refused = await drop.Run(makeParams({ StagingDatabaseName: 'Payroll' }));
        expect(refused.ResultCode).toBe('DROP_REFUSED');
        expect(refused.Message).toContain("'MJ_Staging_'");
        expect(sqlCalls).toHaveLength(0);

        const allowed = await drop.Run(makeParams({ StagingDatabaseName: 'Payroll', AllowAnyName: 'true' }));
        expect(allowed.Success).toBe(true);
        expect(sqlCalls.some(s => s.includes('DROP DATABASE [Payroll]'))).toBe(true);
    });

    it("Drop action with DropDatabase 'false' drops only the storage credential", async () => {
        const containerUrl = 'https://acct.blob.core.windows.net/backups';
        const r = await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Staging_X', ContainerUrl: containerUrl, DropDatabase: 'false' }));

        expect(r.Success).toBe(true);
        expect(sqlCalls.some(s => s.includes('DROP DATABASE'))).toBe(false);
        expect(sqlCalls.some(s => s.includes(`DROP CREDENTIAL [${containerUrl}]`))).toBe(true);
        expect(outputs(r).StagingDatabaseDropped).toBe(0);
    });

    it("Drop action with DropDatabase 'false' requires a ContainerUrl", async () => {
        const r = await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Staging_X', DropDatabase: 'false' }));

        expect(r.ResultCode).toBe('MISSING_PARAMETER');
        expect(sqlCalls).toHaveLength(0);
    });

    it('Drop action refuses a CreatedAfter that is not a date', async () => {
        const r = await drop.Run(makeParams({ StagingDatabaseName: 'MJ_Staging_X', CreatedAfter: 'yesterday' }));

        expect(r.ResultCode).toBe('INVALID_PARAMETER');
        expect(sqlCalls).toHaveLength(0);
    });

    it('Drop action reports a refused input as a stage error and never terminates the run', async () => {
        await drop.Run(makeParams({ ProgressRunID: 'run-A', CompanyIntegrationID: 'ci-001' }));

        expect(progressCalls.find(c => c.Method === 'StageError')?.Args[2]).toEqual({ code: 'MISSING_PARAMETER' });
        expect(progressMethods()).not.toContain('Fail');
        expect(progressMethods()).not.toContain('Complete');
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { RunActionParams, ActionParam } from '@memberjunction/actions-base';
import {
    InspectSQLServerBackupAction,
} from '../InspectSQLServerBackupAction.js';
import type { SqlBackupFileListEntry } from '../BaseIntegrationAction.js';

let mockCredentialConfigFn: ReturnType<typeof vi.fn>;
let mockGetCredentialByIdFn: ReturnType<typeof vi.fn>;
let mockGetCredentialFn: ReturnType<typeof vi.fn>;

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
    };
});

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

function createMockSqlExecutor(options: { failOnHeader?: boolean } = {}): {
    executor: DatabaseProviderBase;
    executedSql: string[];
    mockExecuteSql: ReturnType<typeof vi.fn>;
} {
    const executedSql: string[] = [];
    const mockExecuteSql = vi.fn().mockImplementation((sql: string) => {
        executedSql.push(sql);

        if (options.failOnHeader && sql.includes('RESTORE HEADERONLY')) {
            return Promise.reject(new Error('Cannot open backup device'));
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

        return Promise.resolve([]);
    });

    const executor = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
    executor.ExecuteSQL = mockExecuteSql;

    return { executor, executedSql, mockExecuteSql };
}

describe('InspectSQLServerBackupAction', () => {
    let action: InspectSQLServerBackupAction;
    let mockSql: ReturnType<typeof createMockSqlExecutor>;

    beforeEach(() => {
        action = new InspectSQLServerBackupAction();
        mockSql = createMockSqlExecutor();
        action.CustomDatabaseProvider = mockSql.executor;

        mockCredentialConfigFn = vi.fn().mockResolvedValue(undefined);
        mockGetCredentialByIdFn = vi.fn();
        mockGetCredentialFn = vi.fn();
    });

    describe('Parameter Validation', () => {
        it('inspects without a CompanyIntegrationID', async () => {
            const params = makeParams({ BackupUrls: 'C:\\backups\\db.bak' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
        });

        it('returns MISSING_PARAMETER when BackupUrls is absent', async () => {
            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_PARAMETER');
        });

        it('returns INVALID_PARAMETER when BackupUrls contains no non-empty URLs', async () => {
            const params = makeParams({ CompanyIntegrationID: 'ci-001', BackupUrls: ' , , ' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMETER');
        });
    });

    describe('Multi-Stripe Inspection (Msg 3132 Prevention)', () => {
        it('passes ALL stripes to RESTORE HEADERONLY and FILELISTONLY and returns outputs', async () => {
            const stripes = [
                'https://storage.blob.core.windows.net/backups/stripe1.bak',
                'https://storage.blob.core.windows.net/backups/stripe2.bak',
            ];
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: stripes.join(', '),
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');

            // Assert all stripes in HEADERONLY
            const headerSql = mockSql.executedSql.find(s => s.includes('RESTORE HEADERONLY'));
            expect(headerSql).toBeDefined();
            expect(headerSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe1.bak'");
            expect(headerSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe2.bak'");

            // Assert all stripes in FILELISTONLY
            const fileListSql = mockSql.executedSql.find(s => s.includes('RESTORE FILELISTONLY'));
            expect(fileListSql).toBeDefined();
            expect(fileListSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe1.bak'");
            expect(fileListSql).toContain("URL = N'https://storage.blob.core.windows.net/backups/stripe2.bak'");

            // Assert outputs
            const startDate = result.Params?.find(p => p.Name === 'BackupStartDate');
            expect(startDate?.Value).toBe('2026-10-26T01:00:00.000Z');

            const dbName = result.Params?.find(p => p.Name === 'DatabaseName');
            expect(dbName?.Value).toBe('AdventureWorks_Prod');

            const backupSize = result.Params?.find(p => p.Name === 'BackupSizeBytes');
            expect(backupSize?.Value).toBe(104857600);

            const stripeCountParam = result.Params?.find(p => p.Name === 'Stripes');
            expect(stripeCountParam?.Value).toBe(2);

            const filesParam = result.Params?.find(p => p.Name === 'Files');
            expect(filesParam).toBeDefined();
            const files = JSON.parse(String(filesParam?.Value));
            expect(files).toHaveLength(2);

            // Assert storage credential was dropped
            expect(mockSql.executedSql.some(s => s.includes('DROP CREDENTIAL'))).toBe(true);
        });

        it('inspects local disk files without storage credential', async () => {
            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'C:\\backups\\stripe1.bak, C:\\backups\\stripe2.bak',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');

            // Assert no CREATE CREDENTIAL was executed
            expect(mockSql.executedSql.some(s => s.includes('CREATE CREDENTIAL'))).toBe(false);

            // Assert DISK was used
            const headerSql = mockSql.executedSql.find(s => s.includes('RESTORE HEADERONLY'));
            expect(headerSql).toContain("DISK = N'C:\\backups\\stripe1.bak'");
            expect(headerSql).toContain("DISK = N'C:\\backups\\stripe2.bak'");
        });

        it('cleans up temporary storage credential in finally block on failure', async () => {
            mockSql = createMockSqlExecutor({ failOnHeader: true });
            action.CustomDatabaseProvider = mockSql.executor;

            const params = makeParams({
                CompanyIntegrationID: 'ci-001',
                BackupUrls: 'https://storage.blob.core.windows.net/backups/db.bak',
                SasToken: 'token123',
            });

            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INSPECTION_FAILED');

            // Assert DROP CREDENTIAL was called despite failure
            expect(mockSql.executedSql.some(s => s.includes('DROP CREDENTIAL'))).toBe(true);
        });
    });

    describe('Direct-call guards', () => {
        it.each([
            ['a UNC share (NTLM coercion)', '\\\\attacker.example\\s\\x.bak'],
            ['a forward-slash UNC share', '//attacker.example/s/x.bak'],
            ['a non-Azure URL', 'https://attacker.example/c/x.bak'],
            ['a container break-out', "https://acct.blob.core.windows.net/c]';--/x.bak"],
        ])('refuses %s with INVALID_PARAMETER before any SQL', async (_label, backupUrls) => {
            const result = await action['InternalRunAction'](makeParams({ BackupUrls: backupUrls, SasToken: 'token123' }));

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMETER');
            expect(mockSql.executedSql).toHaveLength(0);
        });
    });
});

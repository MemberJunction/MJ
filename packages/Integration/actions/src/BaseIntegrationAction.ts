import { BaseAction } from '@memberjunction/actions';
import { RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { DatabaseProviderBase, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import { EscapeSQLString } from '@memberjunction/global';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';
import {
    AssertStorageContainerUrl,
    BackupSourcesProblem,
    InvalidBackupParameterError,
    IsUrlSource,
    QuoteSqlIdentifier,
    StagingDirectoryProblem
} from './BackupSourceGuard.js';

/**
 * Runs statements that may take hours (a multi-terabyte RESTORE, a set-based load of a staged table)
 * on a connection whose request timeout is disabled, then releases that connection. The API's shared
 * pool keeps its usual request timeout, which a long statement would exceed and be cancelled by.
 */
export interface LongRunningSqlRunner {
    ExecuteSQL<T = Record<string, unknown>>(query: string, description: string): Promise<T[]>;
    Dispose(): Promise<void>;
}

/**
 * The string without any trailing run of the given characters. A loop rather than a `[...]+$`
 * regular expression: that pattern has polynomial worst-case cost, and every path trimmed here is
 * caller-supplied input (a container URL, a backup path, a data directory).
 */
export function TrimTrailingChars(value: string, chars: string): string {
    let end = value.length;
    while (end > 0 && chars.includes(value[end - 1])) {
        end--;
    }
    return value.slice(0, end);
}

/** The runtime shape of an mssql pool that its type definitions leave out: the config it was built from. */
interface ConnectionPoolWithConfig extends sql.ConnectionPool {
    config?: sql.config;
}

/**
 * Header information returned by SQL Server's RESTORE HEADERONLY statement.
 */
export interface SqlBackupHeaderInfo {
    BackupStartDate: Date;
    BackupFinishDate: Date;
    DatabaseName: string;
    FirstLSN?: string;
    LastLSN?: string;
    CheckpointLSN?: string;
    BackupSizeBytes?: number;
}

/**
 * File list entry returned by SQL Server's RESTORE FILELISTONLY statement.
 */
export interface SqlBackupFileListEntry {
    LogicalName: string;
    PhysicalName: string;
    Type: 'D' | 'L';
    SizeBytes?: number;
}

/** A header column as a Date; invalid (NaN time) when the value is not a date. */
function toDate(raw: unknown): Date {
    return raw instanceof Date ? raw : new Date(String(raw));
}

/**
 * Abstract base class for Integration Actions providing parameter extraction,
 * credential resolution, URL parsing, SQL Server backup inspection, and database provider helpers.
 */
export abstract class BaseIntegrationAction extends BaseAction {

    /** Optional custom database provider override (for testing and DI). */
    private _customDatabaseProvider?: DatabaseProviderBase;

    public set CustomDatabaseProvider(provider: DatabaseProviderBase | undefined) {
        this._customDatabaseProvider = provider;
    }

    public get CustomDatabaseProvider(): DatabaseProviderBase | undefined {
        return this._customDatabaseProvider;
    }

    /**
     * Resolves the DatabaseProviderBase instance to use for SQL execution.
     * Prefers custom injected provider, then params.Provider.
     * Enforces that the provider is an instance of DatabaseProviderBase.
     */
    protected GetDatabaseProvider(params: RunActionParams): DatabaseProviderBase {
        const candidate = this._customDatabaseProvider ?? params.Provider;
        if (candidate && candidate instanceof DatabaseProviderBase) {
            return candidate;
        }

        throw new Error("A database provider extending DatabaseProviderBase is required to execute this action.");
    }

    /** The metadata provider this action reads MJ data through: the injected provider, then `params.Provider`. */
    protected GetMetadataProvider(params: RunActionParams): IMetadataProvider {
        const provider = this._customDatabaseProvider ?? params.Provider;
        if (!provider) {
            throw new Error('A metadata provider is required to execute this action.');
        }
        return provider;
    }

    /**
     * A runner for statements that may take hours. On a SQL Server provider this opens one dedicated
     * connection from the same server settings with `requestTimeout: 0` (no limit), since the shared pool's
     * request timeout cannot be lengthened per statement. Any other provider (a test double, another
     * platform) runs the statements through its own `ExecuteSQL`.
     */
    protected async CreateLongRunningRunner(executor: DatabaseProviderBase, contextUser?: UserInfo): Promise<LongRunningSqlRunner> {
        if (executor instanceof SQLServerDataProvider) {
            return this.createDedicatedSqlServerRunner(executor, contextUser);
        }
        return {
            ExecuteSQL: async <T>(query: string, description: string): Promise<T[]> => {
                const rows: T[] | undefined = await executor.ExecuteSQL<T>(query, undefined, { isMutation: true, description }, contextUser);
                return rows ?? [];
            },
            Dispose: async () => undefined,
        };
    }

    /** One connection, built from the shared pool's settings with no request timeout. */
    private async createDedicatedSqlServerRunner(executor: SQLServerDataProvider, contextUser?: UserInfo): Promise<LongRunningSqlRunner> {
        const sharedPool = executor.ConfigData.ConnectionPool as ConnectionPoolWithConfig;
        if (!sharedPool.config) {
            throw new Error('The SQL Server connection pool exposes no configuration to derive a long-running connection from.');
        }
        const pool = new sql.ConnectionPool({
            ...sharedPool.config,
            requestTimeout: 0,
            pool: { ...(sharedPool.config.pool ?? {}), min: 0, max: 1 },
        });
        await pool.connect();
        return {
            ExecuteSQL: async <T>(query: string): Promise<T[]> => {
                const rows: T[] = await SQLServerDataProvider.ExecuteSQLWithPool(pool, query, undefined, contextUser);
                return rows;
            },
            Dispose: async () => {
                await pool.close();
            },
        };
    }

    /**
     * Checks if a given backup path is a web/blob URL (http:// or https://) or a local disk path.
     */
    public IsUrl(path: string): boolean {
        return IsUrlSource(path);
    }

    /**
     * Why the backup sources (blob URLs or disk paths) and the optional staging-file directories cannot
     * be used, or undefined when they can. Every action that reads a backup checks this before any SQL:
     * the actions are callable directly with any parameter values.
     */
    protected BackupInputProblem(params: RunActionParams, backupUrls: string[]): string | undefined {
        const sourcesProblem = BackupSourcesProblem(backupUrls);
        if (sourcesProblem) {
            return sourcesProblem;
        }
        for (const paramName of ['TargetDataFileDirectory', 'TargetLogFileDirectory']) {
            const dir = this.GetStringParam(params, paramName);
            const problem = dir ? StagingDirectoryProblem(dir, paramName) : undefined;
            if (problem) {
                return problem;
            }
        }
        return undefined;
    }

    /**
     * Extracts the Azure Blob container root URL from a full blob URL, and checks that it is a valid
     * storage container URL (it becomes a SQL Server credential name).
     * e.g. 'https://myaccount.blob.core.windows.net/mycontainer/backup.bak' -> 'https://myaccount.blob.core.windows.net/mycontainer'
     */
    protected ExtractContainerUrl(blobUrl: string): string {
        const url = new URL(blobUrl);
        const segments = url.pathname.split('/').filter(s => s.length > 0);
        if (segments.length === 0) {
            throw new InvalidBackupParameterError(`Invalid Azure Blob URL: '${blobUrl}'. Expected storage account and container path.`);
        }
        const containerUrl = `${url.origin}/${segments[0]}`;
        AssertStorageContainerUrl(containerUrl, 'BackupUrls');
        return containerUrl;
    }

    /**
     * Resolves the Azure Blob SAS token either from direct parameter or through CredentialEngine. A
     * stored credential is used only when the caller can read its `MJ: Credentials` row: the engine
     * decrypts any credential it holds, so the caller's own access is checked first.
     */
    protected async ResolveSasToken(params: RunActionParams): Promise<string> {
        const directSas = this.GetStringParam(params, 'SasToken');
        if (directSas) {
            return directSas.replace(/^\?/, '').trim();
        }

        const credId = this.GetStringParam(params, 'StorageCredentialID');
        if (credId) {
            return this.resolveStoredSasToken(params, credId);
        }

        throw new Error("Either 'SasToken' or 'StorageCredentialID' parameter must be provided.");
    }

    /** The token held by the stored credential, once the caller is known to be allowed to read it. */
    private async resolveStoredSasToken(params: RunActionParams, credId: string): Promise<string> {
        const notFound = `Credential with ID '${credId}' was not found or you do not have access to it.`;
        if (!(await this.CallerCanReadCredential(params, credId))) {
            throw new Error(notFound);
        }
        await CredentialEngine.Instance.Config(false, params.ContextUser);
        const credential = CredentialEngine.Instance.getCredentialById(credId);
        if (!credential) {
            throw new Error(notFound);
        }

        const resolved = await CredentialEngine.Instance.GetCredential<Record<string, string>>(credential.Name, {
            contextUser: params.ContextUser,
        });

        const token = resolved.values?.SasToken || resolved.values?.Secret || resolved.values?.Key;
        if (!token) {
            throw new Error(`Credential '${credential.Name}' does not contain 'SasToken', 'Secret', or 'Key'.`);
        }
        return token.replace(/^\?/, '').trim();
    }

    /**
     * True when the calling user can read the `MJ: Credentials` row: a RunView as that user, so entity
     * permissions and row-level security decide.
     */
    protected async CallerCanReadCredential(params: RunActionParams, credId: string): Promise<boolean> {
        const rv = RunView.FromMetadataProvider(this.GetMetadataProvider(params));
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Credentials',
            Fields: ['ID'],
            ExtraFilter: `ID='${EscapeSQLString(credId)}'`,
            ResultType: 'simple',
        }, params.ContextUser);
        return result.Success && (result.Results?.length ?? 0) > 0;
    }

    /**
     * Constructs SQL FROM clause passing all backup stripes (URLs or disk paths).
     */
    protected BuildFromSourcesClause(backupUrls: string[]): string {
        return backupUrls.map(u => {
            const clean = EscapeSQLString(u);
            return this.IsUrl(u) ? `URL = N'${clean}'` : `DISK = N'${clean}'`;
        }).join(',\n    ');
    }

    /**
     * Reads header metadata across all backup stripes using RESTORE HEADERONLY.
     */
    protected async InspectBackupHeader(
        executor: DatabaseProviderBase,
        backupUrls: string[],
        contextUser?: UserInfo
    ): Promise<SqlBackupHeaderInfo> {
        const fromSources = this.BuildFromSourcesClause(backupUrls);
        const query = `RESTORE HEADERONLY\nFROM\n    ${fromSources};`;
        const rows = await executor.ExecuteSQL<Record<string, unknown>>(
            query,
            undefined,
            { description: 'RESTORE HEADERONLY' },
            contextUser
        );

        if (!rows || rows.length === 0) {
            throw new Error(`RESTORE HEADERONLY returned no records for backup URL(s): '${backupUrls.join(', ')}'.`);
        }
        return this.parseBackupHeaderRow(rows[0]);
    }

    /** The header facts of one RESTORE HEADERONLY row. */
    private parseBackupHeaderRow(row: Record<string, unknown>): SqlBackupHeaderInfo {
        const backupStartDate = toDate(row.BackupStartDate);
        const backupFinishDate = toDate(row.BackupFinishDate);
        if (isNaN(backupStartDate.getTime())) {
            throw new Error(`Failed to parse BackupStartDate from backup header: '${String(row.BackupStartDate)}'`);
        }
        const backupSizeBytes = row.BackupSize != null ? Number(row.BackupSize) : undefined;

        return {
            BackupStartDate: backupStartDate,
            BackupFinishDate: isNaN(backupFinishDate.getTime()) ? backupStartDate : backupFinishDate,
            DatabaseName: typeof row.DatabaseName === 'string' ? row.DatabaseName : 'UnknownDatabase',
            FirstLSN: row.FirstLSN != null ? String(row.FirstLSN) : undefined,
            LastLSN: row.LastLSN != null ? String(row.LastLSN) : undefined,
            CheckpointLSN: row.CheckpointLSN != null ? String(row.CheckpointLSN) : undefined,
            BackupSizeBytes: isNaN(backupSizeBytes ?? NaN) ? undefined : backupSizeBytes,
        };
    }

    /**
     * Reads logical file metadata across all backup stripes using RESTORE FILELISTONLY.
     */
    protected async InspectBackupFileList(
        executor: DatabaseProviderBase,
        backupUrls: string[],
        contextUser?: UserInfo
    ): Promise<SqlBackupFileListEntry[]> {
        const fromSources = this.BuildFromSourcesClause(backupUrls);
        const query = `RESTORE FILELISTONLY\nFROM\n    ${fromSources};`;
        const rows = await executor.ExecuteSQL<Record<string, unknown>>(
            query,
            undefined,
            { description: 'RESTORE FILELISTONLY' },
            contextUser
        );

        if (!rows || rows.length === 0) {
            throw new Error(`RESTORE FILELISTONLY returned no file records for backup URL(s): '${backupUrls.join(', ')}'.`);
        }

        return rows.map(r => ({
            LogicalName: String(r.LogicalName),
            PhysicalName: String(r.PhysicalName),
            Type: String(r.Type).toUpperCase() === 'L' ? 'L' : 'D',
            SizeBytes: r.Size != null ? Number(r.Size) : undefined,
        }));
    }

    /**
     * Ensures the SQL Server credential for the Azure Storage container URL exists and carries THIS
     * run's SAS token. An existing credential is altered rather than kept, so a credential left behind by
     * an earlier run (or created by hand) never makes a corrected token silently ineffective. The
     * statement embeds the secret, so it is excluded from SQL logging. The container URL is validated
     * and the credential name quoted QUOTENAME-style, so the name can never end the identifier.
     */
    protected async EnsureStorageCredential(
        executor: DatabaseProviderBase,
        containerUrl: string,
        sasToken: string,
        contextUser?: UserInfo
    ): Promise<void> {
        AssertStorageContainerUrl(containerUrl);
        const cleanSas = EscapeSQLString(sasToken);
        const nameLiteral = EscapeSQLString(containerUrl);
        const credentialName = QuoteSqlIdentifier(containerUrl);
        const query = `
IF EXISTS (SELECT 1 FROM sys.credentials WHERE name = N'${nameLiteral}')
    ALTER CREDENTIAL ${credentialName}
    WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
    SECRET = N'${cleanSas}';
ELSE
    CREATE CREDENTIAL ${credentialName}
    WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
    SECRET = N'${cleanSas}';`;
        await executor.ExecuteSQL(query, undefined, { isMutation: true, ignoreLogging: true, description: 'Ensure Azure Storage Credential' }, contextUser);
    }

    /**
     * Drops the temporary SQL Server storage credential. Validates the container URL and quotes the
     * credential name, as {@link EnsureStorageCredential} does.
     */
    protected async DropStorageCredential(
        executor: DatabaseProviderBase,
        containerUrl: string,
        contextUser?: UserInfo
    ): Promise<void> {
        AssertStorageContainerUrl(containerUrl);
        const nameLiteral = EscapeSQLString(containerUrl);
        const query = `
IF EXISTS (SELECT 1 FROM sys.credentials WHERE name = N'${nameLiteral}')
BEGIN
    DROP CREDENTIAL ${QuoteSqlIdentifier(containerUrl)};
END`;
        await executor.ExecuteSQL(query, undefined, { isMutation: true, description: 'Drop Azure Storage Credential' }, contextUser);
    }

    // ─── Parameter Accessor Helpers ─────────────────────────────────────

    protected GetStringParam(params: RunActionParams, name: string): string | undefined {
        const nameLower = name.toLowerCase();
        const param = params.Params?.find(p => p.Name.trim().toLowerCase() === nameLower);
        if (!param || param.Value == null) return undefined;
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    protected GetNumberParam(params: RunActionParams, name: string, defaultValue: number): number {
        const raw = this.GetStringParam(params, name);
        if (raw == null) return defaultValue;
        const num = Number(raw);
        return isNaN(num) ? defaultValue : num;
    }

    protected GetBoolParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const raw = this.GetStringParam(params, name);
        if (raw == null) return defaultValue;
        const lower = raw.toLowerCase();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
        return defaultValue;
    }

    protected GetStringListParam(params: RunActionParams, name: string): string[] | undefined {
        const raw = this.GetStringParam(params, name);
        if (!raw) return undefined;
        const list = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
        return list.length > 0 ? list : undefined;
    }

    /**
     * Records an output value. A parameter the caller already supplied under the same name (one the
     * action declares as `Both`, such as a staging database name the action may have generated) is
     * updated in place rather than duplicated: an action's parameter names are unique.
     */
    protected AddOutputParam(params: RunActionParams, name: string, value: number | string | boolean): void {
        const nameLower = name.trim().toLowerCase();
        const existing = params.Params.find(p => p.Name.trim().toLowerCase() === nameLower);
        if (existing) {
            existing.Type = 'Both';
            existing.Value = value;
            return;
        }
        const outputParam = new ActionParam();
        outputParam.Name = name;
        outputParam.Type = 'Output';
        outputParam.Value = value;
        params.Params.push(outputParam);
    }
}

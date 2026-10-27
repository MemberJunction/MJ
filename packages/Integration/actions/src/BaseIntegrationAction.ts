import { BaseAction } from '@memberjunction/actions';
import { RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { DatabaseProviderBase, LogError, type UserInfo } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import { EscapeSQLString } from '@memberjunction/global';

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
    protected getDatabaseProvider(params: RunActionParams): DatabaseProviderBase {
        const candidate = this._customDatabaseProvider ?? params.Provider;
        if (candidate && candidate instanceof DatabaseProviderBase) {
            return candidate;
        }

        throw new Error("A database provider extending DatabaseProviderBase is required to execute this action.");
    }

    /**
     * Checks if a given backup path is a web/blob URL (http:// or https://) or a local disk path.
     */
    public IsUrl(path: string): boolean {
        return path.startsWith('http://') || path.startsWith('https://');
    }

    /**
     * Extracts the Azure Blob container root URL from a full blob URL.
     * e.g. 'https://myaccount.blob.core.windows.net/mycontainer/backup.bak' -> 'https://myaccount.blob.core.windows.net/mycontainer'
     */
    protected extractContainerUrl(blobUrl: string): string {
        const url = new URL(blobUrl);
        const segments = url.pathname.split('/').filter(s => s.length > 0);
        if (segments.length === 0) {
            throw new Error(`Invalid Azure Blob URL: '${blobUrl}'. Expected storage account and container path.`);
        }
        return `${url.origin}/${segments[0]}`;
    }

    /**
     * Resolves the Azure Blob SAS token either from direct parameter or through CredentialEngine.
     */
    protected async resolveSasToken(params: RunActionParams): Promise<string> {
        const directSas = this.getStringParam(params, 'SasToken');
        if (directSas) {
            return directSas.replace(/^\?/, '').trim();
        }

        const credId = this.getStringParam(params, 'StorageCredentialID') ?? this.getStringParam(params, 'CredentialID');
        if (credId) {
            await CredentialEngine.Instance.Config(false, params.ContextUser);
            const credential = CredentialEngine.Instance.getCredentialById(credId);
            if (!credential) {
                throw new Error(`Credential with ID '${credId}' was not found in CredentialEngine.`);
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

        throw new Error("Either 'SasToken' or 'CredentialID'/'StorageCredentialID' parameter must be provided.");
    }

    /**
     * Constructs SQL FROM clause passing all backup stripes (URLs or disk paths).
     */
    protected buildFromSourcesClause(backupUrls: string[]): string {
        return backupUrls.map(u => {
            const clean = EscapeSQLString(u);
            return this.IsUrl(u) ? `URL = N'${clean}'` : `DISK = N'${clean}'`;
        }).join(',\n    ');
    }

    /**
     * Reads header metadata across all backup stripes using RESTORE HEADERONLY.
     */
    protected async inspectBackupHeader(
        executor: DatabaseProviderBase,
        backupUrls: string[],
        contextUser?: UserInfo
    ): Promise<SqlBackupHeaderInfo> {
        const fromSources = this.buildFromSourcesClause(backupUrls);
        const sql = `RESTORE HEADERONLY\nFROM\n    ${fromSources};`;
        const rows = await executor.ExecuteSQL<Record<string, unknown>>(
            sql,
            undefined,
            { description: 'RESTORE HEADERONLY' },
            contextUser
        );

        if (!rows || rows.length === 0) {
            throw new Error(`RESTORE HEADERONLY returned no records for backup URL(s): '${backupUrls.join(', ')}'.`);
        }

        const row = rows[0];
        const backupStartDateRaw = row.BackupStartDate;
        const backupFinishDateRaw = row.BackupFinishDate;
        const databaseName = typeof row.DatabaseName === 'string' ? row.DatabaseName : 'UnknownDatabase';

        const backupStartDate = backupStartDateRaw instanceof Date
            ? backupStartDateRaw
            : new Date(String(backupStartDateRaw));

        const backupFinishDate = backupFinishDateRaw instanceof Date
            ? backupFinishDateRaw
            : new Date(String(backupFinishDateRaw));

        if (isNaN(backupStartDate.getTime())) {
            throw new Error(`Failed to parse BackupStartDate from backup header: '${String(backupStartDateRaw)}'`);
        }

        const backupSizeBytes = row.BackupSize != null ? Number(row.BackupSize) : undefined;

        return {
            BackupStartDate: backupStartDate,
            BackupFinishDate: isNaN(backupFinishDate.getTime()) ? backupStartDate : backupFinishDate,
            DatabaseName: databaseName,
            FirstLSN: row.FirstLSN != null ? String(row.FirstLSN) : undefined,
            LastLSN: row.LastLSN != null ? String(row.LastLSN) : undefined,
            CheckpointLSN: row.CheckpointLSN != null ? String(row.CheckpointLSN) : undefined,
            BackupSizeBytes: isNaN(backupSizeBytes ?? NaN) ? undefined : backupSizeBytes,
        };
    }

    /**
     * Reads logical file metadata across all backup stripes using RESTORE FILELISTONLY.
     */
    protected async inspectBackupFileList(
        executor: DatabaseProviderBase,
        backupUrls: string[],
        contextUser?: UserInfo
    ): Promise<SqlBackupFileListEntry[]> {
        const fromSources = this.buildFromSourcesClause(backupUrls);
        const sql = `RESTORE FILELISTONLY\nFROM\n    ${fromSources};`;
        const rows = await executor.ExecuteSQL<Record<string, unknown>>(
            sql,
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
     * Ensures the SQL Server Database Scoped / Server Credential exists for the Azure Storage container URL.
     */
    protected async ensureStorageCredential(
        executor: DatabaseProviderBase,
        containerUrl: string,
        sasToken: string,
        contextUser?: UserInfo
    ): Promise<void> {
        const cleanSas = EscapeSQLString(sasToken);
        const cleanUrl = EscapeSQLString(containerUrl);
        const sql = `
IF NOT EXISTS (SELECT 1 FROM sys.credentials WHERE name = N'${cleanUrl}')
BEGIN
    CREATE CREDENTIAL [${cleanUrl}]
    WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
    SECRET = N'${cleanSas}';
END`;
        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: 'Ensure Azure Storage Credential' }, contextUser);
    }

    /**
     * Drops the temporary SQL Server storage credential.
     */
    protected async dropStorageCredential(
        executor: DatabaseProviderBase,
        containerUrl: string,
        contextUser?: UserInfo
    ): Promise<void> {
        const cleanUrl = EscapeSQLString(containerUrl);
        const sql = `
IF EXISTS (SELECT 1 FROM sys.credentials WHERE name = N'${cleanUrl}')
BEGIN
    DROP CREDENTIAL [${cleanUrl}];
END`;
        await executor.ExecuteSQL(sql, undefined, { isMutation: true, description: 'Drop Azure Storage Credential' }, contextUser);
    }

    // ─── Parameter Accessor Helpers ─────────────────────────────────────

    protected getStringParam(params: RunActionParams, name: string): string | undefined {
        const nameLower = name.toLowerCase();
        const param = params.Params?.find(p => p.Name.trim().toLowerCase() === nameLower);
        if (!param || param.Value == null) return undefined;
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    protected getNumberParam(params: RunActionParams, name: string, defaultValue: number): number {
        const raw = this.getStringParam(params, name);
        if (raw == null) return defaultValue;
        const num = Number(raw);
        return isNaN(num) ? defaultValue : num;
    }

    protected getBoolParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const raw = this.getStringParam(params, name);
        if (raw == null) return defaultValue;
        const lower = raw.toLowerCase();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
        return defaultValue;
    }

    protected getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        return this.getBoolParam(params, name, defaultValue);
    }

    protected getStringListParam(params: RunActionParams, name: string): string[] | undefined {
        const raw = this.getStringParam(params, name);
        if (!raw) return undefined;
        const list = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
        return list.length > 0 ? list : undefined;
    }

    protected addOutputParam(params: RunActionParams, name: string, value: number | string | boolean): void {
        const outputParam = new ActionParam();
        outputParam.Name = name;
        outputParam.Type = 'Output';
        outputParam.Value = value;
        params.Params.push(outputParam);
    }
}

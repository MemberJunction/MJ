import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
} from '@memberjunction/integration-engine';
import sql from 'mssql';

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface ConnectionConfig {
    /** SQL Server hostname */
    Server: string;
    /** Database name */
    Database: string;
    /** Database user */
    User: string;
    /** Database password */
    Password: string;
    /** Database schema (e.g., 'hs', 'sf', 'ym'). Defaults to 'dbo'. */
    Schema: string;
}

/**
 * Abstract base class for connectors that read from relational databases via mssql.
 * Handles connection management, object/field discovery, and connection testing.
 * Subclasses must implement FetchChanges to define record extraction logic.
 */
export abstract class RelationalDBConnector extends BaseIntegrationConnector {
    /** Cache of open connection pools keyed by "server|database" */
    private poolCache = new Map<string, sql.ConnectionPool>();

    /**
     * Parses the Configuration JSON on a CompanyIntegration to extract connection details.
     * @param companyIntegration - The entity containing Configuration JSON
     * @returns Parsed connection configuration
     * @throws Error if Configuration is missing or malformed
     */
    protected ParseConnectionConfig(companyIntegration: MJCompanyIntegrationEntity): ConnectionConfig {
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (!configJson) {
            throw new Error('CompanyIntegration.Configuration is null or empty');
        }

        const parsed = JSON.parse(configJson) as Record<string, string>;
        const server = parsed['server'];
        const database = parsed['database'];
        const user = parsed['user'];
        const password = parsed['password'];
        const schema = parsed['schema'] ?? 'dbo';

        if (!server || !database || !user || !password) {
            throw new Error(
                'Configuration JSON must contain server, database, user, and password fields'
            );
        }

        return { Server: server, Database: database, User: user, Password: password, Schema: schema };
    }

    /**
     * Opens or reuses a mssql ConnectionPool for the given configuration.
     * Pools are cached by server+database to avoid redundant connections.
     * @param config - Connection configuration
     * @returns An open ConnectionPool
     */
    protected async GetPool(config: ConnectionConfig): Promise<sql.ConnectionPool> {
        const cacheKey = `${config.Server}|${config.Database}`;
        const existing = this.poolCache.get(cacheKey);
        if (existing?.connected) {
            return existing;
        }

        const pool = new sql.ConnectionPool({
            server: config.Server,
            database: config.Database,
            user: config.User,
            password: config.Password,
            options: {
                encrypt: false,
                trustServerCertificate: true,
            },
        });

        await pool.connect();
        this.poolCache.set(cacheKey, pool);
        return pool;
    }

    /**
     * Tests connectivity to the source database by running SELECT 1.
     * @param companyIntegration - The company integration with connection configuration
     * @param _contextUser - User context for authorization
     * @returns Connection test result with success/failure and message
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = this.ParseConnectionConfig(companyIntegration);
            const pool = await this.GetPool(config);
            const result = await pool.request().query<{ version: string }>(
                'SELECT @@VERSION AS version'
            );
            const version = result.recordset[0]?.version ?? 'Unknown';

            return {
                Success: true,
                Message: `Connected to ${config.Database} on ${config.Server}`,
                ServerVersion: version.split('\n')[0],
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    /**
     * Discovers all user tables in the source database via INFORMATION_SCHEMA.
     * @param companyIntegration - The company integration with connection configuration
     * @param _contextUser - User context for authorization
     * @returns Array of object schemas for each table found
     */
    public async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const config = this.ParseConnectionConfig(companyIntegration);
        const pool = await this.GetPool(config);

        const result = await pool.request()
            .input('schemaName', sql.NVarChar, config.Schema)
            .query<{ TABLE_NAME: string }>(
                `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = @schemaName ORDER BY TABLE_NAME`
            );

        return result.recordset.map((row) => ({
            Name: row.TABLE_NAME,
            Label: row.TABLE_NAME,
            SupportsIncrementalSync: true,
            SupportsWrite: false,
        }));
    }

    /**
     * Discovers columns on a specific table via INFORMATION_SCHEMA.COLUMNS.
     * @param companyIntegration - The company integration with connection configuration
     * @param objectName - Table name to inspect
     * @param _contextUser - User context for authorization
     * @returns Array of field schemas for the specified table
     */
    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const config = this.ParseConnectionConfig(companyIntegration);
        const pool = await this.GetPool(config);

        const result = await pool
            .request()
            .input('tableName', sql.NVarChar, objectName)
            .input('schemaName', sql.NVarChar, config.Schema)
            .query<ColumnSchemaRow>(
                `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @schemaName
                 ORDER BY ORDINAL_POSITION`
            );

        return result.recordset.map((row) => this.mapColumnToFieldSchema(row));
    }

    /**
     * Converts a row from INFORMATION_SCHEMA.COLUMNS to an ExternalFieldSchema.
     * @param row - Column metadata row
     * @returns Mapped field schema
     */
    private mapColumnToFieldSchema(row: ColumnSchemaRow): ExternalFieldSchema {
        return {
            Name: row.COLUMN_NAME,
            Label: row.COLUMN_NAME,
            DataType: row.DATA_TYPE,
            IsRequired: row.IS_NULLABLE === 'NO',
            IsUniqueKey: false,
            IsReadOnly: row.IS_IDENTITY === 1,
        };
    }

    /**
     * Builds an ExternalRecord from a SQL result row.
     * @param row - Raw database row
     * @param idField - Column name to use as ExternalID
     * @param objectType - Object type name for the record
     * @param modifiedAtField - Column name for the modification timestamp
     * @param deletedField - Column name for the deleted flag (optional)
     * @returns An ExternalRecord
     */
    protected BuildExternalRecord(
        row: Record<string, unknown>,
        idField: string,
        objectType: string,
        modifiedAtField: string,
        deletedField?: string
    ): ExternalRecord {
        const modifiedRaw = row[modifiedAtField];
        const modifiedAt = modifiedRaw instanceof Date ? modifiedRaw : undefined;
        const isDeleted = deletedField ? Boolean(row[deletedField]) : undefined;

        return {
            ExternalID: String(row[idField]),
            ObjectType: objectType,
            Fields: { ...row },
            ModifiedAt: modifiedAt,
            IsDeleted: isDeleted,
        };
    }

    /**
     * Fetches changed records from a table, ordered by a modification timestamp column.
     * Applies watermark filtering and batch size limiting.
     * @param ctx - Fetch context with integration, object, watermark, and batch details
     * @param idField - Column name for the primary key
     * @param modifiedAtField - Column name for the modification timestamp
     * @param deletedField - Column name for the deleted flag (optional)
     * @returns Batch of external records with pagination info
     */
    protected async FetchChangesFromTable(
        ctx: FetchContext,
        idField: string,
        modifiedAtField: string,
        deletedField?: string
    ): Promise<FetchBatchResult> {
        const config = this.ParseConnectionConfig(ctx.CompanyIntegration);
        const pool = await this.GetPool(config);

        const request = pool.request();
        let whereClause = '';
        if (ctx.WatermarkValue) {
            whereClause = `WHERE [${modifiedAtField}] > CAST(@watermark AS datetime2(7))`;
            request.input('watermark', sql.NVarChar, ctx.WatermarkValue);
        }

        // Fetch one extra to detect HasMore
        const fetchCount = ctx.BatchSize + 1;
        request.input('fetchCount', sql.Int, fetchCount);

        // Include full-precision timestamp (datetime2 has 7 decimal places, JS Date only has 3)
        // to avoid sub-millisecond precision loss in watermark comparisons
        const rawTsCol = `CONVERT(varchar(50), [${modifiedAtField}], 126) AS [__mj_raw_ts]`;
        const query = `SELECT TOP (@fetchCount) *, ${rawTsCol} FROM [${config.Schema}].[${ctx.ObjectName}] ${whereClause} ORDER BY [${modifiedAtField}], [${idField}]`;
        const result = await request.query<Record<string, unknown>>(query);

        const hasMore = result.recordset.length > ctx.BatchSize;
        const rows = hasMore ? result.recordset.slice(0, ctx.BatchSize) : result.recordset;

        const newWatermark = this.extractRawWatermark(rows);

        // Remove internal column before building records
        for (const row of rows) {
            delete row['__mj_raw_ts'];
        }

        const records = rows.map((row) =>
            this.BuildExternalRecord(row, idField, ctx.ObjectName, modifiedAtField, deletedField)
        );

        return { Records: records, HasMore: hasMore, NewWatermarkValue: newWatermark };
    }

    /**
     * Extracts the full-precision watermark string from the last row's __mj_raw_ts column.
     * Uses CONVERT(varchar, ..., 126) output which preserves datetime2(7) precision,
     * avoiding the sub-millisecond truncation that JavaScript Date introduces.
     * @param rows - Array of database rows containing __mj_raw_ts
     * @returns Full-precision datetime2 string, or undefined
     */
    private extractRawWatermark(rows: Record<string, unknown>[]): string | undefined {
        if (rows.length === 0) return undefined;
        const rawTs = rows[rows.length - 1]['__mj_raw_ts'];
        return rawTs != null ? String(rawTs) : undefined;
    }

    /**
     * Closes all cached connection pools. Call during cleanup/shutdown.
     */
    public async CloseAllPools(): Promise<void> {
        for (const pool of this.poolCache.values()) {
            if (pool.connected) {
                await pool.close();
            }
        }
        this.poolCache.clear();
    }
}

/** Row shape from INFORMATION_SCHEMA.COLUMNS query */
interface ColumnSchemaRow {
    COLUMN_NAME: string;
    DATA_TYPE: string;
    IS_NULLABLE: string;
    IS_IDENTITY: number;
}

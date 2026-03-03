import { DatabaseProviderBase, UserInfo, LogError, LogStatus } from '@memberjunction/core';

/**
 * Manages SQL schema and table operations for YM data sync.
 *
 * Dynamically creates/alters tables based on the shape of incoming data,
 * and performs upserts using MERGE statements.
 */
export class YMSchemaManager {
    private schemaName: string;
    private contextUser: UserInfo;
    private dbProvider: DatabaseProviderBase;

    constructor(schemaName: string, contextUser: UserInfo, dbProvider: DatabaseProviderBase) {
        this.schemaName = schemaName;
        this.contextUser = contextUser;
        this.dbProvider = dbProvider;
    }

    /**
     * Ensures the target schema exists.
     */
    public async EnsureSchemaExists(): Promise<void> {
        const sql = `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '${this.schemaName}')
            EXEC('CREATE SCHEMA [${this.schemaName}]')`;
        await this.executeSql(sql);
    }

    /**
     * Ensures a table exists with columns inferred from a sample record.
     * Creates the table if missing; adds new columns if the schema has grown.
     */
    public async EnsureTableExists(
        tableName: string,
        sampleRecord: Record<string, unknown>
    ): Promise<void> {
        const fullTableName = `[${this.schemaName}].[${tableName}]`;
        const tableExists = await this.checkTableExists(tableName);
        // Sanitize the sample so column names don't collide with reserved columns
        const sanitized = this.sanitizeRecord(sampleRecord);

        if (!tableExists) {
            await this.createTable(fullTableName, sanitized);
        } else {
            await this.addMissingColumns(fullTableName, tableName, sanitized);
        }
    }

    /**
     * Upserts records into the table using MERGE, keyed on YM_SourceID.
     * Processes in batches of 500.
     */
    public async UpsertRecords(
        tableName: string,
        records: Record<string, unknown>[],
        pkFields: string[]
    ): Promise<{ Inserted: number; Updated: number }> {
        const fullTableName = `[${this.schemaName}].[${tableName}]`;
        let totalInserted = 0;
        let totalUpdated = 0;
        const batchSize = 500;

        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            const result = await this.mergeBatch(fullTableName, batch, pkFields);
            totalInserted += result.Inserted;
            totalUpdated += result.Updated;
        }

        return { Inserted: totalInserted, Updated: totalUpdated };
    }

    /**
     * Truncates a table for full refresh.
     */
    public async TruncateTable(tableName: string): Promise<void> {
        const fullTableName = `[${this.schemaName}].[${tableName}]`;
        await this.executeSql(`TRUNCATE TABLE ${fullTableName}`);
    }

    // ─── Private helpers ─────────────────────────────────────────

    /** Column names reserved by the sync framework that cannot come from YM data */
    private static readonly RESERVED_COLUMNS = new Set(['id', 'ym_sourceid', 'ym_lastsyncedat']);

    /**
     * Sanitizes a YM field name to avoid collision with reserved columns.
     * If the field name (case-insensitive) collides, it gets a 'YM_' prefix.
     */
    private sanitizeColumnName(fieldName: string): string {
        if (YMSchemaManager.RESERVED_COLUMNS.has(fieldName.toLowerCase())) {
            return `YM_${fieldName}`;
        }
        return fieldName;
    }

    /**
     * Returns a sanitized copy of a record with renamed keys where needed.
     */
    private sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
            sanitized[this.sanitizeColumnName(key)] = value;
        }
        return sanitized;
    }

    private async checkTableExists(tableName: string): Promise<boolean> {
        const sql = `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = '${this.schemaName}' AND TABLE_NAME = '${tableName}'`;
        const result = await this.executeSql(sql);
        return result && result.length > 0 && Number(result[0].cnt) > 0;
    }

    private async createTable(
        fullTableName: string,
        sampleRecord: Record<string, unknown>
    ): Promise<void> {
        const columns = this.buildColumnDefinitions(sampleRecord);
        const sql = `CREATE TABLE ${fullTableName} (
            [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
            [YM_SourceID] NVARCHAR(500) NOT NULL,
            ${columns},
            [YM_LastSyncedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()
        );
        CREATE UNIQUE INDEX [UX_${fullTableName.replace(/[\[\].]/g, '')}_SourceID]
            ON ${fullTableName} ([YM_SourceID]);`;

        LogStatus(`YM Schema: Creating table ${fullTableName}`);
        await this.executeSql(sql);
    }

    private async addMissingColumns(
        fullTableName: string,
        tableName: string,
        sampleRecord: Record<string, unknown>
    ): Promise<void> {
        const existingColumns = await this.getExistingColumns(tableName);
        const existingSet = new Set(existingColumns.map(c => c.toLowerCase()));

        for (const [key, value] of Object.entries(sampleRecord)) {
            if (!existingSet.has(key.toLowerCase())) {
                const sqlType = this.inferSqlType(value);
                const sql = `ALTER TABLE ${fullTableName} ADD [${key}] ${sqlType} NULL`;
                LogStatus(`YM Schema: Adding column [${key}] to ${fullTableName}`);
                await this.executeSql(sql);
            }
        }
    }

    private async getExistingColumns(tableName: string): Promise<string[]> {
        const sql = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = '${this.schemaName}' AND TABLE_NAME = '${tableName}'`;
        const result = await this.executeSql(sql);
        return result ? result.map((r: Record<string, unknown>) => String(r.COLUMN_NAME)) : [];
    }

    private buildColumnDefinitions(record: Record<string, unknown>): string {
        return Object.entries(record)
            .map(([key, value]) => `[${key}] ${this.inferSqlType(value)} NULL`)
            .join(',\n            ');
    }

    private inferSqlType(value: unknown): string {
        if (value == null) return 'NVARCHAR(MAX)';
        if (typeof value === 'boolean') return 'BIT';
        if (typeof value === 'number') {
            return Number.isInteger(value) ? 'INT' : 'DECIMAL(18,4)';
        }
        if (typeof value === 'string') {
            return value.length > 500 ? 'NVARCHAR(MAX)' : 'NVARCHAR(500)';
        }
        if (typeof value === 'object') return 'NVARCHAR(MAX)';
        return 'NVARCHAR(MAX)';
    }

    /**
     * Builds a composite YM_SourceID from one or more PK field values.
     * Single field: just the value. Multiple fields: joined with '|'.
     */
    private buildSourceId(record: Record<string, unknown>, pkFields: string[]): string {
        const parts = pkFields.map(f => String(record[f] ?? ''));
        return parts.join('|');
    }

    private async mergeBatch(
        fullTableName: string,
        records: Record<string, unknown>[],
        pkFields: string[]
    ): Promise<{ Inserted: number; Updated: number }> {
        if (records.length === 0) return { Inserted: 0, Updated: 0 };

        // Sanitize all records so column names match the SQL table
        const sanitizedRecords = records.map(r => this.sanitizeRecord(r));

        const columns = Object.keys(sanitizedRecords[0]);
        const columnList = columns.map(c => `[${c}]`).join(', ');
        const updateSet = columns
            .map(c => `T.[${c}] = S.[${c}]`)
            .join(', ');

        const valueRows = sanitizedRecords.map((record, idx) => {
            // Build composite source ID from original (unsanitized) record PK fields
            const sourceId = this.escapeValue(this.buildSourceId(records[idx], pkFields));
            const vals = columns.map(c => this.escapeValue(record[c]));
            return `(${sourceId}, ${vals.join(', ')}, GETUTCDATE())`;
        });

        const sql = `
            DECLARE @mergeOutput TABLE (MergeAction NVARCHAR(10));
            MERGE INTO ${fullTableName} AS T
            USING (VALUES ${valueRows.join(',\n')})
                AS S ([YM_SourceID], ${columnList}, [YM_LastSyncedAt])
            ON T.[YM_SourceID] = S.[YM_SourceID]
            WHEN MATCHED THEN
                UPDATE SET ${updateSet}, T.[YM_LastSyncedAt] = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT ([YM_SourceID], ${columnList}, [YM_LastSyncedAt])
                VALUES (S.[YM_SourceID], ${columns.map(c => `S.[${c}]`).join(', ')}, GETUTCDATE())
            OUTPUT $action INTO @mergeOutput;
            SELECT
                SUM(CASE WHEN MergeAction = 'INSERT' THEN 1 ELSE 0 END) AS Inserted,
                SUM(CASE WHEN MergeAction = 'UPDATE' THEN 1 ELSE 0 END) AS Updated
            FROM @mergeOutput;`;

        const result = await this.executeSql(sql);
        if (result && result.length > 0) {
            return {
                Inserted: Number(result[0].Inserted) || 0,
                Updated: Number(result[0].Updated) || 0,
            };
        }
        return { Inserted: 0, Updated: 0 };
    }

    private escapeValue(value: unknown): string {
        if (value == null) return 'NULL';
        if (typeof value === 'boolean') return value ? '1' : '0';
        if (typeof value === 'number') return String(value);
        if (typeof value === 'object') {
            const json = JSON.stringify(value).replace(/'/g, "''");
            return `N'${json}'`;
        }
        const str = String(value).replace(/'/g, "''");
        return `N'${str}'`;
    }

    private async executeSql(sql: string): Promise<Record<string, unknown>[]> {
        try {
            return await this.dbProvider.ExecuteSQL(sql, undefined, undefined, this.contextUser);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`YM SchemaManager SQL error: ${message}`);
            throw error;
        }
    }
}

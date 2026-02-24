import { DatabaseProviderBase, UserInfo } from '@memberjunction/core';

/**
 * Manages SQL schema and table operations for YM data sync.
 * Uses DatabaseProviderBase.ExecuteSQL() for all DDL/DML because
 * the target tables are raw data dumps — NOT registered MJ entities.
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
     * Ensures the target schema exists (CREATE SCHEMA IF NOT EXISTS).
     */
    public async EnsureSchemaExists(): Promise<void> {
        const sql = `
            IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '${this.escapeSql(this.schemaName)}')
            BEGIN
                EXEC('CREATE SCHEMA [${this.escapeSql(this.schemaName)}]')
            END
        `;
        await this.dbProvider.ExecuteSQL(sql, undefined, undefined, this.contextUser);
    }

    /**
     * Ensures a table exists with columns matching the data shape.
     * Creates the table if it doesn't exist; adds new columns via ALTER TABLE if it does.
     *
     * @param tableName - Table name (without schema prefix)
     * @param sampleRecord - A sample record to infer column types from
     * @param pkField - The YM primary key field name (stored as YM_SourceID)
     */
    public async EnsureTableExists(
        tableName: string,
        sampleRecord: Record<string, unknown>,
        pkField: string
    ): Promise<void> {
        const fullTableName = this.fullName(tableName);
        const tableExists = await this.tableExists(tableName);

        if (!tableExists) {
            await this.createTable(fullTableName, tableName, sampleRecord, pkField);
        } else {
            await this.addMissingColumns(fullTableName, tableName, sampleRecord, pkField);
        }
    }

    /**
     * Upserts a batch of records into the target table using SQL MERGE.
     * Keyed on YM_SourceID (the YM primary key value).
     */
    public async UpsertRecords(
        tableName: string,
        records: Record<string, unknown>[],
        pkField: string
    ): Promise<{ Inserted: number; Updated: number }> {
        if (records.length === 0) {
            return { Inserted: 0, Updated: 0 };
        }

        const fullTableName = this.fullName(tableName);
        let totalInserted = 0;
        let totalUpdated = 0;

        // Process in batches of 500
        const batchSize = 500;
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            const count = await this.upsertBatch(fullTableName, batch, pkField);
            totalInserted += count;
        }

        return { Inserted: totalInserted, Updated: totalUpdated };
    }

    /**
     * Truncates a table (for full refresh mode).
     */
    public async TruncateTable(tableName: string): Promise<void> {
        const exists = await this.tableExists(tableName);
        if (exists) {
            await this.dbProvider.ExecuteSQL(
                `TRUNCATE TABLE ${this.fullName(tableName)}`,
                undefined, undefined, this.contextUser
            );
        }
    }

    // ── Private Helpers ──────────────────────────────────────────────────

    private fullName(tableName: string): string {
        return `[${this.escapeSql(this.schemaName)}].[${this.escapeSql(tableName)}]`;
    }

    private async tableExists(tableName: string): Promise<boolean> {
        const result = await this.dbProvider.ExecuteSQL<{ cnt: number }>(
            `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = '${this.escapeSql(this.schemaName)}'
               AND TABLE_NAME = '${this.escapeSql(tableName)}'`,
            undefined, undefined, this.contextUser
        );
        return result.length > 0 && result[0].cnt > 0;
    }

    private async createTable(
        fullTableName: string,
        tableName: string,
        sampleRecord: Record<string, unknown>,
        pkField: string
    ): Promise<void> {
        const columns = this.buildColumnDefinitions(sampleRecord, pkField);
        const constraintSuffix = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
        const sql = `
            CREATE TABLE ${fullTableName} (
                ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
                YM_SourceID NVARCHAR(200) NOT NULL,
                ${columns},
                YM_LastSyncedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
                CONSTRAINT PK_${constraintSuffix} PRIMARY KEY (ID)
            );
            CREATE UNIQUE INDEX UX_${constraintSuffix}_SourceID
                ON ${fullTableName} (YM_SourceID);
        `;
        await this.dbProvider.ExecuteSQL(sql, undefined, undefined, this.contextUser);
    }

    private buildColumnDefinitions(
        sampleRecord: Record<string, unknown>,
        pkField: string
    ): string {
        const columnDefs: string[] = [];
        for (const [key, value] of Object.entries(sampleRecord)) {
            if (key === pkField) continue;
            const sqlType = this.inferSQLType(value);
            columnDefs.push(`[${this.escapeSql(key)}] ${sqlType} NULL`);
        }
        return columnDefs.join(',\n                ');
    }

    private async addMissingColumns(
        fullTableName: string,
        tableName: string,
        sampleRecord: Record<string, unknown>,
        pkField: string
    ): Promise<void> {
        const existingColumns = await this.getExistingColumns(tableName);

        for (const [key, value] of Object.entries(sampleRecord)) {
            if (key === pkField) continue;
            const normalizedKey = key.toLowerCase();
            if (normalizedKey === 'ym_sourceid' || normalizedKey === 'id') continue;
            if (!existingColumns.has(normalizedKey)) {
                const sqlType = this.inferSQLType(value);
                await this.dbProvider.ExecuteSQL(
                    `ALTER TABLE ${fullTableName} ADD [${this.escapeSql(key)}] ${sqlType} NULL`,
                    undefined, undefined, this.contextUser
                );
            }
        }
    }

    private async getExistingColumns(tableName: string): Promise<Set<string>> {
        const result = await this.dbProvider.ExecuteSQL<{ COLUMN_NAME: string }>(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = '${this.escapeSql(this.schemaName)}'
               AND TABLE_NAME = '${this.escapeSql(tableName)}'`,
            undefined, undefined, this.contextUser
        );
        return new Set(result.map(r => r.COLUMN_NAME.toLowerCase()));
    }

    private async upsertBatch(
        fullTableName: string,
        records: Record<string, unknown>[],
        pkField: string
    ): Promise<number> {
        const allKeys = this.collectAllKeys(records, pkField);
        const valueRows = records.map(record => {
            const sourceId = this.sqlValue(record[pkField]);
            const dataValues = allKeys.map(key => this.sqlValue(record[key]));
            return `(${sourceId}, ${dataValues.join(', ')})`;
        });

        const sourceColumns = allKeys.map(k => `[${this.escapeSql(k)}]`).join(', ');
        const updateSet = allKeys
            .map(k => `T.[${this.escapeSql(k)}] = S.[${this.escapeSql(k)}]`)
            .join(', ');
        const insertColumns = `YM_SourceID, ${sourceColumns}`;
        const insertValues = `S.YM_SourceID, ${allKeys.map(k => `S.[${this.escapeSql(k)}]`).join(', ')}`;

        const mergeSql = `
            MERGE ${fullTableName} AS T
            USING (VALUES ${valueRows.join(',\n                ')})
                AS S (YM_SourceID, ${sourceColumns})
            ON T.YM_SourceID = S.YM_SourceID
            WHEN MATCHED THEN
                UPDATE SET ${updateSet}, T.YM_LastSyncedAt = GETUTCDATE()
            WHEN NOT MATCHED THEN
                INSERT (${insertColumns}, YM_LastSyncedAt)
                VALUES (${insertValues}, GETUTCDATE());
        `;

        await this.dbProvider.ExecuteSQL(mergeSql, undefined, undefined, this.contextUser);
        return records.length;
    }

    private collectAllKeys(records: Record<string, unknown>[], pkField: string): string[] {
        const keySet = new Set<string>();
        for (const record of records) {
            for (const key of Object.keys(record)) {
                if (key !== pkField) {
                    keySet.add(key);
                }
            }
        }
        return Array.from(keySet).sort();
    }

    /**
     * Infers a SQL Server column type from a JavaScript value.
     */
    private inferSQLType(value: unknown): string {
        if (value === null || value === undefined) {
            return 'NVARCHAR(MAX)';
        }
        switch (typeof value) {
            case 'string':
                return value.length > 500 ? 'NVARCHAR(MAX)' : 'NVARCHAR(500)';
            case 'number':
                return Number.isInteger(value) ? 'INT' : 'DECIMAL(18,4)';
            case 'boolean':
                return 'BIT';
            case 'object':
                return 'NVARCHAR(MAX)';
            default:
                return 'NVARCHAR(MAX)';
        }
    }

    /**
     * Converts a JS value to a SQL literal string.
     */
    private sqlValue(value: unknown): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'string') {
            return `N'${this.escapeSql(value)}'`;
        }
        if (typeof value === 'number') {
            return String(value);
        }
        if (typeof value === 'boolean') {
            return value ? '1' : '0';
        }
        if (typeof value === 'object') {
            return `N'${this.escapeSql(JSON.stringify(value))}'`;
        }
        return `N'${this.escapeSql(String(value))}'`;
    }

    /**
     * Escapes single quotes for SQL string literals.
     */
    private escapeSql(value: string): string {
        return value.replace(/'/g, "''");
    }
}

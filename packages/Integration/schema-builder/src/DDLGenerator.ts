/**
 * DDLGenerator — produces CREATE TABLE / ALTER TABLE SQL strings.
 * File-emission only — never executes SQL.
 */
import { GetDialect } from '@memberjunction/sql-dialect';
import type { DatabasePlatform, TargetColumnConfig, TargetTableConfig, ColumnModification } from './interfaces.js';

/** Characters allowed in identifiers (schema, table, column names). */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Names of the standard `__mj_integration_*` tracking columns on every integration table. */
export type StandardIntegrationColumnName =
    | '__mj_integration_SyncStatus'
    | '__mj_integration_LastSyncedAt'
    | '__mj_integration_LastSyncedSnapshot'
    | '__mj_integration_SyncMessage'
    | '__mj_integration_ContentHash'
    | '__mj_integration_CustomOverflow'
    | '__mj_integration_ExternalVersion'
    | '__mj_integration_LastSeenModifiedValue'
    | '__mj_integration_LastReconciledAt'
    | '__mj_integration_LastWriterDirection'
    | '__mj_integration_IsTombstoned'
    | '__mj_integration_DeletedDetectedAt';

/** Standard descriptions for the `__mj_integration_*` tracking columns on every integration table. */
export const STANDARD_COLUMN_DESCRIPTIONS: Readonly<Record<StandardIntegrationColumnName, string>> = Object.freeze({
    '__mj_integration_SyncStatus': 'Current per-record sync status: Active, Archived, Error, or Conflict (both sides changed the same field; the record awaits resolution per the entity map ConflictResolution policy).',
    '__mj_integration_LastSyncedAt': 'Timestamp of the last successful sync for this record',
    '__mj_integration_LastSyncedSnapshot': 'The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.',
    '__mj_integration_SyncMessage': 'Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.',
    '__mj_integration_ContentHash': 'SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark.',
    '__mj_integration_CustomOverflow': 'Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the "extra" keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.',
    '__mj_integration_ExternalVersion': 'The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.',
    '__mj_integration_LastSeenModifiedValue': 'The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).',
    '__mj_integration_LastReconciledAt': 'Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).',
    '__mj_integration_LastWriterDirection': 'Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.',
    '__mj_integration_IsTombstoned': 'Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.',
    '__mj_integration_DeletedDetectedAt': 'Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.',
});

/**
 * Generates DDL SQL for creating and altering integration tables.
 */
export class DDLGenerator {
    /**
     * Generate CREATE SCHEMA IF NOT EXISTS statement.
     */
    GenerateCreateSchema(schemaName: string, platform: DatabasePlatform): string {
        ValidateIdentifier(schemaName, 'schema');
        if (platform === 'sqlserver') {
            return `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '${schemaName}')\n    EXEC('CREATE SCHEMA [${schemaName}]');\nGO`;
        }
        return `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`;
    }

    /**
     * Generate a full CREATE TABLE statement.
     * PK fields keep their natural names from the source system and are emitted as ORDINARY columns —
     * NO database constraint (not PRIMARY KEY, not UNIQUE). Their PK-ness is SOFT: it lives only in
     * additionalSchemaInfo, which CodeGen reads (via applySoftPKFKConfig) to set the entity's METADATA
     * PK + IsSoftPrimaryKey flag — never a DB key. See the detailed note at the soft-PK block below.
     * Standard integration columns (__mj_integration_*) are added automatically.
     */
    GenerateCreateTable(config: TargetTableConfig, platform: DatabasePlatform): string {
        ValidateIdentifier(config.SchemaName, 'schema');
        ValidateIdentifier(config.TableName, 'table');

        const q = platform === 'sqlserver' ? QuoteSqlServer : QuotePostgres;
        const d = GetDialect(platform);
        const fullTable = `${q(config.SchemaName)}.${q(config.TableName)}`;

        const lines: string[] = [];

        // User-configured columns (includes PK, Soft FK, and Organic Key fields as regular columns)
        const indexedColSet = new Set<string>([
            ...(config.PrimaryKeyFields ?? []).map(f => f.toLowerCase()),
            ...(config.SoftForeignKeys ?? []).map(fk => fk.FieldName.toLowerCase()),
            ...(config.OrganicKeyFields ?? []).flat().map(c => c.toLowerCase()),
        ]);
        for (const col of config.Columns) {
            ValidateIdentifier(col.TargetColumnName, 'column');
            const nullable = col.IsNullable ? 'NULL' : 'NOT NULL';
            const defaultExpr = col.DefaultValue != null ? ` DEFAULT ${col.DefaultValue}` : '';
            // NVARCHAR(MAX) and NVARCHAR(>450) cannot be indexed on SQL Server — cap indexed key columns to NVARCHAR(450)
            const isIndexedCol = indexedColSet.has(col.TargetColumnName.toLowerCase());
            const sqlType = isIndexedCol ? d.CapIndexableType(col.TargetSqlType) : col.TargetSqlType;
            lines.push(`    ${q(col.TargetColumnName)} ${sqlType} ${nullable}${defaultExpr}`);
        }

        // Standard integration columns (prefixed to avoid collisions)
        lines.push(...this.standardColumns(platform));

        // PK/FK/OrganicKey are SOFT-ONLY — declared in additionalSchemaInfo/metadata, and emitted as
        // NO database constraint (not PRIMARY KEY, not UNIQUE, not FOREIGN KEY). Instead we emit
        // idempotent NON-UNIQUE indexes so lookups and joins use Index Seek without blocking writes.
        const softIndexes: string[] = [];
        const indexedTuples = new Set<string>();

        if (config.PrimaryKeyFields && config.PrimaryKeyFields.length > 0) {
            config.PrimaryKeyFields.forEach(f => ValidateIdentifier(f, 'pk column'));
            const tupleKey = config.PrimaryKeyFields.map(f => f.toLowerCase()).join(',');
            if (!indexedTuples.has(tupleKey)) {
                indexedTuples.add(tupleKey);
                softIndexes.push(
                    d.CreateIndexIfAbsent({
                        schema: config.SchemaName,
                        tableName: config.TableName,
                        indexName: `IX_${config.SchemaName}_${config.TableName}_PK`,
                        columns: config.PrimaryKeyFields,
                        unique: false,
                    })
                );
            }
        }

        for (const fk of config.SoftForeignKeys ?? []) {
            ValidateIdentifier(fk.FieldName, 'soft-fk column');
            const tupleKey = fk.FieldName.toLowerCase();
            if (!indexedTuples.has(tupleKey)) {
                indexedTuples.add(tupleKey);
                softIndexes.push(
                    d.CreateIndexIfAbsent({
                        schema: config.SchemaName,
                        tableName: config.TableName,
                        indexName: `IX_${config.SchemaName}_${config.TableName}_FK_${fk.FieldName}`,
                        columns: [fk.FieldName],
                        unique: false,
                    })
                );
            }
        }

        for (const cols of config.OrganicKeyFields ?? []) {
            if (cols.length === 0) continue;
            cols.forEach(c => ValidateIdentifier(c, 'organic-key column'));
            const tupleKey = cols.map(c => c.toLowerCase()).join(',');
            if (!indexedTuples.has(tupleKey)) {
                indexedTuples.add(tupleKey);
                softIndexes.push(
                    d.CreateIndexIfAbsent({
                        schema: config.SchemaName,
                        tableName: config.TableName,
                        indexName: `IX_${config.SchemaName}_${config.TableName}_OK_${cols.join('_')}`,
                        columns: cols,
                        unique: false,
                    })
                );
            }
        }

        const body = lines.join(',\n');
        // Idempotent create: skip if the physical table already exists. Makes re-running
        // Create-Tables safe even when MJ has no entity for the table yet (e.g. a prior run
        // created the table but entity generation hadn't completed), avoiding
        // "There is already an object named '<table>'" collisions.
        const createTable = this.generateIdempotentCreateTableStatement(fullTable, body, platform);

        const trailing: string[] = [...softIndexes, ...this.GenerateDescriptions(config, platform)];

        if (trailing.length > 0) {
            return createTable + '\n\n' + trailing.join('\n\n');
        }

        return createTable;
    }

    /**
     * Build a platform-specific, idempotent CREATE TABLE statement (creates only when the
     * table is absent). Each platform is handled explicitly — postgresql is NOT treated as a
     * "not sqlserver" catch-all — and the `never` default makes adding a new DatabasePlatform
     * a compile error here rather than a silent fall-through to the wrong dialect.
     */
    private generateIdempotentCreateTableStatement(fullTable: string, body: string, platform: DatabasePlatform): string {
        switch (platform) {
            case 'sqlserver':
                // Single-statement IF guard (no BEGIN/END) so RSU's batch chunking on ';\n' can't split it.
                return `IF OBJECT_ID(N'${fullTable}', N'U') IS NULL\nCREATE TABLE ${fullTable} (\n${body}\n);`;
            case 'postgresql':
                // Postgres has native idempotent create.
                return `CREATE TABLE IF NOT EXISTS ${fullTable} (\n${body}\n);`;
            default: {
                const unsupported: never = platform;
                throw new Error(`GenerateIdempotentCreateTableStatement: unsupported database platform '${String(unsupported)}'`);
            }
        }
    }

    /**
     * Generate idempotent table and column description statements for the target platform
     * via `SQLDialect` (`MS_Description` guarded by `sys.fn_listextendedproperty` on SQL Server,
     * `COMMENT ON TABLE`/`COMMENT ON COLUMN` on PostgreSQL).
     */
    GenerateDescriptions(config: TargetTableConfig, platform: DatabasePlatform): string[] {
        ValidateIdentifier(config.SchemaName, 'schema');
        ValidateIdentifier(config.TableName, 'table');

        const dialect = GetDialect(platform);
        const statements: string[] = [];

        if (this.hasMeaningfulDescription(config.Description)) {
            statements.push(dialect.CommentOnObjectIfAbsent('TABLE', config.SchemaName, config.TableName, config.Description));
        }

        for (const [colName, desc] of Object.entries(STANDARD_COLUMN_DESCRIPTIONS)) {
            if (this.hasMeaningfulDescription(desc)) {
                statements.push(dialect.CommentOnColumnIfAbsent(config.SchemaName, config.TableName, colName, desc));
            }
        }

        for (const col of config.Columns) {
            ValidateIdentifier(col.TargetColumnName, 'column');
            if (this.hasMeaningfulDescription(col.Description)) {
                statements.push(dialect.CommentOnColumnIfAbsent(config.SchemaName, config.TableName, col.TargetColumnName, col.Description));
            }
        }

        return statements;
    }

    /**
     * Generate SQL Server `sp_addextendedproperty` calls for table and column descriptions.
     * Delegates to {@link GenerateDescriptions} for `'sqlserver'`.
     */
    GenerateExtendedProperties(config: TargetTableConfig): string[] {
        return this.GenerateDescriptions(config, 'sqlserver');
    }

    /**
     * Generate ALTER TABLE ADD COLUMN statement (plus an idempotent column description
     * statement when `column.Description` is non-whitespace).
     */
    GenerateAlterTableAddColumn(
        schemaName: string,
        tableName: string,
        column: TargetColumnConfig,
        platform: DatabasePlatform
    ): string {
        ValidateIdentifier(schemaName, 'schema');
        ValidateIdentifier(tableName, 'table');
        ValidateIdentifier(column.TargetColumnName, 'column');

        const alterStmt = this.buildIdempotentAddColumnStatement(schemaName, tableName, column, platform);
        if (this.hasMeaningfulDescription(column.Description)) {
            const descStmt = GetDialect(platform).CommentOnColumnIfAbsent(
                schemaName, tableName, column.TargetColumnName, column.Description
            );
            return `${alterStmt}\n\n${descStmt}`;
        }

        return alterStmt;
    }

    private buildIdempotentAddColumnStatement(
        schemaName: string,
        tableName: string,
        column: TargetColumnConfig,
        platform: DatabasePlatform
    ): string {
        const q = platform === 'sqlserver' ? QuoteSqlServer : QuotePostgres;
        const fullTable = `${q(schemaName)}.${q(tableName)}`;
        const nullable = column.IsNullable ? 'NULL' : 'NOT NULL';
        const defaultExpr = column.DefaultValue != null ? ` DEFAULT ${column.DefaultValue}` : '';

        // Idempotency guard — re-applying after a partial/interrupted run (or any re-sync) must not
        // fail because the column already exists. SQL Server has no `ADD COLUMN IF NOT EXISTS`, so we
        // gate with a single-statement IF over sys.columns (no BEGIN/END, so RSU's ';\n' batch chunker
        // can't split it). Postgres has native IF NOT EXISTS.
        switch (platform) {
            case 'sqlserver': {
                const addStmt = `ALTER TABLE ${fullTable}\n    ADD ${q(column.TargetColumnName)} ${column.TargetSqlType} ${nullable}${defaultExpr};`;
                return (
                    `IF NOT EXISTS (SELECT 1 FROM sys.columns ` +
                    `WHERE object_id = OBJECT_ID(N'${q(schemaName)}.${q(tableName)}') ` +
                    `AND name = N'${column.TargetColumnName}')\n${addStmt}`
                );
            }
            case 'postgresql':
                return `ALTER TABLE ${fullTable}\n    ADD COLUMN IF NOT EXISTS ${q(column.TargetColumnName)} ${column.TargetSqlType} ${nullable}${defaultExpr};`;
            default: {
                const unsupported: never = platform;
                throw new Error(`GenerateAlterTableAddColumn: unsupported database platform '${String(unsupported)}'`);
            }
        }
    }

    private hasMeaningfulDescription(description: string | undefined | null): description is string {
        return description != null && description.replace(/\0/g, '').trim().length > 0;
    }

    /**
     * Generate ALTER TABLE ALTER COLUMN statement for type/nullability changes.
     */
    GenerateAlterTableAlterColumn(
        schemaName: string,
        tableName: string,
        mod: ColumnModification,
        platform: DatabasePlatform
    ): string {
        ValidateIdentifier(schemaName, 'schema');
        ValidateIdentifier(tableName, 'table');
        ValidateIdentifier(mod.ColumnName, 'column');

        const q = platform === 'sqlserver' ? QuoteSqlServer : QuotePostgres;
        const fullTable = `${q(schemaName)}.${q(tableName)}`;
        const nullable = mod.NewNullable ? 'NULL' : 'NOT NULL';

        if (platform === 'sqlserver') {
            return `ALTER TABLE ${fullTable}\n    ALTER COLUMN ${q(mod.ColumnName)} ${mod.NewType} ${nullable};`;
        }
        // PostgreSQL requires an explicit USING expression when the old type cannot be
        // implicitly cast to the new one (e.g. text → boolean). Always-valid, so emitted
        // unconditionally. Mirrors postgresqlDialect.AlterColumnDDL.
        const col = q(mod.ColumnName);
        const alter = `ALTER TABLE ${fullTable}\n    ALTER COLUMN ${col} TYPE ${mod.NewType} USING ${col}::${mod.NewType},\n    ALTER COLUMN ${col} ${mod.NewNullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`;
        // Bug 5a: PG forbids ALTER COLUMN TYPE while a view depends on the column. RSU runs CodeGen
        // immediately after the migration, which recreates the integration views — so we drop the
        // dependent views here (runtime catalog discovery via a DO block) and let CodeGen rebuild
        // them. The NAMED dollar tag ($mj_dropviews$) keeps the block intact through the $$-aware
        // RSU migration chunker. schemaName/tableName are already ValidateIdentifier-checked above,
        // so embedding them as literals is injection-safe.
        const dropDependentViews =
            `DO $mj_dropviews$\n` +
            `DECLARE v RECORD;\n` +
            `BEGIN\n` +
            `  FOR v IN\n` +
            `    SELECT DISTINCT dn.nspname AS s, dv.relname AS n\n` +
            `    FROM pg_depend d\n` +
            `    JOIN pg_rewrite rw ON rw.oid = d.objid\n` +
            `    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'\n` +
            `    JOIN pg_namespace dn ON dn.oid = dv.relnamespace\n` +
            `    JOIN pg_class st ON st.oid = d.refobjid\n` +
            `    JOIN pg_namespace sn ON sn.oid = st.relnamespace\n` +
            `    WHERE sn.nspname = '${schemaName}' AND st.relname = '${tableName}' AND dv.oid <> st.oid\n` +
            `  LOOP\n` +
            `    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v.s, v.n);\n` +
            `  END LOOP;\n` +
            `END\n` +
            `$mj_dropviews$;`;
        return `${dropDependentViews}\n${alter}`;
    }

    private standardColumns(platform: DatabasePlatform): string[] {
        const q = platform === 'sqlserver' ? QuoteSqlServer : QuotePostgres;
        if (platform === 'sqlserver') {
            return [
                `    ${q('__mj_integration_SyncStatus')} NVARCHAR(50) NOT NULL DEFAULT 'Active'`,
                `    ${q('__mj_integration_LastSyncedAt')} DATETIMEOFFSET NULL`,
                `    ${q('__mj_integration_LastSyncedSnapshot')} NVARCHAR(MAX) NULL`,
                `    ${q('__mj_integration_SyncMessage')} NVARCHAR(MAX) NULL`,
                `    ${q('__mj_integration_ContentHash')} NVARCHAR(64) NULL`,
                `    ${q('__mj_integration_CustomOverflow')} NVARCHAR(MAX) NULL`,
                `    ${q('__mj_integration_ExternalVersion')} NVARCHAR(255) NULL`,
                `    ${q('__mj_integration_LastSeenModifiedValue')} NVARCHAR(255) NULL`,
                `    ${q('__mj_integration_LastReconciledAt')} DATETIMEOFFSET NULL`,
                `    ${q('__mj_integration_LastWriterDirection')} NVARCHAR(10) NULL`,
                `    ${q('__mj_integration_IsTombstoned')} BIT NOT NULL DEFAULT 0`,
                `    ${q('__mj_integration_DeletedDetectedAt')} DATETIMEOFFSET NULL`,
            ];
        }
        return [
            `    ${q('__mj_integration_SyncStatus')} VARCHAR(50) NOT NULL DEFAULT 'Active'`,
            `    ${q('__mj_integration_LastSyncedAt')} TIMESTAMPTZ NULL`,
            `    ${q('__mj_integration_LastSyncedSnapshot')} TEXT NULL`,
            `    ${q('__mj_integration_SyncMessage')} TEXT NULL`,
            `    ${q('__mj_integration_ContentHash')} VARCHAR(64) NULL`,
            `    ${q('__mj_integration_CustomOverflow')} TEXT NULL`,
            `    ${q('__mj_integration_ExternalVersion')} VARCHAR(255) NULL`,
            `    ${q('__mj_integration_LastSeenModifiedValue')} VARCHAR(255) NULL`,
            `    ${q('__mj_integration_LastReconciledAt')} TIMESTAMPTZ NULL`,
            `    ${q('__mj_integration_LastWriterDirection')} VARCHAR(10) NULL`,
            `    ${q('__mj_integration_IsTombstoned')} BOOLEAN NOT NULL DEFAULT FALSE`,
            `    ${q('__mj_integration_DeletedDetectedAt')} TIMESTAMPTZ NULL`,
        ];
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

function QuoteSqlServer(name: string): string {
    return `[${name}]`;
}

function QuotePostgres(name: string): string {
    return `"${name}"`;
}

/** Validates that an identifier contains only safe characters. */
export function ValidateIdentifier(name: string, kind: string): void {
    if (!IDENTIFIER_RE.test(name)) {
        throw new Error(`Invalid ${kind} name "${name}": must match ${IDENTIFIER_RE.source}`);
    }
}

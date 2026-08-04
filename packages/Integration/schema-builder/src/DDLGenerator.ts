/**
 * DDLGenerator — produces CREATE TABLE / ALTER TABLE SQL strings.
 * File-emission only — never executes SQL.
 */
import type { DatabasePlatform, TargetColumnConfig, TargetTableConfig, ColumnModification } from './interfaces.js';

/** Characters allowed in identifiers (schema, table, column names). */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
        const fullTable = `${q(config.SchemaName)}.${q(config.TableName)}`;

        const lines: string[] = [];

        // User-configured columns (includes PK fields as regular columns)
        const pkFieldSet = new Set(config.PrimaryKeyFields.map(f => f.toLowerCase()));
        for (const col of config.Columns) {
            ValidateIdentifier(col.TargetColumnName, 'column');
            const nullable = col.IsNullable ? 'NULL' : 'NOT NULL';
            const defaultExpr = col.DefaultValue != null ? ` DEFAULT ${col.DefaultValue}` : '';
            // NVARCHAR(MAX) cannot be indexed — cap PK columns to NVARCHAR(450)
            const isPkCol = pkFieldSet.has(col.TargetColumnName.toLowerCase());
            const sqlType = isPkCol && col.TargetSqlType.toUpperCase() === 'NVARCHAR(MAX)'
                ? 'NVARCHAR(450)'
                : col.TargetSqlType;
            lines.push(`    ${q(col.TargetColumnName)} ${sqlType} ${nullable}${defaultExpr}`);
        }

        // Standard integration columns (prefixed to avoid collisions)
        lines.push(...this.StandardColumns(platform));

        // PK is SOFT-ONLY — declared in additionalSchemaInfo (which CodeGen reads to set the entity's
        // metadata PK), and emitted as NO database constraint here: not a PRIMARY KEY, and not even a
        // UNIQUE. Integration PKs are *inferred* (naming + streamed-data statistics at p<0.05), so
        // enforcing one — even as UNIQUE — would reject valid rows the moment an inference is wrong.
        // Dedupe is the engine's job via the record-map, not a DB key. So the table carries the PK
        // columns as ordinary columns; their PK-ness lives only in additionalSchemaInfo.

        const body = lines.join(',\n');
        // Idempotent create: skip if the physical table already exists. Makes re-running
        // Create-Tables safe even when MJ has no entity for the table yet (e.g. a prior run
        // created the table but entity generation hadn't completed), avoiding
        // "There is already an object named '<table>'" collisions.
        const createTable = this.GenerateIdempotentCreateTableStatement(fullTable, body, platform);

        // Generate extended properties for descriptions (SQL Server only)
        if (platform === 'sqlserver') {
            const extProps = this.GenerateExtendedProperties(config);
            if (extProps.length > 0) {
                return createTable + '\n\n' + extProps.join('\n\n');
            }
        }

        return createTable;
    }

    /**
     * Build a platform-specific, idempotent CREATE TABLE statement (creates only when the
     * table is absent). Each platform is handled explicitly — postgresql is NOT treated as a
     * "not sqlserver" catch-all — and the `never` default makes adding a new DatabasePlatform
     * a compile error here rather than a silent fall-through to the wrong dialect.
     */
    private GenerateIdempotentCreateTableStatement(fullTable: string, body: string, platform: DatabasePlatform): string {
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
     * Generate sp_addextendedproperty calls for table and column descriptions.
     */
    GenerateExtendedProperties(config: TargetTableConfig): string[] {
        const props: string[] = [];

        // Table-level description
        if (config.Description) {
            const escaped = EscapeSqlString(config.Description);
            const exec =
                `EXEC sp_addextendedproperty\n` +
                `    @name = N'MS_Description',\n` +
                `    @value = N'${escaped}',\n` +
                `    @level0type = N'SCHEMA', @level0name = '${config.SchemaName}',\n` +
                `    @level1type = N'TABLE', @level1name = '${config.TableName}';`;
            props.push(this.GuardExtendedProperty(config.SchemaName, config.TableName, null, exec));
        }

        // Standard column descriptions
        const standardDescriptions: Record<string, string> = {
            '__mj_integration_SyncStatus': 'Current per-record sync status: Active, Archived, Error, or Conflict (both sides changed the same field; the record awaits resolution per the entity map ConflictResolution policy).',
            '__mj_integration_LastSyncedAt': 'Timestamp of the last successful sync for this record',
            '__mj_integration_LastSyncedSnapshot': 'The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.',
            '__mj_integration_SyncMessage': 'Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.',
            '__mj_integration_ContentHash': 'SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark.',
            '__mj_integration_CustomOverflow': 'Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the "extra" keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.',
        };

        for (const [colName, desc] of Object.entries(standardDescriptions)) {
            props.push(this.MakeColumnExtendedProperty(config.SchemaName, config.TableName, colName, desc));
        }

        // User-configured column descriptions
        for (const col of config.Columns) {
            if (col.Description) {
                props.push(this.MakeColumnExtendedProperty(
                    config.SchemaName, config.TableName, col.TargetColumnName, col.Description
                ));
            }
        }

        return props;
    }

    private MakeColumnExtendedProperty(
        schemaName: string, tableName: string, columnName: string, description: string
    ): string {
        const escaped = EscapeSqlString(description);
        const exec =
            `EXEC sp_addextendedproperty\n` +
            `    @name = N'MS_Description',\n` +
            `    @value = N'${escaped}',\n` +
            `    @level0type = N'SCHEMA', @level0name = '${schemaName}',\n` +
            `    @level1type = N'TABLE', @level1name = '${tableName}',\n` +
            `    @level2type = N'COLUMN', @level2name = '${columnName}';`;
        return this.GuardExtendedProperty(schemaName, tableName, columnName, exec);
    }

    /**
     * Wrap an sp_addextendedproperty EXEC in an existence guard so re-running a migration is
     * idempotent — without it, re-adding MS_Description to a table/column that already has it
     * throws "Property cannot be added ... already has the property". Single-statement IF
     * (no BEGIN/END) so RSU's batch chunking on ';\n' can't split it. SQL Server only —
     * postgresql uses no extended properties here. Pass columnName=null for a table-level
     * property, or the column name for a column-level one (levels must match the EXEC).
     */
    private GuardExtendedProperty(
        schemaName: string, tableName: string, columnName: string | null, execStatement: string
    ): string {
        const level2 = columnName ? `N'COLUMN', N'${columnName}'` : `NULL, NULL`;
        return (
            `IF NOT EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(` +
            `N'MS_Description', N'SCHEMA', N'${schemaName}', N'TABLE', N'${tableName}', ${level2}))\n` +
            execStatement
        );
    }

    /**
     * Generate ALTER TABLE ADD COLUMN statement.
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

        const q = platform === 'sqlserver' ? QuoteSqlServer : QuotePostgres;
        const fullTable = `${q(schemaName)}.${q(tableName)}`;
        const nullable = column.IsNullable ? 'NULL' : 'NOT NULL';
        const defaultExpr = column.DefaultValue != null ? ` DEFAULT ${column.DefaultValue}` : '';

        // Idempotency guard — re-applying after a partial/interrupted run (or any re-sync) must not
        // fail because the column already exists. SQL Server has no `ADD COLUMN IF NOT EXISTS`, so we
        // gate with a single-statement IF over sys.columns (no BEGIN/END, so RSU's ';\n' batch chunker
        // can't split it — same shape as GuardExtendedProperty). Postgres has native IF NOT EXISTS.
        if (platform === 'sqlserver') {
            const addStmt = `ALTER TABLE ${fullTable}\n    ADD ${q(column.TargetColumnName)} ${column.TargetSqlType} ${nullable}${defaultExpr};`;
            return (
                `IF NOT EXISTS (SELECT 1 FROM sys.columns ` +
                `WHERE object_id = OBJECT_ID(N'${q(schemaName)}.${q(tableName)}') ` +
                `AND name = N'${column.TargetColumnName}')\n${addStmt}`
            );
        }
        return `ALTER TABLE ${fullTable}\n    ADD COLUMN IF NOT EXISTS ${q(column.TargetColumnName)} ${column.TargetSqlType} ${nullable}${defaultExpr};`;
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

    private StandardColumns(platform: DatabasePlatform): string[] {
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

/** Escapes single quotes in a string for use in SQL string literals. */
function EscapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

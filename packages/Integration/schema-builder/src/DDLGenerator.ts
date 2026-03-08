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
     * PK fields keep their natural names from the source system and get a UNIQUE constraint.
     * Standard integration columns (__mj_integration_*) are added automatically.
     */
    GenerateCreateTable(config: TargetTableConfig, platform: DatabasePlatform): string {
        ValidateIdentifier(config.SchemaName, 'schema');
        ValidateIdentifier(config.TableName, 'table');

        const q = platform === 'sqlserver' ? QuoteSqlServer : QuotePostgres;
        const fullTable = `${q(config.SchemaName)}.${q(config.TableName)}`;

        const lines: string[] = [];

        // User-configured columns (includes PK fields as regular columns)
        for (const col of config.Columns) {
            ValidateIdentifier(col.TargetColumnName, 'column');
            const nullable = col.IsNullable ? 'NULL' : 'NOT NULL';
            const defaultExpr = col.DefaultValue != null ? ` DEFAULT ${col.DefaultValue}` : '';
            lines.push(`    ${q(col.TargetColumnName)} ${col.TargetSqlType} ${nullable}${defaultExpr}`);
        }

        // Standard integration columns (prefixed to avoid collisions)
        lines.push(...this.StandardColumns(platform));

        // UNIQUE constraint on PK field(s) — no DB-level PK, soft PK via additionalSchemaInfo
        if (config.PrimaryKeyFields.length > 0) {
            const pkColNames = config.PrimaryKeyFields.map(f => q(f)).join(', ');
            const uqName = `UQ_${config.SchemaName}_${config.TableName}_PK`;
            lines.push(`    CONSTRAINT ${q(uqName)} UNIQUE (${pkColNames})`);
        }

        const body = lines.join(',\n');
        const createTable = `CREATE TABLE ${fullTable} (\n${body}\n);`;

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
     * Generate sp_addextendedproperty calls for table and column descriptions.
     */
    GenerateExtendedProperties(config: TargetTableConfig): string[] {
        const props: string[] = [];

        // Table-level description
        if (config.Description) {
            const escaped = EscapeSqlString(config.Description);
            props.push(
                `EXEC sp_addextendedproperty\n` +
                `    @name = N'MS_Description',\n` +
                `    @value = N'${escaped}',\n` +
                `    @level0type = N'SCHEMA', @level0name = '${config.SchemaName}',\n` +
                `    @level1type = N'TABLE', @level1name = '${config.TableName}';`
            );
        }

        // Standard column descriptions
        const standardDescriptions: Record<string, string> = {
            '__mj_integration_SyncStatus': 'Current sync status: Active, Archived, or Error',
            '__mj_integration_LastSyncedAt': 'Timestamp of the last successful sync for this record',
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
        return (
            `EXEC sp_addextendedproperty\n` +
            `    @name = N'MS_Description',\n` +
            `    @value = N'${escaped}',\n` +
            `    @level0type = N'SCHEMA', @level0name = '${schemaName}',\n` +
            `    @level1type = N'TABLE', @level1name = '${tableName}',\n` +
            `    @level2type = N'COLUMN', @level2name = '${columnName}';`
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

        if (platform === 'sqlserver') {
            return `ALTER TABLE ${fullTable}\n    ADD ${q(column.TargetColumnName)} ${column.TargetSqlType} ${nullable}${defaultExpr};`;
        }
        return `ALTER TABLE ${fullTable}\n    ADD COLUMN ${q(column.TargetColumnName)} ${column.TargetSqlType} ${nullable}${defaultExpr};`;
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
        return `ALTER TABLE ${fullTable}\n    ALTER COLUMN ${q(mod.ColumnName)} TYPE ${mod.NewType},\n    ALTER COLUMN ${q(mod.ColumnName)} ${mod.NewNullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`;
    }

    private StandardColumns(platform: DatabasePlatform): string[] {
        const q = platform === 'sqlserver' ? QuoteSqlServer : QuotePostgres;
        if (platform === 'sqlserver') {
            return [
                `    ${q('__mj_integration_SyncStatus')} NVARCHAR(50) NOT NULL DEFAULT 'Active'`,
                `    ${q('__mj_integration_LastSyncedAt')} DATETIMEOFFSET NULL`,
            ];
        }
        return [
            `    ${q('__mj_integration_SyncStatus')} VARCHAR(50) NOT NULL DEFAULT 'Active'`,
            `    ${q('__mj_integration_LastSyncedAt')} TIMESTAMPTZ NULL`,
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

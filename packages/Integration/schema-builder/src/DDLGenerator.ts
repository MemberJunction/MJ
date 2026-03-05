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
     * Generate a full CREATE TABLE statement with standard integration columns.
     */
    GenerateCreateTable(config: TargetTableConfig, platform: DatabasePlatform): string {
        ValidateIdentifier(config.SchemaName, 'schema');
        ValidateIdentifier(config.TableName, 'table');

        const q = platform === 'sqlserver' ? QuoteSqlServer : QuotePostgres;
        const fullTable = `${q(config.SchemaName)}.${q(config.TableName)}`;

        const lines: string[] = [];

        // Standard columns
        lines.push(...this.StandardColumns(platform));

        // User-configured columns
        for (const col of config.Columns) {
            ValidateIdentifier(col.TargetColumnName, 'column');
            const nullable = col.IsNullable ? 'NULL' : 'NOT NULL';
            const defaultExpr = col.DefaultValue != null ? ` DEFAULT ${col.DefaultValue}` : '';
            lines.push(`    ${q(col.TargetColumnName)} ${col.TargetSqlType} ${nullable}${defaultExpr}`);
        }

        // Constraints
        const pkName = `PK_${config.SchemaName}_${config.TableName}`;
        const uqName = `UQ_${config.SchemaName}_${config.TableName}_SourceRecordID`;
        lines.push(`    CONSTRAINT ${q(pkName)} PRIMARY KEY (${q('ID')})`);
        lines.push(`    CONSTRAINT ${q(uqName)} UNIQUE (${q('SourceRecordID')})`);

        const body = lines.join(',\n');
        return `CREATE TABLE ${fullTable} (\n${body}\n);`;
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
                `    ${q('ID')} UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID()`,
                `    ${q('SourceRecordID')} NVARCHAR(255) NOT NULL`,
                `    ${q('SourceJSON')} NVARCHAR(MAX) NULL`,
                `    ${q('SyncStatus')} NVARCHAR(50) NOT NULL DEFAULT 'Active'`,
                `    ${q('LastSyncedAt')} DATETIMEOFFSET NULL`,
            ];
        }
        return [
            `    ${q('ID')} UUID NOT NULL DEFAULT gen_random_uuid()`,
            `    ${q('SourceRecordID')} VARCHAR(255) NOT NULL`,
            `    ${q('SourceJSON')} TEXT NULL`,
            `    ${q('SyncStatus')} VARCHAR(50) NOT NULL DEFAULT 'Active'`,
            `    ${q('LastSyncedAt')} TIMESTAMPTZ NULL`,
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

/**
 * DDLGenerator — produces CREATE TABLE / ALTER TABLE SQL strings.
 * Generic: works with any TableDefinition — no integration-specific assumptions.
 * File-emission only — never executes SQL.
 */
import type {
    ColumnDefinition,
    ColumnModification,
    DatabasePlatform,
    TableDefinition,
} from './interfaces.js';

/** Characters allowed in SQL identifiers (schema, table, column names). */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Generates platform-correct DDL SQL for creating and altering tables.
 * No integration-specific columns are added automatically; consumers inject
 * any domain-specific columns via TableDefinition.AdditionalColumns.
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
     *
     * Column order:
     *   1. Columns from TableDefinition.Columns
     *   2. Columns from TableDefinition.AdditionalColumns (consumer-injected)
     *   3. UNIQUE constraint on SoftPrimaryKeys (if any)
     *   4. REFERENCES constraints on hard ForeignKeys (if any)
     *
     * Followed by extended-property calls (SQL Server only).
     */
    GenerateCreateTable(def: TableDefinition, platform: DatabasePlatform): string {
        ValidateIdentifier(def.SchemaName, 'schema');
        ValidateIdentifier(def.TableName, 'table');

        const q = Quoter(platform);
        const fullTable = `${q(def.SchemaName)}.${q(def.TableName)}`;

        const lines: string[] = [];

        // User-defined columns
        for (const col of def.Columns) {
            lines.push(this.renderColumnLine(col, platform));
        }

        // Consumer-injected columns (e.g., integration sync columns)
        for (const col of def.AdditionalColumns ?? []) {
            lines.push(this.renderColumnLine(col, platform));
        }

        // UNIQUE constraint on soft PK fields
        if (def.SoftPrimaryKeys && def.SoftPrimaryKeys.length > 0) {
            const pkColNames = def.SoftPrimaryKeys.map(f => {
                ValidateIdentifier(f, 'soft-pk column');
                return q(f);
            }).join(', ');
            const uqName = `UQ_${def.SchemaName}_${def.TableName}_PK`;
            lines.push(`    CONSTRAINT ${q(uqName)} UNIQUE (${pkColNames})`);
        }

        // Hard FK constraints (IsSoft=false only)
        for (const fk of def.ForeignKeys?.filter(f => !f.IsSoft) ?? []) {
            ValidateIdentifier(fk.ColumnName, 'fk column');
            const constraintName = `FK_${def.TableName}_${fk.ColumnName}`;
            lines.push(
                `    CONSTRAINT ${q(constraintName)} FOREIGN KEY (${q(fk.ColumnName)}) ` +
                `REFERENCES ${q(fk.ReferencedSchema)}.${q(fk.ReferencedTable)}(${q(fk.ReferencedColumn)})`
            );
        }

        const body = lines.join(',\n');
        const createTable = `CREATE TABLE ${fullTable} (\n${body}\n);`;

        // Extended properties for descriptions (SQL Server only)
        if (platform === 'sqlserver') {
            const extProps = this.GenerateExtendedProperties(def);
            if (extProps.length > 0) {
                return createTable + '\n\n' + extProps.join('\n\n');
            }
        }

        return createTable;
    }

    /**
     * Generate sp_addextendedproperty calls for table and column descriptions.
     * SQL Server only — no-op for PostgreSQL (caller uses COMMENT ON separately).
     */
    GenerateExtendedProperties(def: TableDefinition): string[] {
        const props: string[] = [];
        const allColumns = [...def.Columns, ...(def.AdditionalColumns ?? [])];

        if (def.Description) {
            const escaped = EscapeSqlString(def.Description);
            props.push(
                `EXEC sp_addextendedproperty\n` +
                `    @name = N'MS_Description',\n` +
                `    @value = N'${escaped}',\n` +
                `    @level0type = N'SCHEMA', @level0name = '${def.SchemaName}',\n` +
                `    @level1type = N'TABLE', @level1name = '${def.TableName}';`
            );
        }

        for (const col of allColumns) {
            if (col.Description) {
                props.push(this.makeColumnExtendedProperty(def.SchemaName, def.TableName, col.Name, col.Description));
            }
        }

        return props;
    }

    /**
     * Generate ALTER TABLE ADD COLUMN statement.
     */
    GenerateAlterTableAddColumn(
        schemaName: string,
        tableName: string,
        column: ColumnDefinition,
        platform: DatabasePlatform
    ): string {
        ValidateIdentifier(schemaName, 'schema');
        ValidateIdentifier(tableName, 'table');
        ValidateIdentifier(column.Name, 'column');

        const q = Quoter(platform);
        const fullTable = `${q(schemaName)}.${q(tableName)}`;
        const colDef = this.renderColumnBody(column, platform);

        if (platform === 'sqlserver') {
            return `ALTER TABLE ${fullTable}\n    ADD ${q(column.Name)} ${colDef};`;
        }
        return `ALTER TABLE ${fullTable}\n    ADD COLUMN ${q(column.Name)} ${colDef};`;
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

        const q = Quoter(platform);
        const fullTable = `${q(schemaName)}.${q(tableName)}`;
        const nullable = mod.NewNullable ? 'NULL' : 'NOT NULL';

        if (platform === 'sqlserver') {
            return `ALTER TABLE ${fullTable}\n    ALTER COLUMN ${q(mod.ColumnName)} ${mod.NewType} ${nullable};`;
        }
        return (
            `ALTER TABLE ${fullTable}\n` +
            `    ALTER COLUMN ${q(mod.ColumnName)} TYPE ${mod.NewType},\n` +
            `    ALTER COLUMN ${q(mod.ColumnName)} ${mod.NewNullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`
        );
    }

    // ─── Private helpers ─────────────────────────────────────────────

    private renderColumnLine(col: ColumnDefinition, platform: DatabasePlatform): string {
        ValidateIdentifier(col.Name, 'column');
        const q = Quoter(platform);
        return `    ${q(col.Name)} ${this.renderColumnBody(col, platform)}`;
    }

    private renderColumnBody(col: ColumnDefinition, platform: DatabasePlatform): string {
        const sqlType = col.RawSqlType ?? resolveSqlType(col, platform);
        const nullable = col.IsNullable ? 'NULL' : 'NOT NULL';
        const defaultExpr = col.DefaultValue != null ? ` DEFAULT ${col.DefaultValue}` : '';
        return `${sqlType} ${nullable}${defaultExpr}`;
    }

    private makeColumnExtendedProperty(
        schemaName: string,
        tableName: string,
        columnName: string,
        description: string
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
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Returns the platform-appropriate quoting function. */
function Quoter(platform: DatabasePlatform): (name: string) => string {
    return platform === 'sqlserver' ? QuoteSqlServer : QuotePostgres;
}

function QuoteSqlServer(name: string): string {
    return `[${name}]`;
}

function QuotePostgres(name: string): string {
    return `"${name}"`;
}

/**
 * Validates that an identifier contains only safe characters.
 * Exported for use by consumers that need to pre-validate names.
 */
export function ValidateIdentifier(name: string, kind: string): void {
    if (!IDENTIFIER_RE.test(name)) {
        throw new Error(`Invalid ${kind} name "${name}": must match ${IDENTIFIER_RE.source}`);
    }
}

/** Escapes single quotes in a string for use in SQL string literals. */
export function EscapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Resolve the SQL type for a column from its abstract Type + size hints.
 * Exposed so TypeMapper can be used independently.
 */
export function resolveSqlType(col: ColumnDefinition, platform: DatabasePlatform): string {
    return TypeMap.resolve(col.Type, col, platform);
}

// ─── Inline type resolution (avoids circular import with TypeMapper) ─

const TYPE_TABLE: Record<string, { ss: string; pg: string }> = {
    string:   { ss: 'NVARCHAR',          pg: 'VARCHAR' },
    text:     { ss: 'NVARCHAR(MAX)',      pg: 'TEXT' },
    integer:  { ss: 'INT',               pg: 'INTEGER' },
    bigint:   { ss: 'BIGINT',            pg: 'BIGINT' },
    decimal:  { ss: 'DECIMAL',           pg: 'NUMERIC' },
    boolean:  { ss: 'BIT',               pg: 'BOOLEAN' },
    datetime: { ss: 'DATETIMEOFFSET',    pg: 'TIMESTAMPTZ' },
    date:     { ss: 'DATE',              pg: 'DATE' },
    uuid:     { ss: 'UNIQUEIDENTIFIER',  pg: 'UUID' },
    json:     { ss: 'NVARCHAR(MAX)',      pg: 'JSONB' },
    float:    { ss: 'FLOAT',             pg: 'DOUBLE PRECISION' },
    time:     { ss: 'TIME',              pg: 'TIME' },
};

const TypeMap = {
    resolve(type: string, col: ColumnDefinition, platform: DatabasePlatform): string {
        const entry = TYPE_TABLE[type.toLowerCase().trim()];
        if (!entry) {
            return platform === 'sqlserver' ? 'NVARCHAR(MAX)' : 'TEXT';
        }
        const base = platform === 'sqlserver' ? entry.ss : entry.pg;
        return applyPrecision(base, type, col, platform);
    },
};

function applyPrecision(base: string, type: string, col: ColumnDefinition, platform: DatabasePlatform): string {
    if (type === 'string') {
        if (col.MaxLength != null && col.MaxLength > 0) {
            if (platform === 'sqlserver' && col.MaxLength > 4000) return 'NVARCHAR(MAX)';
            return `${base}(${col.MaxLength})`;
        }
        return `${base}(255)`;
    }
    if (type === 'decimal') {
        const precision = col.Precision ?? 18;
        const scale = col.Scale ?? 2;
        return `${base}(${precision},${scale})`;
    }
    return base;
}

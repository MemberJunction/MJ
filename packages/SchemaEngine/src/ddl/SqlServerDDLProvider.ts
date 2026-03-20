/**
 * SqlServerDDLProvider — SQL Server implementation of DDL platform provider.
 * Registered as 'sqlserver' in MJ's ClassFactory.
 *
 * Delegates identifier quoting and table description generation to SQLDialect
 * from @memberjunction/sql-dialect, ensuring consistency with the rest
 * of MJ's SQL generation pipeline.
 */
import { RegisterClass } from '@memberjunction/global';
import type { ColumnDefinition, ColumnModification } from '../interfaces.js';
import { BaseDDLPlatformProvider } from './BaseDDLPlatformProvider.js';
import { EscapeSqlString, ApplyStringLength, ApplyDecimalPrecision } from './utils.js';
import { SQLServerDialect } from '@memberjunction/sql-dialect';

const TYPE_MAP: Record<string, string> = {
  string: 'NVARCHAR',
  text: 'NVARCHAR(MAX)',
  integer: 'INT',
  bigint: 'BIGINT',
  decimal: 'DECIMAL',
  boolean: 'BIT',
  datetime: 'DATETIMEOFFSET',
  date: 'DATE',
  uuid: 'UNIQUEIDENTIFIER',
  json: 'NVARCHAR(MAX)',
  float: 'FLOAT',
  time: 'TIME',
};

@RegisterClass(BaseDDLPlatformProvider, 'sqlserver')
export class SqlServerDDLProvider extends BaseDDLPlatformProvider {
  constructor() {
    super();
    this.Dialect = new SQLServerDialect();
  }

  QuoteIdentifier(name: string): string {
    // Delegate to SQLDialect for consistent quoting across MJ
    return this.Dialect!.QuoteIdentifier(name);
  }

  CreateSchema(schemaName: string): string {
    return `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '${schemaName}')\n` +
      `    EXEC('CREATE SCHEMA [${schemaName}]');\n${this.Dialect!.BatchSeparator()}`;
  }

  AddColumnClause(quotedColName: string, colBody: string): string {
    return `ADD ${quotedColName} ${colBody}`;
  }

  AlterColumnClause(quotedTable: string, quotedColName: string, mod: ColumnModification): string {
    const nullable = mod.NewNullable ? 'NULL' : 'NOT NULL';
    return `ALTER TABLE ${quotedTable}\n    ALTER COLUMN ${quotedColName} ${mod.NewType} ${nullable};`;
  }

  DescribeTable(schemaName: string, tableName: string, description: string): string {
    // Delegate to SQLDialect.CommentOnObject for consistent sp_addextendedproperty generation
    return this.Dialect!.CommentOnObject('TABLE', schemaName, tableName, description) + ';';
  }

  DescribeColumn(schemaName: string, tableName: string, columnName: string, description: string): string {
    // SQLDialect.CommentOnObject only supports level0+level1 (schema+table).
    // Column descriptions need level2 (@level2type = 'COLUMN'), so we generate directly.
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

  ResolveType(col: ColumnDefinition): string {
    const entry = TYPE_MAP[col.Type.toLowerCase().trim()];
    if (!entry) return this.FallbackType();

    if (col.Type === 'string') return ApplyStringLength(entry, col, 4000, 'NVARCHAR(MAX)');
    if (col.Type === 'decimal') return ApplyDecimalPrecision(entry, col);
    return entry;
  }

  FallbackType(): string {
    return 'NVARCHAR(MAX)';
  }

  PlatformReservedPrefixes(): string[] {
    return ['dbo', 'guest', 'db_', 'sp_', 'xp_', 'fn_'];
  }
}

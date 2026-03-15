/**
 * SqlServerDDLProvider — SQL Server implementation of DDL platform provider.
 * Registered as 'sqlserver' in MJ's ClassFactory.
 */
import { RegisterClass } from '@memberjunction/global';
import type { ColumnDefinition, ColumnModification } from '../interfaces.js';
import { BaseDDLPlatformProvider } from './BaseDDLPlatformProvider.js';
import { EscapeSqlString, ApplyStringLength, ApplyDecimalPrecision } from './utils.js';

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
  QuoteIdentifier(name: string): string {
    return `[${name}]`;
  }

  CreateSchema(schemaName: string): string {
    return `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '${schemaName}')\n` + `    EXEC('CREATE SCHEMA [${schemaName}]');\nGO`;
  }

  AddColumnClause(quotedColName: string, colBody: string): string {
    return `ADD ${quotedColName} ${colBody}`;
  }

  AlterColumnClause(quotedTable: string, quotedColName: string, mod: ColumnModification): string {
    const nullable = mod.NewNullable ? 'NULL' : 'NOT NULL';
    return `ALTER TABLE ${quotedTable}\n    ALTER COLUMN ${quotedColName} ${mod.NewType} ${nullable};`;
  }

  DescribeTable(schemaName: string, tableName: string, description: string): string {
    const escaped = EscapeSqlString(description);
    return (
      `EXEC sp_addextendedproperty\n` +
      `    @name = N'MS_Description',\n` +
      `    @value = N'${escaped}',\n` +
      `    @level0type = N'SCHEMA', @level0name = '${schemaName}',\n` +
      `    @level1type = N'TABLE', @level1name = '${tableName}';`
    );
  }

  DescribeColumn(schemaName: string, tableName: string, columnName: string, description: string): string {
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

/**
 * PostgresDDLProvider — PostgreSQL implementation of DDL platform provider.
 * Registered as 'postgresql' in MJ's ClassFactory.
 */
import { RegisterClass } from '@memberjunction/global';
import type { ColumnDefinition, ColumnModification } from '../interfaces.js';
import { BaseDDLPlatformProvider } from './BaseDDLPlatformProvider.js';
import { EscapeSqlString, ApplyStringLength, ApplyDecimalPrecision } from './utils.js';

const TYPE_MAP: Record<string, string> = {
  string: 'VARCHAR',
  text: 'TEXT',
  integer: 'INTEGER',
  bigint: 'BIGINT',
  decimal: 'NUMERIC',
  boolean: 'BOOLEAN',
  datetime: 'TIMESTAMPTZ',
  date: 'DATE',
  uuid: 'UUID',
  json: 'JSONB',
  float: 'DOUBLE PRECISION',
  time: 'TIME',
};

@RegisterClass(BaseDDLPlatformProvider, 'postgresql')
export class PostgresDDLProvider extends BaseDDLPlatformProvider {
  QuoteIdentifier(name: string): string {
    return `"${name}"`;
  }

  CreateSchema(schemaName: string): string {
    return `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`;
  }

  AddColumnClause(quotedColName: string, colBody: string): string {
    return `ADD COLUMN ${quotedColName} ${colBody}`;
  }

  AlterColumnClause(quotedTable: string, quotedColName: string, mod: ColumnModification): string {
    return (
      `ALTER TABLE ${quotedTable}\n` +
      `    ALTER COLUMN ${quotedColName} TYPE ${mod.NewType},\n` +
      `    ALTER COLUMN ${quotedColName} ${mod.NewNullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`
    );
  }

  DescribeTable(schemaName: string, tableName: string, description: string): string {
    const escaped = EscapeSqlString(description);
    return `COMMENT ON TABLE "${schemaName}"."${tableName}" IS '${escaped}';`;
  }

  DescribeColumn(schemaName: string, tableName: string, columnName: string, description: string): string {
    const escaped = EscapeSqlString(description);
    return `COMMENT ON COLUMN "${schemaName}"."${tableName}"."${columnName}" IS '${escaped}';`;
  }

  ResolveType(col: ColumnDefinition): string {
    const entry = TYPE_MAP[col.Type.toLowerCase().trim()];
    if (!entry) return this.FallbackType();

    if (col.Type === 'string') return ApplyStringLength(entry, col);
    if (col.Type === 'decimal') return ApplyDecimalPrecision(entry, col);
    return entry;
  }

  FallbackType(): string {
    return 'TEXT';
  }

  PlatformReservedPrefixes(): string[] {
    return ['pg_'];
  }
}

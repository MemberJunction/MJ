/**
 * PostgresDDLProvider — PostgreSQL implementation of DDL platform provider.
 * Registered as 'postgresql' in MJ's ClassFactory.
 *
 * Delegates identifier quoting and table description generation to SQLDialect
 * from @memberjunction/sql-dialect, ensuring consistency with the rest
 * of MJ's SQL generation pipeline.
 */
import { RegisterClass } from '@memberjunction/global';
import type { ColumnDefinition, ColumnModification } from '../interfaces.js';
import { BaseDDLPlatformProvider } from './BaseDDLPlatformProvider.js';
import { EscapeSqlString, ApplyStringLength, ApplyDecimalPrecision } from './utils.js';
import { PostgreSQLDialect } from '@memberjunction/sql-dialect';

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
  constructor() {
    super();
    this.Dialect = new PostgreSQLDialect();
  }

  QuoteIdentifier(name: string): string {
    // Delegate to SQLDialect for consistent quoting across MJ
    return this.Dialect!.QuoteIdentifier(name);
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
    // Delegate to SQLDialect.CommentOnObject for consistent COMMENT ON generation
    return this.Dialect!.CommentOnObject('TABLE', schemaName, tableName, description) + ';';
  }

  DescribeColumn(schemaName: string, tableName: string, columnName: string, description: string): string {
    // SQLDialect.CommentOnObject doesn't support the schema."table"."column" triple syntax.
    // Column comments need the full three-part reference, so we generate directly.
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

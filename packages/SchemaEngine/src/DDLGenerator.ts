/**
 * DDLGenerator — platform-agnostic DDL generation powered by SQLDialect.
 *
 * All platform-specific behavior lives in SQLDialect implementations
 * from @memberjunction/sql-dialect. DDLGenerator orchestrates the
 * generation of CREATE TABLE, ALTER TABLE, and description metadata
 * without any platform branching.
 */
import type { ColumnDefinition, ColumnModification, DatabasePlatform, TableDefinition } from './interfaces.js';
import { SQLDialect, SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { ValidateIdentifier } from './utils.js';

// ─── Dialect Lookup ─────────────────────────────────────────────────

const DIALECT_MAP: Record<string, () => SQLDialect> = {
  sqlserver: () => new SQLServerDialect(),
  postgresql: () => new PostgreSQLDialect(),
};

/**
 * Get the SQLDialect for a given platform string.
 * Throws if the platform is not supported.
 */
export function GetDialect(platform: DatabasePlatform | string): SQLDialect {
  const factory = DIALECT_MAP[platform];
  if (!factory) {
    throw new Error(`No SQLDialect registered for "${platform}". Supported: ${Object.keys(DIALECT_MAP).join(', ')}`);
  }
  return factory();
}

// ─── DDLGenerator ───────────────────────────────────────────────────

/**
 * Generates platform-correct DDL SQL for creating and altering tables.
 * Delegates all platform-specific syntax to SQLDialect.
 */
export class DDLGenerator {
  /**
   * Generate CREATE SCHEMA IF NOT EXISTS statement.
   */
  GenerateCreateSchema(schemaName: string, platform: DatabasePlatform): string {
    ValidateIdentifier(schemaName, 'schema');
    return GetDialect(platform).CreateSchemaDDL(schemaName);
  }

  /**
   * Generate a full CREATE TABLE statement.
   */
  GenerateCreateTable(def: TableDefinition, platform: DatabasePlatform): string {
    ValidateIdentifier(def.SchemaName, 'schema');
    ValidateIdentifier(def.TableName, 'table');

    const d = GetDialect(platform);
    const q = d.QuoteIdentifier.bind(d);
    const fullTable = `${q(def.SchemaName)}.${q(def.TableName)}`;

    // PK columns in a UNIQUE constraint may need type capping (e.g. SQL Server NVARCHAR(MAX) → 450)
    const pkFieldSet = new Set((def.SoftPrimaryKeys ?? []).map(f => f.toLowerCase()));
    const lines: string[] = [];

    for (const col of def.Columns) {
      lines.push(this.renderColumnLine(this.capPKColumnType(col, pkFieldSet, d), d));
    }

    for (const col of def.AdditionalColumns ?? []) {
      lines.push(this.renderColumnLine(this.capPKColumnType(col, pkFieldSet, d), d));
    }

    if (def.SoftPrimaryKeys && def.SoftPrimaryKeys.length > 0) {
      const pkColNames = def.SoftPrimaryKeys.map((f) => {
        ValidateIdentifier(f, 'soft-pk column');
        return q(f);
      }).join(', ');
      const uqName = `UQ_${def.SchemaName}_${def.TableName}_PK`;
      lines.push(`    CONSTRAINT ${q(uqName)} UNIQUE (${pkColNames})`);
    }

    for (const fk of def.ForeignKeys?.filter((f) => !f.IsSoft) ?? []) {
      ValidateIdentifier(fk.ColumnName, 'fk column');
      const constraintName = `FK_${def.TableName}_${fk.ColumnName}`;
      lines.push(
        `    CONSTRAINT ${q(constraintName)} FOREIGN KEY (${q(fk.ColumnName)}) ` +
          `REFERENCES ${q(fk.ReferencedSchema)}.${q(fk.ReferencedTable)}(${q(fk.ReferencedColumn)})`,
      );
    }

    const body = lines.join(',\n');
    const createTable = `CREATE TABLE ${fullTable} (\n${body}\n);`;

    const descStatements = this.GenerateDescriptions(def, d);
    if (descStatements.length > 0) {
      return createTable + '\n\n' + descStatements.join('\n\n');
    }

    return createTable;
  }

  /**
   * Generate description metadata for table + columns.
   */
  GenerateDescriptions(def: TableDefinition, dialect: SQLDialect): string[] {
    const statements: string[] = [];
    const allColumns = [...def.Columns, ...(def.AdditionalColumns ?? [])];

    if (def.Description) {
      statements.push(dialect.CommentOnObject('TABLE', def.SchemaName, def.TableName, def.Description) + ';');
    }

    for (const col of allColumns) {
      if (col.Description) {
        statements.push(dialect.CommentOnColumn(def.SchemaName, def.TableName, col.Name, col.Description));
      }
    }

    return statements;
  }

  /**
   * Generate sp_addextendedproperty calls for table and column descriptions.
   * @deprecated Use GenerateDescriptions() with a dialect instead.
   */
  GenerateExtendedProperties(def: TableDefinition): string[] {
    return this.GenerateDescriptions(def, GetDialect('sqlserver'));
  }

  /**
   * Generate ALTER TABLE ADD COLUMN statement.
   */
  GenerateAlterTableAddColumn(schemaName: string, tableName: string, column: ColumnDefinition, platform: DatabasePlatform): string {
    ValidateIdentifier(schemaName, 'schema');
    ValidateIdentifier(tableName, 'table');
    ValidateIdentifier(column.Name, 'column');

    const d = GetDialect(platform);
    const q = d.QuoteIdentifier.bind(d);
    const fullTable = `${q(schemaName)}.${q(tableName)}`;
    const sqlType = column.RawSqlType ?? d.ResolveAbstractType({
      type: column.Type,
      maxLength: column.MaxLength,
      precision: column.Precision,
      scale: column.Scale,
    });

    return `ALTER TABLE ${fullTable}\n    ${d.AddColumnClause({ name: column.Name, sqlType, nullable: column.IsNullable, defaultValue: column.DefaultValue ?? undefined })};`;
  }

  /**
   * Generate ALTER TABLE ALTER COLUMN statement for type/nullability changes.
   */
  GenerateAlterTableAlterColumn(schemaName: string, tableName: string, mod: ColumnModification, platform: DatabasePlatform): string {
    ValidateIdentifier(schemaName, 'schema');
    ValidateIdentifier(tableName, 'table');
    ValidateIdentifier(mod.ColumnName, 'column');

    const d = GetDialect(platform);
    const q = d.QuoteIdentifier.bind(d);
    const fullTable = `${q(schemaName)}.${q(tableName)}`;

    return d.AlterColumnDDL(fullTable, {
      columnName: mod.ColumnName,
      newType: mod.NewType,
      newNullable: mod.NewNullable,
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private capPKColumnType(col: ColumnDefinition, pkFieldSet: Set<string>, dialect: SQLDialect): ColumnDefinition {
    if (pkFieldSet.has(col.Name.toLowerCase()) && col.RawSqlType) {
      const capped = dialect.CapIndexableType(col.RawSqlType);
      if (capped !== col.RawSqlType) {
        return { ...col, RawSqlType: capped };
      }
    }
    return col;
  }

  private renderColumnLine(col: ColumnDefinition, dialect: SQLDialect): string {
    ValidateIdentifier(col.Name, 'column');
    return `    ${dialect.QuoteIdentifier(col.Name)} ${this.renderColumnBody(col, dialect)}`;
  }

  private renderColumnBody(col: ColumnDefinition, dialect: SQLDialect): string {
    const sqlType = col.RawSqlType ?? dialect.ResolveAbstractType({
      type: col.Type,
      maxLength: col.MaxLength,
      precision: col.Precision,
      scale: col.Scale,
    });
    const nullable = col.IsNullable ? 'NULL' : 'NOT NULL';
    const defaultExpr = col.DefaultValue != null ? ` DEFAULT ${col.DefaultValue}` : '';
    return `${sqlType} ${nullable}${defaultExpr}`;
  }
}

// ─── Re-exports (backward compatibility) ────────────────────────────
export { ValidateIdentifier, EscapeSqlString } from './utils.js';

/** Resolve the SQL type for a column via SQLDialect. */
export function resolveSqlType(col: ColumnDefinition, platform: DatabasePlatform): string {
  return col.RawSqlType ?? GetDialect(platform).ResolveAbstractType({
    type: col.Type,
    maxLength: col.MaxLength,
    precision: col.Precision,
    scale: col.Scale,
  });
}

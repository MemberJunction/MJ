/**
 * DDLGenerator — platform-agnostic DDL generation powered by SQLDialect.
 *
 * All platform-specific behavior lives in SQLDialect implementations
 * from @memberjunction/sql-dialect. DDLGenerator orchestrates the
 * generation of CREATE TABLE, ALTER TABLE, and description metadata
 * without any platform branching.
 */
import type { ColumnDefinition, ColumnModification, DatabasePlatform, TableDefinition } from './interfaces.js';
import { SQLDialect, GetDialect as GetDialectFromPackage } from '@memberjunction/sql-dialect';
import { ValidateIdentifier } from './utils.js';

/**
 * Get the SQLDialect for a given platform string.
 * Delegates to the canonical factory in `@memberjunction/sql-dialect`.
 * Re-exported here for backward compatibility with SchemaEngine consumers.
 */
export function GetDialect(platform: DatabasePlatform | string): SQLDialect {
  return GetDialectFromPackage(platform);
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
   *
   * @param options.IfNotExists - When true, emit an idempotent, single-statement CREATE
   *   (and re-run-safe descriptions) so applying the migration twice — or against a table
   *   that physically exists but has no MJ entity yet — does not collide. Off by default to
   *   preserve the exact output for callers (e.g. the AI schema designer) that expect a bare
   *   CREATE TABLE. The integration Create-Tables path opts in.
   */
  GenerateCreateTable(def: TableDefinition, platform: DatabasePlatform, options?: { IfNotExists?: boolean }): string {
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

    if (def.PrimaryKeyColumns && def.PrimaryKeyColumns.length > 0) {
      const pkColNames = def.PrimaryKeyColumns.map((f) => {
        ValidateIdentifier(f, 'pk column');
        return q(f);
      }).join(', ');
      const pkName = `PK_${def.TableName}`;
      lines.push(`    CONSTRAINT ${q(pkName)} PRIMARY KEY (${pkColNames})`);
    }

    // All integration PKs/FKs are SOFT — declared in metadata so CodeGen can key its sprocs, but NOT
    // enforced by a hard DB constraint. The PK is an inferred/statistical key; a UNIQUE constraint
    // would reject genuine rows the inference missed and turn a guess into a write-blocking failure.
    // We emit a NON-UNIQUE index instead, so per-record match/load lookups stay fast without
    // enforcing a uniqueness we only inferred. (Soft FKs are already excluded in the FK loop below.)
    const softPkIndex: string[] = [];
    if (def.SoftPrimaryKeys && def.SoftPrimaryKeys.length > 0) {
      def.SoftPrimaryKeys.forEach((f) => ValidateIdentifier(f, 'soft-pk column'));
      const ixName = `IX_${def.SchemaName}_${def.TableName}_PK`;
      const idx = d.IndexDDL({
        schema: def.SchemaName,
        tableName: def.TableName,
        indexName: ixName,
        columns: def.SoftPrimaryKeys,
        unique: false,
      });
      // Idempotent on re-codegen: PG IndexDDL already emits IF NOT EXISTS; guard SQL Server explicitly.
      softPkIndex.push(
        platform === 'postgresql'
          ? idx + ';'
          : `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'${ixName}' AND object_id = OBJECT_ID(N'${fullTable}'))\n${idx};`,
      );
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
    const createTable = options?.IfNotExists
      ? d.CreateTableIfAbsent(fullTable, body)
      : `CREATE TABLE ${fullTable} (\n${body}\n);`;

    const trailing = [...softPkIndex, ...this.GenerateDescriptions(def, d, options?.IfNotExists)];
    if (trailing.length > 0) {
      return createTable + '\n\n' + trailing.join('\n\n');
    }

    return createTable;
  }

  /**
   * Generate description metadata for table + columns.
   * @param idempotent - When true, emit re-run-safe variants (guarded so re-adding an
   *   existing description does not error). Default false preserves the original output.
   */
  GenerateDescriptions(def: TableDefinition, dialect: SQLDialect, idempotent = false): string[] {
    const statements: string[] = [];
    const allColumns = [...def.Columns, ...(def.AdditionalColumns ?? [])];

    if (def.Description) {
      statements.push(idempotent
        ? dialect.CommentOnObjectIfAbsent('TABLE', def.SchemaName, def.TableName, def.Description)
        : dialect.CommentOnObject('TABLE', def.SchemaName, def.TableName, def.Description) + ';');
    }

    for (const col of allColumns) {
      if (col.Description) {
        statements.push(idempotent
          ? dialect.CommentOnColumnIfAbsent(def.SchemaName, def.TableName, col.Name, col.Description)
          : dialect.CommentOnColumn(def.SchemaName, def.TableName, col.Name, col.Description));
      }
    }

    return statements;
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

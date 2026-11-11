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

    // Columns participating in Soft PK, Soft FK, or Organic Key indexes may need type capping
    // (e.g. SQL Server NVARCHAR(MAX) or NVARCHAR(>450) → NVARCHAR(450)) so CREATE INDEX succeeds.
    const indexedColSet = new Set<string>([
      ...(def.SoftPrimaryKeys ?? []).map(f => f.toLowerCase()),
      ...(def.ForeignKeys?.filter(f => f.IsSoft).map(f => f.ColumnName.toLowerCase()) ?? []),
      ...(def.OrganicKeys ?? []).flat().map(f => f.toLowerCase()),
    ]);
    const lines: string[] = [];

    for (const col of def.Columns) {
      lines.push(this.renderColumnLine(this.capIndexedColumnType(col, indexedColSet, d), d));
    }

    for (const col of def.AdditionalColumns ?? []) {
      lines.push(this.renderColumnLine(this.capIndexedColumnType(col, indexedColSet, d), d));
    }

    const indexedTuples = new Set<string>();

    if (def.PrimaryKeyColumns && def.PrimaryKeyColumns.length > 0) {
      const pkColNames = def.PrimaryKeyColumns.map((f) => {
        ValidateIdentifier(f, 'pk column');
        return q(f);
      }).join(', ');
      const pkName = `PK_${def.TableName}`;
      lines.push(`    CONSTRAINT ${q(pkName)} PRIMARY KEY (${pkColNames})`);
      indexedTuples.add(def.PrimaryKeyColumns.map(f => f.toLowerCase()).join(','));
    }

    // All integration PKs/FKs/OrganicKeys are SOFT — declared in metadata so CodeGen can key its sprocs
    // and views, but NOT enforced by a hard DB constraint. We emit idempotent NON-UNIQUE indexes for
    // SoftPrimaryKeys, Soft ForeignKeys, and OrganicKeys so point lookups and joins use Index Seek.
    const softIndexes: string[] = [];
    if (def.SoftPrimaryKeys && def.SoftPrimaryKeys.length > 0) {
      def.SoftPrimaryKeys.forEach((f) => ValidateIdentifier(f, 'soft-pk column'));
      const tupleKey = def.SoftPrimaryKeys.map(f => f.toLowerCase()).join(',');
      if (!indexedTuples.has(tupleKey)) {
        indexedTuples.add(tupleKey);
        const ixName = `IX_${def.SchemaName}_${def.TableName}_PK`;
        softIndexes.push(
          d.CreateIndexIfAbsent({
            schema: def.SchemaName,
            tableName: def.TableName,
            indexName: ixName,
            columns: def.SoftPrimaryKeys,
            unique: false,
          }),
        );
      }
    }

    for (const fk of def.ForeignKeys?.filter((f) => f.IsSoft) ?? []) {
      ValidateIdentifier(fk.ColumnName, 'soft-fk column');
      const tupleKey = fk.ColumnName.toLowerCase();
      if (!indexedTuples.has(tupleKey)) {
        indexedTuples.add(tupleKey);
        const ixName = `IX_${def.SchemaName}_${def.TableName}_FK_${fk.ColumnName}`;
        softIndexes.push(
          d.CreateIndexIfAbsent({
            schema: def.SchemaName,
            tableName: def.TableName,
            indexName: ixName,
            columns: [fk.ColumnName],
            unique: false,
          }),
        );
      }
    }

    for (const cols of def.OrganicKeys ?? []) {
      if (cols.length === 0) continue;
      cols.forEach((c) => ValidateIdentifier(c, 'organic-key column'));
      const tupleKey = cols.map(c => c.toLowerCase()).join(',');
      if (!indexedTuples.has(tupleKey)) {
        indexedTuples.add(tupleKey);
        const ixName = `IX_${def.SchemaName}_${def.TableName}_OK_${cols.join('_')}`;
        softIndexes.push(
          d.CreateIndexIfAbsent({
            schema: def.SchemaName,
            tableName: def.TableName,
            indexName: ixName,
            columns: cols,
            unique: false,
          }),
        );
      }
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

    const trailing = [...softIndexes, ...this.GenerateDescriptions(def, d, options?.IfNotExists)];
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

  private capIndexedColumnType(col: ColumnDefinition, indexedColSet: Set<string>, dialect: SQLDialect): ColumnDefinition {
    if (!indexedColSet.has(col.Name.toLowerCase())) {
      return col;
    }
    const rawSqlType = col.RawSqlType ?? dialect.ResolveAbstractType({
      type: col.Type,
      maxLength: col.MaxLength,
      precision: col.Precision,
      scale: col.Scale,
    });
    const capped = dialect.CapIndexableType(rawSqlType);
    if (capped !== rawSqlType) {
      return { ...col, RawSqlType: capped };
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
export { ValidateIdentifier } from './utils.js';

/** Resolve the SQL type for a column via SQLDialect. */
export function ResolveSqlType(col: ColumnDefinition, platform: DatabasePlatform): string {
  return col.RawSqlType ?? GetDialect(platform).ResolveAbstractType({
    type: col.Type,
    maxLength: col.MaxLength,
    precision: col.Precision,
    scale: col.Scale,
  });
}

/** @deprecated Use {@link ResolveSqlType}. */
export function resolveSqlType(col: ColumnDefinition, platform: DatabasePlatform): string {
  return ResolveSqlType(col, platform);
}

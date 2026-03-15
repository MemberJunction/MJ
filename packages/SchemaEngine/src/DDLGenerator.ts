/**
 * DDLGenerator — platform-agnostic orchestrator for DDL generation.
 *
 * All platform-specific behavior lives in BaseDDLPlatformProvider subclasses
 * (ddl/SqlServerDDLProvider.ts, ddl/PostgresDDLProvider.ts). DDLGenerator
 * discovers them via MJ's ClassFactory and contains zero platform branching.
 *
 * To add a new platform: create a subclass, @RegisterClass it, import it.
 * No changes needed here.
 */
import type { ColumnDefinition, ColumnModification, DatabasePlatform, TableDefinition } from './interfaces.js';
import { MJGlobal } from '@memberjunction/global';
import { BaseDDLPlatformProvider } from './ddl/BaseDDLPlatformProvider.js';
import { ValidateIdentifier } from './ddl/utils.js';

// ─── Provider Lookup ────────────────────────────────────────────────

/**
 * Get the DDL platform provider for a given platform string.
 * Uses MJ's ClassFactory — external packages can register additional platforms
 * via @RegisterClass(BaseDDLPlatformProvider, 'mysql').
 */
export function GetPlatformProvider(platform: DatabasePlatform | string): BaseDDLPlatformProvider {
  const provider = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDDLPlatformProvider>(BaseDDLPlatformProvider, platform);
  if (!provider) {
    throw new Error(`No DDL platform provider registered for "${platform}". ` + `Register one with @RegisterClass(BaseDDLPlatformProvider, '${platform}')`);
  }
  return provider;
}

// ─── DDLGenerator ───────────────────────────────────────────────────

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
    return GetPlatformProvider(platform).CreateSchema(schemaName);
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
   * Followed by description metadata (platform-specific).
   */
  GenerateCreateTable(def: TableDefinition, platform: DatabasePlatform): string {
    ValidateIdentifier(def.SchemaName, 'schema');
    ValidateIdentifier(def.TableName, 'table');

    const p = GetPlatformProvider(platform);
    const q = p.QuoteIdentifier.bind(p);
    const fullTable = `${q(def.SchemaName)}.${q(def.TableName)}`;

    const lines: string[] = [];

    for (const col of def.Columns) {
      lines.push(this.renderColumnLine(col, p));
    }

    for (const col of def.AdditionalColumns ?? []) {
      lines.push(this.renderColumnLine(col, p));
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

    const descStatements = this.GenerateDescriptions(def, p);
    if (descStatements.length > 0) {
      return createTable + '\n\n' + descStatements.join('\n\n');
    }

    return createTable;
  }

  /**
   * Generate description metadata for table + columns via the platform provider.
   */
  GenerateDescriptions(def: TableDefinition, provider: BaseDDLPlatformProvider): string[] {
    const statements: string[] = [];
    const allColumns = [...def.Columns, ...(def.AdditionalColumns ?? [])];

    if (def.Description) {
      statements.push(provider.DescribeTable(def.SchemaName, def.TableName, def.Description));
    }

    for (const col of allColumns) {
      if (col.Description) {
        statements.push(provider.DescribeColumn(def.SchemaName, def.TableName, col.Name, col.Description));
      }
    }

    return statements;
  }

  /**
   * Generate sp_addextendedproperty calls for table and column descriptions.
   * @deprecated Use GenerateDescriptions() with a platform provider instead.
   */
  GenerateExtendedProperties(def: TableDefinition): string[] {
    return this.GenerateDescriptions(def, GetPlatformProvider('sqlserver'));
  }

  /**
   * Generate ALTER TABLE ADD COLUMN statement.
   */
  GenerateAlterTableAddColumn(schemaName: string, tableName: string, column: ColumnDefinition, platform: DatabasePlatform): string {
    ValidateIdentifier(schemaName, 'schema');
    ValidateIdentifier(tableName, 'table');
    ValidateIdentifier(column.Name, 'column');

    const p = GetPlatformProvider(platform);
    const q = p.QuoteIdentifier.bind(p);
    const fullTable = `${q(schemaName)}.${q(tableName)}`;
    const colBody = this.renderColumnBody(column, p);

    return `ALTER TABLE ${fullTable}\n    ${p.AddColumnClause(q(column.Name), colBody)};`;
  }

  /**
   * Generate ALTER TABLE ALTER COLUMN statement for type/nullability changes.
   */
  GenerateAlterTableAlterColumn(schemaName: string, tableName: string, mod: ColumnModification, platform: DatabasePlatform): string {
    ValidateIdentifier(schemaName, 'schema');
    ValidateIdentifier(tableName, 'table');
    ValidateIdentifier(mod.ColumnName, 'column');

    const p = GetPlatformProvider(platform);
    const q = p.QuoteIdentifier.bind(p);
    const fullTable = `${q(schemaName)}.${q(tableName)}`;

    return p.AlterColumnClause(fullTable, q(mod.ColumnName), mod);
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private renderColumnLine(col: ColumnDefinition, provider: BaseDDLPlatformProvider): string {
    ValidateIdentifier(col.Name, 'column');
    return `    ${provider.QuoteIdentifier(col.Name)} ${this.renderColumnBody(col, provider)}`;
  }

  private renderColumnBody(col: ColumnDefinition, provider: BaseDDLPlatformProvider): string {
    const sqlType = col.RawSqlType ?? provider.ResolveType(col);
    const nullable = col.IsNullable ? 'NULL' : 'NOT NULL';
    const defaultExpr = col.DefaultValue != null ? ` DEFAULT ${col.DefaultValue}` : '';
    return `${sqlType} ${nullable}${defaultExpr}`;
  }
}

// ─── Re-exports from ddl/utils (backward compatibility) ────────────
export { ValidateIdentifier, EscapeSqlString } from './ddl/utils.js';

/** Resolve the SQL type for a column via the platform provider. */
export function resolveSqlType(col: ColumnDefinition, platform: DatabasePlatform): string {
  return GetPlatformProvider(platform).ResolveType(col);
}

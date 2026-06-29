import { ExternalObjectType, ExternalSchemaRelationship } from "@memberjunction/core";
import { MJExternalDataSourceEntity } from "@memberjunction/core-entities";
import { BaseExternalDataSourceDriver } from "./BaseExternalDataSourceDriver";
import { ExternalFkRow, ExternalViewParams } from "./types";

/**
 * Intermediate base for the relational (SQL) external data source drivers
 * (SQL Server, PostgreSQL, MySQL, Oracle, Snowflake). Holds the logic that is
 * genuinely identical across dialects — identifier qualification, object-type
 * mapping, composite-key-aware FK grouping, and the SELECT skeleton — so each
 * concrete driver only supplies the bits that actually differ per dialect:
 *
 *  - {@link quoteIdent}        — identifier quoting (brackets / backticks / double-quotes)
 *  - {@link orderAndPageClause} — the ORDER BY + paging suffix (LIMIT/OFFSET vs OFFSET/FETCH vs TOP)
 *  - {@link selectTopClause}    — optional leading row-cap clause (T-SQL `TOP (n)`); default none
 *
 * Non-SQL drivers (e.g. MongoDB) extend {@link BaseExternalDataSourceDriver} directly instead.
 *
 * @typeParam TConnection - the concrete connection/pool type the driver manages.
 */
export abstract class BaseSqlExternalDataSourceDriver<TConnection = unknown> extends BaseExternalDataSourceDriver<TConnection> {
  /** Quote a single SQL identifier for this dialect, escaping the dialect's embedded quote char. */
  protected abstract quoteIdent(name: string): string;

  /**
   * Dialect-specific ORDER BY + paging suffix appended after the `FROM`/`WHERE` of a SELECT.
   * Receives the full {@link ExternalViewParams}; returns the clause (with a leading space) or ''.
   */
  protected abstract orderAndPageClause(params: ExternalViewParams): string;

  /**
   * Optional leading clause placed immediately after `SELECT` (before the projection). Default ''.
   * T-SQL overrides this to emit `TOP (n) ` for a non-paginated row cap.
   */
  protected selectTopClause(_params: ExternalViewParams): string {
    return '';
  }

  /**
   * Build a parameter-free SELECT. The projection + filter are dialect-agnostic; ordering/paging is
   * delegated to {@link orderAndPageClause} (and an optional {@link selectTopClause}). The `filter`
   * is a trusted dialect WHERE body — the same contract as MJ RunView's `ExtraFilter` — screened
   * upstream by the provider before it reaches a driver.
   */
  protected buildSelectSql(target: string, params: ExternalViewParams): string {
    const projection = params.fields?.length ? params.fields.map((f) => this.quoteIdent(f)).join(', ') : '*';
    let sql = `SELECT ${this.selectTopClause(params)}${projection} FROM ${target}`;
    if (params.filter) {
      sql += ` WHERE ${params.filter}`;
    }
    sql += this.orderAndPageClause(params);
    return sql;
  }

  /** Map a dialect object-type token to MJ's external object type. Case-insensitive `VIEW` → view. */
  protected mapObjectType(objectType: string): ExternalObjectType {
    return objectType.toUpperCase() === 'VIEW' ? 'view' : 'table';
  }

  /** Resolve an object name to a quoted, schema-qualified reference. */
  protected qualifyObject(dataSource: MJExternalDataSourceEntity, objectName: string): string {
    if (objectName.includes('.')) {
      return objectName.split('.').map((p) => this.quoteIdent(p)).join('.');
    }
    if (dataSource.DefaultSchema) {
      return `${this.quoteIdent(dataSource.DefaultSchema)}.${this.quoteIdent(objectName)}`;
    }
    return this.quoteIdent(objectName);
  }

  /**
   * Group flat FK-column rows (normalized to {@link ExternalFkRow}) into one relationship per
   * constraint, keyed by referencing table. Composite-key aware: rows sharing a `constraint_name`
   * accumulate their column pairings into a single relationship.
   */
  protected groupForeignKeys(fkRows: ExternalFkRow[]): Map<string, ExternalSchemaRelationship[]> {
    const byTable = new Map<string, Map<string, ExternalSchemaRelationship>>();
    for (const r of fkRows) {
      const constraints = byTable.get(r.table_name) ?? new Map<string, ExternalSchemaRelationship>();
      const rel = constraints.get(r.constraint_name) ?? {
        Name: r.constraint_name,
        ReferencedObject: r.referenced_table,
        ReferencedSchema: r.referenced_schema,
        Columns: [],
      };
      rel.Columns.push({ Column: r.column_name, ReferencedColumn: r.referenced_column });
      constraints.set(r.constraint_name, rel);
      byTable.set(r.table_name, constraints);
    }
    const out = new Map<string, ExternalSchemaRelationship[]>();
    for (const [table, constraints] of byTable) {
      out.set(table, Array.from(constraints.values()));
    }
    return out;
  }
}

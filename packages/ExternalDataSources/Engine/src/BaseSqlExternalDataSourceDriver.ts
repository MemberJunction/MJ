import { ExternalObjectType, ExternalSchemaRelationship } from "@memberjunction/core";
import { MJExternalDataSourceEntity } from "@memberjunction/core-entities";
import { BaseExternalDataSourceDriver } from "./BaseExternalDataSourceDriver";
import { ExternalFkRow, ExternalViewParams } from "./types";
import { assertReadOnlyNativeQuery, assertReadOnlyClause, type SqlDialectKey } from "./sqlReadOnlyScreen";

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
   * Parser dialect used to screen native-query text for read-only safety (see
   * {@link screenReadOnlyNativeQuery}). Defaults to `'ansi'` (PostgreSQL grammar), which covers
   * PostgreSQL / MySQL / Oracle / Snowflake; the SQL Server driver overrides this to `'sqlserver'`
   * so T-SQL specifics (brackets, `TOP`, `@vars`) parse correctly.
   */
  protected sqlDialectKey(): SqlDialectKey {
    return 'ansi';
  }

  /**
   * Enforce the read-only contract on a native-query string before it executes. Concrete SQL
   * drivers MUST call this at the top of `RunNativeQuery` — EDS is read-only, but rendered Query
   * SQL runs verbatim on a read/write connection and is not covered by the provider-layer
   * Save/Delete backstop. Fail-closed: throws on stacked statements, unparseable SQL, or any
   * write/DDL. See {@link assertReadOnlyNativeQuery}.
   */
  protected screenReadOnlyNativeQuery(sql: string): void {
    assertReadOnlyNativeQuery(sql, this.sqlDialectKey());
  }

  /**
   * Re-screen a caller-supplied WHERE / ORDER-BY fragment at the driver boundary (defense in depth)
   * before it is interpolated into a SELECT — the engine does not rely on an upstream caller having
   * screened it. Fail-closed; see {@link assertReadOnlyClause}.
   */
  protected screenReadOnlyClause(clause: string, kind: "where" | "orderby"): void {
    assertReadOnlyClause(clause, this.sqlDialectKey(), kind);
  }

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
   * and `orderBy` are dialect fragments — the same contract as MJ RunView's `ExtraFilter`/`OrderBy` —
   * and are re-screened HERE at the driver boundary ({@link screenReadOnlyClause}) before
   * interpolation: defense in depth, NOT relying on an upstream caller having screened them.
   */
  protected buildSelectSql(target: string, params: ExternalViewParams): string {
    if (params.filter) {
      this.screenReadOnlyClause(params.filter, 'where');
    }
    if (params.orderBy) {
      this.screenReadOnlyClause(params.orderBy, 'orderby');
    }
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

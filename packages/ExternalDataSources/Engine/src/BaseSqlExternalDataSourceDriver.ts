import { ExternalObjectType, ExternalSchemaRelationship, EntityInfo } from "@memberjunction/core";
import { MJExternalDataSourceEntity } from "@memberjunction/core-entities";
import { BaseExternalDataSourceDriver } from "./BaseExternalDataSourceDriver";
import { ExternalFkRow, ExternalViewParams, ExternalQueryParameter, ExternalSeekAfter } from "./types";
import type { QueryDialect } from "@memberjunction/sql-dialect";
import { AssertReadOnlyNativeQuery, AssertReadOnlyClause, GetScreenDialect, type SqlDialectKey } from "./sqlReadOnlyScreen";

/**
 * Intermediate base for the relational (SQL) external data source drivers
 * (SQL Server, PostgreSQL, MySQL, Oracle, Snowflake). Holds the logic that is
 * genuinely identical across dialects — identifier qualification, object-type
 * mapping, composite-key-aware FK grouping, and the SELECT skeleton — so each
 * concrete driver only supplies the bits that actually differ per dialect:
 *
 *  - {@link sqlDialectKey}     — the source's SQL dialect, which drives identifier quoting and the read-only screen
 *  - {@link orderAndPageClause} — the ORDER BY + paging suffix (LIMIT/OFFSET vs OFFSET/FETCH vs TOP)
 *  - {@link selectTopClause}    — optional leading row-cap clause (T-SQL `TOP (n)`); default none
 *
 * Non-SQL drivers (e.g. MongoDB) extend {@link BaseExternalDataSourceDriver} directly instead.
 *
 * @typeParam TConnection - the concrete connection/pool type the driver manages.
 */
export abstract class BaseSqlExternalDataSourceDriver<TConnection = unknown> extends BaseExternalDataSourceDriver<TConnection> {
  private resolvedDialect: QueryDialect | null = null;

  /**
   * The source's SQL dialect (see `@memberjunction/sql-dialect`): its lexical rules and grammar
   * screen native-query text and clause fragments for read-only safety, and its writer quotes
   * identifiers. Each built-in driver returns its own key. Defaults to `'ansi'`, the PostgreSQL
   * dialect, for a driver that does not say.
   */
  protected sqlDialectKey(): SqlDialectKey {
    return 'ansi';
  }

  /** The registered key of {@link SourceDialect} (`'ansi'` reads as the PostgreSQL dialect). */
  public override get QueryDialectKey(): string | null {
    return this.SourceDialect.Key;
  }

  /** The {@link QueryDialect} for {@link sqlDialectKey}, resolved once. */
  protected get SourceDialect(): QueryDialect {
    if (!this.resolvedDialect) {
      this.resolvedDialect = GetScreenDialect(this.sqlDialectKey());
    }
    return this.resolvedDialect;
  }

  /** Quote a single SQL identifier with the source dialect's writer, escaping its embedded quote character. */
  protected quoteIdent(name: string): string {
    return this.SourceDialect.Writer.QuoteIdentifier(name);
  }

  /**
   * Enforce the read-only contract on a native-query string before it executes. Concrete SQL
   * drivers MUST call this at the top of `RunNativeQuery` — EDS is read-only, but rendered Query
   * SQL runs verbatim on a read/write connection and is not covered by the provider-layer
   * Save/Delete backstop. Fail-closed: throws on stacked statements, unparseable SQL, or any
   * write/DDL. See {@link assertReadOnlyNativeQuery}.
   */
  protected screenReadOnlyNativeQuery(sql: string): void {
    AssertReadOnlyNativeQuery(this.normalizeForReadOnlyParse(sql), this.sqlDialectKey());
  }

  /**
   * Normalize dialect-specific syntax the read-only parser can't handle, for STRUCTURE analysis ONLY
   * — the original SQL (with its real placeholders) is still what executes. Default: no-op. Drivers
   * whose native syntax isn't accepted by their {@link sqlDialectKey} grammar override this: e.g. the
   * ANSI/PostgreSQL grammar used for MySQL/Snowflake can't parse `?` positional placeholders, so those
   * drivers neutralize them here — otherwise a legitimate parameterized read is refused as unparseable.
   * A normalization must NEVER turn a write into a read (only value/identifier-level substitutions).
   */
  protected normalizeForReadOnlyParse(sql: string): string {
    return sql;
  }

  /**
   * Build a quoted, parameter-bound `WHERE` clause for a (possibly composite) primary key. Each key
   * identifier is quoted via {@link quoteIdent} (so mixed-case / reserved-word PK columns work on
   * case-sensitive dialects), and each value is returned separately for binding — never interpolated.
   * `placeholder(i)` supplies the dialect's bind token for the i-th value (`$1` / `?` / `:1` / `@pk0`).
   * Returns the clause and the values in bind order.
   */
  protected buildPrimaryKeyWhere(
    primaryKeys: readonly ExternalQueryParameter[],
    placeholder: (index: number) => string,
  ): { clause: string; values: Array<ExternalQueryParameter["value"]> } {
    // Defense in depth: an empty key set would otherwise yield `WHERE ` (malformed SQL that could match
    // every row). The router guards this before calling LoadSingle, but a direct caller must not slip through.
    if (primaryKeys.length === 0) {
      throw new Error("buildPrimaryKeyWhere requires at least one primary-key value.");
    }
    const parts: string[] = [];
    const values: Array<ExternalQueryParameter["value"]> = [];
    primaryKeys.forEach((pk, i) => {
      parts.push(`${this.quoteIdent(pk.name)} = ${placeholder(i)}`);
      values.push(pk.value);
    });
    return { clause: parts.join(" AND "), values };
  }

  /**
   * Re-screen a caller-supplied WHERE / ORDER-BY fragment at the driver boundary (defense in depth)
   * before it is interpolated into a SELECT — the engine does not rely on an upstream caller having
   * screened it. Fail-closed; see {@link assertReadOnlyClause}.
   */
  protected screenReadOnlyClause(clause: string, kind: "where" | "orderby"): void {
    AssertReadOnlyClause(clause, this.sqlDialectKey(), kind);
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

  /** Quote a string literal for safe inline use in a screened WHERE fragment (single-quote escaped). */
  protected quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  /**
   * Render the optional structured incremental lower-bound ({@link ExternalViewParams.incrementalSince})
   * into a dialect WHERE fragment — `<quotedField> >= <literal>` — using THIS driver's own identifier
   * quoting, so an incremental-sync caller never hand-writes dialect SQL. Inclusive (`>=`). Returns
   * undefined when no incremental bound was supplied.
   */
  protected buildIncrementalPredicate(params: ExternalViewParams): string | undefined {
    if (!params.incrementalSince) {
      return undefined;
    }
    return `${this.quoteIdent(params.incrementalSince.Field)} >= ${this.formatIncrementalLiteral(params.incrementalSince.Value)}`;
  }

  /**
   * Format the incremental bound value as a dialect SQL literal. Default: a plain single-quoted string —
   * SQL Server / PostgreSQL / Snowflake implicitly parse an ISO-8601 timestamp string, so no wrapping is
   * needed. Dialects whose default parser rejects the ISO `T`/`Z` form override this (e.g. the Oracle
   * driver wraps an ISO timestamp in `TO_TIMESTAMP` with a matching format mask).
   */
  protected formatIncrementalLiteral(value: string): string {
    return this.quoteLiteral(value);
  }

  /**
   * Whether this dialect sorts NULL before non-NULL values in an ascending ORDER BY. SQL Server, MySQL
   * and Databricks (Spark) do; PostgreSQL, Oracle and Snowflake sort NULL last and override this. It
   * decides on which side of the NULL run a keyset seek resumes — see {@link buildSeekPredicate}.
   */
  protected nullsSortFirst(): boolean {
    return true;
  }

  /** Format a seek key value as a dialect literal: a number verbatim, anything else single-quoted. */
  protected formatSeekKeyLiteral(value: string | number): string {
    return typeof value === 'number' ? String(value) : this.quoteLiteral(value);
  }

  /**
   * Render "primary key strictly after these values" for the ordered key list: `k1 > v1` for a single
   * key, `(k1 > v1) OR (k1 = v1 AND k2 > v2) ...` for a composite one. Undefined when there are no keys.
   */
  protected buildKeysAfterPredicate(keys: ExternalSeekAfter['Keys']): string | undefined {
    if (keys.length === 0) {
      return undefined;
    }
    if (keys.length === 1) {
      return `${this.quoteIdent(keys[0].Field)} > ${this.formatSeekKeyLiteral(keys[0].Value)}`;
    }
    const alternatives = keys.map((key, i) => {
      const equalPrefix = keys.slice(0, i).map((k) => `${this.quoteIdent(k.Field)} = ${this.formatSeekKeyLiteral(k.Value)}`);
      const after = `${this.quoteIdent(key.Field)} > ${this.formatSeekKeyLiteral(key.Value)}`;
      return `(${[...equalPrefix, after].join(' AND ')})`;
    });
    return `(${alternatives.join(' OR ')})`;
  }

  /**
   * Render the structured {@link ExternalViewParams.seekAfter} resume point into a dialect WHERE fragment
   * using THIS driver's identifier quoting, literal formatting and NULL ordering, so a keyset caller never
   * hand-writes dialect SQL. Returns undefined when no seek was supplied; throws on a seek that cannot
   * resume (no keys and no consumed range), since silently ignoring it would restart the walk from the top.
   */
  protected buildSeekPredicate(params: ExternalViewParams): string | undefined {
    const seek = params.seekAfter;
    if (!seek) {
      return undefined;
    }
    const keysAfter = this.buildKeysAfterPredicate(seek.Keys);
    if (!seek.Watermark) {
      if (!keysAfter) {
        throw new Error('seekAfter requires at least one key when no watermark is supplied.');
      }
      return keysAfter;
    }
    const field = this.quoteIdent(seek.Watermark.Field);
    const nullRun = this.buildSeekNullRunPredicate(field, seek.Watermark.Value, keysAfter);
    if (nullRun !== undefined) {
      return nullRun;
    }
    const value = seek.Watermark.Value as string;
    const upper = seek.Watermark.ExclusiveUpper;
    if (seek.Watermark.WithinRange) {
      if (!upper) {
        throw new Error('seekAfter.Watermark.WithinRange requires ExclusiveUpper.');
      }
      return this.buildSeekWithinRangePredicate(field, value, upper, keysAfter);
    }
    const afterWatermark = upper
      ? this.buildSeekTruncatedRangePredicate(field, value, upper, keysAfter)
      : this.buildSeekExactWatermarkPredicate(field, value, keysAfter);
    // A NULL watermark sorts after every value on a NULLS-LAST dialect, so the NULL run is still ahead.
    return this.nullsSortFirst() ? afterWatermark : `${afterWatermark} OR ${field} IS NULL`;
  }

  /** The seek when the last consumed row's watermark was NULL, i.e. the walk is inside the NULL run. */
  private buildSeekNullRunPredicate(field: string, value: string | null, keysAfter: string | undefined): string | undefined {
    if (value !== null) {
      return undefined;
    }
    if (!keysAfter) {
      throw new Error('seekAfter with a NULL watermark requires at least one key.');
    }
    // NULLS FIRST: finish the NULL run by key, then every non-NULL row. NULLS LAST: the NULL run is the
    // tail of the ordering, so only the rest of it remains.
    return this.nullsSortFirst()
      ? `(${field} IS NULL AND ${keysAfter}) OR ${field} IS NOT NULL`
      : `${field} IS NULL AND ${keysAfter}`;
  }

  /** The seek for an exactly-known watermark: later watermarks, or the same watermark with a later key. */
  private buildSeekExactWatermarkPredicate(field: string, value: string, keysAfter: string | undefined): string {
    const literal = this.formatIncrementalLiteral(value);
    return keysAfter ? `${field} > ${literal} OR (${field} = ${literal} AND ${keysAfter})` : `${field} > ${literal}`;
  }

  /**
   * The seek for a truncated temporal watermark whose consumed rows lie in `[lower, upper)`.
   *
   * "After the range" is `W >= upper AND W > lower`, never `W >= upper` alone: a column coarser than a
   * millisecond rounds the `upper` literal back into the consumed value (SQL Server `datetime` turns
   * `.004` into `.003`, `smalldatetime` drops the milliseconds), so `W >= upper` alone re-reads the
   * range forever. For such a column `lower` converts to exactly the stored value, so `W > lower` excludes
   * it; for a finer column `W >= upper` already implies `W > lower`.
   */
  private buildSeekTruncatedRangePredicate(field: string, lower: string, upper: string, keysAfter: string | undefined): string {
    const lowerLiteral = this.formatIncrementalLiteral(lower);
    const upperLiteral = this.formatIncrementalLiteral(upper);
    const afterRange = `(${field} >= ${upperLiteral} AND ${field} > ${lowerLiteral})`;
    if (!keysAfter) {
      return afterRange;
    }
    return `${afterRange} OR (${this.buildInRangePredicate(field, lowerLiteral, upperLiteral)} AND ${keysAfter})`;
  }

  /** Rows inside the truncated range `[lower, upper)` with keys after the marker (all of them without keys). */
  private buildSeekWithinRangePredicate(field: string, lower: string, upper: string, keysAfter: string | undefined): string {
    const inRange = this.buildInRangePredicate(field, this.formatIncrementalLiteral(lower), this.formatIncrementalLiteral(upper));
    return keysAfter ? `${inRange} AND ${keysAfter}` : inRange;
  }

  /**
   * "Inside `[lower, upper)`", exact for every column precision: `W = lower` keeps the range for a column
   * that rounds `upper` down onto `lower` (where `W < upper` would be empty).
   */
  private buildInRangePredicate(field: string, lowerLiteral: string, upperLiteral: string): string {
    return `${field} >= ${lowerLiteral} AND (${field} < ${upperLiteral} OR ${field} = ${lowerLiteral})`;
  }

  /**
   * The effective WHERE body: the caller's screened {@link ExternalViewParams.filter} combined (ANDed)
   * with the driver-rendered incremental predicate and the driver-rendered keyset seek. Any subset may
   * be present. The caller's filter is screened by {@link buildSelectSql}; the incremental and seek
   * predicates are driver-built from quoted identifiers + escaped literals, so they need no screening.
   */
  protected effectiveWhere(params: ExternalViewParams): string | undefined {
    const incremental = this.buildIncrementalPredicate(params);
    const seek = this.buildSeekPredicate(params);
    // Normalize a blank filter to undefined FIRST: `''`/whitespace is falsy but NOT nullish, so a naive
    // `params.filter ?? incremental` would return `''` and silently DROP the incremental bound (and emit
    // an empty `WHERE`). Treat a blank filter as "no filter".
    const filter = params.filter && params.filter.trim().length > 0 ? params.filter : undefined;
    const clauses: string[] = [];
    if (filter) clauses.push(filter);
    if (incremental) clauses.push(incremental);
    if (seek) clauses.push(seek);
    if (clauses.length === 0) {
      return undefined;
    }
    if (clauses.length === 1) {
      return clauses[0];
    }
    // The filter and the seek are OR-capable fragments and get parenthesized; the incremental bound is a
    // single comparison and stays bare (the historical shape callers and tests rely on).
    return clauses.map((c) => (c === incremental ? c : `(${c})`)).join(' AND ');
  }

  /**
   * Build the `COUNT(*)` SQL for a paginated view — honoring BOTH the caller's `filter` AND the structured
   * `incrementalSince` bound via {@link effectiveWhere}, so `totalRowCount` is consistent with the rows the
   * matching SELECT returns. Centralized here (rather than each driver hand-rolling `WHERE ${params.filter}`)
   * so a driver can't forget the incremental bound. The `cnt` alias reads back per-dialect case (Oracle /
   * Snowflake uppercase it to `CNT`).
   */
  protected buildCountSql(target: string, params: ExternalViewParams): string {
    const where = this.effectiveWhere(params);
    return `SELECT COUNT(*) AS cnt FROM ${target}${where ? ` WHERE ${where}` : ''}`;
  }

  /**
   * Build a parameter-free SELECT. The projection + filter are dialect-agnostic; ordering/paging is
   * delegated to {@link orderAndPageClause} (and an optional {@link selectTopClause}). The `filter`
   * and `orderBy` are dialect fragments — the same contract as MJ RunView's `ExtraFilter`/`OrderBy` —
   * and are re-screened HERE at the driver boundary ({@link screenReadOnlyClause}) before
   * interpolation: defense in depth, NOT relying on an upstream caller having screened them. A
   * structured {@link ExternalViewParams.incrementalSince} is ANDed in via {@link effectiveWhere}.
   */
  protected buildSelectSql(target: string, params: ExternalViewParams): string {
    if (params.filter && params.filter.trim().length > 0) {
      this.screenReadOnlyClause(params.filter, 'where');
    }
    if (params.orderBy) {
      this.screenReadOnlyClause(params.orderBy, 'orderby');
    }
    const projection = params.fields?.length ? params.fields.map((f) => this.quoteIdent(f)).join(', ') : '*';
    const effectiveParams = this.applyDefaultOrderBy(params);
    const where = this.effectiveWhere(params);
    let sql = `SELECT ${this.selectTopClause(effectiveParams)}${projection} FROM ${target}`;
    if (where) {
      sql += ` WHERE ${where}`;
    }
    sql += this.orderAndPageClause(effectiveParams);
    return sql;
  }

  /**
   * Resolve the effective ordering: a caller-supplied {@link ExternalViewParams.orderBy} always wins
   * (it was already screened). Otherwise, when the router supplied {@link ExternalViewParams.defaultOrderByColumns}
   * (the entity's primary key, for deterministic offset paging), materialize them into an ORDER BY with
   * each identifier QUOTED per this dialect — a bare mixed-case / reserved-word PK column would fail to
   * resolve on a case-sensitive dialect. These names come from trusted MJ metadata, so they are not screened.
   */
  protected applyDefaultOrderBy(params: ExternalViewParams): ExternalViewParams {
    if (params.orderBy || !params.defaultOrderByColumns?.length) {
      return params;
    }
    const quoted = params.defaultOrderByColumns.map((c) => this.quoteIdent(c)).join(', ');
    return { ...params, orderBy: quoted };
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
   * SQL object-name resolution: schema-qualify a bare name with the entity's `SchemaName` so an object
   * in a NON-default schema (e.g. medallion bronze/silver/gold, or any multi-schema source) resolves
   * correctly — {@link qualifyObject} then splits on '.' and quotes each part. An already schema-qualified
   * name (contains '.') or an entity with no `SchemaName` is returned unchanged (qualifyObject falls back
   * to the source DefaultSchema for the bare case). `SchemaName` is the same value CodeGen used to
   * introspect the object, so the read path and introspection stay consistent. This override is why the
   * qualification never reaches a non-SQL driver (e.g. MongoDB), which treats the name as literal.
   */
  public override ResolveObjectName(entity: EntityInfo): string {
    // Reuse the base fallback chain (ExternalObjectName || BaseTable || Name — `||` so an empty-string
    // ExternalObjectName falls through; see the base method) so SQL and non-SQL drivers can never diverge
    // on how the bare name is derived — this override only ADDS schema qualification.
    const objectName = super.ResolveObjectName(entity);
    if (objectName.includes('.') || !entity.SchemaName) {
      return objectName;
    }
    return `${entity.SchemaName}.${objectName}`;
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

/**
 * SQL for the data quality probes, for SQL Server, PostgreSQL and MySQL.
 *
 * A table probe is ONE `SELECT` of aggregates over the table (columns are split into batches only
 * for very wide tables), so the database scans the table once per batch no matter how many checks
 * are on. A relationship probe packs several relationships of one child table into one statement of
 * scalar subqueries. Aliases are ordinal and lowercase (`c3_blank`): PostgreSQL folds unquoted
 * aliases to lowercase and truncates identifiers past 63 bytes, so names built from column names
 * would not round-trip.
 *
 * Timeouts are not in this SQL. `BaseAutoDocDriver.ExecuteBounded` applies each engine's own bound.
 */

import type { ColumnMeasure, RelationshipProbeSpec, TableQualityProbeColumn, TableQualityProbeSpec } from '../types/data-quality.js';

export type QualityProvider = 'sqlserver' | 'postgresql' | 'mysql';

/** Broad type families the probes care about. */
export type QualityTypeFamily = 'text' | 'fixedText' | 'largeText' | 'date' | 'numeric' | 'other';

/** The pieces of SQL that differ between engines. */
export interface QualityDialect {
  Provider: QualityProvider;
  /** Quote an identifier, doubling the closing delimiter. */
  Quote(identifier: string): string;
  /** Rows in the current group, as a 64-bit count. */
  CountAll(): string;
  CountNonNull(expression: string): string;
  /** Rows for which `condition` is true. The condition must not contain a subquery (SQL Server rejects that inside an aggregate). */
  CountWhere(condition: string): string;
  /** Distinct values compared exactly: case- and accent-sensitive. */
  CountDistinctExact(expression: string): string;
  /** Distinct values after `lower(trim())`. */
  CountDistinctFolded(expression: string): string;
  /** Whitespace-trimmed text. */
  Trim(expression: string): string;
  ByteLength(expression: string): string;
  CharLength(expression: string): string;
  /** The value, as text, looks like a number. */
  IsNumericText(expression: string): string;
  /** The value, as text, starts like a date (ISO or day/month/year). */
  IsDateText(expression: string): string;
  /** The value is one of the placeholder dates applications write instead of NULL. */
  IsSentinelDate(expression: string, dataType: string): string;
  /** The value is later than now plus `days`. */
  IsFutureDate(expression: string, days: number): string;
  /** The expression as text, for comparing two keys of different types. */
  AsText(expression: string): string;
  /** Query hint appended to every probe statement (SQL Server: one core per probe), or ''. */
  Suffix(): string;
  /** The family a column's declared type belongs to on this engine. */
  TypeFamily(dataType: string): QualityTypeFamily;
}

const NUMERIC_TYPES = new Set([
  'int',
  'integer',
  'bigint',
  'smallint',
  'tinyint',
  'mediumint',
  'decimal',
  'numeric',
  'float',
  'real',
  'double',
  'money',
  'smallmoney',
  'int2',
  'int4',
  'int8',
  'float4',
  'float8',
  'number',
  'dec',
  'fixed',
  'double precision',
]);

/**
 * Placeholder dates SQL Server applications write instead of NULL, limited to the ones the column's
 * type can hold: the type's own minimum and maximum, and 1900-01-01 (the value of a zero datetime).
 */
export function SqlServerSentinelDates(dataType: string): string[] {
  switch (BaseTypeName(dataType)) {
    case 'smalldatetime':
      return ['1900-01-01', '2079-06-06'];
    case 'datetime':
      return ['1753-01-01', '1900-01-01', '9999-12-31'];
    default:
      return ['0001-01-01', '1753-01-01', '1900-01-01', '9999-12-31'];
  }
}

/**
 * Lower-cased type name without length, precision or `unsigned`.
 * Index-based so a hostile type string cannot make it backtrack.
 */
export function BaseTypeName(dataType: string): string {
  const lower = dataType.toLowerCase();
  const paren = lower.indexOf('(');
  const withoutLength = (paren >= 0 ? lower.slice(0, paren) : lower).trim();
  const unsigned = ' unsigned';
  const endsUnsigned = withoutLength.endsWith('unsigned') && /\s/.test(withoutLength.charAt(withoutLength.length - unsigned.length));
  return endsUnsigned ? withoutLength.slice(0, -'unsigned'.length).trim() : withoutLength;
}

/** Family shared by every engine; each dialect overrides the engine-specific cases first. */
function commonTypeFamily(t: string): QualityTypeFamily {
  if (NUMERIC_TYPES.has(t)) return 'numeric';
  if (t === 'varchar' || t === 'nvarchar' || t === 'character varying' || t === 'citext' || t === 'string') return 'text';
  if (t === 'char' || t === 'nchar' || t === 'bpchar' || t === 'character') return 'fixedText';
  if (t === 'date' || t === 'datetime' || t === 'datetime2' || t === 'smalldatetime' || t === 'datetimeoffset' || t === 'timestamptz') {
    return 'date';
  }
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialects
// ─────────────────────────────────────────────────────────────────────────────

export const SQL_SERVER_QUALITY_DIALECT: QualityDialect = {
  Provider: 'sqlserver',
  Quote: (id) => `[${id.replace(/]/g, ']]')}]`,
  CountAll: () => 'COUNT_BIG(*)',
  CountNonNull: (e) => `COUNT_BIG(${e})`,
  CountWhere: (c) => `COUNT_BIG(CASE WHEN ${c} THEN 1 END)`,
  // A binary collation makes DISTINCT case-sensitive; the default collation folds case.
  CountDistinctExact: (e) => `COUNT_BIG(DISTINCT CAST(${e} AS NVARCHAR(4000)) COLLATE Latin1_General_BIN2)`,
  CountDistinctFolded: (e) => `COUNT_BIG(DISTINCT LOWER(LTRIM(RTRIM(CAST(${e} AS NVARCHAR(4000))))) COLLATE Latin1_General_BIN2)`,
  // LTRIM(RTRIM()) rather than TRIM(), which needs SQL Server 2017.
  Trim: (e) => `LTRIM(RTRIM(${e}))`,
  ByteLength: (e) => `DATALENGTH(${e})`,
  CharLength: (e) => `LEN(${e})`,
  IsNumericText: (e) => `TRY_CONVERT(float, ${e}) IS NOT NULL`,
  IsDateText: (e) =>
    `(LTRIM(${e}) LIKE '[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]%' OR LTRIM(${e}) LIKE '[0-3][0-9]/[0-3][0-9]/[12][0-9][0-9][0-9]%' OR LTRIM(${e}) LIKE '[0-3][0-9].[0-3][0-9].[12][0-9][0-9][0-9]%')`,
  IsSentinelDate: (e, dataType) => {
    // The column side is cast to date, so the literals never overflow the column's own type.
    const literals = SqlServerSentinelDates(dataType);
    return `CAST(${e} AS date) IN (${literals.map((d) => `CAST('${d}' AS date)`).join(', ')})`;
  },
  IsFutureDate: (e, days) => `${e} > DATEADD(day, ${Math.floor(days)}, SYSDATETIME())`,
  AsText: (e) => `CAST(${e} AS NVARCHAR(4000))`,
  Suffix: () => 'OPTION (MAXDOP 1)',
  TypeFamily: (dataType) => {
    const t = BaseTypeName(dataType);
    if (t === 'text' || t === 'ntext') return 'largeText';
    // `timestamp` on SQL Server is rowversion, not a date.
    if (t === 'timestamp' || t === 'rowversion') return 'other';
    return commonTypeFamily(t);
  },
};

/** PostgreSQL `btrim` strips only spaces by default; tabs and newlines count as whitespace here. */
const PG_WHITESPACE = `E' \\t\\r\\n'`;

export const POSTGRESQL_QUALITY_DIALECT: QualityDialect = {
  Provider: 'postgresql',
  Quote: (id) => `"${id.replace(/"/g, '""')}"`,
  CountAll: () => 'COUNT(*)::bigint',
  CountNonNull: (e) => `COUNT(${e})::bigint`,
  CountWhere: (c) => `(COUNT(*) FILTER (WHERE ${c}))::bigint`,
  // PostgreSQL text comparison is already case-sensitive.
  CountDistinctExact: (e) => `COUNT(DISTINCT ${e}::text)::bigint`,
  CountDistinctFolded: (e) => `COUNT(DISTINCT lower(btrim(${e}::text, ${PG_WHITESPACE})))::bigint`,
  Trim: (e) => `btrim(${e}::text, ${PG_WHITESPACE})`,
  ByteLength: (e) => `octet_length(${e}::text)`,
  CharLength: (e) => `char_length(${e}::text)`,
  IsNumericText: (e) => `${e}::text ~ '^\\s*[-+]?[0-9]+([.][0-9]+)?([eE][-+]?[0-9]+)?\\s*$'`,
  IsDateText: (e) => `${e}::text ~ '^\\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[/.][0-9]{1,2}[/.][0-9]{4})'`,
  IsSentinelDate: (e) => `(NOT isfinite(${e}) OR ${e}::date IN (DATE '0001-01-01', DATE '1900-01-01', DATE '1970-01-01', DATE '9999-12-31'))`,
  IsFutureDate: (e, days) => `${e} > now() + interval '${Math.floor(days)} days'`,
  AsText: (e) => `${e}::text`,
  Suffix: () => '',
  TypeFamily: (dataType) => {
    const t = BaseTypeName(dataType);
    if (t === 'text') return 'text';
    if (t === 'timestamp' || t === 'timestamp without time zone' || t === 'timestamp with time zone') return 'date';
    return commonTypeFamily(t);
  },
};

export const MYSQL_QUALITY_DIALECT: QualityDialect = {
  Provider: 'mysql',
  Quote: (id) => `\`${id.replace(/`/g, '``')}\``,
  CountAll: () => 'COUNT(*)',
  CountNonNull: (e) => `COUNT(${e})`,
  CountWhere: (c) => `SUM(CASE WHEN ${c} THEN 1 ELSE 0 END)`,
  // The default collations are case-insensitive; comparing bytes makes DISTINCT exact.
  CountDistinctExact: (e) => `COUNT(DISTINCT CAST(${e} AS BINARY))`,
  CountDistinctFolded: (e) => `COUNT(DISTINCT LOWER(TRIM(${e})))`,
  Trim: (e) => `TRIM(${e})`,
  ByteLength: (e) => `LENGTH(${e})`,
  CharLength: (e) => `CHAR_LENGTH(${e})`,
  IsNumericText: (e) => `${e} REGEXP '^[[:space:]]*[-+]?[0-9]+([.][0-9]+)?([eE][-+]?[0-9]+)?[[:space:]]*$'`,
  IsDateText: (e) => `${e} REGEXP '^[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[/.][0-9]{1,2}[/.][0-9]{4})'`,
  IsSentinelDate: (e) => `(CAST(${e} AS CHAR) LIKE '0000-00-00%' OR DATE(${e}) IN ('1000-01-01', '1970-01-01', '9999-12-31'))`,
  IsFutureDate: (e, days) => `${e} > NOW() + INTERVAL ${Math.floor(days)} DAY`,
  AsText: (e) => `CAST(${e} AS CHAR)`,
  Suffix: () => '',
  TypeFamily: (dataType) => {
    const t = BaseTypeName(dataType);
    if (t === 'tinytext' || t === 'text') return 'text';
    if (t === 'mediumtext' || t === 'longtext') return 'largeText';
    if (t === 'timestamp') return 'date';
    return commonTypeFamily(t);
  },
};

/** The dialect for a driver's provider name. Unknown providers fall back to SQL Server, as `CreateDriver` does. */
export function QualityDialectFor(provider: string): QualityDialect {
  switch (provider.toLowerCase()) {
    case 'postgresql':
      return POSTGRESQL_QUALITY_DIALECT;
    case 'mysql':
      return MYSQL_QUALITY_DIALECT;
    default:
      return SQL_SERVER_QUALITY_DIALECT;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Statements
// ─────────────────────────────────────────────────────────────────────────────

/** What one alias in a probe statement measures. */
export interface ProbeAlias {
  Alias: string;
  /** Column name, for column measures. */
  Column?: string;
  /** Relationship index in the batch, for relationship measures. */
  Relationship?: number;
  Measure: ColumnMeasure | 'Rows' | 'DuplicateRows' | 'CheckedRows' | 'OrphanRows' | 'ParentRows' | 'UnreferencedParentRows';
}

export interface ProbeStatement {
  Sql: string;
  Aliases: ProbeAlias[];
}

const MEASURE_ALIAS: Record<ColumnMeasure, string> = {
  NonNull: 'nonnull',
  Blank: 'blank',
  Untrimmed: 'untrimmed',
  Variants: 'variants',
  NumericLike: 'numeric',
  DateLike: 'datelike',
  SentinelDate: 'sentinel',
  FutureDate: 'future',
  Negative: 'negative',
  AtCapacity: 'atcapacity',
};

function measureExpression(d: QualityDialect, column: TableQualityProbeColumn, measure: ColumnMeasure, futureDays: number): string | undefined {
  const q = d.Quote(column.Name);
  const notBlank = `${d.Trim(q)} <> ''`;
  switch (measure) {
    case 'NonNull':
      return d.CountNonNull(q);
    case 'Blank':
      return d.CountWhere(`${d.Trim(q)} = ''`);
    case 'Untrimmed':
      return d.CountWhere(`${notBlank} AND ${d.ByteLength(q)} <> ${d.ByteLength(d.Trim(q))}`);
    case 'Variants':
      return `(${d.CountDistinctExact(q)} - ${d.CountDistinctFolded(q)})`;
    case 'NumericLike':
      return d.CountWhere(`${notBlank} AND ${d.IsNumericText(q)}`);
    case 'DateLike':
      return d.CountWhere(`${notBlank} AND ${d.IsDateText(q)}`);
    case 'SentinelDate':
      return d.CountWhere(d.IsSentinelDate(q, column.DataType));
    case 'FutureDate':
      // A placeholder such as 9999-12-31 is also "in the future"; it is counted as a placeholder only.
      return d.CountWhere(`${d.IsFutureDate(q, futureDays)} AND NOT ${d.IsSentinelDate(q, column.DataType)}`);
    case 'Negative':
      return d.CountWhere(`${q} < 0`);
    case 'AtCapacity':
      return column.DeclaredLength !== undefined ? d.CountWhere(`${d.CharLength(q)} = ${Math.floor(column.DeclaredLength)}`) : undefined;
  }
}

function tableName(d: QualityDialect, schema: string, table: string): string {
  return `${d.Quote(schema)}.${d.Quote(table)}`;
}

function withSuffix(d: QualityDialect, sql: string): string {
  const suffix = d.Suffix();
  return suffix ? `${sql}\n${suffix}` : sql;
}

/**
 * The statement for a set of columns of one table (one batch). Column indexes in aliases are the
 * column's position in `columns`, offset by `indexOffset` so batches never reuse an alias.
 */
export function BuildTableProbeStatement(spec: TableQualityProbeSpec, columns: TableQualityProbeColumn[], d: QualityDialect, indexOffset = 0): ProbeStatement {
  const select: string[] = [`${d.CountAll()} AS rows_`];
  const aliases: ProbeAlias[] = [{ Alias: 'rows_', Measure: 'Rows' }];
  columns.forEach((column, i) => {
    for (const measure of column.Measures) {
      const expression = measureExpression(d, column, measure, spec.FutureToleranceDays);
      if (!expression) continue;
      const alias = `c${indexOffset + i}_${MEASURE_ALIAS[measure]}`;
      select.push(`${expression} AS ${alias}`);
      aliases.push({ Alias: alias, Column: column.Name, Measure: measure });
    }
  });
  const sql = `SELECT\n  ${select.join(',\n  ')}\nFROM ${tableName(d, spec.Schema, spec.Table)}`;
  return { Sql: withSuffix(d, sql), Aliases: aliases };
}

/** Split a table spec into batches of at most `batchSize` columns, one statement each. */
export function BuildTableProbeStatements(spec: TableQualityProbeSpec, d: QualityDialect, batchSize: number): ProbeStatement[] {
  const size = Math.max(1, Math.floor(batchSize));
  const statements: ProbeStatement[] = [];
  for (let start = 0; start < spec.Columns.length; start += size) {
    statements.push(BuildTableProbeStatement(spec, spec.Columns.slice(start, start + size), d, start));
  }
  return statements;
}

/** Exact duplicate rows: all rows minus distinct rows over the comparable columns. Two scans. */
export function BuildDuplicateRowsStatement(spec: TableQualityProbeSpec, d: QualityDialect): ProbeStatement | undefined {
  const columns = spec.DuplicateRowColumns ?? [];
  if (columns.length === 0) return undefined;
  const t = tableName(d, spec.Schema, spec.Table);
  const list = columns.map((c) => d.Quote(c)).join(', ');
  const sql = `SELECT\n  (SELECT ${d.CountAll()} FROM ${t}) - (SELECT ${d.CountAll()} FROM (SELECT DISTINCT ${list} FROM ${t}) distinct_rows) AS duplicate_rows`;
  return { Sql: withSuffix(d, sql), Aliases: [{ Alias: 'duplicate_rows', Measure: 'DuplicateRows' }] };
}

/**
 * Orphan counts for several relationships of the same child table, as scalar subqueries (a
 * subquery inside an aggregate is not allowed on SQL Server). A child row is checked only when
 * every key column is non-null, which is how the engines enforce a composite foreign key.
 */
export function BuildRelationshipProbeStatement(specs: RelationshipProbeSpec[], d: QualityDialect): ProbeStatement {
  const select: string[] = [];
  const aliases: ProbeAlias[] = [];
  specs.forEach((spec, i) => {
    const child = tableName(d, spec.Child.Schema, spec.Child.Table);
    const parent = tableName(d, spec.Parent.Schema, spec.Parent.Table);
    const side = (alias: string, column: string) => (spec.CompareAsText ? d.AsText(`${alias}.${d.Quote(column)}`) : `${alias}.${d.Quote(column)}`);
    const checked = spec.Child.Columns.map((c) => `c.${d.Quote(c)} IS NOT NULL`).join(' AND ');
    const match = spec.Child.Columns.map((c, k) => `${side('p', spec.Parent.Columns[k])} = ${side('c', c)}`).join(' AND ');
    select.push(`(SELECT ${d.CountAll()} FROM ${child} c WHERE ${checked}) AS r${i}_checked`);
    aliases.push({ Alias: `r${i}_checked`, Relationship: i, Measure: 'CheckedRows' });
    select.push(`(SELECT ${d.CountAll()} FROM ${child} c WHERE ${checked} AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE ${match})) AS r${i}_orphans`);
    aliases.push({ Alias: `r${i}_orphans`, Relationship: i, Measure: 'OrphanRows' });
    if (spec.CountUnreferencedParents) {
      const referenced = spec.Child.Columns.map((c, k) => `${side('c', c)} = ${side('p', spec.Parent.Columns[k])}`).join(' AND ');
      select.push(`(SELECT ${d.CountAll()} FROM ${parent} p) AS r${i}_parents`);
      aliases.push({ Alias: `r${i}_parents`, Relationship: i, Measure: 'ParentRows' });
      select.push(`(SELECT ${d.CountAll()} FROM ${parent} p WHERE NOT EXISTS (SELECT 1 FROM ${child} c WHERE ${referenced})) AS r${i}_unreferenced`);
      aliases.push({ Alias: `r${i}_unreferenced`, Relationship: i, Measure: 'UnreferencedParentRows' });
    }
  });
  return { Sql: withSuffix(d, `SELECT\n  ${select.join(',\n  ')}`), Aliases: aliases };
}

/**
 * The exact (case- and whitespace-sensitive) value distribution of one column, most frequent
 * first. Needed on SQL Server, whose default collation folds case in `GROUP BY`, so the sampled
 * distribution never shows the spellings a value list must fold.
 */
export function BuildExactDistributionStatement(schema: string, table: string, column: string, limit: number, d: QualityDialect): string {
  const q = d.Quote(column);
  const t = tableName(d, schema, table);
  const n = Math.max(1, Math.floor(limit));
  switch (d.Provider) {
    case 'sqlserver': {
      const exact = `CAST(${q} AS NVARCHAR(4000)) COLLATE Latin1_General_BIN2`;
      return withSuffix(
        d,
        `SELECT TOP ${n} ${exact} AS value, COUNT_BIG(*) AS frequency FROM ${t} WHERE ${q} IS NOT NULL GROUP BY ${exact} ORDER BY COUNT_BIG(*) DESC`,
      );
    }
    case 'postgresql':
      return `SELECT ${q}::text AS value, COUNT(*)::bigint AS frequency FROM ${t} WHERE ${q} IS NOT NULL GROUP BY ${q}::text ORDER BY COUNT(*) DESC LIMIT ${n}`;
    case 'mysql':
      // Grouping by bytes keeps spellings apart; MIN() of a group of identical bytes returns that spelling as text.
      return `SELECT MIN(${q}) AS value, COUNT(*) AS frequency FROM ${t} WHERE ${q} IS NOT NULL GROUP BY CAST(${q} AS BINARY) ORDER BY COUNT(*) DESC LIMIT ${n}`;
  }
}

/**
 * Read every alias of a probe row as a number. PostgreSQL bigints and SQL Server `COUNT_BIG`
 * arrive as strings; a `SUM` over no rows is NULL. Missing and non-numeric values read as 0.
 */
export function ParseProbeRow(row: Record<string, unknown> | undefined, statement: ProbeStatement): Map<string, number> {
  const out = new Map<string, number>();
  for (const { Alias } of statement.Aliases) {
    const raw = row ? (row[Alias] ?? row[Alias.toLowerCase()]) : undefined;
    const value = raw === null || raw === undefined ? 0 : Number(raw);
    out.set(Alias, Number.isFinite(value) ? value : 0);
  }
  return out;
}

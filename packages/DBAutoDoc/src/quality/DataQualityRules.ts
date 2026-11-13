/**
 * Data quality rules: pure functions from state (statistics, catalog, probe measurements) and the
 * resolved config to findings.
 *
 * Nothing here touches the database. The phase runner takes the measurements; these rules turn
 * them into findings. Because deriving is cheap and deterministic, it runs again whenever keys
 * change: the description loop adds keys and pruning removes them, and a finding about a
 * relationship that no longer exists must not survive.
 */

import type { ColumnDefinition, DatabaseDocumentation, TableDefinition } from '../types/state.js';
import type {
  ColumnQualityMeasures,
  DataQualityCheck,
  DataQualityFinding,
  DataQualityPhase,
  DataQualityScope,
  DataQualitySeverity,
  DataQualitySource,
  TableQualityProbeResult,
} from '../types/data-quality.js';
import { IsUniquelyIndexed } from '../utils/index-hints.js';
import type { ResolvedDataQualityConfig } from './DataQualityConfig.js';
import { BaseTypeName, QualityDialectFor, SqlServerSentinelDates, type QualityDialect, type QualityTypeFamily } from './QualityProbeSQL.js';
import { FindTable, RelationshipKey, TableRelationships, type Relationship } from './Relationships.js';

/** Everything a rule may read. */
export interface RuleContext {
  State: DatabaseDocumentation;
  Config: ResolvedDataQualityConfig;
  Dialect: QualityDialect;
  /** The clock FutureDate compares against. */
  Now: Date;
}

/** Build a rule context for a state. */
export function CreateRuleContext(state: DatabaseDocumentation, config: ResolvedDataQualityConfig, now: Date = new Date()): RuleContext {
  return { State: state, Config: config, Dialect: QualityDialectFor(state.database.provider ?? 'sqlserver'), Now: now };
}

const SEVERITY_ORDER: Record<DataQualitySeverity, number> = { error: 0, warning: 1, info: 2 };

/** Sort findings most severe first, then by table and column, so reports and prompts are stable. */
export function SortFindings(findings: DataQualityFinding[]): DataQualityFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.Severity] - SEVERITY_ORDER[b.Severity] ||
      `${a.SchemaName}.${a.TableName}`.localeCompare(`${b.SchemaName}.${b.TableName}`) ||
      (a.ColumnName ?? '').localeCompare(b.ColumnName ?? '') ||
      a.Kind.localeCompare(b.Kind),
  );
}

/** Every finding for the whole database. */
export function DeriveFindings(context: RuleContext): DataQualityFinding[] {
  const findings: DataQualityFinding[] = [];
  for (const schema of context.State.schemas) {
    for (const table of schema.tables) {
      findings.push(...DeriveTableFindings(context, schema.name, table));
    }
  }
  return SortFindings(findings);
}

/** Findings for one table: the table, its columns, and the relationships it references. */
export function DeriveTableFindings(context: RuleContext, schemaName: string, table: TableDefinition): DataQualityFinding[] {
  const out: DataQualityFinding[] = [];
  const probe = TableProbeFor(context.State.phases.dataQuality, schemaName, table.name);
  tableFindings(context, schemaName, table, probe, out);
  const rows = ExactRowCount(table, probe);
  if (rows === undefined || rows >= context.Config.Thresholds.minRowsForColumnChecks) {
    for (const column of table.columns) {
      columnFindings(context, schemaName, table, column, probe?.Columns[column.name], out);
    }
  }
  relationshipFindings(context, schemaName, table, out);
  return out;
}

/** The probe result for a table, if one was taken. */
export function TableProbeFor(phase: DataQualityPhase | undefined, schemaName: string, tableName: string): TableQualityProbeResult | undefined {
  return phase?.TableProbes[`${schemaName}.${tableName}`];
}

/**
 * The table's exact row count: the probe's `COUNT(*)`, else the largest `totalRows` the sampling
 * pass measured (each column's statistics come from a full `COUNT(*)`). Undefined when neither ran.
 */
export function ExactRowCount(table: TableDefinition, probe?: TableQualityProbeResult): number | undefined {
  if (probe?.RowCount !== undefined) return probe.RowCount;
  let best: number | undefined;
  for (const column of table.columns) {
    const n = column.statistics?.totalRows;
    if (typeof n === 'number' && Number.isFinite(n) && (best === undefined || n > best)) best = n;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table
// ─────────────────────────────────────────────────────────────────────────────

function tableFindings(
  context: RuleContext,
  schemaName: string,
  table: TableDefinition,
  probe: TableQualityProbeResult | undefined,
  out: DataQualityFinding[],
): void {
  const { Checks, Thresholds } = context.Config;
  const rows = ExactRowCount(table, probe);

  if (Checks.EmptyTable && rows === 0) {
    push(out, {
      Kind: 'EmptyTable',
      Severity: 'info',
      Scope: 'table',
      Source: probe?.RowCount !== undefined ? 'probe' : 'statistics',
      SchemaName: schemaName,
      TableName: table.name,
      Measures: { Rows: 0 },
      Message: 'The table has no rows, so its description rests on its structure alone.',
    });
  }

  if (Checks.StaleRowCountEstimate && rows !== undefined && table.rowCountEstimate !== undefined) {
    const drift = Math.abs(table.rowCountEstimate - rows) / Math.max(rows, 1);
    if (drift >= Thresholds.rowCountDriftRatio) {
      push(out, {
        Kind: 'StaleRowCountEstimate',
        Severity: 'info',
        Scope: 'table',
        Source: 'statistics',
        SchemaName: schemaName,
        TableName: table.name,
        Measures: { Estimate: table.rowCountEstimate, Exact: rows },
        Message: `The catalog estimated ${count(table.rowCountEstimate)} rows; the exact count is ${count(rows)} (statistics may be stale).`,
      });
    }
  }

  const hasPrimaryKey = table.columns.some((c) => c.isPrimaryKey) || (table.indexes ?? []).some((ix) => ix.IsPrimaryKey);
  const uniqueIndexes = (table.indexes ?? []).filter((ix) => ix.IsUnique && !ix.IsPrimaryKey && !ix.FilterDefinition && ix.Columns.length > 0);
  if (Checks.NoPrimaryKey && !hasPrimaryKey && rows !== 0) {
    const candidate = uniqueIndexes[0];
    push(out, {
      Kind: 'NoPrimaryKey',
      Severity: 'warning',
      Scope: 'table',
      Source: 'catalog',
      SchemaName: schemaName,
      TableName: table.name,
      Measures: { UniqueIndexes: uniqueIndexes.length },
      Message: candidate
        ? `No primary key, declared or discovered; the unique index on (${candidate.Columns.join(', ')}) could serve as one.`
        : 'No primary key, declared or discovered, and no unique index: rows cannot be told apart reliably.',
    });
  }

  if (Checks.IsolatedTable && rows !== 0 && table.dependsOn.length === 0 && !isReferenced(context.State, schemaName, table.name)) {
    push(out, {
      Kind: 'IsolatedTable',
      Severity: 'info',
      Scope: 'table',
      Source: 'catalog',
      SchemaName: schemaName,
      TableName: table.name,
      Measures: {},
      Message: 'No relationship to any other table, declared or discovered.',
    });
  }

  if (Checks.ExactDuplicateRows && probe?.DuplicateRows !== undefined && probe.DuplicateRows > 0) {
    const total = rows ?? 0;
    push(out, {
      Kind: 'ExactDuplicateRows',
      Severity: 'warning',
      Scope: 'table',
      Source: 'probe',
      SchemaName: schemaName,
      TableName: table.name,
      Measures: { DuplicateRows: probe.DuplicateRows, Rows: total, Share: ratio(probe.DuplicateRows, total) },
      Message: `${count(probe.DuplicateRows)} rows${total > 0 ? ` (${percent(probe.DuplicateRows, total)})` : ''} are exact copies of another row.`,
      Approximate: probe.DuplicateRowsApproximate === true ? true : undefined,
    });
  }
}

function isReferenced(state: DatabaseDocumentation, schemaName: string, tableName: string): boolean {
  for (const schema of state.schemas) {
    for (const table of schema.tables) {
      for (const dep of table.dependsOn) {
        const target = dep.table.includes('.') ? dep.table.split('.').pop() : dep.table;
        if (dep.schema.toLowerCase() === schemaName.toLowerCase() && target?.toLowerCase() === tableName.toLowerCase()) return true;
      }
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column
// ─────────────────────────────────────────────────────────────────────────────

function columnFindings(
  context: RuleContext,
  schemaName: string,
  table: TableDefinition,
  column: ColumnDefinition,
  measured: ColumnQualityMeasures | undefined,
  out: DataQualityFinding[],
): void {
  const s = column.statistics;
  const family = context.Dialect.TypeFamily(column.dataType);
  const base = { SchemaName: schemaName, TableName: table.name, ColumnName: column.name };
  if (!s) {
    // Sampling was skipped: only the probe's own counts are available.
    const probedNonNull = measured?.NonNullRows;
    if (probedNonNull === undefined || probedNonNull <= 0) return;
    if (family === 'date') dateFindings(context, column, measured, probedNonNull, base, out);
    if (family === 'numeric' && context.Config.Checks.NegativeValue && IsQuantityName(column.name)) {
      negativeFinding(column, measured, probedNonNull, base, out);
    }
    if (family === 'text' || family === 'fixedText') textFindings(context, column, measured, probedNonNull, Number.POSITIVE_INFINITY, family, base, out);
    return;
  }
  const n = finiteOr(s.totalRows, 0);
  if (n <= 0) return;
  const { Checks, Thresholds } = context.Config;
  const nulls = finiteOr(s.nullCount, 0);
  const nonNull = Math.max(0, n - nulls);
  const distinct = finiteOr(s.distinctCount, 0);
  const nullPercent = (nulls / n) * 100;

  if (nulls >= n) {
    if (Checks.AlwaysNull) {
      push(out, {
        ...base,
        Kind: 'AlwaysNull',
        Severity: 'warning',
        Scope: 'column',
        Source: 'statistics',
        Measures: { Rows: n },
        Message: `Every one of ${count(n)} rows is NULL: the column appears unused.`,
      });
    }
    return; // nothing else can be said about a column with no values
  }

  const constant = firstValue(s.valueDistribution, s.sampleValues);
  // A constant blank string is reported once, as BlankString.
  const blankConstant = constant !== undefined && constant.trim() === '';
  if (Checks.ConstantValue && nonNull >= 2 && distinct === 1 && !column.isPrimaryKey && !blankConstant) {
    const value = constant;
    const isDefault = value !== undefined && column.defaultValue !== undefined && stripDefault(column.defaultValue) === value;
    const timestamp = family === 'date' ? ': the rows were written at the same moment and this column has not changed since' : '';
    push(out, {
      ...base,
      Kind: 'ConstantValue',
      Severity: 'info',
      Scope: 'column',
      Source: 'statistics',
      Measures: { NonNullRows: nonNull },
      SampleValues: samples(context, value === undefined ? [] : [value]),
      Message: `Every non-null row holds the same value${value !== undefined ? ` '${clip(value)}'` : ''}${isDefault ? ', the column default' : ''}${timestamp}.`,
    });
  }

  if (column.isForeignKey) {
    if (Checks.ForeignKeyMostlyNull && nullPercent >= Thresholds.foreignKeyMostlyNullPercent) {
      push(out, {
        ...base,
        Kind: 'ForeignKeyMostlyNull',
        Severity: 'info',
        Scope: 'column',
        Source: 'statistics',
        Measures: { NullPercent: round1(nullPercent), Rows: n },
        Message: `${round1(nullPercent)}% NULL: the relationship is optional in practice.`,
      });
    }
    const wholePrimaryKey = column.isPrimaryKey && table.columns.filter((c) => c.isPrimaryKey).length === 1;
    if (Checks.OneToOne && !wholePrimaryKey && nonNull >= Thresholds.minRowsForUniqueness && distinct === nonNull) {
      push(out, {
        ...base,
        Kind: 'OneToOne',
        Severity: 'info',
        Scope: 'column',
        Source: 'statistics',
        Measures: { DistinctCount: distinct, NonNullRows: nonNull },
        Message: 'Every non-null value is different: a one-to-one (extension or is-a) relationship, not many-to-one.',
      });
    }
  } else if (Checks.HighNullRate && nullPercent >= Thresholds.highNullRatePercent) {
    push(out, {
      ...base,
      Kind: 'HighNullRate',
      Severity: 'info',
      Scope: 'column',
      Source: 'statistics',
      Measures: { NullPercent: round1(nullPercent), Rows: n },
      Message: `${round1(nullPercent)}% of rows are NULL.`,
    });
  }

  if (Checks.NullableNeverNull && column.isNullable && nulls === 0 && n >= Thresholds.minRowsForUniqueness) {
    push(out, {
      ...base,
      Kind: 'NullableNeverNull',
      Severity: 'info',
      Scope: 'column',
      Source: 'statistics',
      Measures: { Rows: n },
      Message: `Declared nullable but never NULL across ${count(n)} rows.`,
    });
  }

  const keyLike = !column.isPrimaryKey && !column.isForeignKey && isIdentifierType(column.dataType, family, column.maxLength);
  const uniquelyIndexed = IsUniquelyIndexed(table, column.name);
  if (keyLike && uniquelyIndexed === false && nonNull >= Thresholds.minRowsForUniqueness) {
    const uniqueness = distinct / nonNull;
    if (Checks.NearUnique && uniqueness >= Thresholds.nearUniqueRatio && uniqueness < 1) {
      const duplicates = nonNull - distinct;
      push(out, {
        ...base,
        Kind: 'NearUnique',
        Severity: 'warning',
        Scope: 'column',
        Source: 'statistics',
        Measures: { DistinctCount: distinct, NonNullRows: nonNull, DuplicateValues: duplicates, Uniqueness: round4(uniqueness) },
        Message: `Almost an identifier: ${count(duplicates)} repeated value${duplicates === 1 ? '' : 's'} among ${count(nonNull)} non-null rows (${(Math.floor(uniqueness * 10_000) / 100).toFixed(2)}% unique).`,
      });
    }
    if (Checks.UndeclaredUnique && nulls === 0 && distinct === n) {
      push(out, {
        ...base,
        Kind: 'UndeclaredUnique',
        Severity: 'info',
        Scope: 'column',
        Source: 'statistics',
        Measures: { Rows: n },
        Message: `Unique and never NULL across ${count(n)} rows, with no primary key or unique index: a natural or alternate key candidate.`,
      });
    }
  }

  if (family === 'date') {
    dateFindings(context, column, measured, nonNull, base, out);
  }
  if (family === 'numeric' && Checks.NegativeValue && IsQuantityName(column.name)) {
    negativeFinding(column, measured, nonNull, base, out);
  }
  if (family === 'text' || family === 'fixedText') {
    textFindings(context, column, measured, nonNull, distinct, family, base, out);
  }
}

type ColumnBase = { SchemaName: string; TableName: string; ColumnName: string };

function negativeFinding(
  column: ColumnDefinition,
  measured: ColumnQualityMeasures | undefined,
  nonNull: number,
  base: ColumnBase,
  out: DataQualityFinding[],
): void {
  const min = toNumber(column.statistics?.min ?? column.statistics?.minValue);
  const negatives = measured?.NegativeRows;
  if (!((negatives !== undefined && negatives > 0) || (negatives === undefined && min !== undefined && min < 0))) return;
  push(out, {
    ...base,
    Kind: 'NegativeValue',
    Severity: 'info',
    Scope: 'column',
    Source: negatives !== undefined ? 'probe' : 'statistics',
    Measures: negatives !== undefined ? { NegativeRows: negatives, Share: ratio(negatives, nonNull) } : { Min: min ?? 0 },
    Message:
      negatives !== undefined
        ? `${count(negatives)} rows (${percent(negatives, nonNull)}) are negative in a column named like a quantity.`
        : `Values go as low as ${min} in a column named like a quantity.`,
  });
}

function dateFindings(
  context: RuleContext,
  column: ColumnDefinition,
  measured: ColumnQualityMeasures | undefined,
  nonNull: number,
  base: ColumnBase,
  out: DataQualityFinding[],
): void {
  const { Checks, Thresholds } = context.Config;
  const s = column.statistics;
  const min = ToISODate(s?.min ?? s?.minValue);
  const max = ToISODate(s?.max ?? s?.maxValue);

  if (Checks.SentinelDate) {
    const sentinels = sentinelDates(context.Dialect, column.dataType);
    const placeholder = [min, max].find((d) => d !== undefined && sentinels.has(d));
    const rows = measured?.SentinelDateRows;
    if (rows !== undefined ? rows > 0 : placeholder !== undefined) {
      push(out, {
        ...base,
        Kind: 'SentinelDate',
        Severity: 'warning',
        Scope: 'column',
        Source: rows !== undefined ? 'probe' : 'statistics',
        Measures: rows !== undefined ? { SentinelRows: rows, Share: ratio(rows, nonNull) } : {},
        SampleValues: samples(context, placeholder ? [placeholder] : []),
        Message:
          rows !== undefined
            ? `${count(rows)} rows (${percent(rows, nonNull)}) hold a placeholder date${placeholder ? ` such as ${placeholder}` : ''} instead of NULL.`
            : `The range ${placeholder === min ? 'starts' : 'ends'} at the placeholder date ${placeholder}: some rows use it instead of NULL.`,
      });
    }
  }

  if (Checks.FutureDate && !IsFutureLookingName(column.name)) {
    const rows = measured?.FutureDateRows;
    const limit = new Date(context.Now.getTime() + Thresholds.futureDateToleranceDays * 86_400_000).toISOString().slice(0, 10);
    const maxIsFuture = max !== undefined && max > limit && !sentinelDates(context.Dialect, column.dataType).has(max);
    if (rows !== undefined ? rows > 0 : maxIsFuture) {
      push(out, {
        ...base,
        Kind: 'FutureDate',
        Severity: 'info',
        Scope: 'column',
        Source: rows !== undefined ? 'probe' : 'statistics',
        Measures: rows !== undefined ? { FutureRows: rows, Share: ratio(rows, nonNull) } : {},
        Message:
          rows !== undefined
            ? `${count(rows)} rows (${percent(rows, nonNull)}) are dated in the future${max ? `, up to ${max}` : ''}.`
            : `The latest value, ${max}, is in the future.`,
      });
    }
  }
}

function textFindings(
  context: RuleContext,
  column: ColumnDefinition,
  measured: ColumnQualityMeasures | undefined,
  nonNull: number,
  distinct: number,
  family: QualityTypeFamily,
  base: ColumnBase,
  out: DataQualityFinding[],
): void {
  const { Checks, Thresholds } = context.Config;
  const s = column.statistics;

  if (s && Checks.LengthAtCapacity && family === 'text' && column.maxLength !== undefined && column.maxLength >= Thresholds.lengthAtCapacityMinDeclared) {
    const longest = toNumber(s.maxLength);
    const shortest = toNumber(s.minLength);
    // Every value exactly the declared length is a fixed format (an account number), not truncation.
    const fixedFormat = shortest !== undefined && shortest >= column.maxLength;
    if (longest !== undefined && longest >= column.maxLength && !fixedFormat) {
      const atCapacity = measured?.AtCapacityRows;
      const average = toNumber(s.avgLength) ?? 0;
      const severe = average >= 0.9 * column.maxLength || (atCapacity !== undefined && ratio(atCapacity, nonNull) >= 0.05);
      push(out, {
        ...base,
        Kind: 'LengthAtCapacity',
        Severity: severe ? 'warning' : 'info',
        Scope: 'column',
        Source: atCapacity !== undefined ? 'probe' : 'statistics',
        Measures: {
          DeclaredLength: column.maxLength,
          MaxLength: longest,
          AverageLength: round1(average),
          ...(atCapacity !== undefined ? { AtCapacityRows: atCapacity } : {}),
        },
        Message: `The longest value fills all ${column.maxLength} declared characters${atCapacity !== undefined ? ` (${count(atCapacity)} rows)` : ''}: values may have been cut off.`,
      });
    }
  }

  if (!measured) return;
  const blank = measured.BlankRows ?? 0;

  if (Checks.BlankString && blank > 0) {
    const share = ratio(blank, nonNull);
    push(out, {
      ...base,
      Kind: 'BlankString',
      Severity: share >= 0.01 ? 'warning' : 'info',
      Scope: 'column',
      Source: 'probe',
      Measures: { BlankRows: blank, Share: share },
      Message: `${count(blank)} rows (${percent(blank, nonNull)}) are empty or whitespace-only strings, used instead of NULL.`,
    });
  }

  if (Checks.UntrimmedString && (measured.UntrimmedRows ?? 0) > 0) {
    const rows = measured.UntrimmedRows ?? 0;
    push(out, {
      ...base,
      Kind: 'UntrimmedString',
      Severity: 'warning',
      Scope: 'column',
      Source: 'probe',
      Measures: { UntrimmedRows: rows, Share: ratio(rows, nonNull) },
      Message: `${count(rows)} rows (${percent(rows, nonNull)}) have leading or trailing whitespace.`,
    });
  }

  if (Checks.CaseWhitespaceVariants && (measured.VariantSpellings ?? 0) > 0) {
    const variants = measured.VariantSpellings ?? 0;
    const groups = SpellingGroups(
      measured.ExactDistribution ?? (s?.valueDistribution ?? []).map((v) => ({ Value: String(v.value), Frequency: Number(v.frequency) })),
    );
    const example = groups.find((g) => g.length > 1) ?? [];
    push(out, {
      ...base,
      Kind: 'CaseWhitespaceVariants',
      Severity: 'warning',
      Scope: 'column',
      Source: 'probe',
      Measures: { VariantSpellings: variants },
      SampleValues: samples(context, example),
      Message: `${count(variants)} spelling${variants === 1 ? '' : 's'} differ${variants === 1 ? 's' : ''} from another only by letter case or surrounding spaces${
        example.length > 1
          ? ` (e.g. ${example
              .slice(0, 3)
              .map((v) => `'${clip(v)}'`)
              .join(', ')})`
          : ''
      }.`,
    });
  }

  const parsed = nonNull - blank;
  if (parsed >= 20 && distinct > 1 && !isCodeLikeName(column.name)) {
    const numericShare = ratio(measured.NumericLikeRows ?? 0, parsed);
    const dateShare = ratio(measured.DateLikeRows ?? 0, parsed);
    if (Checks.NumericStoredAsText && measured.NumericLikeRows !== undefined && numericShare >= Thresholds.storedAsTextShare) {
      push(out, {
        ...base,
        Kind: 'NumericStoredAsText',
        Severity: 'info',
        Scope: 'column',
        Source: 'probe',
        Measures: { NumericRows: measured.NumericLikeRows, Share: numericShare },
        Message: `${round1(numericShare * 100)}% of values are numbers stored as ${column.dataType}: sorting and arithmetic need a conversion.`,
      });
    } else if (Checks.DateStoredAsText && measured.DateLikeRows !== undefined && numericShare < 0.5 && dateShare >= Thresholds.storedAsTextShare) {
      push(out, {
        ...base,
        Kind: 'DateStoredAsText',
        Severity: 'info',
        Scope: 'column',
        Source: 'probe',
        Measures: { DateRows: measured.DateLikeRows, Share: dateShare },
        Message: `${round1(dateShare * 100)}% of values are dates stored as ${column.dataType}: date filters and ordering need a conversion.`,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationship
// ─────────────────────────────────────────────────────────────────────────────

function relationshipFindings(context: RuleContext, schemaName: string, table: TableDefinition, out: DataQualityFinding[]): void {
  const { Checks, Thresholds } = context.Config;
  const phase = context.State.phases.dataQuality;
  for (const r of TableRelationships(schemaName, table)) {
    const related = {
      SchemaName: r.Parent.Schema,
      TableName: r.Parent.Table,
      ColumnNames: r.Parent.Columns,
      ConstraintName: r.ConstraintName,
      Declared: r.Declared,
    };
    const base = {
      SchemaName: schemaName,
      TableName: table.name,
      ColumnName: r.Child.Columns[0],
      ColumnNames: r.Child.Columns,
      Related: related,
    };
    const parentName = `${r.Parent.Schema}.${r.Parent.Table}`;

    if (Checks.UntrustedForeignKey && r.Declared && (r.IsTrusted === false || r.IsDisabled === true)) {
      push(out, {
        ...base,
        Kind: 'UntrustedForeignKey',
        Severity: 'warning',
        Scope: 'relationship',
        Source: 'catalog',
        Measures: {},
        Message: `The foreign key${r.ConstraintName ? ` ${r.ConstraintName}` : ''} to ${parentName} is ${r.IsDisabled ? 'disabled' : 'not trusted (created or re-enabled without checking existing rows)'}: the database does not guarantee every row has a match.`,
      });
    }

    if (Checks.ForeignKeyTypeMismatch && !r.Declared) {
      const mismatch = TypeMismatch(context, r);
      if (mismatch) {
        push(out, {
          ...base,
          Kind: 'ForeignKeyTypeMismatch',
          Severity: mismatch.Severe ? 'warning' : 'info',
          Scope: 'relationship',
          Source: 'catalog',
          Measures: {},
          Message: `Child column is ${mismatch.Child} but ${parentName}.${r.Parent.Columns[0]} is ${mismatch.Parent}: joins need an implicit conversion${mismatch.Severe ? ' and may not use an index' : ''}.`,
        });
      }
    }

    const probed = phase?.RelationshipProbes[RelationshipKey(r)];
    if (!probed || probed.Outcome !== 'ok') continue;
    const checked = probed.CheckedRows ?? 0;
    const orphans = probed.OrphanRows ?? 0;
    if (Checks.OrphanedForeignKey && orphans > 0) {
      const rate = ratio(orphans, checked);
      const severity: DataQualitySeverity = r.Declared ? 'error' : rate * 100 >= Thresholds.orphanWarningPercent ? 'warning' : 'info';
      push(out, {
        ...base,
        Kind: 'OrphanedForeignKey',
        Severity: severity,
        Scope: 'relationship',
        Source: 'probe',
        Measures: { CheckedRows: checked, OrphanRows: orphans, OrphanRate: rate },
        Message: `${count(orphans)} of ${count(checked)} non-null rows (${percent(orphans, checked)}) have no matching row in ${parentName}${r.Declared ? '' : ': parent rows were deleted, or this is not a real reference'}.`,
      });
    }
    if (Checks.UnreferencedParentRows && probed.ParentRows !== undefined && probed.UnreferencedParentRows !== undefined && probed.ParentRows > 0) {
      const share = ratio(probed.UnreferencedParentRows, probed.ParentRows);
      if (share >= 0.5) {
        push(out, {
          ...base,
          Kind: 'UnreferencedParentRows',
          Severity: 'info',
          Scope: 'relationship',
          Source: 'probe',
          Measures: { ParentRows: probed.ParentRows, UnreferencedRows: probed.UnreferencedParentRows, Share: share },
          Message: `${count(probed.UnreferencedParentRows)} of ${count(probed.ParentRows)} rows in ${parentName} (${percent(probed.UnreferencedParentRows, probed.ParentRows)}) are never referenced from here.`,
        });
      }
    }
  }
}

/** How a discovered key's two sides differ in type, or undefined when they match. */
export function TypeMismatch(context: RuleContext, r: Relationship): { Child: string; Parent: string; Severe: boolean } | undefined {
  const childTable = FindTable(context.State.schemas, r.Child.Schema, r.Child.Table);
  const parentTable = FindTable(context.State.schemas, r.Parent.Schema, r.Parent.Table);
  const childColumn = childTable?.columns.find((c) => c.name.toLowerCase() === r.Child.Columns[0]?.toLowerCase());
  const parentColumn = parentTable?.columns.find((c) => c.name.toLowerCase() === r.Parent.Columns[0]?.toLowerCase());
  if (!childColumn || !parentColumn) return undefined;
  const a = BaseTypeName(childColumn.dataType);
  const b = BaseTypeName(parentColumn.dataType);
  if (a === b) return undefined;
  const familyA = context.Dialect.TypeFamily(childColumn.dataType);
  const familyB = context.Dialect.TypeFamily(parentColumn.dataType);
  const unicode = (t: string) => t.startsWith('n') && (t === 'nvarchar' || t === 'nchar');
  const textPair = (familyA === 'text' || familyA === 'fixedText') && (familyB === 'text' || familyB === 'fixedText');
  const severe = familyA !== familyB && !textPair ? true : textPair && unicode(a) !== unicode(b);
  return { Child: childColumn.dataType, Parent: parentColumn.dataType, Severe: severe };
}

// ─────────────────────────────────────────────────────────────────────────────
// Value lists
// ─────────────────────────────────────────────────────────────────────────────

/** Fold key for a value: lower case, surrounding whitespace removed. */
export function FoldValue(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Group spellings that fold to the same value, most frequent spelling first in each group and the
 * largest groups first.
 */
export function SpellingGroups(distribution: Array<{ Value: string; Frequency: number }>): string[][] {
  const groups = new Map<string, Array<{ Value: string; Frequency: number }>>();
  for (const entry of distribution) {
    const key = FoldValue(entry.Value);
    if (key === '') continue;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => list.sort((x, y) => y.Frequency - x.Frequency).map((e) => e.Value)).sort((x, y) => y.length - x.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type FindingDraft = Omit<DataQualityFinding, 'Id'> & { Kind: DataQualityCheck; Scope: DataQualityScope; Source: DataQualitySource };

function push(out: DataQualityFinding[], draft: FindingDraft): void {
  const finding: DataQualityFinding = { Id: FindingId(draft), ...draft };
  if (!finding.SampleValues || finding.SampleValues.length === 0) delete finding.SampleValues;
  if (finding.Approximate === undefined) delete finding.Approximate;
  out.push(finding);
}

/** `Kind:schema.table[.column][->schema.table]`. */
export function FindingId(f: Pick<DataQualityFinding, 'Kind' | 'SchemaName' | 'TableName' | 'ColumnName' | 'Related' | 'ColumnNames'>): string {
  const column = f.ColumnNames && f.ColumnNames.length > 1 ? `(${f.ColumnNames.join(',')})` : f.ColumnName ? `.${f.ColumnName}` : '';
  const related = f.Related ? `->${f.Related.SchemaName}.${f.Related.TableName}` : '';
  return `${f.Kind}:${f.SchemaName}.${f.TableName}${column}${related}`;
}

function samples(context: RuleContext, values: string[]): string[] | undefined {
  const n = context.Config.IncludeSampleValues;
  if (n <= 0 || values.length === 0) return undefined;
  return values.slice(0, n).map(clip);
}

function clip(value: string): string {
  return value.length > 60 ? `${value.slice(0, 57)}...` : value;
}

function firstValue(distribution: Array<{ value: string | number }> | undefined, sampleValues: unknown[] | undefined): string | undefined {
  const v = distribution?.[0]?.value ?? sampleValues?.find((x) => x !== null && x !== undefined);
  if (v === null || v === undefined) return undefined;
  return v instanceof Date ? v.toISOString() : String(v);
}

/** `('Active')`, `((0))`, `N'X'` → `Active`, `0`, `X`. */
function stripDefault(definition: string): string {
  let d = definition.trim();
  while (d.startsWith('(') && d.endsWith(')')) d = d.slice(1, -1).trim();
  d = d.replace(/^N'/, "'");
  if (d.startsWith("'") && d.endsWith("'")) d = d.slice(1, -1);
  return d.replace(/::[a-z ]+$/i, '').replace(/^'|'$/g, '');
}

function finiteOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? round4(part / whole) : 0;
}

function percent(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  const p = (part / whole) * 100;
  return `${p > 0 && p < 0.1 ? '<0.1' : round1(p)}%`;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** The ISO date (`YYYY-MM-DD`) of a statistics value, which is a Date in memory and a string after a save. */
export function ToISODate(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  const text = String(value);
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso) return iso[1];
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString().slice(0, 10);
}

function sentinelDates(dialect: QualityDialect, dataType: string): Set<string> {
  switch (dialect.Provider) {
    case 'sqlserver':
      return new Set(SqlServerSentinelDates(dataType));
    case 'postgresql':
      return new Set(['0001-01-01', '1900-01-01', '1970-01-01', '9999-12-31']);
    case 'mysql':
      return new Set(['0000-00-00', '1000-01-01', '1970-01-01', '9999-12-31']);
  }
}

/** Text longer than this is not treated as a possible key. */
const MAX_KEY_TEXT_LENGTH = 255;

const INTEGER_TYPES = new Set(['int', 'integer', 'bigint', 'smallint', 'tinyint', 'mediumint', 'int2', 'int4', 'int8', 'serial', 'bigserial']);

/** Types whose uniqueness means something: integers, text, and GUIDs. Dates, decimals and floats are unique by accident. */
function isIdentifierType(dataType: string, family: QualityTypeFamily, declaredLength: number | undefined): boolean {
  const t = BaseTypeName(dataType);
  // Long or unbounded text (log entries, documents) is unique by accident, not as a key.
  if (family === 'text' || family === 'fixedText') return declaredLength !== undefined && declaredLength <= MAX_KEY_TEXT_LENGTH;
  return INTEGER_TYPES.has(t) || t === 'uniqueidentifier' || t === 'uuid';
}

/** Lower-case words of an identifier: `UnitPrice` → `unit price`, `order_qty` → `order qty`. */
export function NameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

const QUANTITY_WORDS = new Set(['qty', 'quantity', 'count', 'price', 'cost', 'fee', 'weight', 'hours', 'units', 'age', 'length', 'width', 'height', 'size']);
const FUTURE_WORDS = new Set([
  'expire',
  'expires',
  'expiry',
  'expiration',
  'end',
  'ends',
  'due',
  'valid',
  'until',
  'through',
  'thru',
  'scheduled',
  'schedule',
  'planned',
  'plan',
  'target',
  'deadline',
  'renewal',
  'renew',
  'next',
  'effective',
  'start',
  'estimated',
  'forecast',
  'projected',
  'promised',
  'delivery',
]);
const CODE_WORDS = new Set([
  'code',
  'zip',
  'postal',
  'postcode',
  'phone',
  'fax',
  'mobile',
  'ssn',
  'ein',
  'tin',
  'sku',
  'upc',
  'isbn',
  'account',
  'number',
  'no',
  'num',
  'id',
]);

/** Words like quantity, price or weight, where a negative value is suspicious. */
export function IsQuantityName(name: string): boolean {
  return NameWords(name).some((w) => QUANTITY_WORDS.has(w));
}

/** Words like expires, due or scheduled, where a future date is expected. */
export function IsFutureLookingName(name: string): boolean {
  return NameWords(name).some((w) => FUTURE_WORDS.has(w));
}

/** Names whose values are digits by design (codes, phone numbers, account numbers). */
function isCodeLikeName(name: string): boolean {
  return NameWords(name).some((w) => CODE_WORDS.has(w));
}

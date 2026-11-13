/**
 * Runs the data quality probe statements through `BaseAutoDocDriver.ExecuteBounded`.
 *
 * One table probe is normally one statement. When a statement fails for a reason other than its
 * timeout, the batch is split in halves down to single columns, so one column the engine cannot
 * evaluate (an unusual type, a conversion it rejects) costs only that column's measures, not the
 * table's. A timeout is not split: smaller statements would only time out more often.
 */

import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { DescribeProbeFailure } from '../drivers/probeErrors.js';
import type { BoundedQueryOutcome } from '../types/data-quality.js';
import type {
  ColumnMeasure,
  ColumnQualityMeasures,
  RelationshipProbeOutcome,
  RelationshipProbeSpec,
  TableQualityProbeColumn,
  TableQualityProbeOutcome,
  TableQualityProbeSpec,
} from '../types/data-quality.js';
import {
  BuildDuplicateRowsStatement,
  BuildExactDistributionStatement,
  BuildRelationshipProbeStatement,
  BuildTableProbeStatement,
  ParseProbeRow,
  type ProbeStatement,
  type QualityDialect,
} from './QualityProbeSQL.js';

const TIMEOUT_REASON = 'probe exceeded its timeout';

export interface ProbeOptions {
  TimeoutMs: number;
  ColumnBatchSize: number;
}

/** The numeric fields of {@link ColumnQualityMeasures}, one per measure. */
type MeasureField = Exclude<keyof ColumnQualityMeasures, 'ExactDistribution' | 'Failed'>;

const MEASURE_FIELD: Record<ColumnMeasure, MeasureField> = {
  NonNull: 'NonNullRows',
  Blank: 'BlankRows',
  Untrimmed: 'UntrimmedRows',
  Variants: 'VariantSpellings',
  NumericLike: 'NumericLikeRows',
  DateLike: 'DateLikeRows',
  SentinelDate: 'SentinelDateRows',
  FutureDate: 'FutureDateRows',
  Negative: 'NegativeRows',
  AtCapacity: 'AtCapacityRows',
};

function isColumnMeasure(measure: string): measure is ColumnMeasure {
  return measure in MEASURE_FIELD;
}

type StatementResult = { Ok: true; Values: Map<string, number> } | { Ok: false; Reason: string; Code?: string };

/** `ExecuteBounded` never throws for a database error; this also covers a driver that throws anyway. */
async function execute<T extends Record<string, unknown>>(driver: BaseAutoDocDriver, sql: string, timeoutMs: number): Promise<BoundedQueryOutcome<T>> {
  try {
    return await driver.ExecuteBounded<T>(sql, timeoutMs);
  } catch (error) {
    return { Ok: false, Reason: DescribeProbeFailure(error) };
  }
}

async function run(driver: BaseAutoDocDriver, statement: ProbeStatement, timeoutMs: number): Promise<StatementResult> {
  const outcome = await execute<Record<string, unknown>>(driver, statement.Sql, timeoutMs);
  if (outcome.Ok !== true) return outcome;
  return { Ok: true, Values: ParseProbeRow(outcome.Rows[0], statement) };
}

/** Probe one table. Never throws. */
export async function ProbeTable(
  driver: BaseAutoDocDriver,
  dialect: QualityDialect,
  spec: TableQualityProbeSpec,
  options: ProbeOptions,
): Promise<TableQualityProbeOutcome> {
  const columns: Record<string, ColumnQualityMeasures> = {};
  const failed: Record<string, string> = {};
  let rowCount: number | undefined;

  const record = (statement: ProbeStatement, values: Map<string, number>) => {
    for (const alias of statement.Aliases) {
      const value = values.get(alias.Alias) ?? 0;
      if (alias.Measure === 'Rows') {
        rowCount = value;
      } else if (alias.Column !== undefined && isColumnMeasure(alias.Measure)) {
        const entry = (columns[alias.Column] ??= {});
        entry[MEASURE_FIELD[alias.Measure]] = value;
      }
    }
  };

  // Columns are processed in batches; `offset` keeps aliases unique across batches.
  const probeColumns = async (batch: TableQualityProbeColumn[], offset: number): Promise<void> => {
    const statement = BuildTableProbeStatement(spec, batch, dialect, offset);
    const result = await run(driver, statement, options.TimeoutMs);
    if (result.Ok === true) {
      record(statement, result.Values);
      return;
    }
    if (batch.length <= 1 || result.Reason === TIMEOUT_REASON) {
      for (const column of batch) failed[column.Name] = result.Reason;
      return;
    }
    const half = Math.ceil(batch.length / 2);
    await probeColumns(batch.slice(0, half), offset);
    await probeColumns(batch.slice(half), offset + half);
  };

  if (spec.Columns.length === 0) {
    // Nothing per column: one COUNT(*) still gives the exact row count.
    const statement = BuildTableProbeStatement(spec, [], dialect);
    const result = await run(driver, statement, options.TimeoutMs);
    if (result.Ok !== true) return result;
    record(statement, result.Values);
  } else {
    const size = Math.max(1, Math.floor(options.ColumnBatchSize));
    for (let start = 0; start < spec.Columns.length; start += size) {
      await probeColumns(spec.Columns.slice(start, start + size), start);
    }
    if (rowCount === undefined) {
      // Every batch failed. If even COUNT(*) fails, the table is unreadable: report that once.
      const statement = BuildTableProbeStatement(spec, [], dialect);
      const result = await run(driver, statement, options.TimeoutMs);
      if (result.Ok !== true) return result;
      record(statement, result.Values);
    }
  }

  let duplicateRows: number | undefined;
  if (spec.CountDuplicateRows) {
    const statement = BuildDuplicateRowsStatement(spec, dialect);
    if (statement) {
      const result = await run(driver, statement, options.TimeoutMs);
      if (result.Ok === true) duplicateRows = result.Values.get('duplicate_rows');
      else failed['(duplicate rows)'] = result.Reason;
    }
  }

  return { Ok: true, RowCount: rowCount ?? 0, Columns: columns, DuplicateRows: duplicateRows, FailedColumns: failed };
}

/**
 * Probe several relationships of one child table in one statement. If the statement fails for a
 * reason other than its timeout, each relationship is retried alone. Returns one outcome per spec,
 * in order. Never throws.
 */
export async function ProbeRelationships(
  driver: BaseAutoDocDriver,
  dialect: QualityDialect,
  specs: RelationshipProbeSpec[],
  timeoutMs: number,
): Promise<RelationshipProbeOutcome[]> {
  if (specs.length === 0) return [];
  const statement = BuildRelationshipProbeStatement(specs, dialect);
  const result = await run(driver, statement, timeoutMs);
  if (result.Ok === true) {
    return specs.map((spec, i) => {
      const read = (suffix: string) => result.Values.get(`r${i}_${suffix}`) ?? 0;
      return {
        Ok: true,
        CheckedRows: read('checked'),
        OrphanRows: read('orphans'),
        ...(spec.CountUnreferencedParents ? { ParentRows: read('parents'), UnreferencedParentRows: read('unreferenced') } : {}),
      };
    });
  }
  if (specs.length === 1 || result.Reason === TIMEOUT_REASON) {
    return specs.map(() => ({ Ok: false, Reason: result.Reason, Code: result.Code }));
  }
  const outcomes: RelationshipProbeOutcome[] = [];
  for (const spec of specs) {
    const [single] = await ProbeRelationships(driver, dialect, [spec], timeoutMs);
    outcomes.push(single);
  }
  return outcomes;
}

/** The exact value distribution of one column, most frequent first, or undefined when it cannot be read. */
export async function FetchExactDistribution(
  driver: BaseAutoDocDriver,
  dialect: QualityDialect,
  schema: string,
  table: string,
  column: string,
  limit: number,
  timeoutMs: number,
): Promise<Array<{ Value: string; Frequency: number }> | undefined> {
  const outcome = await execute<{ value: unknown; frequency: unknown }>(
    driver,
    BuildExactDistributionStatement(schema, table, column, limit, dialect),
    timeoutMs,
  );
  if (outcome.Ok !== true) return undefined;
  return outcome.Rows.filter((r) => r.value !== null && r.value !== undefined).map((r) => ({
    Value: r.value instanceof Date ? r.value.toISOString() : String(r.value),
    Frequency: Number(r.frequency) || 0,
  }));
}

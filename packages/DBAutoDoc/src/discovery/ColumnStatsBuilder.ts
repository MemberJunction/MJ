/**
 * Builds the per-column statistics record that relationship discovery keys on, from whichever
 * source already has the numbers: the sampling pass (column.statistics on the schema) or a direct
 * driver query. Both PKDetector's cache-miss path and ColumnStatsCache.SeedFromSchemas go through
 * here so that a seeded entry and a queried entry are built by the same rules.
 */

import { CachedColumnStats } from '../types/discovery.js';

export type ColumnDataPattern = CachedColumnStats['dataPattern'];

/** The numbers a cached entry is built from; the same whether they came from sampling or a query. */
export interface ColumnStatsInput {
  SchemaName: string;
  TableName: string;
  ColumnName: string;
  DataType: string;
  TotalRows: number;
  NullCount: number;
  DistinctCount: number;
  SampleValues: Array<string | number | null>;
  MinValue?: string | number;
  MaxValue?: string | number;
  AvgLength?: number;
  ValueDistribution?: Array<{ value: string | number; frequency: number }>;
  QueryTimeMs?: number;
}

/** True when the sample holds an empty string, whitespace, or a zero: values a primary key never has. */
export function HasBlankOrZero(sampleValues: Array<string | number | null> | undefined): boolean {
  return (sampleValues ?? []).some((v) => v === '' || v === 0 || v === '0' || (typeof v === 'string' && v.trim() === ''));
}

/** Classify a column's values as sequential, GUID, natural, or unknown from its type and sample. */
export function DetectDataPattern(sampleValues: Array<string | number | null> | undefined, dataType?: string): ColumnDataPattern {
  const type = dataType?.toLowerCase() ?? '';
  if (type.includes('uniqueidentifier') || type.includes('uuid') || type.includes('guid')) {
    return 'guid';
  }

  if (sampleValues && sampleValues.length > 1) {
    const values = sampleValues.filter((v): v is string | number => v != null);

    if (values.length > 0 && typeof values[0] === 'string') {
      const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (values.every((v) => typeof v === 'string' && guidPattern.test(v))) {
        return 'guid';
      }
    }

    if (values.length > 0 && typeof values[0] === 'number') {
      const sorted = (values as number[]).slice().sort((a, b) => a - b);
      const isSequential = sorted.every((val, idx) => idx === 0 || val === sorted[idx - 1] + 1);
      if (isSequential) {
        return 'sequential';
      }
    }
  }

  if (type.includes('varchar') || type.includes('char')) {
    return 'natural';
  }

  return 'unknown';
}

/**
 * Build the cached record. Uniqueness is distinct / total over the whole table, and a column is
 * PK-eligible only when it has rows, no nulls, no blanks or zeros in the sample, and is 100% unique.
 * FK eligibility starts true; FKDetector refines it by data type and value checks.
 */
export function BuildCachedColumnStats(input: ColumnStatsInput): CachedColumnStats {
  const { TotalRows: totalRows, NullCount: nullCount, DistinctCount: distinctCount } = input;
  const nullPercentage = totalRows > 0 ? nullCount / totalRows : 0;
  const uniqueness = totalRows > 0 ? distinctCount / totalRows : 0;

  return {
    schemaName: input.SchemaName,
    tableName: input.TableName,
    columnName: input.ColumnName,
    dataType: input.DataType,
    totalRows,
    nullCount,
    nullPercentage,
    distinctCount,
    uniqueness,
    minValue: input.MinValue,
    maxValue: input.MaxValue,
    avgLength: input.AvgLength,
    dataPattern: DetectDataPattern(input.SampleValues, input.DataType),
    sampleValues: input.SampleValues,
    valueDistribution: input.ValueDistribution,
    pkEligible: totalRows > 0 && nullCount === 0 && uniqueness === 1.0 && !HasBlankOrZero(input.SampleValues),
    fkEligible: true,
    computedAt: new Date().toISOString(),
    queryTimeMs: input.QueryTimeMs ?? 0,
  };
}

/**
 * EnumCandidateGate — deterministic pre-filter for enum/value-list detection.
 *
 * Evaluates column metadata and statistics to decide whether a column should be
 * presented to the LLM as a potential enum. Only string-typed, low-cardinality
 * columns with short max-length pass the gate.
 *
 * The gate intentionally errs on the side of exclusion: false negatives
 * (missing a real enum) are far cheaper than false positives (locking a
 * free-text field to a dropdown).
 */

import { ColumnDefinition, ColumnStatistics } from '../types/state.js';
import { EnumCandidateContext } from '../types/analysis.js';

/** Configuration knobs for the pre-filter gates */
export interface EnumGateConfig {
  /** Maximum column declared length to consider (default 50) */
  maxColumnLength: number;
  /** Upper bound on distinct values (default 50) */
  maxDistinctValues: number;
  /** Minimum total rows before applying cardinality ratio (default 50) */
  minTotalRows: number;
  /** Maximum cardinality ratio (distinct / total) to pass (default 0.05) */
  maxCardinalityRatio: number;
  /** Regex patterns for column names to always exclude */
  excludeColumnNamePatterns: RegExp[];
}

/** Result returned when a column passes the gate */
export interface EnumCandidate {
  columnName: string;
  values: string[];
  distinctCount: number;
  totalRows: number;
  cardinalityRatio: number;
  dataType: string;
  maxLength?: number;
}

const DEFAULT_CONFIG: EnumGateConfig = {
  maxColumnLength: 50,
  maxDistinctValues: 50,
  minTotalRows: 50,
  maxCardinalityRatio: 0.05,
  excludeColumnNamePatterns: [
    /Notes?$/i,
    /Description$/i,
    /Comment$/i,
    /Address/i,
  ],
};

/** Set of data-type base names eligible for enum detection (string types) */
const STRING_TYPES = new Set([
  'char', 'nchar', 'varchar', 'nvarchar',
  'character', 'character varying',
]);

/** Data patterns that indicate key-shaped columns — always excluded */
const EXCLUDED_PATTERNS = new Set<string>(['sequential', 'guid', 'composite']);

export class EnumCandidateGate {
  private readonly config: EnumGateConfig;

  constructor(config?: Partial<EnumGateConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate all columns of a table and return candidates that pass every gate.
   */
  public evaluateTable(
    columns: ColumnDefinition[],
    tableRowCount: number
  ): EnumCandidateContext[] {
    const candidates: EnumCandidateContext[] = [];
    for (const col of columns) {
      const candidate = this.evaluateColumn(col, tableRowCount);
      if (candidate) {
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  /**
   * Evaluate a single column against all deterministic gates.
   * Returns an EnumCandidateContext if the column passes, or null if it doesn't.
   */
  public evaluateColumn(
    column: ColumnDefinition,
    tableRowCount: number
  ): EnumCandidateContext | null {
    if (!this.passesDataTypeGate(column.dataType)) return null;
    if (!this.passesColumnLengthGate(column.dataType)) return null;
    if (!this.passesNameExclusionGate(column.name)) return null;
    if (!this.passesKeyGate(column)) return null;
    if (!this.passesPatternGate(column.statistics)) return null;

    const stats = column.statistics;
    if (!stats) return null;

    if (!this.passesDistinctCountGate(stats.distinctCount)) return null;
    if (!this.passesCardinalityGate(stats, tableRowCount)) return null;

    const values = this.extractValues(stats);
    if (values.length < 2) return null;

    return {
      columnName: column.name,
      values,
      distinctCount: stats.distinctCount,
      totalRows: tableRowCount,
      cardinalityRatio: tableRowCount > 0 ? stats.distinctCount / tableRowCount : 1,
      dataType: column.dataType,
      maxLength: this.parseDeclaredLength(column.dataType) ?? undefined,
    };
  }

  // ─── Individual Gates ─────────────────────────────────────────────

  /**
   * Gate: column must be a string-family type.
   */
  private passesDataTypeGate(dataType: string): boolean {
    const baseType = this.parseBaseType(dataType);
    // 'text' is allowed only if it's length-bounded (handled by length gate)
    return STRING_TYPES.has(baseType) || baseType === 'text';
  }

  /**
   * Gate: declared column length must be ≤ maxColumnLength.
   * Unbounded text/varchar(max) is excluded.
   */
  private passesColumnLengthGate(dataType: string): boolean {
    const baseType = this.parseBaseType(dataType);
    const length = this.parseDeclaredLength(dataType);

    // Unbounded text type — exclude
    if (baseType === 'text' && length === null) return false;
    // varchar(max) / nvarchar(max) — exclude
    if (length === null && (baseType === 'varchar' || baseType === 'nvarchar')) return false;
    // Length known and exceeds limit
    if (length !== null && length > this.config.maxColumnLength) return false;

    return true;
  }

  /**
   * Gate: column name must not match any exclusion pattern.
   */
  private passesNameExclusionGate(columnName: string): boolean {
    return !this.config.excludeColumnNamePatterns.some(pattern => pattern.test(columnName));
  }

  /**
   * Gate: primary keys and foreign keys are not enum candidates.
   */
  private passesKeyGate(column: ColumnDefinition): boolean {
    return !column.isPrimaryKey && !column.isForeignKey;
  }

  /**
   * Gate: exclude key-shaped data patterns (sequential, guid, composite).
   */
  private passesPatternGate(stats: ColumnStatistics | undefined): boolean {
    if (!stats?.dataPattern) return true;
    return !EXCLUDED_PATTERNS.has(stats.dataPattern);
  }

  /**
   * Gate: distinct count must be ≥ 2 and ≤ maxDistinctValues.
   */
  private passesDistinctCountGate(distinctCount: number): boolean {
    return distinctCount >= 2 && distinctCount <= this.config.maxDistinctValues;
  }

  /**
   * Gate: cardinality ratio must be ≤ threshold, unless the table is small.
   * For small tables (< minTotalRows), the ratio gate is skipped to avoid
   * false positives from low-volume data.
   */
  private passesCardinalityGate(
    stats: ColumnStatistics,
    tableRowCount: number
  ): boolean {
    // Small tables bypass the ratio gate — LLM decides
    if (tableRowCount < this.config.minTotalRows) return true;

    const ratio = tableRowCount > 0 ? stats.distinctCount / tableRowCount : 1;
    return ratio <= this.config.maxCardinalityRatio;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /**
   * Extract the base SQL type name, lowercased, without length/precision.
   * e.g. "nvarchar(50)" → "nvarchar", "CHARACTER VARYING" → "character varying"
   */
  private parseBaseType(dataType: string): string {
    // Remove parenthetical (length/precision)
    const base = dataType.replace(/\(.*\)/, '').trim().toLowerCase();
    return base;
  }

  /**
   * Parse the declared length from a type string.
   * Returns null for unbounded types or types without length.
   * e.g. "varchar(50)" → 50, "nvarchar(max)" → null, "text" → null
   */
  private parseDeclaredLength(dataType: string): number | null {
    const match = dataType.match(/\((\d+|max)\)/i);
    if (!match) return null;
    if (match[1].toLowerCase() === 'max') return null;
    return parseInt(match[1], 10);
  }

  /**
   * Extract distinct string values from column statistics.
   * Trims whitespace, drops empty strings and null-like sentinels.
   */
  private extractValues(stats: ColumnStatistics): string[] {
    const rawValues = this.collectRawValues(stats);
    return this.normalizeValues(rawValues);
  }

  /**
   * Collect raw string values from valueDistribution or sampleValues.
   */
  private collectRawValues(stats: ColumnStatistics): string[] {
    // Prefer valueDistribution — it's comprehensive
    if (stats.valueDistribution && stats.valueDistribution.length > 0) {
      return stats.valueDistribution
        .map(v => String(v.value))
        .filter(v => v !== 'null' && v !== 'undefined');
    }
    // Fallback to sampleValues
    if (stats.sampleValues && stats.sampleValues.length > 0) {
      return stats.sampleValues
        .filter((v): v is string | number => v !== null && v !== undefined)
        .map(v => String(v));
    }
    return [];
  }

  /**
   * Trim whitespace, drop empty strings and null-like sentinels.
   * Does NOT case-normalize — case differences may be meaningful.
   */
  private normalizeValues(values: string[]): string[] {
    const NULL_SENTINELS = new Set(['', 'NULL', 'null', 'N/A', 'n/a', '-', '--']);
    const seen = new Set<string>();
    const result: string[] = [];

    for (const raw of values) {
      const trimmed = raw.trim();
      if (NULL_SENTINELS.has(trimmed)) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
    }

    return result;
  }
}

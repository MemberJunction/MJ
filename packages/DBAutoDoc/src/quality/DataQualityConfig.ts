/**
 * Defaults for the data quality phase, resolved at the consumer like `DEFAULT_KEY_VERIFICATION`.
 */

import type { DataQualityConfig, DataQualityThresholds } from '../types/config.js';
import type { DataQualityCheck } from '../types/data-quality.js';

/** Every check, in the order reports list them. */
export const DATA_QUALITY_CHECKS: readonly DataQualityCheck[] = [
  'EmptyTable',
  'StaleRowCountEstimate',
  'NoPrimaryKey',
  'IsolatedTable',
  'ExactDuplicateRows',
  'AlwaysNull',
  'ConstantValue',
  'HighNullRate',
  'NullableNeverNull',
  'NearUnique',
  'UndeclaredUnique',
  'ForeignKeyMostlyNull',
  'OneToOne',
  'SentinelDate',
  'FutureDate',
  'LengthAtCapacity',
  'NegativeValue',
  'BlankString',
  'UntrimmedString',
  'CaseWhitespaceVariants',
  'NumericStoredAsText',
  'DateStoredAsText',
  'UntrustedForeignKey',
  'ForeignKeyTypeMismatch',
  'OrphanedForeignKey',
  'UnreferencedParentRows',
];

/** Checks that cost a full extra scan and are off unless asked for. */
const OFF_BY_DEFAULT: ReadonlySet<DataQualityCheck> = new Set<DataQualityCheck>(['ExactDuplicateRows', 'UnreferencedParentRows']);

/** {@link DataQualityConfig} with every default applied. */
export interface ResolvedDataQualityConfig {
  Enabled: boolean;
  Probes: boolean;
  ProbeTimeoutMs: number;
  MaxRowsForProbe: number;
  ColumnBatchSize: number;
  RelationshipBatchSize: number;
  MaxPhaseDurationMs: number;
  IncludeSampleValues: number;
  PromptMaxFindingsPerColumn: number;
  Checks: Record<DataQualityCheck, boolean>;
  Thresholds: Required<DataQualityThresholds>;
}

export const DEFAULT_DATA_QUALITY_THRESHOLDS: Required<DataQualityThresholds> = {
  highNullRatePercent: 90,
  foreignKeyMostlyNullPercent: 90,
  nearUniqueRatio: 0.99,
  minRowsForUniqueness: 100,
  minRowsForColumnChecks: 10,
  storedAsTextShare: 0.9,
  variantsMaxDistinct: 100,
  futureDateToleranceDays: 1,
  orphanWarningPercent: 5,
  lengthAtCapacityMinDeclared: 8,
  rowCountDriftRatio: 0.1,
};

/** Resolve a config section (possibly absent) into one with every field set. */
export function ResolveDataQualityConfig(config: DataQualityConfig | undefined): ResolvedDataQualityConfig {
  const c = config ?? {};
  const checks = {} as Record<DataQualityCheck, boolean>;
  for (const check of DATA_QUALITY_CHECKS) {
    checks[check] = c.checks?.[check] ?? !OFF_BY_DEFAULT.has(check);
  }
  const thresholds: Required<DataQualityThresholds> = { ...DEFAULT_DATA_QUALITY_THRESHOLDS };
  if (c.thresholds) {
    for (const key of Object.keys(DEFAULT_DATA_QUALITY_THRESHOLDS) as Array<keyof DataQualityThresholds>) {
      const value = c.thresholds[key];
      if (value !== undefined) thresholds[key] = value;
    }
  }
  return {
    Enabled: c.enabled ?? true,
    Probes: c.probes ?? true,
    ProbeTimeoutMs: positiveOr(c.probeTimeoutMs, 60_000),
    MaxRowsForProbe: nonNegativeOr(c.maxRowsForProbe, 20_000_000),
    ColumnBatchSize: positiveOr(c.columnBatchSize, 40),
    RelationshipBatchSize: positiveOr(c.relationshipBatchSize, 8),
    MaxPhaseDurationMs: nonNegativeOr(c.maxPhaseDurationMs, 0),
    IncludeSampleValues: nonNegativeOr(c.includeSampleValues, 5),
    PromptMaxFindingsPerColumn: nonNegativeOr(c.promptMaxFindingsPerColumn, 3),
    Checks: checks,
    Thresholds: thresholds,
  };
}

/**
 * Problems with a config section, as messages. Unknown check names are the usual mistake
 * (a typo silently leaves the real check on), so they are reported with the valid names.
 */
export function ValidateDataQualityConfig(config: DataQualityConfig | undefined): string[] {
  if (!config) return [];
  const errors: string[] = [];
  const known = new Set<string>(DATA_QUALITY_CHECKS);
  for (const [name, value] of Object.entries(config.checks ?? {})) {
    if (!known.has(name)) {
      errors.push(`analysis.dataQuality.checks: unknown check '${name}'. Valid checks: ${DATA_QUALITY_CHECKS.join(', ')}`);
    } else if (typeof value !== 'boolean') {
      errors.push(`analysis.dataQuality.checks.${name} must be true or false`);
    }
  }
  const knownThresholds = new Set(Object.keys(DEFAULT_DATA_QUALITY_THRESHOLDS));
  for (const [name, value] of Object.entries(config.thresholds ?? {})) {
    if (!knownThresholds.has(name)) {
      errors.push(`analysis.dataQuality.thresholds: unknown threshold '${name}'. Valid thresholds: ${[...knownThresholds].join(', ')}`);
    } else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      errors.push(`analysis.dataQuality.thresholds.${name} must be a non-negative number`);
    }
  }
  return errors;
}

function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

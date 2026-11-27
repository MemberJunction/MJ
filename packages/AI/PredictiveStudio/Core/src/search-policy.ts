/**
 * @module search-policy
 *
 * Equal-cost comparison policy governing wave-search strategies (PR 5 §5.2.5 / B4).
 *
 * Seeded random search (`SearchStrategy.kind === 'random'`) is always enabled when driven by
 * {@link SearchPolicy.SeededRandomStrategistName}. A guided strategist (`SearchStrategy.kind === 'guided'`,
 * `bayesian` or `successive-halving`) is refused unless backed by a stored `MJ: ML Search Strategy Comparisons`
 * record for that method against seeded random search at equal compute across both `W1-signal` and `C1`,
 * whose paired lower bound is strictly positive (`LowerBoundMin > 0`, never `>= 0`, never averaged).
 */
import { UUIDsEqual } from '@memberjunction/global';
import type { SearchStrategy } from './evaluation-protocol';
import type { PairedComparison } from './gate';
import { JsonParse, type JsonValue, type ParseResult } from './json-value';

/** Guided search methods that require an equal-cost comparison before being enabled. */
export type GuidedSearchMethod = 'bayesian' | 'successive-halving';

/** One dataset + seed list entry recorded in `MLSearchStrategyComparison.Datasets`. */
export interface EqualCostComparisonDataset {
  readonly Dataset: string;
  readonly Seeds: readonly number[];
}

/**
 * Typed view of an `MJ: ML Search Strategy Comparisons` row used by pure policy decisions.
 */
export interface EqualCostComparison {
  readonly ID: string;
  readonly Method: GuidedSearchMethod;
  readonly ComputeBudgetSecondsPerArm: number;
  readonly Datasets: readonly EqualCostComparisonDataset[];
  readonly PairedDifference: Readonly<Record<string, PairedComparison>>;
  readonly LowerBoundMin: number;
  readonly Passed: boolean;
}

/** Persisted column projection of `MJ: ML Search Strategy Comparisons` parsed by {@link SearchPolicy.ParseComparisonRow}. */
export interface SearchComparisonColumns {
  readonly ID: string;
  readonly Method: string;
  readonly ComputeBudgetSecondsPerArm: number;
  readonly Datasets: string;
  readonly PairedDifference: string;
  readonly LowerBoundMin: number;
  readonly Passed: boolean;
}

/** Structured refusal returned by {@link SearchPolicy.Decide}. */
export type SearchPolicyRefusal =
  | {
      readonly kind: 'guided-without-comparison';  // case-violation-ok-legacy-back-compat: SearchPolicy contract union field
      readonly method: GuidedSearchMethod;  // case-violation-ok-legacy-back-compat: SearchPolicy contract union field
    }
  | {
      readonly kind: 'comparison-not-passed';  // case-violation-ok-legacy-back-compat: SearchPolicy contract union field
      readonly comparisonId: string;  // case-violation-ok-legacy-back-compat: SearchPolicy contract union field
      readonly lowerBoundMin: number;  // case-violation-ok-legacy-back-compat: SearchPolicy contract union field
    }
  | {
      readonly kind: 'strategist-not-random';  // case-violation-ok-legacy-back-compat: SearchPolicy contract union field
      readonly strategist: string;  // case-violation-ok-legacy-back-compat: SearchPolicy contract union field
    };

/** Strict lower-bound margin (0 means zero improvement at the confidence bound; guided search requires strictly > 0). */
const POSITIVE_BOUND_FLOOR = 0;

/** Lower confidence index in {@link PairedComparison.ci} (`[lower, upper]`). */
const CI_LOWER_INDEX = 0;

/** Upper confidence index in {@link PairedComparison.ci} (`[lower, upper]`). */
const CI_UPPER_INDEX = 1;

/** Required tuple length of {@link PairedComparison.ci}. */
const CI_PAIR_LENGTH = 2;

/** Minimum difference threshold used to verify `LowerBoundMin` matches the minimum paired lower bound across datasets. */
const BOUND_MATCH_TOLERANCE = 1e-6;

/**
 * Pure policy enforcement for evaluation search strategies (`random` vs `guided`).
 */
export class SearchPolicy {
  /** World + scenario datasets every equal-cost comparison must evaluate and beat random on. */
  public static readonly RequiredComparisonDatasets = ['W1-signal', 'C1'] as const;

  /** Canonical name of the seeded random strategist permitted under `random` protocols. */
  public static readonly SeededRandomStrategistName = 'SeededRandomWaveStrategist';

  /** Supported guided methods matching `MLSearchStrategyComparison.Method` CHECK constraint. */
  public static readonly GuidedMethods: readonly GuidedSearchMethod[] = ['bayesian', 'successive-halving'];

  /**
   * Minimum lower bound `ci[0]` across all required datasets (`W1-signal` and `C1`), plus any extra datasets in
   * `pairedDifference`. Returns `null` if either required dataset is missing or any entry is malformed. Pure.
   */
  public static ComputeLowerBoundMin(pairedDifference: Readonly<Record<string, PairedComparison>>): number | null {
    for (const required of SearchPolicy.RequiredComparisonDatasets) {
      if (!Object.prototype.hasOwnProperty.call(pairedDifference, required)) {
        return null;
      }
    }
    const entries = Object.values(pairedDifference);
    if (entries.length === 0) return null;
    let minLower = Number.POSITIVE_INFINITY;
    for (const entry of entries) {
      if (!entry || !Array.isArray(entry.ci) || entry.ci.length < CI_PAIR_LENGTH) return null;
      const lower = entry.ci[CI_LOWER_INDEX];
      if (typeof lower !== 'number' || !Number.isFinite(lower)) return null;
      if (lower < minLower) minLower = lower;
    }
    return Number.isFinite(minLower) ? minLower : null;
  }

  /**
   * Computes `Passed`: strictly `LowerBoundMin > 0` (never `>= 0`). Pure.
   */
  public static ComputePassed(lowerBoundMin: number): boolean {
    return Number.isFinite(lowerBoundMin) && lowerBoundMin > POSITIVE_BOUND_FLOOR;
  }

  /**
   * Verifies `LowerBoundMin` against {@link ComputeLowerBoundMin}: returns error messages when invalid or forged
   * (for example, averaged across W1-signal and C1 instead of taking the minimum). Pure.
   */
  public static GetComparisonRowProblems(row: Pick<SearchComparisonColumns, 'Method' | 'ComputeBudgetSecondsPerArm' | 'Datasets' | 'PairedDifference' | 'LowerBoundMin'>): string[] {
    const errors: string[] = [];
    if (!SearchPolicy.isGuidedMethod(row.Method)) {
      errors.push(`Method must be 'bayesian' or 'successive-halving' (received '${row.Method}')`);
    }
    if (!Number.isFinite(row.ComputeBudgetSecondsPerArm) || row.ComputeBudgetSecondsPerArm <= POSITIVE_BOUND_FLOOR) {
      errors.push('ComputeBudgetSecondsPerArm must be a finite number strictly greater than 0');
    }
    const datasets = SearchPolicy.parseDatasets(row.Datasets, errors);
    const paired = SearchPolicy.parsePairedDifference(row.PairedDifference, errors);
    if (datasets !== null) {
      for (const required of SearchPolicy.RequiredComparisonDatasets) {
        const entry = datasets.find((d) => d.Dataset === required);
        if (!entry || entry.Seeds.length === 0) {
          errors.push(`Datasets must include '${required}' with at least one seed`);
        }
      }
    }
    if (paired !== null) {
      const computedMin = SearchPolicy.ComputeLowerBoundMin(paired);
      if (computedMin === null) {
        errors.push(`PairedDifference must include valid PairedComparison intervals for both ${SearchPolicy.RequiredComparisonDatasets.join(' and ')}`);
      } else if (!Number.isFinite(row.LowerBoundMin) || Math.abs(row.LowerBoundMin - computedMin) > BOUND_MATCH_TOLERANCE) {
        errors.push(`LowerBoundMin must equal the minimum lower bound across datasets (${computedMin}), not ${row.LowerBoundMin}`);
      }
    }
    return errors;
  }

  /** Parses a raw `MJ: ML Search Strategy Comparisons` row into an {@link EqualCostComparison}. Pure. */
  public static ParseComparisonRow(row: SearchComparisonColumns): ParseResult<EqualCostComparison> {
    const errors = SearchPolicy.GetComparisonRowProblems(row);
    const datasets = SearchPolicy.parseDatasets(row.Datasets, []);
    const paired = SearchPolicy.parsePairedDifference(row.PairedDifference, []);
    if (errors.length > 0 || !SearchPolicy.isGuidedMethod(row.Method) || datasets === null || paired === null) {
      return JsonParse.ParseFail(...(errors.length > 0 ? errors : ['Search comparison row is incomplete']));
    }
    return JsonParse.ParseOk({
      ID: row.ID,
      Method: row.Method,
      ComputeBudgetSecondsPerArm: row.ComputeBudgetSecondsPerArm,
      Datasets: datasets,
      PairedDifference: paired,
      LowerBoundMin: row.LowerBoundMin,
      Passed: Boolean(row.Passed),
    });
  }

  /** True when `comparison.Datasets` and `comparison.PairedDifference` both cover `W1-signal` and `C1`. Pure. */
  public static HasRequiredDatasets(comparison: Pick<EqualCostComparison, 'Datasets' | 'PairedDifference'>): boolean {
    for (const required of SearchPolicy.RequiredComparisonDatasets) {
      const hasDataset = comparison.Datasets.some((d) => d.Dataset === required && d.Seeds.length > 0);
      const hasPaired = Object.prototype.hasOwnProperty.call(comparison.PairedDifference, required);
      if (!hasDataset || !hasPaired) return false;
    }
    return true;
  }

  /**
   * Decides whether running `strategy` with `strategistName` and optional `comparison` is allowed.
   * Returns `null` when permitted, or a structured {@link SearchPolicyRefusal} when refused. Pure.
   */
  public static Decide(
    strategy: SearchStrategy,
    strategistName: string,
    comparison: EqualCostComparison | null,
  ): SearchPolicyRefusal | null {
    if (strategy.kind === 'random') {
      return strategistName === SearchPolicy.SeededRandomStrategistName
        ? null
        : { kind: 'strategist-not-random', strategist: strategistName };
    }
    if (
      comparison === null ||
      !UUIDsEqual(comparison.ID, strategy.equalCostComparisonId) ||
      comparison.Method !== strategy.method
    ) {
      return { kind: 'guided-without-comparison', method: strategy.method };
    }
    const computedMin = SearchPolicy.ComputeLowerBoundMin(comparison.PairedDifference);
    const effectiveMin = computedMin === null ? comparison.LowerBoundMin : Math.min(comparison.LowerBoundMin, computedMin);
    if (
      !(comparison.LowerBoundMin > POSITIVE_BOUND_FLOOR) ||
      !comparison.Passed ||
      !SearchPolicy.HasRequiredDatasets(comparison) ||
      computedMin === null ||
      !(effectiveMin > POSITIVE_BOUND_FLOOR)
    ) {
      return {
        kind: 'comparison-not-passed',
        comparisonId: comparison.ID,
        lowerBoundMin: effectiveMin,
      };
    }
    return null;
  }

  /** Human-readable sentence explaining a {@link SearchPolicyRefusal}. Pure. */
  public static DescribeRefusal(refusal: SearchPolicyRefusal): string {
    switch (refusal.kind) {
      case 'guided-without-comparison':
        return `Guided search (${refusal.method}) requires a stored MJ: ML Search Strategy Comparisons record for that method against seeded random search at equal compute across W1-signal and C1.`;
      case 'comparison-not-passed':
        return `Guided search comparison ${refusal.comparisonId} did not pass across both W1-signal and C1 (LowerBoundMin=${refusal.lowerBoundMin}; requires strictly > 0 on both datasets).`;
      case 'strategist-not-random':
        return `Search strategy 'random' requires ${SearchPolicy.SeededRandomStrategistName}, but received '${refusal.strategist}'.`;
    }
  }

  private static isGuidedMethod(value: string): value is GuidedSearchMethod {
    return SearchPolicy.GuidedMethods.some((m) => m === value);
  }

  private static parseDatasets(raw: string, errors: string[]): EqualCostComparisonDataset[] | null {
    const parsed = JsonParse.ParseJsonText(raw, 'Datasets');
    if (parsed.Ok === false) {
      errors.push(...parsed.Errors);
      return null;
    }
    if (!Array.isArray(parsed.Value)) {
      errors.push('Datasets must be a JSON array of {Dataset, Seeds} entries');
      return null;
    }
    const out: EqualCostComparisonDataset[] = [];
    for (const item of parsed.Value) {
      if (!JsonParse.IsJsonObject(item)) {
        errors.push('Every Datasets element must be an object with Dataset and Seeds');
        return null;
      }
      const dataset = JsonParse.JsonString(item, 'Dataset');
      const rawSeeds = item['Seeds'];
      if (!dataset || !Array.isArray(rawSeeds) || !rawSeeds.every((s): s is number => typeof s === 'number' && Number.isInteger(s))) {
        errors.push('Every Datasets entry must have non-empty Dataset string and integer Seeds array');
        return null;
      }
      out.push({ Dataset: dataset, Seeds: rawSeeds });
    }
    return out;
  }

  private static parsePairedDifference(raw: string, errors: string[]): Record<string, PairedComparison> | null {
    const parsed = JsonParse.ParseJsonText(raw, 'PairedDifference');
    if (parsed.Ok === false) {
      errors.push(...parsed.Errors);
      return null;
    }
    if (!JsonParse.IsJsonObject(parsed.Value)) {
      errors.push('PairedDifference must be a JSON object mapping dataset name to PairedComparison');
      return null;
    }
    const out: Record<string, PairedComparison> = {};
    for (const [key, val] of Object.entries(parsed.Value)) {
      const comp = SearchPolicy.parseOnePaired(key, val, errors);
      if (comp === null) return null;
      out[key] = comp;
    }
    return out;
  }

  private static parseOnePaired(dataset: string, val: JsonValue, errors: string[]): PairedComparison | null {
    if (!JsonParse.IsJsonObject(val)) {
      errors.push(`PairedDifference.${dataset} must be a PairedComparison object`);
      return null;
    }
    const value = val['value'];
    const ci = val['ci'];
    const beats = val['beats'];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      !Array.isArray(ci) ||
      ci.length !== CI_PAIR_LENGTH ||
      typeof ci[CI_LOWER_INDEX] !== 'number' ||
      typeof ci[CI_UPPER_INDEX] !== 'number' ||
      !Number.isFinite(ci[CI_LOWER_INDEX]) ||
      !Number.isFinite(ci[CI_UPPER_INDEX]) ||
      typeof beats !== 'boolean'
    ) {
      errors.push(`PairedDifference.${dataset} must contain numeric value, 2-element finite ci tuple, and boolean beats`);
      return null;
    }
    return {
      value,
      ci: [ci[CI_LOWER_INDEX], ci[CI_UPPER_INDEX]],
      beats,
    };
  }
}

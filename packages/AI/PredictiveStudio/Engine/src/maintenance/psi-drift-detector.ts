/**
 * @module maintenance/psi-drift-detector
 *
 * Population Stability Index (PSI), Confidence-Floor Degradation, and
 * Champion-vs-Challenger Divergence evaluation (`WS-4.4`).
 *
 * Mathematical definition of PSI across $B$ bins:
 * $$\text{PSI} = \sum_{i=1}^{B} (p_i - q_i) \ln\left(\frac{p_i}{q_i}\right)$$
 * where $q_i$ is the baseline (expected) proportion in bin $i$, $p_i$ is the evaluation
 * (observed) proportion in bin $i$, and empty bins are regularized with Laplace smoothing
 * $\epsilon = 10^{-4}$.
 *
 * Thresholds:
 * - $\text{PSI} < 0.10$: `'None'` (stable distribution)
 * - $0.10 \le \text{PSI} < 0.25$: `'Warning'` (moderate distributional shift)
 * - $\text{PSI} \ge 0.25$: `'Critical'` (severe distributional shift)
 */

import { LogError, RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import type { MJFeatureValueEntity, MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID, UUIDMap, UUIDSet } from '@memberjunction/global';
import type { DriftContext, DriftResult, IDriftDetector } from './types';

/** Default Laplace smoothing constant for zero-count bins. */
export const DEFAULT_PSI_EPSILON = 1e-4;

/** Default warning threshold for Population Stability Index. */
export const PSI_WARNING_THRESHOLD = 0.10;

/** Default critical drift threshold for Population Stability Index. */
export const PSI_CRITICAL_THRESHOLD = 0.25;

/** Default minimum valid sample size required before PSI or confidence drift is evaluated. */
export const DEFAULT_MIN_SAMPLE_SIZE = 100;

/** Default maximum `MJ: Feature Values` rows loaded per window (baseline, evaluation) in a single drift evaluation. */
export const DEFAULT_DRIFT_MAX_ROWS = 100000;

/** Batch size (in Record Processes) when running scheduled drift sweeps across multiple processes. */
export const DRIFT_SWEEP_BATCH_SIZE = 10;

/** Severity level for feature or prediction drift. */
export type DriftSeverity = 'None' | 'Warning' | 'Critical';

/** Per-feature PSI evaluation result. */
export interface FeaturePSIResult {
  readonly FeatureName: string;
  readonly FeatureType: 'Numeric' | 'Categorical' | 'Prebinned';
  readonly PSI: number;
  readonly Severity: DriftSeverity;
  readonly BinCount: number;
  readonly BaselineSampleCount: number;
  readonly EvaluationSampleCount: number;
  readonly InsufficientData?: boolean;
  readonly BaselineMissingRate?: number;
  readonly EvaluationMissingRate?: number;
  readonly MissingRateDelta?: number;
}

/** Paired champion and challenger shadow observation for a single record. */
export interface ChampionChallengerPair {
  readonly RecordID?: string;
  readonly ChampionScore?: number;
  readonly ChallengerScore?: number;
  readonly ChampionLabel?: string;
  readonly ChallengerLabel?: string;
  readonly ChampionLatencyMs?: number;
  readonly ChallengerLatencyMs?: number;
  readonly TimedOut?: boolean;
  readonly ErrorMessage?: string;
}

/** Input to {@link ComputeConfidenceAndChallengerDivergence}. */
export interface ConfidenceAndDivergenceInput {
  readonly BaselineConfidences?: readonly number[];
  readonly EvaluationConfidences?: readonly number[];
  /** Confidence floor threshold in `[0, 1]` (defaults to `0.60`). */
  readonly ConfidenceFloor?: number;
  /** Maximum acceptable fraction of predictions falling below `ConfidenceFloor` (defaults to `0.20`). */
  readonly MaxBelowFloorRate?: number;
  /** Maximum acceptable drop in mean confidence from baseline to evaluation (defaults to `0.10`). */
  readonly MaxMeanConfidenceDrop?: number;
  readonly Pairs?: readonly ChampionChallengerPair[];
  /** Minimum acceptable label/band agreement rate between champion and challenger (defaults to `0.85`). */
  readonly MinAgreementRate?: number;
  /** Maximum acceptable mean absolute score delta between champion and challenger (defaults to `0.15`). */
  readonly MaxMeanAbsoluteScoreDelta?: number;
  /** Maximum acceptable p95 challenger-to-champion latency ratio (defaults to `3.0`). */
  readonly MaxP95LatencyRatio?: number;
  /** Problem type for numeric score agreement ('classification' uses probability cut unless tolerance given; 'regression' uses tolerance band). */
  readonly ProblemType?: 'classification' | 'regression';
  /** Maximum absolute difference between champion and challenger numeric scores counted as agreement in regression/tolerance mode. */
  readonly ScoreAgreementTolerance?: number;
  /** Minimum valid confidence observations required before flagging confidence degradation (defaults to `100`). */
  readonly MinSampleSize?: number;
}

/** Computed confidence-floor and champion-vs-challenger divergence metrics. */
export interface ConfidenceAndDivergenceMetrics {
  readonly BaselineMeanConfidence: number | null;
  readonly EvaluationMeanConfidence: number | null;
  readonly BelowFloorRate: number | null;
  readonly ConfidenceDegraded: boolean;
  readonly ConfidenceInsufficientData?: boolean;
  readonly DivergenceInsufficientData?: boolean;
  /**
   * Pairs with a champion output. Only these count anywhere: toward the sample size, the agreement rate, the delta,
   * latency and the timeout and failure counts. The challenger side is an output, a timeout, an error, or nothing
   * (a failure too).
   */
  readonly PairCount: number;
  readonly ChallengerTimeoutCount: number;
  readonly ChallengerFailureCount: number;
  readonly AgreementRate: number | null;
  readonly MeanAbsoluteScoreDelta: number | null;
  readonly P95LatencyRatio: number | null;
  readonly ChallengerDiverged: boolean;
}

/** Input to {@link EvaluateFeatureAndPredictionDrift}. */
export interface FeatureAndPredictionDriftInput {
  readonly ModelID?: string;
  readonly RecordProcessID?: string;
  readonly Truncated?: boolean;
  readonly NumericFeatures?: Readonly<
    Record<
      string,
      {
        readonly Baseline: readonly (number | null | undefined)[];
        readonly Evaluation: readonly (number | null | undefined)[];
        readonly Bins?: number;
      }
    >
  >;
  readonly CategoricalFeatures?: Readonly<
    Record<
      string,
      {
        readonly Baseline: readonly (string | null | undefined)[];
        readonly Evaluation: readonly (string | null | undefined)[];
      }
    >
  >;
  readonly PrebinnedFeatures?: Readonly<
    Record<
      string,
      {
        readonly BaselineProportions: readonly number[];
        readonly EvaluationProportions: readonly number[];
        readonly BaselineSampleCount?: number;
        readonly EvaluationSampleCount?: number;
      }
    >
  >;
  readonly ConfidenceAndDivergence?: ConfidenceAndDivergenceInput;
  readonly WarningPSIThreshold?: number;
  readonly CriticalPSIThreshold?: number;
  readonly Epsilon?: number;
  /** Minimum sample count required per window before PSI is evaluated (defaults to `100`). */
  readonly MinSampleSize?: number;
}

/** Aggregate report returned by {@link EvaluateFeatureAndPredictionDrift}. */
export interface FeatureAndPredictionDriftReport {
  readonly ModelID?: string;
  readonly RecordProcessID?: string;
  readonly OverallSeverity: DriftSeverity;
  readonly MaxPSI: number;
  readonly FeatureResults: readonly FeaturePSIResult[];
  readonly DriftedFeatures: readonly FeaturePSIResult[];
  readonly DivergenceMetrics: ConfidenceAndDivergenceMetrics;
  readonly ShouldAlert: boolean;
  readonly InsufficientData: boolean;
  readonly Truncated?: boolean;
  readonly Summary: string;
}

/** Options for loading baseline and evaluation windows from `MJ: Feature Values`. */
export interface LoadDriftFromFeatureValuesOptions {
  readonly RecordProcessID?: string;
  /** Optional `MJ: ML Models` ID; filters `MJ: Feature Values.MLModelID` when `RecordProcessID` is omitted. */
  readonly ModelID?: string;
  readonly ProblemType?: 'classification' | 'regression';
  readonly BaselineWindowEnd?: Date | string;
  readonly EvaluationWindowStart?: Date | string;
  readonly Provider: IMetadataProvider;
  readonly ContextUser?: UserInfo;
  readonly WarningPSIThreshold?: number;
  readonly CriticalPSIThreshold?: number;
  readonly Epsilon?: number;
  readonly MinSampleSize?: number;
  /**
   * Row cap per window: the baseline window and the evaluation window are each read newest-first and capped
   * separately, so a capped load still covers both. Must be a positive whole number (defaults to 100,000).
   */
  readonly MaxRows?: number;
}

type FeatureValueDriftRow = Pick<
  MJFeatureValueEntity,
  | 'ID'
  | 'RecordProcessID'
  | 'ProcessRunID'
  | 'EntityID'
  | 'RecordID'
  | 'FeatureName'
  | 'Role'
  | 'AIModelID'
  | 'MLModelID'
  | 'Source'
  | 'ValueNumeric'
  | 'ValueText'
  | 'Confidence'
  | 'Reasoning'
  | 'ComputedAt'
>;

/**
 * Classify a PSI value into `'None'`, `'Warning'`, or `'Critical'`.
 */
export function ClassifyPSISeverity(
  psi: number,
  warningThreshold: number = PSI_WARNING_THRESHOLD,
  criticalThreshold: number = PSI_CRITICAL_THRESHOLD,
): DriftSeverity {
  if (!Number.isFinite(psi) || psi < warningThreshold) {
    return 'None';
  }
  if (psi >= criticalThreshold) {
    return 'Critical';
  }
  return 'Warning';
}

/**
 * Validate PSI threshold and smoothing parameters, throwing an explicit `INVALID_PARAMETER` error
 * when out of range or inverted.
 */
export function ValidateDriftThresholds(
  warningThreshold: number,
  criticalThreshold: number,
  epsilon: number,
): void {
  if (!Number.isFinite(warningThreshold) || warningThreshold <= 0) {
    throw new Error(
      `INVALID_PARAMETER: WarningPSIThreshold must be a finite positive number (received ${String(warningThreshold)}).`,
    );
  }
  if (!Number.isFinite(criticalThreshold) || criticalThreshold <= 0) {
    throw new Error(
      `INVALID_PARAMETER: CriticalPSIThreshold must be a finite positive number (received ${String(criticalThreshold)}).`,
    );
  }
  if (warningThreshold >= criticalThreshold) {
    throw new Error(
      `INVALID_PARAMETER: WarningPSIThreshold (${warningThreshold}) must be strictly less than CriticalPSIThreshold (${criticalThreshold}).`,
    );
  }
  if (!Number.isFinite(epsilon) || epsilon <= 0 || epsilon > 0.01) {
    throw new Error(
      `INVALID_PARAMETER: Epsilon must be in (0, 0.01] (received ${String(epsilon)}).`,
    );
  }
}

/**
 * Compute Population Stability Index (PSI) across two bin count/proportion arrays:
 * $$\text{PSI} = \sum_{i=1}^{B} (p_i - q_i) \ln\left(\frac{p_i}{q_i}\right)$$
 * applying Laplace smoothing $\epsilon$ (`1e-4` by default) to zero or near-zero bins
 * and normalizing both distributions to sum to `1.0`.
 */
export function ComputePopulationStabilityIndex(
  baselineBins: readonly number[],
  evaluationBins: readonly number[],
  epsilon: number = DEFAULT_PSI_EPSILON,
): number {
  const binCount = Math.max(baselineBins.length, evaluationBins.length);
  if (binCount === 0) {
    return 0;
  }

  const smoothEps = Number.isFinite(epsilon) && epsilon > 0 ? epsilon : DEFAULT_PSI_EPSILON;
  const rawQ: number[] = [];
  const rawP: number[] = [];

  for (let i = 0; i < binCount; i++) {
    const bVal = baselineBins[i] ?? 0;
    const eVal = evaluationBins[i] ?? 0;
    rawQ.push(Number.isFinite(bVal) && bVal > 0 ? bVal : 0);
    rawP.push(Number.isFinite(eVal) && eVal > 0 ? eVal : 0);
  }

  const sumQ = rawQ.reduce((a, b) => a + b, 0);
  const sumP = rawP.reduce((a, b) => a + b, 0);
  if (sumQ <= 0 || sumP <= 0) {
    return 0;
  }

  // Convert to proportions and apply Laplace smoothing for empty bins, then re-normalize
  const smoothedQ = rawQ.map((v) => Math.max(v / sumQ, smoothEps));
  const smoothedP = rawP.map((v) => Math.max(v / sumP, smoothEps));
  const normQSum = smoothedQ.reduce((a, b) => a + b, 0);
  const normPSum = smoothedP.reduce((a, b) => a + b, 0);

  let psi = 0;
  for (let i = 0; i < binCount; i++) {
    const q = smoothedQ[i] / normQSum;
    const p = smoothedP[i] / normPSum;
    psi += (p - q) * Math.log(p / q);
  }

  return Math.max(0, psi);
}

/**
 * Compute PSI for a continuous/numeric feature by constructing empirical quantile bins from
 * the baseline distribution (with open boundary tails `(-inf, q_1)` and `[q_{B-1}, +inf)`
 * and deduplicated interior edges when ties exist), tracking missing/non-finite rates in a
 * dedicated missingness bin.
 */
export function ComputeNumericFeaturePSI(
  featureName: string,
  baselineValues: readonly (number | null | undefined)[],
  evaluationValues: readonly (number | null | undefined)[],
  numBins: number = 10,
  epsilon: number = DEFAULT_PSI_EPSILON,
  warningThreshold: number = PSI_WARNING_THRESHOLD,
  criticalThreshold: number = PSI_CRITICAL_THRESHOLD,
  minSampleSize: number = DEFAULT_MIN_SAMPLE_SIZE,
): FeaturePSIResult {
  const cleanBaseline: number[] = [];
  for (const v of baselineValues) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      cleanBaseline.push(v);
    }
  }
  const cleanEval: number[] = [];
  for (const v of evaluationValues) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      cleanEval.push(v);
    }
  }

  const bins = Math.max(2, Math.floor(numBins));
  const minSamples = Math.max(1, Math.floor(minSampleSize));
  const baseTotal = baselineValues.length;
  const evalTotal = evaluationValues.length;
  const baseMissingCount = baseTotal - cleanBaseline.length;
  const evalMissingCount = evalTotal - cleanEval.length;
  const baseMissingRate = baseTotal > 0 ? baseMissingCount / baseTotal : 0;
  const evalMissingRate = evalTotal > 0 ? evalMissingCount / evalTotal : 0;
  const missingRateDelta = Math.abs(evalMissingRate - baseMissingRate);

  const severeMissingSurge =
    cleanBaseline.length >= minSamples &&
    evalTotal >= minSamples &&
    (cleanEval.length === 0 || missingRateDelta >= criticalThreshold);

  if (!severeMissingSurge && (cleanBaseline.length < minSamples || cleanEval.length < minSamples)) {
    return {
      FeatureName: featureName,
      FeatureType: 'Numeric',
      PSI: 0,
      Severity: 'None',
      BinCount: bins,
      BaselineSampleCount: cleanBaseline.length,
      EvaluationSampleCount: cleanEval.length,
      InsufficientData: true,
      BaselineMissingRate: baseMissingRate,
      EvaluationMissingRate: evalMissingRate,
      MissingRateDelta: missingRateDelta,
    };
  }

  const sortedBaseline = [...cleanBaseline].sort((a, b) => a - b);
  const minVal = sortedBaseline[0];
  const maxVal = sortedBaseline[sortedBaseline.length - 1];

  let baseCounts: number[];
  let evalCounts: number[];

  if (minVal === maxVal) {
    // Constant baseline: bin 0 = exact baseline value, bin 1 = any shifted value
    baseCounts = [cleanBaseline.length, 0];
    let exactEval = 0;
    let shiftedEval = 0;
    for (const v of cleanEval) {
      if (v === minVal) {
        exactEval++;
      } else {
        shiftedEval++;
      }
    }
    evalCounts = [exactEval, shiftedEval];
  } else {
    // Empirical baseline quantile interior edges q_1 .. q_{bins-1}, deduplicating collapsed edges
    const edges: number[] = [];
    for (let k = 1; k < bins; k++) {
      const pos = (k / bins) * (sortedBaseline.length - 1);
      const lower = Math.floor(pos);
      const upper = Math.ceil(pos);
      const weight = pos - lower;
      const q = sortedBaseline[lower] * (1 - weight) + sortedBaseline[upper] * weight;
      if (edges.length === 0 || q > edges[edges.length - 1]) {
        edges.push(q);
      }
    }

    const effectiveBins = edges.length + 1;
    baseCounts = new Array<number>(effectiveBins).fill(0);
    evalCounts = new Array<number>(effectiveBins).fill(0);

    const toQuantileBinIndex = (val: number): number => {
      let lo = 0;
      let hi = edges.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (val >= edges[mid]) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      return lo;
    };

    for (const v of cleanBaseline) {
      baseCounts[toQuantileBinIndex(v)]++;
    }
    for (const v of cleanEval) {
      evalCounts[toQuantileBinIndex(v)]++;
    }
  }

  if (baseMissingCount > 0 || evalMissingCount > 0) {
    baseCounts.push(baseMissingCount);
    evalCounts.push(evalMissingCount);
  }

  const psi = ComputePopulationStabilityIndex(baseCounts, evalCounts, epsilon);
  let severity = ClassifyPSISeverity(psi, warningThreshold, criticalThreshold);
  if (severeMissingSurge && severity !== 'Critical') {
    severity = 'Critical';
  }

  return {
    FeatureName: featureName,
    FeatureType: 'Numeric',
    PSI: psi,
    Severity: severity,
    BinCount: baseCounts.length,
    BaselineSampleCount: cleanBaseline.length,
    EvaluationSampleCount: cleanEval.length,
    InsufficientData: false,
    BaselineMissingRate: baseMissingRate,
    EvaluationMissingRate: evalMissingRate,
    MissingRateDelta: missingRateDelta,
  };
}

/**
 * Compute PSI for a categorical feature across the union of observed baseline and evaluation categories,
 * tracking missing (`null`/`undefined`) rates in a dedicated bucket.
 */
export function ComputeCategoricalFeaturePSI(
  featureName: string,
  baselineCategories: readonly (string | null | undefined)[],
  evaluationCategories: readonly (string | null | undefined)[],
  epsilon: number = DEFAULT_PSI_EPSILON,
  warningThreshold: number = PSI_WARNING_THRESHOLD,
  criticalThreshold: number = PSI_CRITICAL_THRESHOLD,
  minSampleSize: number = DEFAULT_MIN_SAMPLE_SIZE,
): FeaturePSIResult {
  const minSamples = Math.max(1, Math.floor(minSampleSize));
  const cleanBaseline: string[] = [];
  for (const raw of baselineCategories) {
    if (typeof raw === 'string') {
      cleanBaseline.push(raw);
    }
  }
  const cleanEval: string[] = [];
  for (const raw of evaluationCategories) {
    if (typeof raw === 'string') {
      cleanEval.push(raw);
    }
  }

  const baseTotal = baselineCategories.length;
  const evalTotal = evaluationCategories.length;
  const baseMissingCount = baseTotal - cleanBaseline.length;
  const evalMissingCount = evalTotal - cleanEval.length;
  const baseMissingRate = baseTotal > 0 ? baseMissingCount / baseTotal : 0;
  const evalMissingRate = evalTotal > 0 ? evalMissingCount / evalTotal : 0;
  const missingRateDelta = Math.abs(evalMissingRate - baseMissingRate);

  const severeMissingSurge =
    cleanBaseline.length >= minSamples &&
    evalTotal >= minSamples &&
    (cleanEval.length === 0 || missingRateDelta >= criticalThreshold);

  if (!severeMissingSurge && (cleanBaseline.length < minSamples || cleanEval.length < minSamples)) {
    return {
      FeatureName: featureName,
      FeatureType: 'Categorical',
      PSI: 0,
      Severity: 'None',
      BinCount: 0,
      BaselineSampleCount: cleanBaseline.length,
      EvaluationSampleCount: cleanEval.length,
      InsufficientData: true,
      BaselineMissingRate: baseMissingRate,
      EvaluationMissingRate: evalMissingRate,
      MissingRateDelta: missingRateDelta,
    };
  }

  const categories = new Set<string>();
  const baseMap = new Map<string, number>();
  const evalMap = new Map<string, number>();

  for (const key of cleanBaseline) {
    categories.add(key);
    baseMap.set(key, (baseMap.get(key) ?? 0) + 1);
  }
  for (const key of cleanEval) {
    categories.add(key);
    evalMap.set(key, (evalMap.get(key) ?? 0) + 1);
  }

  const orderedKeys = Array.from(categories).sort();
  const baseCounts = orderedKeys.map((k) => baseMap.get(k) ?? 0);
  const evalCounts = orderedKeys.map((k) => evalMap.get(k) ?? 0);

  if (baseMissingCount > 0 || evalMissingCount > 0) {
    baseCounts.push(baseMissingCount);
    evalCounts.push(evalMissingCount);
  }

  const psi = ComputePopulationStabilityIndex(baseCounts, evalCounts, epsilon);
  let severity = ClassifyPSISeverity(psi, warningThreshold, criticalThreshold);
  if (severeMissingSurge && severity !== 'Critical') {
    severity = 'Critical';
  }

  return {
    FeatureName: featureName,
    FeatureType: 'Categorical',
    PSI: psi,
    Severity: severity,
    BinCount: baseCounts.length,
    BaselineSampleCount: cleanBaseline.length,
    EvaluationSampleCount: cleanEval.length,
    InsufficientData: false,
    BaselineMissingRate: baseMissingRate,
    EvaluationMissingRate: evalMissingRate,
    MissingRateDelta: missingRateDelta,
  };
}

/**
 * Compute confidence-floor degradation and champion-vs-challenger divergence metrics.
 */
export function ComputeConfidenceAndChallengerDivergence(
  input: ConfidenceAndDivergenceInput = {},
): ConfidenceAndDivergenceMetrics {
  const confidenceFloor = input.ConfidenceFloor ?? 0.60;
  const maxBelowFloorRate = input.MaxBelowFloorRate ?? 0.20;
  const maxMeanConfidenceDrop = input.MaxMeanConfidenceDrop ?? 0.10;
  const minAgreementRate = input.MinAgreementRate ?? 0.85;
  const maxMeanAbsScoreDelta = input.MaxMeanAbsoluteScoreDelta ?? 0.15;
  const maxP95LatencyRatio = input.MaxP95LatencyRatio ?? 3.0;
  const minSamples = Math.max(1, Math.floor(input.MinSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE));
  const scoreTolerance = input.ScoreAgreementTolerance ?? maxMeanAbsScoreDelta;

  const baseConf = (input.BaselineConfidences ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const evalConf = (input.EvaluationConfidences ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v));

  const baselineMeanConfidence =
    baseConf.length > 0 ? baseConf.reduce((a, b) => a + b, 0) / baseConf.length : null;
  const evaluationMeanConfidence =
    evalConf.length > 0 ? evalConf.reduce((a, b) => a + b, 0) / evalConf.length : null;
  const belowFloorRate =
    evalConf.length > 0 ? evalConf.filter((c) => c < confidenceFloor).length / evalConf.length : null;

  const confidenceInsufficientData =
    (evalConf.length > 0 && evalConf.length < minSamples) ||
    (baseConf.length > 0 && baseConf.length < minSamples);

  const meanDropExceeded =
    !confidenceInsufficientData &&
    baselineMeanConfidence !== null &&
    evaluationMeanConfidence !== null &&
    baselineMeanConfidence - evaluationMeanConfidence > maxMeanConfidenceDrop;
  const floorBreached =
    !confidenceInsufficientData && belowFloorRate !== null && belowFloorRate > maxBelowFloorRate;
  const confidenceDegraded = meanDropExceeded || floorBreached;

  const pairs = input.Pairs ?? [];
  /** Pairs with a champion output: the only rows that count, here and in the sample gate below. */
  let pairedCount = 0;
  let labelPairs = 0;
  let labelAgreements = 0;
  let challengerTimeoutCount = 0;
  let challengerFailureCount = 0;
  const scoreDeltas: number[] = [];
  const champLatencies: number[] = [];
  const challLatencies: number[] = [];

  for (const pair of pairs) {
    const hasChampOutput =
      typeof pair.ChampionScore === 'number' || typeof pair.ChampionLabel === 'string';
    // A challenger row with no champion to compare against says nothing about agreement, failures or latency.
    if (!hasChampOutput) {
      continue;
    }
    pairedCount++;
    const isTimedOut = pair.TimedOut === true;
    const hasError = typeof pair.ErrorMessage === 'string' && pair.ErrorMessage.trim().length > 0;
    const hasChallOutput =
      typeof pair.ChallengerScore === 'number' || typeof pair.ChallengerLabel === 'string';

    if (isTimedOut) {
      challengerTimeoutCount++;
    }
    if (isTimedOut || hasError || !hasChallOutput) {
      challengerFailureCount++;
      labelPairs++;
    } else if (pair.ChampionLabel !== undefined && pair.ChallengerLabel !== undefined) {
      labelPairs++;
      if (pair.ChampionLabel === pair.ChallengerLabel) {
        labelAgreements++;
      }
    } else if (
      typeof pair.ChampionScore === 'number' &&
      Number.isFinite(pair.ChampionScore) &&
      typeof pair.ChallengerScore === 'number' &&
      Number.isFinite(pair.ChallengerScore)
    ) {
      labelPairs++;
      const useToleranceBand =
        input.ProblemType === 'regression' ||
        input.ScoreAgreementTolerance !== undefined ||
        pair.ChampionScore < 0 ||
        pair.ChampionScore > 1 ||
        pair.ChallengerScore < 0 ||
        pair.ChallengerScore > 1;
      if (useToleranceBand) {
        if (Math.abs(pair.ChampionScore - pair.ChallengerScore) <= scoreTolerance) {
          labelAgreements++;
        }
      } else {
        const champPositive = pair.ChampionScore >= 0.5;
        const challPositive = pair.ChallengerScore >= 0.5;
        if (champPositive === challPositive) {
          labelAgreements++;
        }
      }
    }

    if (
      !isTimedOut &&
      !hasError &&
      typeof pair.ChampionScore === 'number' &&
      Number.isFinite(pair.ChampionScore) &&
      typeof pair.ChallengerScore === 'number' &&
      Number.isFinite(pair.ChallengerScore)
    ) {
      scoreDeltas.push(Math.abs(pair.ChampionScore - pair.ChallengerScore));
    }
    if (typeof pair.ChampionLatencyMs === 'number' && pair.ChampionLatencyMs > 0) {
      champLatencies.push(pair.ChampionLatencyMs);
    }
    if (typeof pair.ChallengerLatencyMs === 'number' && pair.ChallengerLatencyMs >= 0) {
      challLatencies.push(pair.ChallengerLatencyMs);
    }
  }

  const agreementRate = labelPairs > 0 ? labelAgreements / labelPairs : null;
  const meanAbsoluteScoreDelta =
    scoreDeltas.length > 0 ? scoreDeltas.reduce((a, b) => a + b, 0) / scoreDeltas.length : null;

  const p95Champ = computePercentile(champLatencies, 0.95);
  const p95Chall = computePercentile(challLatencies, 0.95);
  const p95LatencyRatio = p95Champ !== null && p95Champ > 0 && p95Chall !== null ? p95Chall / p95Champ : null;

  // A challenger row with no champion to compare against is not a sample.
  const divergenceInsufficientData = pairs.length > 0 && pairedCount < minSamples;
  const agreementBreached = !divergenceInsufficientData && agreementRate !== null && agreementRate < minAgreementRate;
  const deltaBreached = !divergenceInsufficientData && meanAbsoluteScoreDelta !== null && meanAbsoluteScoreDelta > maxMeanAbsScoreDelta;
  const latencyBreached = !divergenceInsufficientData && p95LatencyRatio !== null && p95LatencyRatio > maxP95LatencyRatio;
  const challengerDiverged = agreementBreached || deltaBreached || latencyBreached;

  return {
    BaselineMeanConfidence: baselineMeanConfidence,
    EvaluationMeanConfidence: evaluationMeanConfidence,
    BelowFloorRate: belowFloorRate,
    ConfidenceDegraded: confidenceDegraded,
    ConfidenceInsufficientData: confidenceInsufficientData,
    DivergenceInsufficientData: divergenceInsufficientData,
    PairCount: pairedCount,
    ChallengerTimeoutCount: challengerTimeoutCount,
    ChallengerFailureCount: challengerFailureCount,
    AgreementRate: agreementRate,
    MeanAbsoluteScoreDelta: meanAbsoluteScoreDelta,
    P95LatencyRatio: p95LatencyRatio,
    ChallengerDiverged: challengerDiverged,
  };
}

/**
 * Evaluate feature PSI across numeric, categorical, and pre-binned features along with
 * confidence-floor and champion-vs-challenger divergence metrics.
 */
export function EvaluateFeatureAndPredictionDrift(
  input: FeatureAndPredictionDriftInput,
): FeatureAndPredictionDriftReport {
  const epsilon = input.Epsilon ?? DEFAULT_PSI_EPSILON;
  const warnThreshold = input.WarningPSIThreshold ?? PSI_WARNING_THRESHOLD;
  const critThreshold = input.CriticalPSIThreshold ?? PSI_CRITICAL_THRESHOLD;
  const minSampleSize = input.MinSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE;

  ValidateDriftThresholds(warnThreshold, critThreshold, epsilon);

  const featureResults: FeaturePSIResult[] = [];

  if (input.PrebinnedFeatures) {
    for (const [featureName, spec] of Object.entries(input.PrebinnedFeatures)) {
      const baseSampleCount = spec.BaselineSampleCount ?? spec.BaselineProportions.length;
      const evalSampleCount = spec.EvaluationSampleCount ?? spec.EvaluationProportions.length;
      const explicitCountsUnderMin =
        (spec.BaselineSampleCount !== undefined && spec.BaselineSampleCount < minSampleSize) ||
        (spec.EvaluationSampleCount !== undefined && spec.EvaluationSampleCount < minSampleSize);

      if (explicitCountsUnderMin) {
        featureResults.push({
          FeatureName: featureName,
          FeatureType: 'Prebinned',
          PSI: 0,
          Severity: 'None',
          BinCount: Math.max(spec.BaselineProportions.length, spec.EvaluationProportions.length),
          BaselineSampleCount: baseSampleCount,
          EvaluationSampleCount: evalSampleCount,
          InsufficientData: true,
        });
      } else {
        const psi = ComputePopulationStabilityIndex(
          spec.BaselineProportions,
          spec.EvaluationProportions,
          epsilon,
        );
        featureResults.push({
          FeatureName: featureName,
          FeatureType: 'Prebinned',
          PSI: psi,
          Severity: ClassifyPSISeverity(psi, warnThreshold, critThreshold),
          BinCount: Math.max(spec.BaselineProportions.length, spec.EvaluationProportions.length),
          BaselineSampleCount: baseSampleCount,
          EvaluationSampleCount: evalSampleCount,
          InsufficientData: false,
        });
      }
    }
  }

  if (input.NumericFeatures) {
    for (const [featureName, spec] of Object.entries(input.NumericFeatures)) {
      featureResults.push(
        ComputeNumericFeaturePSI(
          featureName,
          spec.Baseline,
          spec.Evaluation,
          spec.Bins ?? 10,
          epsilon,
          warnThreshold,
          critThreshold,
          minSampleSize,
        ),
      );
    }
  }

  if (input.CategoricalFeatures) {
    for (const [featureName, spec] of Object.entries(input.CategoricalFeatures)) {
      featureResults.push(
        ComputeCategoricalFeaturePSI(
          featureName,
          spec.Baseline,
          spec.Evaluation,
          epsilon,
          warnThreshold,
          critThreshold,
          minSampleSize,
        ),
      );
    }
  }

  const divergenceInput: ConfidenceAndDivergenceInput | undefined = input.ConfidenceAndDivergence
    ? {
        ...input.ConfidenceAndDivergence,
        MinSampleSize: input.ConfidenceAndDivergence.MinSampleSize ?? minSampleSize,
      }
    : undefined;
  const divergence = ComputeConfidenceAndChallengerDivergence(divergenceInput);
  const driftedFeatures = featureResults.filter((f) => f.Severity !== 'None');
  const maxPSI = featureResults.reduce((max, f) => Math.max(max, f.PSI), 0);
  const insufficientData =
    featureResults.length > 0
      ? featureResults.some((f) => f.InsufficientData === true) ||
        divergence.ConfidenceInsufficientData === true
      : divergence.ConfidenceInsufficientData === true ||
        divergence.DivergenceInsufficientData === true ||
        divergence.PairCount === 0;

  let overallSeverity: DriftSeverity = ClassifyPSISeverity(maxPSI, warnThreshold, critThreshold);
  for (const f of featureResults) {
    if (f.Severity === 'Critical') {
      overallSeverity = 'Critical';
      break;
    }
    if (f.Severity === 'Warning' && overallSeverity === 'None') {
      overallSeverity = 'Warning';
    }
  }
  if (overallSeverity === 'None' && (divergence.ConfidenceDegraded || divergence.ChallengerDiverged)) {
    overallSeverity = 'Warning';
  }

  const shouldAlert =
    overallSeverity !== 'None' || divergence.ConfidenceDegraded || divergence.ChallengerDiverged;

  const summaryParts: string[] = [
    `OverallSeverity=${overallSeverity}`,
    `MaxPSI=${maxPSI.toFixed(4)}`,
    `DriftedFeatures=${driftedFeatures.length}/${featureResults.length}`,
  ];
  if (insufficientData) {
    summaryParts.push('InsufficientData=true');
  }
  if (divergence.DivergenceInsufficientData) {
    summaryParts.push(
      `DivergenceInsufficientData=true (PairCount=${divergence.PairCount}/${minSampleSize})`,
    );
  }
  if (divergence.ConfidenceDegraded) {
    summaryParts.push(
      `ConfidenceDegraded=true (BelowFloorRate=${(divergence.BelowFloorRate ?? 0).toFixed(2)})`,
    );
  }
  if (divergence.ChallengerDiverged) {
    summaryParts.push(
      `ChallengerDiverged=true (AgreementRate=${(divergence.AgreementRate ?? 1).toFixed(2)}, MeanDelta=${(divergence.MeanAbsoluteScoreDelta ?? 0).toFixed(4)}, Timeouts=${divergence.ChallengerTimeoutCount}, Failures=${divergence.ChallengerFailureCount})`,
    );
  }
  if (input.Truncated) {
    summaryParts.push('Truncated=true');
  }

  return {
    ModelID: input.ModelID,
    RecordProcessID: input.RecordProcessID,
    OverallSeverity: overallSeverity,
    MaxPSI: maxPSI,
    FeatureResults: featureResults,
    DriftedFeatures: driftedFeatures,
    DivergenceMetrics: divergence,
    ShouldAlert: shouldAlert,
    InsufficientData: insufficientData,
    Truncated: input.Truncated,
    Summary: summaryParts.join(', '),
  };
}

const DAY_MS = 86_400_000;

/** The baseline and evaluation windows one drift load compares, in epoch milliseconds. */
interface DriftWindows {
  readonly BaselineStartMs: number;
  readonly BaselineEndMs: number;
  readonly EvaluationStartMs: number;
}

/**
 * The evaluation window defaults to the last 7 days and the baseline to the 28 days before it;
 * explicit `EvaluationWindowStart` / `BaselineWindowEnd` values override them.
 */
function resolveDriftWindows(options: Pick<LoadDriftFromFeatureValuesOptions, 'EvaluationWindowStart' | 'BaselineWindowEnd'>): DriftWindows {
  const nowMs = Date.now();
  const parsedEvalStart = options.EvaluationWindowStart ? new Date(options.EvaluationWindowStart).getTime() : NaN;
  const evaluationStartMs = Number.isFinite(parsedEvalStart) ? parsedEvalStart : nowMs - 7 * DAY_MS;
  const parsedBaselineEnd = options.BaselineWindowEnd ? new Date(options.BaselineWindowEnd).getTime() : NaN;
  const baselineEndMs = Number.isFinite(parsedBaselineEnd) ? parsedBaselineEnd : evaluationStartMs;
  return { BaselineStartMs: baselineEndMs - 28 * DAY_MS, BaselineEndMs: baselineEndMs, EvaluationStartMs: evaluationStartMs };
}

/** The `MJ: Feature Values` columns every drift read selects. */
const DRIFT_ROW_FIELDS: readonly (keyof FeatureValueDriftRow)[] = [
  'ID',
  'RecordProcessID',
  'ProcessRunID',
  'EntityID',
  'RecordID',
  'FeatureName',
  'Role',
  'AIModelID',
  'MLModelID',
  'Source',
  'ValueNumeric',
  'ValueText',
  'Confidence',
  'Reasoning',
  'ComputedAt',
];

/** RecordIDs per pairing read, so a long list becomes several `IN (…)` views in the same batch. */
const PAIRING_RECORD_ID_CHUNK = 500;

/**
 * The two bounded `MJ: Feature Values` reads behind one drift load of one record process (or model): the baseline
 * window, and everything computed since it ends (the evaluation window). Each is read newest-first and capped on its
 * own, so a capped load keeps the newest rows of BOTH windows; one row over the cap is fetched to tell a full window
 * from a truncated one.
 */
function featureValueDriftViews(
  options: LoadDriftFromFeatureValuesOptions,
  windows: DriftWindows,
  maxRows: number,
): [RunViewParams, RunViewParams] {
  const target =
    typeof options.RecordProcessID === 'string' && options.RecordProcessID.trim().length > 0
      ? `RecordProcessID = '${EscapeSQLString(options.RecordProcessID.trim())}' AND `
      : typeof options.ModelID === 'string' && options.ModelID.trim().length > 0
        ? `MLModelID = '${EscapeSQLString(options.ModelID.trim())}' AND `
        : '';
  const at = (ms: number): string => EscapeSQLString(new Date(ms).toISOString());
  const view = (window: string): RunViewParams => ({
    EntityName: 'MJ: Feature Values',
    ExtraFilter: `${target}${window} AND Source = 'Pipeline'`,
    OrderBy: 'ComputedAt DESC',
    Fields: [...DRIFT_ROW_FIELDS],
    ResultType: 'simple',
    MaxRows: maxRows + 1,
    SkipTotalRowCount: true,
  });
  return [
    view(`ComputedAt >= '${at(windows.BaselineStartMs)}' AND ComputedAt < '${at(windows.BaselineEndMs)}'`),
    view(`ComputedAt >= '${at(windows.BaselineEndMs)}'`),
  ];
}

/** The per-window row cap: a positive whole number, defaulting to {@link DEFAULT_DRIFT_MAX_ROWS}. */
function resolveDriftMaxRows(maxRows: number | undefined): number {
  const value = maxRows ?? DEFAULT_DRIFT_MAX_ROWS;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('INVALID_PARAMETER: MaxRows must be a positive whole number.');
  }
  return value;
}

/**
 * Both windows' rows, each cut to `maxRows`, oldest first; `Truncated` when either window had more.
 * `windowRows` are the two {@link featureValueDriftViews} results, each newest-first.
 */
function capDriftWindows(
  windowRows: readonly (readonly FeatureValueDriftRow[])[],
  maxRows: number,
  label: string,
): { Rows: FeatureValueDriftRow[]; Truncated: boolean } {
  const truncated = windowRows.some((rows) => rows.length > maxRows);
  if (truncated) {
    LogError(
      `Drift evaluation for '${label}' was truncated at MaxRows (${maxRows}) per window: the oldest rows of a full window were not read.`,
    );
  }
  const rows = windowRows.flatMap((w) => w.slice(0, maxRows));
  rows.sort((a, b) => new Date(a.ComputedAt).getTime() - new Date(b.ComputedAt).getTime());
  return { Rows: rows, Truncated: truncated };
}

/** The key a challenger is paired on: its record and feature. */
function pairingKey(row: Pick<FeatureValueDriftRow, 'RecordID' | 'FeatureName'>): string {
  return `${row.RecordID}::${row.FeatureName || 'Prediction'}`;
}

/**
 * Reads of the current champion rows for the evaluation-window challengers that have no champion in the loaded
 * windows. A champion whose value has not changed is never rewritten, so its `ComputedAt` can predate both windows;
 * without these rows a stable model's challengers would go unpaired. One view per record process, feature and chunk
 * of {@link PAIRING_RECORD_ID_CHUNK} RecordIDs, newest first. Bounded by the RecordID list, so `IgnoreMaxRows`.
 */
function pairingChampionViews(rows: readonly FeatureValueDriftRow[], windows: DriftWindows): RunViewParams[] {
  const championKeys = new Set(rows.filter((r) => r.Role !== 'Challenger').map(pairingKey));
  const unpaired = new Map<string, { RecordProcessID: string; FeatureName: string; RecordIDs: Set<string> }>();
  for (const r of rows) {
    if (
      r.Role !== 'Challenger' ||
      (r.Source && r.Source !== 'Pipeline') ||
      !r.RecordProcessID ||
      !r.FeatureName ||
      new Date(r.ComputedAt).getTime() < windows.EvaluationStartMs ||
      championKeys.has(pairingKey(r))
    ) {
      continue;
    }
    const groupKey = `${NormalizeUUID(r.RecordProcessID)}::${r.FeatureName}`;
    const group = unpaired.get(groupKey) ?? { RecordProcessID: r.RecordProcessID, FeatureName: r.FeatureName, RecordIDs: new Set<string>() };
    group.RecordIDs.add(r.RecordID);
    unpaired.set(groupKey, group);
  }

  const views: RunViewParams[] = [];
  for (const group of unpaired.values()) {
    const ids = [...group.RecordIDs];
    for (let i = 0; i < ids.length; i += PAIRING_RECORD_ID_CHUNK) {
      const idList = ids.slice(i, i + PAIRING_RECORD_ID_CHUNK).map((id) => `'${EscapeSQLString(id)}'`).join(', ');
      views.push({
        EntityName: 'MJ: Feature Values',
        ExtraFilter:
          `RecordProcessID = '${EscapeSQLString(group.RecordProcessID)}' AND Role = 'Champion' AND Source = 'Pipeline'` +
          ` AND FeatureName = '${EscapeSQLString(group.FeatureName)}' AND RecordID IN (${idList})`,
        OrderBy: 'ComputedAt DESC',
        Fields: [...DRIFT_ROW_FIELDS],
        ResultType: 'simple',
        IgnoreMaxRows: true,
      });
    }
  }
  return views;
}

/**
 * Each row set's out-of-window champion rows for pairing ({@link pairingChampionViews}), from one batched `RunViews`
 * as the caller across every set. A failed view is logged and leaves its challengers unpaired (InsufficientData, never
 * a false alarm).
 */
async function loadPairingChampions(
  rowSets: ReadonlyArray<readonly FeatureValueDriftRow[]>,
  windows: DriftWindows,
  options: Pick<LoadDriftFromFeatureValuesOptions, 'Provider' | 'ContextUser'>,
): Promise<FeatureValueDriftRow[][]> {
  const views: RunViewParams[] = [];
  const owners: number[] = [];
  rowSets.forEach((rows, i) => {
    for (const view of pairingChampionViews(rows, windows)) {
      views.push(view);
      owners.push(i);
    }
  });
  const champions: FeatureValueDriftRow[][] = rowSets.map(() => []);
  if (views.length === 0) {
    return champions;
  }
  const results = await RunView.FromMetadataProvider(options.Provider).RunViews<FeatureValueDriftRow>(views, options.ContextUser);
  views.forEach((_view, k) => {
    const res = results[k];
    if (!res?.Success) {
      LogError(`Drift evaluation could not read the champion rows to pair challengers with: ${res?.ErrorMessage ?? 'unknown error'}`);
      return;
    }
    champions[owners[k]].push(...(res.Results ?? []));
  });
  return champions;
}

/** The ML model of a process's newest champion row; `rows` are oldest first. Undefined for non-ML processes. */
function championMLModelID(rows: readonly FeatureValueDriftRow[]): string | undefined {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].Role !== 'Challenger' && rows[i].MLModelID) {
      return rows[i].MLModelID ?? undefined;
    }
  }
  return undefined;
}

/**
 * Each named ML model's `ProblemType`, by ID, from one `MJ: ML Models` read as the caller. A failed read is logged and
 * yields no entries, so divergence falls back to its score-range heuristic rather than failing the load.
 */
async function loadModelProblemTypes(
  modelIDs: ReadonlyArray<string | undefined>,
  options: Pick<LoadDriftFromFeatureValuesOptions, 'Provider' | 'ContextUser'>,
): Promise<UUIDMap<MJMLModelEntity['ProblemType']>> {
  const ids = [...new UUIDSet(modelIDs.filter((id): id is string => !!id))];
  const problemTypes = new UUIDMap<MJMLModelEntity['ProblemType']>();
  if (ids.length === 0) {
    return problemTypes;
  }
  const res = await RunView.FromMetadataProvider(options.Provider).RunView<Pick<MJMLModelEntity, 'ID' | 'ProblemType'>>(
    {
      EntityName: 'MJ: ML Models',
      ExtraFilter: `ID IN (${ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`,
      Fields: ['ID', 'ProblemType'],
      ResultType: 'simple',
    },
    options.ContextUser,
  );
  if (!res.Success) {
    LogError(`Drift evaluation could not read the ProblemType of ML Models ${ids.join(', ')}: ${res.ErrorMessage ?? 'unknown error'}`);
    return problemTypes;
  }
  for (const model of res.Results ?? []) {
    problemTypes.Set(model.ID, model.ProblemType);
  }
  return problemTypes;
}

/**
 * The ML model behind a process's newest champion: from the windows, else (a stable model whose champions are all
 * older) from the pairing champions, which are newest first.
 */
function processChampionMLModelID(
  rows: readonly FeatureValueDriftRow[],
  pairingChampions: readonly FeatureValueDriftRow[],
): string | undefined {
  return championMLModelID(rows) ?? pairingChampions.find((r) => r.MLModelID)?.MLModelID ?? undefined;
}

/** A caller-supplied ProblemType, else the one of the ML model behind the process's newest champion row. */
function withChampionProblemType(
  options: LoadDriftFromFeatureValuesOptions,
  modelID: string | undefined,
  problemTypes: UUIDMap<MJMLModelEntity['ProblemType']>,
): LoadDriftFromFeatureValuesOptions {
  return { ...options, ProblemType: options.ProblemType ?? problemTypes.Get(modelID) };
}

/**
 * Load baseline and rolling evaluation feature distributions, confidence distributions, and
 * champion-vs-challenger pairs from pipeline-generated `MJ: Feature Values` (`Source = 'Pipeline'`)
 * for a given `RecordProcessID` or `MJ: ML Models` `ModelID` (`MLModelID`).
 *
 * Important semantics:
 * - Champion rows are upserted in place by `ValueKeyHash` (`EntityID + RecordID + FeatureName`), so each
 *   window holds values *computed* (i.e. changed) in that window rather than a full historical population
 *   snapshot.
 * - Each challenger row computed in the evaluation window is paired with the latest champion row for the
 *   same record and feature (the latest champion value is all that exists). A champion that has not changed keeps
 *   its old `ComputedAt`, so champions older than the windows are read for pairing only (one batched read).
 * - An ML Model Record Process with no challenger configured writes no Feature Values, so it has no drift
 *   population and the sweep reports `InsufficientData: true` for it.
 * - `MJ: Feature Values` rows carry no latency metrics, so the scheduled sweep reports no P95 latency
 *   ratio (`LatencyRatio` is evaluated only when callers pass inline latencies).
 */
export async function LoadFeatureAndPredictionDriftFromFeatureValues(
  options: LoadDriftFromFeatureValuesOptions,
): Promise<FeatureAndPredictionDriftInput> {
  const windows = resolveDriftWindows(options);
  const maxRows = resolveDriftMaxRows(options.MaxRows);
  const results = await RunView.FromMetadataProvider(options.Provider).RunViews<FeatureValueDriftRow>(
    featureValueDriftViews(options, windows, maxRows),
    options.ContextUser,
  );
  if (results.length !== 2 || results.some((r) => !r?.Success)) {
    throw new Error(
      `Failed to load MJ: Feature Values for drift evaluation: ${results.find((r) => r && !r.Success)?.ErrorMessage ?? 'unknown error'}`,
    );
  }
  const capped = capDriftWindows(
    results.map((r) => r.Results ?? []),
    maxRows,
    options.RecordProcessID ?? options.ModelID ?? '',
  );
  const [pairingChampions] = await loadPairingChampions([capped.Rows], windows, options);
  const modelID = processChampionMLModelID(capped.Rows, pairingChampions);
  const problemTypes = options.ProblemType
    ? new UUIDMap<MJMLModelEntity['ProblemType']>()
    : await loadModelProblemTypes([modelID], options);
  return {
    ...buildDriftInputFromRows(capped.Rows, windows, withChampionProblemType(options, modelID, problemTypes), pairingChampions),
    Truncated: capped.Truncated,
  };
}

/** One record process's drift input, or (with no `Input`) why its Feature Values could not be read. */
export interface RecordProcessDriftLoad {
  readonly RecordProcessID: string;
  readonly Input?: FeatureAndPredictionDriftInput;
  readonly ErrorMessage?: string;
}

/**
 * Drift inputs for several record processes in one batched `RunViews` round trip (one bounded view per
 * process), so a sweep never reads in a loop. A failed view is reported for its own process only.
 * Sweeps are chunked in batches of {@link DRIFT_SWEEP_BATCH_SIZE} (10).
 */
export async function LoadFeatureAndPredictionDriftForRecordProcesses(
  recordProcessIDs: readonly string[],
  options: Omit<LoadDriftFromFeatureValuesOptions, 'RecordProcessID' | 'ModelID'>,
): Promise<RecordProcessDriftLoad[]> {
  const maxRows = resolveDriftMaxRows(options.MaxRows);
  if (recordProcessIDs.length === 0) {
    return [];
  }
  const windows = resolveDriftWindows(options);
  const allLoads: RecordProcessDriftLoad[] = [];

  for (let c = 0; c < recordProcessIDs.length; c += DRIFT_SWEEP_BATCH_SIZE) {
    const chunkIDs = recordProcessIDs.slice(c, c + DRIFT_SWEEP_BATCH_SIZE);
    const perProcess: LoadDriftFromFeatureValuesOptions[] = chunkIDs.map((id) => ({
      ...options,
      RecordProcessID: id,
    }));
    // Two views per process (baseline window, evaluation window), all in one round trip.
    const results = await RunView.FromMetadataProvider(options.Provider).RunViews<FeatureValueDriftRow>(
      perProcess.flatMap((o) => featureValueDriftViews(o, windows, maxRows)),
      options.ContextUser,
    );

    const chunkLoads = perProcess.map((o, i) => {
      const recordProcessID = o.RecordProcessID ?? '';
      const windowResults = [results[2 * i], results[2 * i + 1]];
      if (windowResults.some((r) => !r?.Success)) {
        return {
          RecordProcessID: recordProcessID,
          ErrorMessage: `Failed to load MJ: Feature Values for drift evaluation: ${windowResults.find((r) => r && !r.Success)?.ErrorMessage ?? 'unknown error'}`,
        };
      }
      return {
        RecordProcessID: recordProcessID,
        Options: o,
        Capped: capDriftWindows(windowResults.map((r) => r?.Results ?? []), maxRows, recordProcessID),
      };
    });

    // One pairing read for the chunk (champions older than the windows), then one ML Models read: each ML process's
    // ProblemType comes from its champion's model.
    const loadedRows = chunkLoads.map((l) => ('Capped' in l && l.Capped ? l.Capped.Rows : []));
    const pairingChampions = await loadPairingChampions(loadedRows, windows, options);
    const modelIDs = loadedRows.map((rows, i) => processChampionMLModelID(rows, pairingChampions[i]));
    const problemTypes = options.ProblemType
      ? new UUIDMap<MJMLModelEntity['ProblemType']>()
      : await loadModelProblemTypes(modelIDs, options);
    chunkLoads.forEach((load, i) => {
      if (!('Capped' in load) || !load.Capped) {
        allLoads.push(load);
        return;
      }
      allLoads.push({
        RecordProcessID: load.RecordProcessID,
        Input: {
          ...buildDriftInputFromRows(
            load.Capped.Rows,
            windows,
            withChampionProblemType(load.Options, modelIDs[i], problemTypes),
            pairingChampions[i],
          ),
          Truncated: load.Capped.Truncated,
        },
      });
    });
  }

  return allLoads;
}

/**
 * Splits loaded Feature Value rows into the two windows' feature distributions and champion/challenger pairs.
 * `pairingChampions` (champion rows older than the windows, newest first) only pair challengers that have no champion
 * in `rows`; they never enter a window.
 */
function buildDriftInputFromRows(
  rows: FeatureValueDriftRow[],
  windows: DriftWindows,
  options: LoadDriftFromFeatureValuesOptions,
  pairingChampions: readonly FeatureValueDriftRow[] = [],
): FeatureAndPredictionDriftInput {
  const championByFeature = new Map<string, FeatureValueDriftRow[]>();
  const latestChampionByRecordFeature = new Map<string, FeatureValueDriftRow>();
  const challengerRows: FeatureValueDriftRow[] = [];

  for (const row of rows) {
    if (row.Source && row.Source !== 'Pipeline') {
      continue;
    }
    const rowTs = new Date(row.ComputedAt).getTime();
    if (row.Role === 'Challenger') {
      if (rowTs >= windows.EvaluationStartMs) {
        challengerRows.push(row);
      }
    } else {
      const featureName = row.FeatureName || 'Prediction';
      const list = championByFeature.get(featureName) ?? [];
      list.push(row);
      championByFeature.set(featureName, list);
      latestChampionByRecordFeature.set(`${row.RecordID}::${featureName}`, row);
    }
  }
  for (const row of pairingChampions) {
    const key = pairingKey(row);
    if (!latestChampionByRecordFeature.has(key)) {
      latestChampionByRecordFeature.set(key, row);
    }
  }

  const numericFeatures: Record<
    string,
    { Baseline: (number | null)[]; Evaluation: (number | null)[] }
  > = {};
  const categoricalFeatures: Record<
    string,
    { Baseline: (string | null)[]; Evaluation: (string | null)[] }
  > = {};
  const baselineConfidences: number[] = [];
  const evaluationConfidences: number[] = [];

  for (const [featureName, featureRows] of championByFeature.entries()) {
    const sorted = [...featureRows].sort(
      (a, b) => new Date(a.ComputedAt).getTime() - new Date(b.ComputedAt).getTime(),
    );

    const baselineWindow = sorted.filter((r) => {
      const ts = new Date(r.ComputedAt).getTime();
      return ts >= windows.BaselineStartMs && ts < windows.BaselineEndMs;
    });
    const evalWindow = sorted.filter((r) => new Date(r.ComputedAt).getTime() >= windows.EvaluationStartMs);

    const hasNumeric = sorted.some((r) => typeof r.ValueNumeric === 'number');
    const hasCategorical = sorted.some((r) => typeof r.ValueText === 'string' && r.ValueNumeric === null);

    if (hasNumeric) {
      numericFeatures[featureName] = {
        Baseline: baselineWindow.map((r) => (typeof r.ValueNumeric === 'number' ? r.ValueNumeric : null)),
        Evaluation: evalWindow.map((r) => (typeof r.ValueNumeric === 'number' ? r.ValueNumeric : null)),
      };
    } else if (hasCategorical) {
      categoricalFeatures[featureName] = {
        Baseline: baselineWindow.map((r) => (typeof r.ValueText === 'string' ? r.ValueText : null)),
        Evaluation: evalWindow.map((r) => (typeof r.ValueText === 'string' ? r.ValueText : null)),
      };
    }

    for (const r of baselineWindow) {
      if (typeof r.Confidence === 'number' && Number.isFinite(r.Confidence)) {
        baselineConfidences.push(r.Confidence);
      }
    }
    for (const r of evalWindow) {
      if (typeof r.Confidence === 'number' && Number.isFinite(r.Confidence)) {
        evaluationConfidences.push(r.Confidence);
      }
    }
  }

  const pairs: ChampionChallengerPair[] = [];
  for (const chall of challengerRows) {
    const champ = latestChampionByRecordFeature.get(pairingKey(chall));
    const reasoning = chall.Reasoning ?? '';
    const isTimeout = reasoning.includes('SHADOW_TIMEOUT');
    const isError = reasoning.includes('SHADOW_ERROR');
    pairs.push({
      RecordID: chall.RecordID,
      ChampionScore: typeof champ?.ValueNumeric === 'number' ? champ.ValueNumeric : undefined,
      ChallengerScore: typeof chall.ValueNumeric === 'number' ? chall.ValueNumeric : undefined,
      ChampionLabel: typeof champ?.ValueText === 'string' ? champ.ValueText : undefined,
      ChallengerLabel: typeof chall.ValueText === 'string' ? chall.ValueText : undefined,
      TimedOut: isTimeout ? true : undefined,
      ErrorMessage: isError ? reasoning : undefined,
    });
  }

  return {
    ModelID: options.ModelID,
    RecordProcessID: options.RecordProcessID,
    NumericFeatures: Object.keys(numericFeatures).length > 0 ? numericFeatures : undefined,
    CategoricalFeatures: Object.keys(categoricalFeatures).length > 0 ? categoricalFeatures : undefined,
    ConfidenceAndDivergence: {
      BaselineConfidences: baselineConfidences,
      EvaluationConfidences: evaluationConfidences,
      Pairs: pairs,
      MinSampleSize: options.MinSampleSize,
      ProblemType: options.ProblemType,
    },
    WarningPSIThreshold: options.WarningPSIThreshold,
    CriticalPSIThreshold: options.CriticalPSIThreshold,
    Epsilon: options.Epsilon,
    MinSampleSize: options.MinSampleSize,
  };
}

/**
 * Statistical PSI-backed implementation of {@link IDriftDetector} for `MaintenanceEngine`.
 * Only `OverallSeverity === 'Critical'` sets `drifted: true` (triggering automatic retraining);
 * `Warning` severity alerts via `ShouldAlert` without triggering retrain.
 */
export class PSIDriftDetector implements IDriftDetector {
  constructor(
    private readonly providerFn?: (modelId: string) => Promise<FeatureAndPredictionDriftInput> | FeatureAndPredictionDriftInput,
    private readonly warningThreshold: number = PSI_WARNING_THRESHOLD,
    private readonly criticalThreshold: number = PSI_CRITICAL_THRESHOLD,
    private readonly minSampleSize: number = DEFAULT_MIN_SAMPLE_SIZE,
  ) {}

  public async detectDrift(context: DriftContext): Promise<DriftResult> {
    let input: FeatureAndPredictionDriftInput;
    if (this.providerFn) {
      input = await this.providerFn(context.modelId);
    } else if (context.provider && (context.recordProcessId || context.modelId)) {
      input = await LoadFeatureAndPredictionDriftFromFeatureValues({
        RecordProcessID: context.recordProcessId,
        ModelID: context.modelId,
        Provider: context.provider,
        ContextUser: context.contextUser,
        WarningPSIThreshold: this.warningThreshold,
        CriticalPSIThreshold: this.criticalThreshold,
        MinSampleSize: this.minSampleSize,
      });
    } else {
      return {
        drifted: false,
        score: 0,
        detail: 'No feature distribution provider configured for PSIDriftDetector.',
      };
    }

    const report = EvaluateFeatureAndPredictionDrift({
      ...input,
      ModelID: context.modelId,
      RecordProcessID: context.recordProcessId ?? input.RecordProcessID,
      WarningPSIThreshold: input.WarningPSIThreshold ?? this.warningThreshold,
      CriticalPSIThreshold: input.CriticalPSIThreshold ?? this.criticalThreshold,
      MinSampleSize: input.MinSampleSize ?? this.minSampleSize,
    });
    return {
      drifted: report.OverallSeverity === 'Critical',
      score: report.MaxPSI,
      detail: report.Summary,
    };
  }
}

function computePercentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[pos];
}

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

import type { DriftContext, DriftResult, IDriftDetector } from './types';

/** Default Laplace smoothing constant for zero-count bins. */
export const DEFAULT_PSI_EPSILON = 1e-4;

/** Default warning threshold for Population Stability Index. */
export const PSI_WARNING_THRESHOLD = 0.10;

/** Default critical drift threshold for Population Stability Index. */
export const PSI_CRITICAL_THRESHOLD = 0.25;

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
}

/** Computed confidence-floor and champion-vs-challenger divergence metrics. */
export interface ConfidenceAndDivergenceMetrics {
  readonly BaselineMeanConfidence: number | null;
  readonly EvaluationMeanConfidence: number | null;
  readonly BelowFloorRate: number | null;
  readonly ConfidenceDegraded: boolean;
  readonly PairCount: number;
  readonly AgreementRate: number | null;
  readonly MeanAbsoluteScoreDelta: number | null;
  readonly P95LatencyRatio: number | null;
  readonly ChallengerDiverged: boolean;
}

/** Input to {@link EvaluateFeatureAndPredictionDrift}. */
export interface FeatureAndPredictionDriftInput {
  readonly ModelID?: string;
  readonly RecordProcessID?: string;
  readonly NumericFeatures?: Readonly<
    Record<string, { readonly Baseline: readonly number[]; readonly Evaluation: readonly number[]; readonly Bins?: number }>
  >;
  readonly CategoricalFeatures?: Readonly<
    Record<string, { readonly Baseline: readonly string[]; readonly Evaluation: readonly string[] }>
  >;
  readonly PrebinnedFeatures?: Readonly<
    Record<string, { readonly BaselineProportions: readonly number[]; readonly EvaluationProportions: readonly number[] }>
  >;
  readonly ConfidenceAndDivergence?: ConfidenceAndDivergenceInput;
  readonly WarningPSIThreshold?: number;
  readonly CriticalPSIThreshold?: number;
  readonly Epsilon?: number;
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
  readonly Summary: string;
}

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
 * Compute PSI for a continuous/numeric feature by constructing equal-width bins across
 * the baseline range `[min, max]` (with open boundary tails `(-inf, edge_1)` and `[edge_{B-1}, +inf)`)
 * so out-of-range evaluation shifts are captured in the boundary bins.
 */
export function ComputeNumericFeaturePSI(
  featureName: string,
  baselineValues: readonly number[],
  evaluationValues: readonly number[],
  numBins: number = 10,
  epsilon: number = DEFAULT_PSI_EPSILON,
  warningThreshold: number = PSI_WARNING_THRESHOLD,
  criticalThreshold: number = PSI_CRITICAL_THRESHOLD,
): FeaturePSIResult {
  const cleanBaseline = baselineValues.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const cleanEval = evaluationValues.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const bins = Math.max(2, Math.floor(numBins));

  if (cleanBaseline.length === 0 || cleanEval.length === 0) {
    return {
      FeatureName: featureName,
      FeatureType: 'Numeric',
      PSI: 0,
      Severity: 'None',
      BinCount: bins,
      BaselineSampleCount: cleanBaseline.length,
      EvaluationSampleCount: cleanEval.length,
    };
  }

  let minVal = cleanBaseline[0];
  let maxVal = cleanBaseline[0];
  for (const v of cleanBaseline) {
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  const span = maxVal - minVal > 0 ? maxVal - minVal : 1;
  const step = span / bins;

  const baseCounts = new Array<number>(bins).fill(0);
  const evalCounts = new Array<number>(bins).fill(0);

  const toBinIndex = (val: number): number => {
    const idx = Math.floor((val - minVal) / step);
    return Math.max(0, Math.min(bins - 1, idx));
  };

  for (const v of cleanBaseline) {
    baseCounts[toBinIndex(v)]++;
  }
  for (const v of cleanEval) {
    evalCounts[toBinIndex(v)]++;
  }

  const psi = ComputePopulationStabilityIndex(baseCounts, evalCounts, epsilon);
  return {
    FeatureName: featureName,
    FeatureType: 'Numeric',
    PSI: psi,
    Severity: ClassifyPSISeverity(psi, warningThreshold, criticalThreshold),
    BinCount: bins,
    BaselineSampleCount: cleanBaseline.length,
    EvaluationSampleCount: cleanEval.length,
  };
}

/**
 * Compute PSI for a categorical feature across the union of observed baseline and evaluation categories.
 */
export function ComputeCategoricalFeaturePSI(
  featureName: string,
  baselineCategories: readonly string[],
  evaluationCategories: readonly string[],
  epsilon: number = DEFAULT_PSI_EPSILON,
  warningThreshold: number = PSI_WARNING_THRESHOLD,
  criticalThreshold: number = PSI_CRITICAL_THRESHOLD,
): FeaturePSIResult {
  if (baselineCategories.length === 0 || evaluationCategories.length === 0) {
    return {
      FeatureName: featureName,
      FeatureType: 'Categorical',
      PSI: 0,
      Severity: 'None',
      BinCount: 0,
      BaselineSampleCount: baselineCategories.length,
      EvaluationSampleCount: evaluationCategories.length,
    };
  }

  const categories = new Set<string>();
  const baseMap = new Map<string, number>();
  const evalMap = new Map<string, number>();

  for (const raw of baselineCategories) {
    const key = String(raw);
    categories.add(key);
    baseMap.set(key, (baseMap.get(key) ?? 0) + 1);
  }
  for (const raw of evaluationCategories) {
    const key = String(raw);
    categories.add(key);
    evalMap.set(key, (evalMap.get(key) ?? 0) + 1);
  }

  const orderedKeys = Array.from(categories).sort();
  const baseCounts = orderedKeys.map((k) => baseMap.get(k) ?? 0);
  const evalCounts = orderedKeys.map((k) => evalMap.get(k) ?? 0);

  const psi = ComputePopulationStabilityIndex(baseCounts, evalCounts, epsilon);
  return {
    FeatureName: featureName,
    FeatureType: 'Categorical',
    PSI: psi,
    Severity: ClassifyPSISeverity(psi, warningThreshold, criticalThreshold),
    BinCount: orderedKeys.length,
    BaselineSampleCount: baselineCategories.length,
    EvaluationSampleCount: evaluationCategories.length,
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

  const baseConf = (input.BaselineConfidences ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const evalConf = (input.EvaluationConfidences ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v));

  const baselineMeanConfidence =
    baseConf.length > 0 ? baseConf.reduce((a, b) => a + b, 0) / baseConf.length : null;
  const evaluationMeanConfidence =
    evalConf.length > 0 ? evalConf.reduce((a, b) => a + b, 0) / evalConf.length : null;
  const belowFloorRate =
    evalConf.length > 0 ? evalConf.filter((c) => c < confidenceFloor).length / evalConf.length : null;

  const meanDropExceeded =
    baselineMeanConfidence !== null &&
    evaluationMeanConfidence !== null &&
    baselineMeanConfidence - evaluationMeanConfidence > maxMeanConfidenceDrop;
  const floorBreached = belowFloorRate !== null && belowFloorRate > maxBelowFloorRate;
  const confidenceDegraded = meanDropExceeded || floorBreached;

  const pairs = input.Pairs ?? [];
  let labelPairs = 0;
  let labelAgreements = 0;
  const scoreDeltas: number[] = [];
  const champLatencies: number[] = [];
  const challLatencies: number[] = [];

  for (const pair of pairs) {
    if (pair.ChampionLabel !== undefined && pair.ChallengerLabel !== undefined) {
      labelPairs++;
      if (pair.ChampionLabel === pair.ChallengerLabel) {
        labelAgreements++;
      }
    } else if (typeof pair.ChampionScore === 'number' && typeof pair.ChallengerScore === 'number') {
      labelPairs++;
      const champPositive = pair.ChampionScore >= 0.5;
      const challPositive = pair.ChallengerScore >= 0.5;
      if (champPositive === challPositive) {
        labelAgreements++;
      }
    }

    if (typeof pair.ChampionScore === 'number' && typeof pair.ChallengerScore === 'number') {
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

  const agreementBreached = agreementRate !== null && agreementRate < minAgreementRate;
  const deltaBreached = meanAbsoluteScoreDelta !== null && meanAbsoluteScoreDelta > maxMeanAbsScoreDelta;
  const latencyBreached = p95LatencyRatio !== null && p95LatencyRatio > maxP95LatencyRatio;
  const challengerDiverged = agreementBreached || deltaBreached || latencyBreached;

  return {
    BaselineMeanConfidence: baselineMeanConfidence,
    EvaluationMeanConfidence: evaluationMeanConfidence,
    BelowFloorRate: belowFloorRate,
    ConfidenceDegraded: confidenceDegraded,
    PairCount: pairs.length,
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

  const featureResults: FeaturePSIResult[] = [];

  if (input.PrebinnedFeatures) {
    for (const [featureName, spec] of Object.entries(input.PrebinnedFeatures)) {
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
        BaselineSampleCount: spec.BaselineProportions.length,
        EvaluationSampleCount: spec.EvaluationProportions.length,
      });
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
        ),
      );
    }
  }

  const divergence = ComputeConfidenceAndChallengerDivergence(input.ConfidenceAndDivergence);
  const driftedFeatures = featureResults.filter((f) => f.Severity !== 'None');
  const maxPSI = featureResults.reduce((max, f) => Math.max(max, f.PSI), 0);

  let overallSeverity: DriftSeverity = ClassifyPSISeverity(maxPSI, warnThreshold, critThreshold);
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
  if (divergence.ConfidenceDegraded) {
    summaryParts.push(
      `ConfidenceDegraded=true (BelowFloorRate=${(divergence.BelowFloorRate ?? 0).toFixed(2)})`,
    );
  }
  if (divergence.ChallengerDiverged) {
    summaryParts.push(
      `ChallengerDiverged=true (AgreementRate=${(divergence.AgreementRate ?? 1).toFixed(2)}, MeanDelta=${(divergence.MeanAbsoluteScoreDelta ?? 0).toFixed(4)})`,
    );
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
    Summary: summaryParts.join(', '),
  };
}

/**
 * Statistical PSI-backed implementation of {@link IDriftDetector} for `MaintenanceEngine`.
 */
export class PSIDriftDetector implements IDriftDetector {
  constructor(
    private readonly providerFn?: (modelId: string) => Promise<FeatureAndPredictionDriftInput> | FeatureAndPredictionDriftInput,
    private readonly warningThreshold: number = PSI_WARNING_THRESHOLD,
    private readonly criticalThreshold: number = PSI_CRITICAL_THRESHOLD,
  ) {}

  public async detectDrift(context: DriftContext): Promise<DriftResult> {
    if (!this.providerFn) {
      return {
        drifted: false,
        score: 0,
        detail: 'No feature distribution provider configured for PSIDriftDetector.',
      };
    }
    const input = await this.providerFn(context.modelId);
    const report = EvaluateFeatureAndPredictionDrift({
      ...input,
      ModelID: context.modelId,
      WarningPSIThreshold: this.warningThreshold,
      CriticalPSIThreshold: this.criticalThreshold,
    });
    return {
      drifted: report.ShouldAlert,
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

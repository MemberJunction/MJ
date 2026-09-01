/**
 * @module statistics/statistics-pass
 *
 * The **statistics pre-pass** — measure the data before choosing an architecture.
 *
 * The Model Development Agent currently proposes an algorithm from the 6×7 guidance matrix and the
 * user's goal statement. That is a decision made blind. This pass gives it evidence: the class
 * balance (is "always no" already 97% accurate?), the per-feature association with the target
 * (is one candidate the answer under another name?), the cardinality (is one an identifier?), the
 * rows-per-feature (can any family in the tree honestly learn from this?), and then whether each
 * candidate component-tree leaf is admissible given all of that.
 *
 * Three properties it has to have, and does:
 *
 *  1. **The same assembly path as training.** It calls the same `FeatureAssemblyExecutor` with the
 *     same params, so what it describes is what the model will actually see — not an approximation
 *     of it.
 *  2. **The same locked-holdout carve as training** (`training/holdout.ts`), and it describes ONLY
 *     the training portion. Measuring the holdout would leak it into every downstream decision and
 *     `MLModel.HoldoutMetrics` would stop being the honest number.
 *  3. **No inference.** The sidecar returns measurements; the hints and the gate verdicts are
 *     derived by pure TypeScript with explicit thresholds. Nothing here is an opinion.
 */

import { LogError } from '@memberjunction/core';
import type {
  DatasetStatistics,
  DescribeFeature,
  DescribeRequest,
  DescribeResponse,
  FeatureSchemaEntry,
  FeatureStatistics,
  MatrixData,
  ProblemType,
  TargetStatistics,
  ValidationStrategy,
} from '@memberjunction/predictive-studio-core';
import { addCollinearityHints, deriveFeatureHints } from '@memberjunction/predictive-studio-core';

import { FeatureAssemblyExecutor, type FeatureAssemblyParams } from '../feature-assembly';
import { carveLockedHoldout } from '../training/holdout';
import type { StatisticsDeps } from './seams';

/** Input to {@link StatisticsPass.run} — the assembly params plus the validation split. */
export interface StatisticsPassInput {
  /**
   * The SAME assembly params training would use. Reusing the caller's params (rather than
   * rebuilding them here) is what guarantees the pass describes the real matrix.
   */
  assembly: FeatureAssemblyParams;
  /** The validation strategy, read for `LockedHoldoutFraction` — the holdout is excluded. */
  validation: ValidationStrategy;
  /** Classification or regression. */
  problemType: ProblemType;
  /** Also request the pairwise correlation matrix, which drives the `collinear` hints. */
  includeCorrelations?: boolean;
  /** Cap on enumerated categories per column. Omitted ⇒ sidecar default. */
  topValuesLimit?: number;
}

/**
 * Runs the pre-pass. Stateless across calls; construct once and reuse.
 */
export class StatisticsPass {
  private readonly assembler: FeatureAssemblyExecutor;

  /** @param assembler optional executor override (tests inject one over in-memory fixtures) */
  constructor(assembler?: FeatureAssemblyExecutor) {
    this.assembler = assembler ?? new FeatureAssemblyExecutor();
  }

  /**
   * Assemble, carve the holdout away, describe what is left, and fold the measurements into
   * {@link DatasetStatistics} with hints attached.
   *
   * @throws when assembly or the sidecar call fails — a pre-pass that silently returned partial
   *   numbers would be worse than one that didn't run, because the agent would act on them.
   */
  public async run(input: StatisticsPassInput, deps: StatisticsDeps): Promise<DatasetStatistics> {
    const targetVariable = input.assembly.targetVariable;
    if (!targetVariable) {
      throw new Error('StatisticsPass: assembly params must carry a targetVariable — there is nothing to describe against.');
    }

    const assembly = await this.assembler.assemble({
      ...input.assembly,
      context: 'train',
      contextUser: deps.contextUser ?? input.assembly.contextUser,
      provider: deps.provider ?? input.assembly.provider,
    });

    // The holdout is carved and then DISCARDED here — the pass never looks at it.
    const split = carveLockedHoldout(assembly.matrix, input.validation);

    const request = this.buildDescribeRequest(input, assembly.featureSchema, targetVariable, split.training);
    const response = await deps.describer.describe(request);

    return this.toDatasetStatistics(input, assembly.featureSchema, response);
  }

  /** Build the `/describe` body from the assembled training partition. */
  private buildDescribeRequest(
    input: StatisticsPassInput,
    featureSchema: FeatureSchemaEntry[],
    targetVariable: string,
    training: MatrixData,
  ): DescribeRequest {
    return {
      problem_type: input.problemType,
      feature_schema: featureSchema,
      target: targetVariable,
      data: training,
      include_correlations: input.includeCorrelations,
      top_values_limit: input.topValuesLimit,
    };
  }

  /** Fold the sidecar's measurements into the persisted statistics shape, deriving hints. */
  private toDatasetStatistics(
    input: StatisticsPassInput,
    featureSchema: FeatureSchemaEntry[],
    response: DescribeResponse,
  ): DatasetStatistics {
    const kindByName = new Map(featureSchema.map((f) => [f.Name, f.Kind]));
    const features = response.features.map((f) => toFeatureStatistics(f, response.row_count, kindByName.get(f.name)));

    if (response.correlations) {
      addCollinearityHints(features, correlationLookup(response.correlations));
    }

    const featureCount = features.length;
    return {
      EntityName: input.assembly.targetEntityName,
      RowCount: response.row_count,
      FeatureCount: featureCount,
      // Guarded: a plan with zero features is a caller bug, but it must not surface as Infinity in
      // a gate message that a business user reads.
      RowsPerFeature: featureCount > 0 ? response.row_count / featureCount : 0,
      Target: toTargetStatistics(response, input.problemType),
      Features: features,
      DescribedAt: new Date().toISOString(),
      Warnings: [...response.warnings],
    };
  }
}

// region: mapping (pure) ------------------------------------------------------

/**
 * Map one `/describe` feature onto {@link FeatureStatistics}, attaching its hints.
 *
 * @param f the sidecar's measurements for this column
 * @param rowCount rows in the described (training) partition — needed for `CardinalityRatio`
 * @param declaredKind the assembler's kind for this column, which wins over the sidecar's echo
 */
export function toFeatureStatistics(f: DescribeFeature, rowCount: number, declaredKind?: string): FeatureStatistics {
  // Distinct values per NON-NULL row. A column that is 50% missing but has a different value in
  // every row it does have is entirely distinct where present — which is exactly what makes it an
  // identifier. Dividing by the full row count would halve the ratio and hide it.
  const nonNullCount = rowCount * Math.max(0, 1 - f.missing_fraction);
  const stats: FeatureStatistics = {
    Name: f.name,
    Kind: normalizeKind(declaredKind ?? f.kind),
    MissingFraction: f.missing_fraction,
    DistinctCount: f.distinct_count,
    CardinalityRatio: nonNullCount > 0 ? Math.min(1, f.distinct_count / nonNullCount) : 0,
    Mean: f.numeric?.mean,
    StdDev: f.numeric?.std,
    Min: f.numeric?.min,
    Max: f.numeric?.max,
    Quartiles: f.numeric ? (f.numeric.quartiles.slice(0, 3) as [number, number, number]) : undefined,
    Skewness: f.numeric?.skewness,
    TargetAssociation: f.target_association,
    MutualInformation: f.mutual_information,
    TopValues: f.top_values?.map((v) => ({ Value: v.value, Count: v.count })),
    Hints: [],
  };
  stats.Hints = deriveFeatureHints(stats);
  return stats;
}

/** Map the `/describe` target block onto {@link TargetStatistics}, computing the minority share. */
export function toTargetStatistics(response: DescribeResponse, problemType: ProblemType): TargetStatistics {
  const t = response.target;
  const base: TargetStatistics = {
    Name: t.name,
    ProblemType: problemType,
    LabeledRowCount: t.labeled_row_count,
  };

  if (t.classes && t.classes.length > 0) {
    const total = t.classes.reduce((sum, c) => sum + c.count, 0);
    base.Classes = t.classes.map((c) => ({
      Value: c.value,
      Count: c.count,
      Fraction: total > 0 ? c.count / total : 0,
    }));
    // The smallest class, not "the positive class" — which one is "positive" is a labeling
    // convention, but the rarest one is what decides whether accuracy means anything.
    base.MinorityFraction = base.Classes.reduce((min, c) => Math.min(min, c.Fraction), 1);
  }

  if (t.numeric) {
    base.Numeric = {
      Mean: t.numeric.mean,
      StdDev: t.numeric.std,
      Min: t.numeric.min,
      Max: t.numeric.max,
      Quartiles: t.numeric.quartiles.slice(0, 3) as [number, number, number],
    };
  }

  return base;
}

/**
 * Build the `(a, b) => |r|` lookup {@link addCollinearityHints} expects from the sidecar's
 * `"a|b"`-keyed map. Order-insensitive, since the caller iterates pairs in schema order and the
 * sidecar emits them in its own.
 */
export function correlationLookup(correlations: Record<string, number>): (a: string, b: string) => number | null {
  return (a, b) => correlations[`${a}|${b}`] ?? correlations[`${b}|${a}`] ?? null;
}

/** Normalize a feature kind onto the statistics vocabulary, defaulting unknowns to numeric. */
function normalizeKind(kind: string): FeatureStatistics['Kind'] {
  switch (kind) {
    case 'numeric':
    case 'categorical':
    case 'embedding':
    case 'llm-derived':
    case 'presence':
      return kind;
    default:
      return 'numeric';
  }
}

/**
 * Run the pass without letting a failure take the caller down. Returns `null` and logs on failure —
 * for callers (like the agent orchestrator) where a missing pre-pass should degrade the decision to
 * the old blind one, not abort the session.
 */
export async function runStatisticsPassBestEffort(
  pass: StatisticsPass,
  input: StatisticsPassInput,
  deps: StatisticsDeps,
): Promise<DatasetStatistics | null> {
  try {
    return await pass.run(input, deps);
  } catch (err) {
    LogError(`StatisticsPass failed (the plan will proceed without measured statistics): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

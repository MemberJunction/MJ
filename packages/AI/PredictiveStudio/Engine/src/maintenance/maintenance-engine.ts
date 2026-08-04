/**
 * @module maintenance/maintenance-engine
 *
 * The **MaintenanceEngine** — Predictive Studio's maintenance pillar (plan §12 /
 * SP10). It composes the existing pieces (the {@link TrainingEngine}, the
 * scoring inference path via an injected re-score runner, the
 * `MJ: ML Model Scoring Bindings` lineage) into one auditable maintenance flow:
 *
 * 1. **Staleness detection** ({@link MaintenanceEngine.detectStaleness}) — given a
 *    binding + its model, decide stale-or-fresh by a configurable
 *    {@link RetrainingPolicy}: **cadence** (last-scored / last-trained older than N
 *    days), **data-volume** (target row count grew > X% since training), and a
 *    **drift** seam ({@link IDriftDetector}).
 * 2. **Scheduled re-scoring** ({@link MaintenanceEngine.rescoreScheduledBinding}) —
 *    for a `Mode='Scheduled'` binding, re-run scoring via the injected runner and
 *    stamp `LastScoredAt` / `LastRowCount` on the binding.
 * 3. **Retraining trigger** ({@link MaintenanceEngine.triggerRetrainIfStale}) — when
 *    a model is stale, retrain via `TrainingEngine.trainModel` against the same
 *    pipeline → a NEW immutable version; compare the challenger's `HoldoutMetrics`
 *    vs the incumbent's; return a **promotion recommendation** (`promote` when the
 *    challenger wins by the configured margin, else `hold`). It NEVER auto-promotes
 *    — promotion is a separate signed-off Action (§6.4 / PS-AGENT-7).
 * 4. A **single pass** ({@link MaintenanceEngine.runMaintenancePass}) the scheduler
 *    / an Action calls to do all of the above over a set of bindings, isolated
 *    per-binding so one failure never aborts the batch.
 *
 * Every external dependency is injected (see {@link MaintenanceDeps}) so the engine
 * is unit-testable with no live database and no live sidecar.
 */

import { LogError, type UserInfo } from '@memberjunction/core';
import { isErrorMetric } from '@memberjunction/predictive-studio-core';
import type {
  MJMLModelEntity,
  MJMLModelScoringBindingEntity,
} from '@memberjunction/core-entities';
import type { TrainModelInput, TrainModelResult } from '../training';

import type {
  RetrainingPolicy,
  MaintenanceDeps,
  StalenessResult,
  StalenessReason,
  RescoreResult,
  RetrainOutcome,
  ChallengerComparison,
  PromotionRecommendation,
  IMaintenanceClock,
  DriftContext,
  MaintenancePassOptions,
  MaintenancePassResult,
  MaintenancePassEntry,
} from './types';
import { DEFAULT_RETRAINING_POLICY, MaintenanceSystemClock } from './types';
import { resolveComparisonMetric, readMetric } from './metrics';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Maintenance orchestrator. Stateless across calls; construct once and reuse. The
 * dependency bundle ({@link MaintenanceDeps}) and {@link RetrainingPolicy} are
 * supplied per call.
 */
export class MaintenanceEngine {
  // region: staleness detection -------------------------------------------------

  /**
   * Decide whether a binding's model is stale per policy. Pure with respect to the
   * injected seams: reads counts/drift via deps and the clock, mutates nothing.
   *
   * @param binding the `MJ: ML Model Scoring Bindings` row
   * @param model the `MJ: ML Models` row the binding scores with
   * @param policy the staleness/retraining policy (partial → merged with defaults)
   * @param deps the injected dependency bundle
   */
  public async detectStaleness(
    binding: MJMLModelScoringBindingEntity,
    model: MJMLModelEntity,
    policy: Partial<RetrainingPolicy>,
    deps: MaintenanceDeps,
  ): Promise<StalenessResult> {
    const p = this.resolvePolicy(policy);
    const clock = deps.clock ?? MaintenanceSystemClock;
    const reasons: StalenessReason[] = [];

    const currentRowCount = await this.currentRowCount(model, deps);
    const trainedRowCount = model.TrainingRowCount ?? undefined;

    this.pushCadenceReason(reasons, binding, model, p, clock);
    this.pushDataVolumeReason(reasons, trainedRowCount, currentRowCount, p);
    await this.pushDriftReason(reasons, model, binding, trainedRowCount, currentRowCount, p, deps);

    return {
      bindingId: binding.ID,
      modelId: model.ID,
      stale: reasons.length > 0,
      reasons,
      currentRowCount,
      trainedRowCount,
    };
  }

  /** Append a cadence reason when the anchor timestamp is older than `cadenceDays`. */
  private pushCadenceReason(
    reasons: StalenessReason[],
    binding: MJMLModelScoringBindingEntity,
    model: MJMLModelEntity,
    policy: RetrainingPolicy,
    clock: IMaintenanceClock,
  ): void {
    if (policy.cadenceDays <= 0) {
      return;
    }
    const anchor = policy.cadenceAnchor === 'lastScored' ? binding.LastScoredAt : model.TrainedAt;
    if (!anchor) {
      // No anchor timestamp yet (never scored / never recorded). Treat as stale so a
      // never-scored scheduled binding is picked up on the first pass.
      reasons.push({
        trigger: 'cadence',
        detail: `No ${policy.cadenceAnchor === 'lastScored' ? 'last-scored' : 'trained'} timestamp recorded yet, so the model is treated as due for a refresh.`,
      });
      return;
    }
    const ageDays = (clock.now().getTime() - new Date(anchor).getTime()) / MS_PER_DAY;
    if (ageDays > policy.cadenceDays) {
      reasons.push({
        trigger: 'cadence',
        detail:
          `It has been ${ageDays.toFixed(1)} days since the model was ` +
          `${policy.cadenceAnchor === 'lastScored' ? 'last scored' : 'trained'}, ` +
          `past the ${policy.cadenceDays}-day refresh cadence.`,
      });
    }
  }

  /** Append a data-volume reason when the target population grew past the threshold. */
  private pushDataVolumeReason(
    reasons: StalenessReason[],
    trainedRowCount: number | undefined,
    currentRowCount: number | undefined,
    policy: RetrainingPolicy,
  ): void {
    if (policy.dataVolumeGrowthThreshold <= 0) {
      return;
    }
    if (trainedRowCount == null || trainedRowCount <= 0 || currentRowCount == null) {
      return;
    }
    const growth = (currentRowCount - trainedRowCount) / trainedRowCount;
    if (growth > policy.dataVolumeGrowthThreshold) {
      reasons.push({
        trigger: 'data-volume',
        detail:
          `The data has grown ${(growth * 100).toFixed(1)}% (from ${trainedRowCount} to ${currentRowCount} rows) ` +
          `since training, past the ${(policy.dataVolumeGrowthThreshold * 100).toFixed(0)}% growth threshold.`,
      });
    }
  }

  /** Append a drift reason when drift detection is enabled and the detector flags it. */
  private async pushDriftReason(
    reasons: StalenessReason[],
    model: MJMLModelEntity,
    binding: MJMLModelScoringBindingEntity,
    trainedRowCount: number | undefined,
    currentRowCount: number | undefined,
    policy: RetrainingPolicy,
    deps: MaintenanceDeps,
  ): Promise<void> {
    if (!policy.driftEnabled) {
      return;
    }
    const context: DriftContext = {
      modelId: model.ID,
      trainedRowCount,
      currentRowCount,
      lastScoredRowCount: binding.LastRowCount ?? undefined,
    };
    const result = await deps.driftDetector.detectDrift(context);
    if (result.drifted) {
      reasons.push({ trigger: 'drift', detail: result.detail });
    }
  }

  /** Count the model's target population now (via the injected counter); undefined on read failure. */
  private async currentRowCount(model: MJMLModelEntity, deps: MaintenanceDeps): Promise<number | undefined> {
    const targetEntityName = this.targetEntityName(model);
    if (!targetEntityName) {
      return undefined;
    }
    try {
      return await deps.rowCounter.countRows(targetEntityName, undefined, deps.contextUser, deps.provider);
    } catch (err) {
      LogError(`MaintenanceEngine: row count failed for '${targetEntityName}': ${asMessage(err)}`);
      return undefined;
    }
  }

  // region: scheduled re-scoring ------------------------------------------------

  /**
   * Re-score a `Mode='Scheduled'` binding and stamp its monitoring fields
   * (`LastScoredAt = now`, `LastRowCount = scoredCount`). Bindings that are not
   * `Scheduled` are skipped (returns `null`).
   *
   * @param binding the binding to re-score
   * @param model the model it scores with
   * @param deps the injected dependency bundle
   * @returns the re-score result, or `null` when the binding is not `Scheduled`
   */
  public async rescoreScheduledBinding(
    binding: MJMLModelScoringBindingEntity,
    model: MJMLModelEntity,
    deps: MaintenanceDeps,
  ): Promise<RescoreResult | null> {
    if (binding.Mode !== 'Scheduled') {
      return null;
    }
    const targetEntityName = this.targetEntityName(model);
    if (!targetEntityName) {
      throw new Error(`MaintenanceEngine: cannot re-score binding '${binding.ID}' — model '${model.ID}' has no resolvable target entity.`);
    }

    const result = await deps.rescoreRunner.rescore({
      modelId: model.ID,
      targetEntityName,
      contextUser: deps.contextUser,
      provider: deps.provider,
    });

    await this.stampScoringRun(binding, result, deps);
    return result;
  }

  /** Stamp `LastScoredAt` / `LastRowCount` on a binding after a re-score (clock-driven). */
  private async stampScoringRun(
    binding: MJMLModelScoringBindingEntity,
    result: RescoreResult,
    deps: MaintenanceDeps,
  ): Promise<void> {
    const clock = deps.clock ?? MaintenanceSystemClock;
    binding.LastScoredAt = clock.now();
    binding.LastRowCount = result.scoredCount;
    await this.saveOrThrow(binding, `stamp scoring run on binding '${binding.ID}'`);
  }

  // region: retraining trigger --------------------------------------------------

  /**
   * Retrain when stale: if `staleness.stale`, retrain the binding's model against
   * the SAME pipeline → a new immutable version, then compare the challenger's
   * holdout metric vs the incumbent's and return a promotion RECOMMENDATION
   * (`promote` / `hold`). Never auto-promotes.
   *
   * @param binding the binding whose model may be retrained
   * @param incumbent the current (stale) model
   * @param staleness the staleness verdict driving the decision
   * @param policy the policy (for the promotion margin + comparison metric)
   * @param deps the injected dependency bundle (carries the training engine + deps)
   * @param trainInputOverrides optional extra train inputs (labelEventDates / maxRows / etc.)
   */
  public async triggerRetrainIfStale(
    binding: MJMLModelScoringBindingEntity,
    incumbent: MJMLModelEntity,
    staleness: StalenessResult,
    policy: Partial<RetrainingPolicy>,
    deps: MaintenanceDeps,
    trainInputOverrides?: Partial<Omit<TrainModelInput, 'pipelineId'>>,
  ): Promise<RetrainOutcome> {
    if (!staleness.stale) {
      return {
        bindingId: binding.ID,
        incumbentModelId: incumbent.ID,
        retrained: false,
        stalenessReasons: [],
      };
    }

    const p = this.resolvePolicy(policy);
    const challenger = await this.retrainSamePipeline(incumbent, deps, trainInputOverrides);
    const comparison = this.compareChallenger(incumbent, challenger.model, p);

    return {
      bindingId: binding.ID,
      incumbentModelId: incumbent.ID,
      retrained: true,
      stalenessReasons: staleness.reasons,
      challenger,
      comparison,
    };
  }

  /** Retrain the incumbent's pipeline into a new immutable version via the training engine. */
  private async retrainSamePipeline(
    incumbent: MJMLModelEntity,
    deps: MaintenanceDeps,
    trainInputOverrides?: Partial<Omit<TrainModelInput, 'pipelineId'>>,
  ): Promise<TrainModelResult> {
    const input: TrainModelInput = {
      ...trainInputOverrides,
      pipelineId: incumbent.PipelineID,
    };
    return deps.trainingEngine.trainModel(input, deps.trainingDeps);
  }

  /**
   * Compare a challenger model's holdout metric vs the incumbent's and recommend
   * `promote` (challenger wins by ≥ margin) or `hold`. Pure / synchronous — reads
   * the frozen `HoldoutMetrics` JSON off both models. This is a RECOMMENDATION; no
   * promotion is performed here (that is a separate signed-off Action).
   *
   * @param incumbent the current model
   * @param challenger the freshly-retrained model
   * @param policy the resolved policy (margin + comparison metric)
   */
  public compareChallenger(
    incumbent: MJMLModelEntity,
    challenger: MJMLModelEntity,
    policy: RetrainingPolicy,
  ): ChallengerComparison {
    const metric = resolveComparisonMetric(policy.comparisonMetric, incumbent, challenger);
    const incumbentValue = readMetric(incumbent.HoldoutMetrics, metric);
    const challengerValue = readMetric(challenger.HoldoutMetrics, metric);
    // `delta` is reported as challenger − incumbent for transparency, but the
    // promote decision uses `improvement`, computed in the metric's NATURAL
    // direction: for error metrics (RMSE/MAE/logloss) lower is better, so an
    // improvement means the incumbent's value minus the challenger's.
    const delta = incumbentValue != null && challengerValue != null ? challengerValue - incumbentValue : null;
    const improvement = this.metricImprovement(metric, incumbentValue, challengerValue);
    const recommendation = this.recommendPromotion(improvement, policy.promotionMargin);

    return {
      metric,
      incumbentValue,
      challengerValue,
      delta,
      margin: policy.promotionMargin,
      recommendation,
      detail: this.buildComparisonDetail(metric, incumbentValue, challengerValue, delta, policy.promotionMargin, recommendation),
    };
  }

  /**
   * How much the challenger improves over the incumbent, in the metric's natural
   * direction (positive = better). Returns `null` when either value is absent.
   * For error metrics lower is better → improvement = incumbent − challenger;
   * for higher-is-better metrics → improvement = challenger − incumbent.
   */
  private metricImprovement(metric: string, incumbentValue: number | null, challengerValue: number | null): number | null {
    if (incumbentValue == null || challengerValue == null) {
      return null;
    }
    return isErrorMetric(metric) ? incumbentValue - challengerValue : challengerValue - incumbentValue;
  }

  /** Decide promote-vs-hold from the directional improvement + margin (hold when unknown). */
  private recommendPromotion(improvement: number | null, margin: number): PromotionRecommendation {
    if (improvement == null) {
      return 'hold';
    }
    return improvement >= margin ? 'promote' : 'hold';
  }

  /** Plain-language comparison explanation (business-friendly; never implies auto-promotion). */
  private buildComparisonDetail(
    metric: string,
    incumbentValue: number | null,
    challengerValue: number | null,
    delta: number | null,
    margin: number,
    recommendation: PromotionRecommendation,
  ): string {
    if (incumbentValue == null || challengerValue == null) {
      return (
        `Could not compare on "${metric}" — ${incumbentValue == null ? 'the current model' : 'the new model'} ` +
        `has no holdout value for it. Recommending HOLD until a human reviews. No promotion was performed.`
      );
    }
    const verb = recommendation === 'promote' ? 'beats' : 'does not beat';
    return (
      `The newly-trained model scores ${challengerValue.toFixed(4)} vs the current model's ${incumbentValue.toFixed(4)} ` +
      `on "${metric}" (a change of ${(delta ?? 0).toFixed(4)}). It ${verb} the current model by the required ` +
      `${margin.toFixed(4)} margin, so the recommendation is to ${recommendation.toUpperCase()}. ` +
      `Promotion still requires explicit human sign-off — nothing has been promoted automatically.`
    );
  }

  // region: full pass -----------------------------------------------------------

  /**
   * Run the full maintenance pass over a set of bindings — the entry the scheduler
   * (or an Action) calls. For each binding: load its model, detect staleness,
   * optionally re-score (`Scheduled` bindings), and optionally retrain+compare when
   * stale. Each binding is isolated: a failure is captured on its entry and the
   * pass continues.
   *
   * @param bindings the bindings to maintain (resolve via the loader for "all scheduled")
   * @param policy the staleness/retraining policy (partial → merged with defaults)
   * @param deps the injected dependency bundle
   * @param options pass toggles (re-score scheduled / retrain stale)
   */
  public async runMaintenancePass(
    bindings: MJMLModelScoringBindingEntity[],
    policy: Partial<RetrainingPolicy>,
    deps: MaintenanceDeps,
    options: MaintenancePassOptions = {},
  ): Promise<MaintenancePassResult> {
    const rescoreScheduled = options.rescoreScheduled ?? true;
    const retrainStale = options.retrainStale ?? true;

    const entries: MaintenancePassEntry[] = [];
    for (const binding of bindings) {
      entries.push(await this.maintainOne(binding, policy, deps, { rescoreScheduled, retrainStale, trainModelInput: options.trainModelInput }));
    }
    return this.summarizePass(entries);
  }

  /** Maintain a single binding end-to-end, capturing any error on the entry. */
  private async maintainOne(
    binding: MJMLModelScoringBindingEntity,
    policy: Partial<RetrainingPolicy>,
    deps: MaintenanceDeps,
    options: Required<Pick<MaintenancePassOptions, 'rescoreScheduled' | 'retrainStale'>> & Pick<MaintenancePassOptions, 'trainModelInput'>,
  ): Promise<MaintenancePassEntry> {
    try {
      const model = await deps.loader.loadModel(binding.MLModelID, deps.contextUser, deps.provider);
      if (!model) {
        return {
          bindingId: binding.ID,
          staleness: { bindingId: binding.ID, modelId: binding.MLModelID, stale: false, reasons: [] },
          error: `Model '${binding.MLModelID}' not found for binding '${binding.ID}'.`,
        };
      }

      const rescore = options.rescoreScheduled
        ? (await this.rescoreScheduledBinding(binding, model, deps)) ?? undefined
        : undefined;

      const staleness = await this.detectStaleness(binding, model, policy, deps);

      const retrain =
        options.retrainStale && staleness.stale
          ? await this.triggerRetrainIfStale(binding, model, staleness, policy, deps, options.trainModelInput)
          : undefined;

      return { bindingId: binding.ID, staleness, rescore, retrain };
    } catch (err) {
      const message = asMessage(err);
      LogError(`MaintenanceEngine: maintenance failed for binding '${binding.ID}': ${message}`);
      return {
        bindingId: binding.ID,
        staleness: { bindingId: binding.ID, modelId: binding.MLModelID, stale: false, reasons: [] },
        error: message,
      };
    }
  }

  /** Fold per-binding entries into the pass-level counts. */
  private summarizePass(entries: MaintenancePassEntry[]): MaintenancePassResult {
    let staleCount = 0;
    let rescoredCount = 0;
    let retrainedCount = 0;
    let promoteRecommendedCount = 0;

    for (const e of entries) {
      if (e.staleness.stale) {
        staleCount++;
      }
      if (e.rescore) {
        rescoredCount++;
      }
      if (e.retrain?.retrained) {
        retrainedCount++;
      }
      if (e.retrain?.comparison?.recommendation === 'promote') {
        promoteRecommendedCount++;
      }
    }

    return { entries, staleCount, rescoredCount, retrainedCount, promoteRecommendedCount };
  }

  // region: helpers -------------------------------------------------------------

  /** Merge a partial policy over the defaults. */
  private resolvePolicy(policy: Partial<RetrainingPolicy>): RetrainingPolicy {
    return { ...DEFAULT_RETRAINING_POLICY, ...policy };
  }

  /**
   * Resolve the model's target entity name from its frozen lineage (the
   * training-unit entity), matching how {@link MLModelInferenceProcessor} resolves
   * it at score time. Falls back to the model's `Pipeline` name virtual when
   * lineage is absent.
   */
  private targetEntityName(model: MJMLModelEntity): string {
    const lineage = parseJson<Record<string, unknown>>(model.Lineage, {});
    if (typeof lineage.targetEntityName === 'string' && lineage.targetEntityName.length > 0) {
      return lineage.targetEntityName;
    }
    return model.Pipeline ?? '';
  }

  /** Save a binding and throw with `LatestResult.CompleteMessage` on failure (CLAUDE.md). */
  private async saveOrThrow(binding: MJMLModelScoringBindingEntity, what: string): Promise<void> {
    const ok = await binding.Save();
    if (!ok) {
      const message = binding.LatestResult?.CompleteMessage ?? 'unknown error';
      throw new Error(`MaintenanceEngine: failed to ${what}: ${message}`);
    }
  }
}

/**
 * Convenience free-function entry for the scheduler / an Action: construct a
 * {@link MaintenanceEngine} and run a single pass. Mirrors the "expose a clean
 * `runMaintenancePass(bindings, policy, deps)` entry" scheduling hook (plan §12 /
 * SP10) so callers don't have to manage the engine instance.
 *
 * @param bindings the bindings to maintain
 * @param policy the staleness/retraining policy
 * @param deps the injected dependency bundle
 * @param options pass toggles
 */
export function runMaintenancePass(
  bindings: MJMLModelScoringBindingEntity[],
  policy: Partial<RetrainingPolicy>,
  deps: MaintenanceDeps,
  options?: MaintenancePassOptions,
): Promise<MaintenancePassResult> {
  return new MaintenanceEngine().runMaintenancePass(bindings, policy, deps, options);
}

/** Parse a possibly-null JSON column, falling back to a default on null/parse error. */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Normalize an unknown error into a message string. */
function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Re-export for downstream maintenance consumers without reaching into core. */
export type { UserInfo };

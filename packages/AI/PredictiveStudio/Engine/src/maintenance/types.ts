/**
 * @module maintenance/types
 *
 * The {@link RetrainingPolicy} type + dependency-injection seams and input/output
 * shapes for the {@link MaintenanceEngine} (plan §12 / SP10). Maintenance is a
 * **co-equal pillar** — staleness detection, scheduled re-scoring, and retraining
 * triggers (cadence / data-volume / drift) hung off `MJ: ML Model Scoring Bindings`.
 *
 * Every external dependency the engine touches — entity reads, the row counter,
 * the training engine, the inference runner, the clock, and the drift detector —
 * is expressed as a narrow interface here so the orchestrator is unit-testable
 * with **no live database and no live sidecar**.
 */

import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type {
  MJMLModelEntity,
  MJMLModelScoringBindingEntity,
} from '@memberjunction/core-entities';

import type { TrainingEngine } from '../training';
import type { TrainModelInput, TrainModelResult, TrainingDeps, IEntityFactory } from '../training';

/**
 * Configurable retraining/staleness policy (plan §12). All thresholds carry
 * sensible defaults via {@link DEFAULT_RETRAINING_POLICY} so a caller can opt into
 * just the knobs it cares about. The same policy drives staleness detection AND
 * the retraining-trigger decision (a model is "stale" → it is a retraining
 * candidate).
 */
export interface RetrainingPolicy {
  /**
   * Cadence: a model is stale when its reference timestamp (last scored / last
   * trained — see {@link cadenceAnchor}) is older than this many days. `0` or a
   * negative value disables the cadence trigger.
   */
  cadenceDays: number;
  /**
   * Which timestamp the cadence trigger measures staleness against:
   * - `lastScored` — the binding's `LastScoredAt` (how long since we last scored)
   * - `lastTrained` — the model's `TrainedAt` (how long since the model itself was built)
   * Defaults to `lastTrained` (the model going stale is what drives retraining).
   */
  cadenceAnchor: 'lastScored' | 'lastTrained';
  /**
   * Data-volume: a model is stale when the target entity's CURRENT row count has
   * grown by more than this fraction over the count at training time
   * (`(current - trained) / trained > threshold`). e.g. `0.25` = "stale once 25%
   * more rows exist than the model was trained on". `0` or negative disables it.
   */
  dataVolumeGrowthThreshold: number;
  /**
   * Drift: whether to consult the injected {@link IDriftDetector}. When `true` and
   * the detector reports drift over its own threshold, the model is stale.
   */
  driftEnabled: boolean;
  /**
   * Promotion margin: a freshly-retrained challenger is only RECOMMENDED for
   * promotion when its holdout metric beats the incumbent's by at least this
   * absolute margin (e.g. `0.01` = "must be ≥1 point better"). Below the margin →
   * HOLD. Never auto-promotes regardless (promotion is a separate signed-off
   * Action / human gate — §6.4 / PS-AGENT-7).
   */
  promotionMargin: number;
  /**
   * Which holdout metric to compare challenger-vs-incumbent on (a key inside the
   * model's `HoldoutMetrics` JSON). `'auto'` picks a sensible default per problem
   * type (`roc_auc` for classification, `r2` for regression), falling back to the
   * first numeric metric present on both. Higher-is-better is assumed for the
   * built-in metrics.
   */
  comparisonMetric: string | 'auto';
}

/** Sensible defaults for {@link RetrainingPolicy} (plan §12). */
export const DEFAULT_RETRAINING_POLICY: RetrainingPolicy = {
  cadenceDays: 30,
  cadenceAnchor: 'lastTrained',
  dataVolumeGrowthThreshold: 0.25,
  driftEnabled: false,
  promotionMargin: 0.01,
  comparisonMetric: 'auto',
};

/** One reason a model was flagged stale, with the supporting numbers. */
export interface StalenessReason {
  /** Which trigger fired. */
  trigger: 'cadence' | 'data-volume' | 'drift';
  /** Plain-language explanation (business-friendly, surfaced to users/agents). */
  detail: string;
}

/** The outcome of a staleness evaluation for a single binding/model. */
export interface StalenessResult {
  /** The scoring binding evaluated. */
  bindingId: string;
  /** The model the binding scores with. */
  modelId: string;
  /** Whether ANY trigger flagged the model stale. */
  stale: boolean;
  /** Every trigger that fired (empty when fresh). */
  reasons: StalenessReason[];
  /** The current target-entity row count observed (for transparency/audit). */
  currentRowCount?: number;
  /** The row count the model was trained on (`MJMLModelEntity.TrainingRowCount`). */
  trainedRowCount?: number;
}

/**
 * Drift-detection seam. The DEFAULT implementation ({@link RowCountProxyDriftDetector})
 * is intentionally simple and HONEST — it uses an observable proxy (relative
 * change in scored-row volume vs the training row count) rather than pretending to
 * do a real distributional test. A genuine statistical drift method
 * (population-stability index / KS over the score distribution) is a flagged
 * follow-up (plan §16 [O]); inject a real detector here when it lands.
 */
export interface IDriftDetector {
  /**
   * Decide whether the model has drifted enough to be considered stale.
   *
   * @param context the model + its binding + observed counts (read-only)
   * @returns drift verdict + a plain-language explanation
   */
  detectDrift(context: DriftContext): Promise<DriftResult> | DriftResult;
}

/** Read-only inputs handed to an {@link IDriftDetector}. */
export interface DriftContext {
  /** The model being evaluated. */
  modelId: string;
  /** Row count the model was trained on. */
  trainedRowCount?: number;
  /** Current target-entity row count (from the injected counter). */
  currentRowCount?: number;
  /** The binding's last-recorded scored row count (`LastRowCount`). */
  lastScoredRowCount?: number;
}

/** An {@link IDriftDetector}'s verdict. */
export interface DriftResult {
  /** Whether the model has drifted past the detector's own threshold. */
  drifted: boolean;
  /** A 0..1 drift score (the detector's own metric); optional. */
  score?: number;
  /** Plain-language explanation. */
  detail: string;
}

/**
 * Counter seam — returns the CURRENT row count of a target entity (optionally
 * filtered), so the data-volume trigger can compare today's count against the
 * model's `TrainingRowCount`. Wraps a `RunView` count in production; tests inject
 * a fake returning canned counts.
 */
export interface IRowCounter {
  /**
   * Count rows of a target entity right now.
   *
   * @param entityName the target entity (model's training-unit entity)
   * @param extraFilter optional filter narrowing the population (mirrors the pipeline scope)
   * @param contextUser request user — required server-side for isolation/audit
   * @param provider optional provider for multi-provider correctness
   */
  countRows(
    entityName: string,
    extraFilter?: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<number>;
}

/**
 * Read seam for loading the bindings + their models that maintenance evaluates.
 * Wraps `RunView` in production; tests inject canned rows. Returns `null` for a
 * missing single lookup (mirrors `RunView`'s non-throwing contract).
 */
export interface IMaintenanceLoader {
  /**
   * Load a single scoring binding by id (mutation-free read).
   *
   * @returns the binding, or `null` when not found
   */
  loadBinding(
    bindingId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLModelScoringBindingEntity | null>;

  /**
   * Load every scoring binding in a given {@link RetrainingPolicy}-relevant `Mode`
   * (e.g. all `Scheduled` bindings for the scheduled-rescore pass).
   *
   * @param mode the binding mode to filter on (omit for ALL bindings)
   */
  loadBindings(
    mode?: MaintenanceBindingMode,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLModelScoringBindingEntity[]>;

  /**
   * Load the `MJ: ML Models` row a binding scores with (mutation-free read).
   *
   * @returns the model, or `null` when not found
   */
  loadModel(
    modelId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLModelEntity | null>;
}

/** The binding modes maintenance distinguishes (mirrors `MJMLModelScoringBindingEntity.Mode`). */
export type MaintenanceBindingMode = 'OnDemand' | 'Scheduled' | 'Materialized';

/**
 * Re-scoring seam — re-runs scoring for a binding and reports how many rows were
 * scored. Wraps the {@link MLModelInferenceProcessor} batch path (via the score
 * runner) in production; tests inject a fake returning a canned count. Keeps the
 * MaintenanceEngine decoupled from the scoring runner's storage/sidecar wiring.
 */
export interface IRescoreRunner {
  /**
   * Re-score the population a binding targets.
   *
   * @param request which model/entity to score + the context
   * @returns the number of rows scored (and failures, for monitoring)
   */
  rescore(request: RescoreRequest): Promise<RescoreResult>;
}

/** Input to {@link IRescoreRunner.rescore}. */
export interface RescoreRequest {
  /** The model id to score with. */
  modelId: string;
  /** The target entity whose records get scored. */
  targetEntityName: string;
  /** Optional filter narrowing the population (mirrors the pipeline scope). */
  extraFilter?: string;
  /** Optional cap on rows. */
  maxRows?: number;
  /** Request user. */
  contextUser?: UserInfo;
  /** Optional provider. */
  provider?: IMetadataProvider;
}

/** Result of an {@link IRescoreRunner.rescore} call. */
export interface RescoreResult {
  /** Rows successfully scored. */
  scoredCount: number;
  /** Rows that failed to score. */
  failedCount: number;
}

/**
 * Clock seam — abstracts `new Date()` so cadence math is deterministic in tests.
 * Named `IMaintenanceClock` (returning a `Date`) to avoid colliding with the
 * experiment module's millisecond-based `IClock`.
 */
export interface IMaintenanceClock {
  /** The current instant. */
  now(): Date;
}

/** Default {@link IMaintenanceClock} backed by the system clock. */
export const MaintenanceSystemClock: IMaintenanceClock = {
  now: () => new Date(),
};

/**
 * The injected dependency bundle for {@link MaintenanceEngine}. Bundling the
 * seams (rather than constructor-injecting each) keeps the engine stateless and
 * lets a caller vary implementations per pass.
 */
export interface MaintenanceDeps {
  /** Loads bindings + models. */
  loader: IMaintenanceLoader;
  /** Entity-creation seam (shared with training) — used to stamp binding monitoring fields. */
  entityFactory: IEntityFactory;
  /** Counts target-entity rows for the data-volume trigger. */
  rowCounter: IRowCounter;
  /** Re-runs scoring for the scheduled-rescore pass. */
  rescoreRunner: IRescoreRunner;
  /** Drift-detection seam (consulted only when `policy.driftEnabled`). */
  driftDetector: IDriftDetector;
  /** The training engine used to retrain a stale model into a new version. */
  trainingEngine: TrainingEngine;
  /** The training dependency bundle threaded into `trainingEngine.trainModel`. */
  trainingDeps: TrainingDeps;
  /** Clock seam (defaults to the system clock when omitted at the engine boundary). */
  clock?: IMaintenanceClock;
  /** Request user — threaded through every entity op for isolation/audit. */
  contextUser?: UserInfo;
  /** Optional provider for multi-provider correctness. */
  provider?: IMetadataProvider;
}

/** The promotion verdict produced after a retrain+compare. */
export type PromotionRecommendation = 'promote' | 'hold';

/** The result of evaluating a freshly-retrained challenger against the incumbent. */
export interface ChallengerComparison {
  /** The metric key the comparison used. */
  metric: string;
  /** Incumbent's value for that metric (or `null` when absent). */
  incumbentValue: number | null;
  /** Challenger's value for that metric (or `null` when absent). */
  challengerValue: number | null;
  /** challenger − incumbent (when both present). */
  delta: number | null;
  /** The configured promotion margin the delta was tested against. */
  margin: number;
  /** `promote` when delta ≥ margin, else `hold`. NEVER triggers an actual promotion. */
  recommendation: PromotionRecommendation;
  /** Plain-language explanation (business-friendly). */
  detail: string;
}

/** The outcome of a retraining trigger for a single stale binding/model. */
export interface RetrainOutcome {
  /** The binding that triggered the retrain. */
  bindingId: string;
  /** The incumbent model that was found stale. */
  incumbentModelId: string;
  /** Whether a retrain actually ran (false when the model was not stale). */
  retrained: boolean;
  /** Why the incumbent was found stale (empty when not stale). */
  stalenessReasons: StalenessReason[];
  /** The newly-trained challenger model + run (present only when `retrained`). */
  challenger?: TrainModelResult;
  /** Challenger-vs-incumbent comparison (present only when `retrained`). */
  comparison?: ChallengerComparison;
}

/** Per-binding outcome of the full maintenance pass. */
export interface MaintenancePassEntry {
  /** The binding evaluated. */
  bindingId: string;
  /** The staleness verdict. */
  staleness: StalenessResult;
  /** The re-score result, when the binding is `Scheduled` and was re-scored. */
  rescore?: RescoreResult;
  /** The retrain outcome, when retraining was requested AND the model was stale. */
  retrain?: RetrainOutcome;
  /** Any error captured for this binding (the pass is isolated per-binding). */
  error?: string;
}

/** Options controlling a {@link MaintenanceEngine.runMaintenancePass} run. */
export interface MaintenancePassOptions {
  /** When true, `Scheduled` bindings are re-scored as part of the pass. Default true. */
  rescoreScheduled?: boolean;
  /** When true, stale models are retrained + compared (never promoted). Default true. */
  retrainStale?: boolean;
  /** Optional per-binding train input overrides (e.g. labelEventDates / maxRows). */
  trainModelInput?: Partial<Omit<TrainModelInput, 'pipelineId'>>;
}

/** The full maintenance pass summary. */
export interface MaintenancePassResult {
  /** One entry per binding processed. */
  entries: MaintenancePassEntry[];
  /** Count of bindings flagged stale. */
  staleCount: number;
  /** Count of bindings re-scored. */
  rescoredCount: number;
  /** Count of models retrained. */
  retrainedCount: number;
  /** Count of challengers recommended for promotion (recommendation only). */
  promoteRecommendedCount: number;
}

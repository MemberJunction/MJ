/**
 * @module experiment/types
 *
 * Dependency-injection seams and input/output shapes for the
 * {@link ExperimentOrchestrator} (plan §8.3 / §8.4 / §9.1). Every external
 * dependency the orchestrator touches — entity creation, model training, the
 * wall-clock (for budget), and the adaptive "what-next" wave strategist — is
 * expressed as a narrow interface here so the orchestrator is fully
 * deterministic and unit-testable with no live database, no live sidecar, and
 * no real time.
 *
 * The orchestrator is the **execution-phase** code (plan §9.1): it receives an
 * already-**approved** `ModelingPlanSpec` (the approval gate is the agent's job)
 * and executes its `ProposedExperiments` as **waves** with bounded concurrency,
 * a leaderboard, pruning, and a between-wave budget gate.
 */

import type { BaseEntity, UserInfo, IMetadataProvider } from '@memberjunction/core';
import type {
  ModelingPlanSpec,
  Budget,
  LeaderboardEntry,
} from '@memberjunction/predictive-studio-core';
import type {
  MJExperimentEntity,
  MJExperimentSessionEntity,
  MJExperimentSessionIterationEntity,
  MJMLModelEntity,
  MJMLTrainingRunEntity,
} from '@memberjunction/core-entities';

/**
 * One proposed experiment lifted off a {@link ModelingPlanSpec}. Mirrors an
 * element of `ModelingPlanSpec.ProposedExperiments` — kept as a local alias so
 * the orchestrator code reads against a named type.
 */
export type ProposedExperiment = ModelingPlanSpec['ProposedExperiments'][number];

/**
 * Factory seam for creating strongly-typed entity objects. Wraps
 * `Metadata.GetEntityObject` in production; tests inject a fake returning
 * in-memory entity stand-ins. Mirrors {@link IEntityFactory} from the training
 * module but is re-declared here so the experiment engine doesn't re-export
 * across its own sub-modules.
 */
export interface IExperimentEntityFactory {
  /**
   * Create a new, unsaved entity object for the named entity. Mirrors
   * `Metadata.GetEntityObject<T>(entityName, contextUser)`.
   *
   * @param entityName MJ entity name (e.g. `MJ: Experiment Sessions`)
   * @param contextUser request user — required on the server for isolation/audit
   */
  getEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
}

/**
 * Monotonic clock seam for wall-clock budget enforcement (plan §8.4). The
 * orchestrator never calls `Date.now()` directly so tests can advance time
 * deterministically. Returns milliseconds since an arbitrary fixed epoch.
 */
export interface IClock {
  /** @returns the current time in milliseconds (monotonic, test-controllable). */
  now(): number;
}

/**
 * The single ML-execution seam the orchestrator depends on for each iteration —
 * "train this experiment, give me the model + run + normalized score." In
 * production this delegates to the `TrainingEngine` (which produces an immutable
 * `MJ: ML Models` + `MJ: ML Training Runs`); tests inject a deterministic fake.
 *
 * The orchestrator is intentionally decoupled from the `TrainingEngine`'s
 * pipeline-id contract: it hands the trainer a {@link TrainExperimentInput}
 * (the experiment definition + the owning iteration id) and receives a
 * {@link TrainExperimentResult}. The production adapter
 * (`TrainingEngineExperimentTrainer`) bridges this to `TrainingEngine.trainModel`.
 */
export interface IExperimentTrainer {
  /**
   * Train one experiment and return the produced model, its training-run row,
   * and the normalized holdout {@link TrainExperimentResult.Score} for the
   * plan's `SuccessMetric`. The implementation links the run to the iteration
   * (`ExperimentSessionIterationID`).
   *
   * @param input the experiment to train + the owning iteration/session context
   */
  train(input: TrainExperimentInput): Promise<TrainExperimentResult>;
}

/**
 * Input handed to {@link IExperimentTrainer.train} for a single iteration.
 */
export interface TrainExperimentInput {
  /** The proposed experiment being trained (algorithm × feature set × hyperparameters). */
  experiment: ProposedExperiment;
  /** The plan being executed (carries TargetDefinition, SuccessMetric, ValidationStrategy). */
  plan: ModelingPlanSpec;
  /** The `MJ: Experiment Session Iterations` id this run belongs to. */
  iterationId: string;
  /** The owning `MJ: Experiment Sessions` id. */
  sessionId: string;
  /** Request user — threaded for isolation/audit. */
  contextUser?: UserInfo;
  /** Optional provider for multi-provider correctness. */
  provider?: IMetadataProvider;
}

/**
 * The result of training one experiment — the model produced, the training-run
 * leaf (linked to the iteration), the normalized leaderboard score, and the
 * compute/token cost attributed to the attempt (for budget enforcement, §8.4).
 */
export interface TrainExperimentResult {
  /** The immutable `MJ: ML Models` row produced (Draft). */
  model: MJMLModelEntity;
  /** The `MJ: ML Training Runs` leaf recording the attempt (linked to the iteration). */
  run: MJMLTrainingRunEntity;
  /** Normalized holdout metric for the plan's `SuccessMetric` — drives the leaderboard. */
  Score: number;
  /** Compute cost attributed to this attempt (defaults to 0 when unknown). */
  ComputeCost?: number;
  /** LLM tokens used by this attempt (defaults to 0 when unknown). */
  TokensUsed?: number;
}

/**
 * The adaptive "what-next" seam (plan §9.1 — "internal LLM inference is used
 * only for choices"). Given the results so far, decide which experiments to run
 * in the next wave. The **default** implementation is fully deterministic
 * ({@link PlanOrderWaveStrategist}) — it just iterates the plan's
 * `ProposedExperiments` in priority order, in waves. An optional LLM-backed
 * strategist can be injected later to swap in adaptive "given these results,
 * what to try next" behavior without touching the deterministic loop.
 */
export interface IWaveStrategist {
  /**
   * Choose the experiments for the next wave.
   *
   * @param context the leaderboard + already-run experiments + remaining
   *   candidates + the plan, so the strategist can decide what to try next
   * @returns the experiments to run in the next wave (empty array ends the loop)
   */
  proposeNextWave(context: WaveStrategistContext): Promise<ProposedExperiment[]> | ProposedExperiment[];
}

/**
 * Context handed to {@link IWaveStrategist.proposeNextWave} — everything a
 * strategist (deterministic or LLM-backed) needs to decide the next wave.
 */
export interface WaveStrategistContext {
  /** The plan being executed. */
  plan: ModelingPlanSpec;
  /** Experiments NOT yet dispatched (deterministic default draws from here, priority-ordered). */
  remaining: ProposedExperiment[];
  /** The current leaderboard, best-first, across all completed iterations so far. */
  leaderboard: LeaderboardEntry[];
  /** Index of the wave about to be produced (0-based). */
  waveIndex: number;
  /** The max iterations this wave may contain (the configured concurrency). */
  maxWaveSize: number;
}

/**
 * Tunables for an orchestration run. All optional with sensible deterministic
 * defaults; tests vary them to drive wave/prune/budget behavior precisely.
 */
export interface ExperimentRunOptions {
  /**
   * Max iterations executed concurrently within a wave (bounded concurrency,
   * §8.3). Also bounds the default wave size. Defaults to {@link DEFAULT_WAVE_CONCURRENCY}.
   */
  concurrency?: number;
  /**
   * Keep the top-K iterations on the leaderboard after each wave; iterations
   * ranked below K are pruned (their Status set to `Pruned`). When omitted, no
   * top-K cap is applied (only the relative-threshold prune, if set, runs).
   */
  keepTopK?: number;
  /**
   * Prune any completed iteration whose Score is below
   * `bestScore * relativePruneThreshold` (a fraction in [0,1]). E.g. `0.8`
   * prunes anything scoring under 80% of the current best. When omitted, no
   * relative prune is applied.
   */
  relativePruneThreshold?: number;
  /**
   * Optional override of the session's budget (otherwise taken from
   * `ModelingPlanSpec.ProposedBudget`). Useful for tests.
   */
  budget?: Budget;
  /** Optional human-readable session name (defaults to a name derived from the plan goal). */
  sessionName?: string;
  /** Optional `MJ: AI Agent Runs` id that owns/drives this session (plan §9.1). */
  agentRunID?: string;
  /**
   * Optional pre-resolved `MJ: Experiments` id to create the session under. When
   * omitted, the orchestrator creates a new durable Experiment definition.
   */
  experimentID?: string;
}

/**
 * The injected dependency bundle passed to
 * {@link ExperimentOrchestrator.runSession}. Bundling the seams keeps the
 * orchestrator stateless across calls and lets a caller vary implementations
 * per call.
 */
export interface ExperimentDeps {
  /** Entity-creation seam (Experiment / Session / Iteration rows). */
  entityFactory: IExperimentEntityFactory;
  /** Per-iteration training seam (delegates to the TrainingEngine in production). */
  trainer: IExperimentTrainer;
  /** Wall-clock seam for wall-clock budget enforcement (deterministic in tests). */
  clock: IClock;
  /**
   * Optional adaptive wave strategist (plan §9.1). When omitted the orchestrator
   * uses the deterministic {@link PlanOrderWaveStrategist}.
   */
  waveStrategist?: IWaveStrategist;
  /** Request user — threaded through every entity op for isolation/audit. */
  contextUser?: UserInfo;
  /** Optional provider for multi-provider correctness. */
  provider?: IMetadataProvider;
}

/** The reason a session stopped, surfaced on {@link ExperimentSessionResult}. */
export type SessionStopReason =
  | 'completed' // all proposed experiments executed (or strategist ended the loop)
  | 'budget-maxRuns' // MaxRuns budget reached → Paused
  | 'budget-maxComputeCost' // MaxComputeCost budget reached → Paused
  | 'budget-maxWallclock'; // MaxWallclockMinutes budget reached → Paused

/**
 * The result of {@link ExperimentOrchestrator.runSession} — the durable
 * Experiment, the executed Session, the iterations created, the final
 * leaderboard, the best model surfaced, and how/why the session stopped.
 */
export interface ExperimentSessionResult {
  /** The durable `MJ: Experiments` definition. */
  experiment: MJExperimentEntity;
  /** The `MJ: Experiment Sessions` row executed (Completed or Paused). */
  session: MJExperimentSessionEntity;
  /** All `MJ: Experiment Session Iterations` created during the run. */
  iterations: MJExperimentSessionIterationEntity[];
  /** The final leaderboard, best-first. */
  leaderboard: LeaderboardEntry[];
  /** The best (winning) model surfaced, if any iteration produced one. */
  bestModel: MJMLModelEntity | null;
  /** Why the session stopped (completed vs. a clean budget pause). */
  stopReason: SessionStopReason;
}

/** Default bounded concurrency / max wave size when none is configured (§8.3). */
export const DEFAULT_WAVE_CONCURRENCY = 3;

/**
 * @module experiment/experiment-orchestrator
 *
 * The **ExperimentOrchestrator** — Predictive Studio's deterministic
 * execution-phase plan executor (plan §8.3 / §8.4 / §9.1). Given an
 * **already-approved** {@link ModelingPlanSpec}, it runs the plan's
 * `ProposedExperiments` as **waves** with bounded concurrency, maintaining a
 * leaderboard, pruning dominated branches, and gating on the session `Budget`.
 *
 * ## Session lifecycle (§4.5 / §8.3)
 * `Experiment` (durable definition) → `Experiment Session` (one execution,
 * Status `Planning → AwaitingApproval → Running → Paused → Completed/Cancelled`)
 * → N `Experiment Session Iterations` (the leaderboard unit, each with an
 * `ML Training Run` leaf). The orchestrator receives an approved plan, so it
 * moves the session `Running` immediately (the approval gate is the agent's
 * job) and finalizes `Completed` or — on a budget bound — pauses cleanly
 * (`Paused`) rather than overrun.
 *
 * ## Deterministic wave loop (§8.3 — the core)
 * ```text
 * generate wave → train wave (bounded concurrency) → evaluate → update
 *   leaderboard → prune → budget-gate → decide next wave
 * ```
 * For each experiment in a wave the orchestrator creates an iteration
 * (`Pending → Running`), trains it via the injected {@link IExperimentTrainer}
 * (→ model + run + normalized Score), links the run to the iteration, scores the
 * iteration, then updates the leaderboard. After each wave it prunes
 * unpromising branches (top-K / relative threshold), checks the budget, and asks
 * the {@link IWaveStrategist} for the next wave.
 *
 * ## Adaptive "what-next" seam (§9.1)
 * The next wave comes from {@link IWaveStrategist.proposeNextWave}. The default
 * ({@link PlanOrderWaveStrategist}) is fully deterministic (iterate the plan in
 * priority order, in waves); an LLM-backed strategist can be injected to swap in
 * "given these results, what to try next" — the deterministic loop is unchanged.
 *
 * Every external dependency is injected ({@link ExperimentDeps}) so the engine
 * is unit-testable with no live database, no live sidecar, and no real clock.
 */

import { LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
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
} from '@memberjunction/core-entities';

import {
  type ExperimentDeps,
  type ExperimentRunOptions,
  type ExperimentSessionResult,
  type ProposedExperiment,
  type SessionStopReason,
  type IWaveStrategist,
  type WaveStrategistContext,
  DEFAULT_WAVE_CONCURRENCY,
} from './types';
import { rankLeaderboard, bestEntry, selectPrunedIterationIds } from './leaderboard';
import { runBounded } from './concurrency';
import { PlanOrderWaveStrategist } from './wave-strategist';

/**
 * A budget check result — whether the session may continue and, if not, why.
 */
interface BudgetGateResult {
  exceeded: boolean;
  reason?: SessionStopReason;
}

/** Running budget accounting carried across waves. */
interface BudgetState {
  runs: number;
  computeCost: number;
  startedAtMs: number;
}

/**
 * The deterministic experiment orchestrator. Stateless across calls; construct
 * once and reuse. All dependencies are supplied per call via
 * {@link ExperimentDeps}.
 */
export class ExperimentOrchestrator {
  /**
   * Execute an approved modeling plan for a fresh experiment session.
   *
   * @param plan the **approved** modeling plan (the approval gate is the agent's job)
   * @param deps the injected dependency bundle (entity factory, trainer, clock, strategist)
   * @param options optional run tunables (concurrency, prune rules, budget override)
   * @returns the experiment, session, iterations, final leaderboard, best model, and stop reason
   */
  public async runSession(
    plan: ModelingPlanSpec,
    deps: ExperimentDeps,
    options: ExperimentRunOptions = {},
  ): Promise<ExperimentSessionResult> {
    this.assertApproved(plan);

    const experiment = await this.resolveExperiment(plan, deps, options);
    const budget = this.resolveBudget(plan, options);
    const session = await this.createSession(plan, experiment, budget, deps, options);

    const concurrency = options.concurrency ?? DEFAULT_WAVE_CONCURRENCY;
    const strategist = deps.waveStrategist ?? new PlanOrderWaveStrategist();

    const iterations: MJExperimentSessionIterationEntity[] = [];
    const leaderboard: LeaderboardEntry[] = [];
    const modelsByIteration = new Map<string, MJMLModelEntity>();
    const remaining = [...plan.ProposedExperiments];
    const budgetState: BudgetState = { runs: 0, computeCost: 0, startedAtMs: deps.clock.now() };

    let stopReason: SessionStopReason = 'completed';
    let sequence = 0;
    let waveIndex = 0;

    while (true) {
      const wave = await this.nextWave(strategist, { plan, remaining, leaderboard, waveIndex, maxWaveSize: concurrency });
      if (wave.length === 0) {
        break;
      }
      this.removeFromRemaining(remaining, wave);

      const gate = this.gateBeforeWave(budget, budgetState, deps);
      if (gate.exceeded) {
        stopReason = gate.reason ?? 'budget-maxRuns';
        break;
      }

      const trimmedWave = this.trimWaveToBudget(wave, budget, budgetState);
      const waveResult = await this.runWave(
        trimmedWave,
        sequence,
        plan,
        session,
        deps,
        budget,
        budgetState,
        concurrency,
        iterations,
        leaderboard,
        modelsByIteration,
      );
      sequence += trimmedWave.length;
      stopReason = waveResult.stopReason;

      await this.applyPruning(leaderboard, iterations, options, deps);
      await this.snapshotLeaderboard(session, leaderboard, deps);

      if (waveResult.stopReason !== 'completed') {
        break;
      }
      waveIndex++;
    }

    const finalized = await this.finalizeSession(session, leaderboard, modelsByIteration, stopReason, deps);
    return {
      experiment,
      session,
      iterations,
      leaderboard: rankLeaderboard(leaderboard),
      bestModel: finalized,
      stopReason,
    };
  }

  // region: approval + setup ----------------------------------------------------

  /** Guard: the orchestrator only executes approved plans (§9.1). */
  private assertApproved(plan: ModelingPlanSpec): void {
    if (plan.Approved !== true) {
      throw new Error('ExperimentOrchestrator: plan is not approved — execution is gated on user approval (§9.1).');
    }
  }

  /**
   * Resolve (or create) the durable `MJ: Experiments` definition. When
   * `options.experimentID` is supplied, the caller already created one; otherwise
   * a new Active definition is created from the plan.
   */
  private async resolveExperiment(
    plan: ModelingPlanSpec,
    deps: ExperimentDeps,
    options: ExperimentRunOptions,
  ): Promise<MJExperimentEntity> {
    const experiment = await deps.entityFactory.getEntityObject<MJExperimentEntity>('MJ: Experiments', deps.contextUser);
    if (options.experimentID) {
      experiment.ID = options.experimentID;
    }
    experiment.Name = options.sessionName ?? this.deriveName(plan);
    experiment.Description = plan.Goal;
    experiment.ExperimentType = 'MLModelSearch';
    experiment.Goal = plan.Goal;
    experiment.TargetMetric = plan.TargetDefinition.SuccessMetric;
    experiment.Status = 'Active';
    await this.saveOrThrow(experiment, 'create Experiment definition');
    return experiment;
  }

  /** Budget = explicit override, else the plan's `ProposedBudget` (both optional). */
  private resolveBudget(plan: ModelingPlanSpec, options: ExperimentRunOptions): Budget {
    if (options.budget) {
      return options.budget;
    }
    return {
      MaxComputeCost: plan.ProposedBudget?.MaxComputeCost,
      MaxRuns: plan.ProposedBudget?.MaxRuns,
      MaxWallclockMinutes: plan.ProposedBudget?.MaxWallclockMinutes,
    };
  }

  /**
   * Create the `MJ: Experiment Sessions` row carrying the approved plan, budget,
   * and (optional) agent run. The session moves straight to `Running` (approval
   * already happened, §9.1).
   */
  private async createSession(
    plan: ModelingPlanSpec,
    experiment: MJExperimentEntity,
    budget: Budget,
    deps: ExperimentDeps,
    options: ExperimentRunOptions,
  ): Promise<MJExperimentSessionEntity> {
    const session = await deps.entityFactory.getEntityObject<MJExperimentSessionEntity>('MJ: Experiment Sessions', deps.contextUser);
    session.ExperimentID = experiment.ID;
    session.Name = options.sessionName ?? this.deriveName(plan);
    session.Goal = plan.Goal;
    session.Budget = JSON.stringify(budget);
    session.PlanSpec = JSON.stringify(plan);
    if (options.agentRunID) {
      session.AgentRunID = options.agentRunID;
    }
    session.Status = 'Running';
    await this.saveOrThrow(session, 'create Experiment Session');
    return session;
  }

  // region: wave loop -----------------------------------------------------------

  /** Ask the strategist for the next wave (the injectable "what-next" seam, §9.1). */
  private async nextWave(strategist: IWaveStrategist, context: WaveStrategistContext): Promise<ProposedExperiment[]> {
    const proposed = await strategist.proposeNextWave(context);
    return proposed ?? [];
  }

  /**
   * Run a single wave: create + train its iterations with bounded concurrency,
   * link each run to its iteration, score the iteration, and fold results into
   * the leaderboard. Budget is re-checked per-iteration so the session pauses at
   * the exact bound (no overrun).
   */
  private async runWave(
    wave: ProposedExperiment[],
    sequenceBase: number,
    plan: ModelingPlanSpec,
    session: MJExperimentSessionEntity,
    deps: ExperimentDeps,
    budget: Budget,
    budgetState: BudgetState,
    concurrency: number,
    iterations: MJExperimentSessionIterationEntity[],
    leaderboard: LeaderboardEntry[],
    modelsByIteration: Map<string, MJMLModelEntity>,
  ): Promise<{ stopReason: SessionStopReason }> {
    // Create all iteration rows up front (Pending) so sequence numbers are stable
    // and deterministic regardless of concurrent completion order.
    const created: Array<{ iteration: MJExperimentSessionIterationEntity; experiment: ProposedExperiment }> = [];
    for (let i = 0; i < wave.length; i++) {
      const iteration = await this.createIteration(session, wave[i], sequenceBase + i, deps);
      iterations.push(iteration);
      created.push({ iteration, experiment: wave[i] });
    }

    // Fold each completed train into the leaderboard + budget IMMEDIATELY as it
    // finishes (not after the whole wave) so the `shouldStop` predicate below sees
    // up-to-date budget state and can halt further dispatch the instant a bound
    // trips — no in-flight overrun (plan §8.4).
    let stopReason: SessionStopReason = 'completed';
    const foldOutcome = (outcome: {
      iterationId: string;
      scored: boolean;
      score: number;
      computeCost: number;
      model: MJMLModelEntity | null;
    }): void => {
      if (outcome.model) {
        modelsByIteration.set(outcome.iterationId, outcome.model);
      }
      if (outcome.scored) {
        leaderboard.push({ IterationID: outcome.iterationId, Metric: outcome.score, ModelID: outcome.model?.ID });
        budgetState.runs += 1;
        budgetState.computeCost += outcome.computeCost;
      }
      const gate = this.checkBudget(budget, budgetState, deps);
      if (gate.exceeded) {
        stopReason = gate.reason ?? 'budget-maxRuns';
      }
    };

    const tasks = created.map(({ iteration, experiment }) => async () => {
      const outcome = await this.trainIteration(iteration, experiment, plan, session, deps);
      foldOutcome(outcome);
      return outcome;
    });

    // Stop pulling new iterations the moment a budget bound has tripped — workers
    // consult this before claiming their next task, so no extra train is dispatched.
    await runBounded(tasks, concurrency, { shouldStop: () => stopReason !== 'completed' });
    return { stopReason };
  }

  /** Create a `Pending` iteration row for an experiment, then mark it `Running`. */
  private async createIteration(
    session: MJExperimentSessionEntity,
    experiment: ProposedExperiment,
    sequence: number,
    deps: ExperimentDeps,
  ): Promise<MJExperimentSessionIterationEntity> {
    const iteration = await deps.entityFactory.getEntityObject<MJExperimentSessionIterationEntity>(
      'MJ: Experiment Session Iterations',
      deps.contextUser,
    );
    iteration.ExperimentSessionID = session.ID;
    iteration.Sequence = sequence;
    iteration.Label = experiment.Label;
    iteration.Rationale = experiment.Rationale;
    iteration.Status = 'Pending';
    await this.saveOrThrow(iteration, 'create Experiment Session Iteration');
    return iteration;
  }

  /**
   * Train one iteration: mark it `Running`, call the trainer, link the run to the
   * iteration, set the normalized Score + costs, and mark it `Completed` (or
   * `Failed`). Returns a small outcome record for leaderboard/budget folding.
   */
  private async trainIteration(
    iteration: MJExperimentSessionIterationEntity,
    experiment: ProposedExperiment,
    plan: ModelingPlanSpec,
    session: MJExperimentSessionEntity,
    deps: ExperimentDeps,
  ): Promise<{ iterationId: string; scored: boolean; score: number; computeCost: number; model: MJMLModelEntity | null }> {
    iteration.Status = 'Running';
    await this.saveOrThrow(iteration, 'mark iteration Running');

    try {
      const result = await deps.trainer.train({
        experiment,
        plan,
        iterationId: iteration.ID,
        sessionId: session.ID,
        contextUser: deps.contextUser,
        provider: deps.provider,
      });

      const computeCost = result.ComputeCost ?? 0;
      iteration.Score = result.Score;
      iteration.ComputeCost = computeCost;
      iteration.TokensUsed = result.TokensUsed ?? 0;
      iteration.Status = 'Completed';
      await this.saveOrThrow(iteration, 'finalize iteration');
      return { iterationId: iteration.ID, scored: true, score: result.Score, computeCost, model: result.model };
    } catch (err) {
      await this.failIteration(iteration, err);
      return { iterationId: iteration.ID, scored: false, score: 0, computeCost: 0, model: null };
    }
  }

  /** Record a failed iteration (best-effort — never masks the loop's progress). */
  private async failIteration(iteration: MJExperimentSessionIterationEntity, err: unknown): Promise<void> {
    try {
      iteration.Status = 'Failed';
      iteration.Rationale = `${iteration.Rationale ?? ''}\nTraining failed: ${err instanceof Error ? err.message : String(err)}`.trim();
      const ok = await iteration.Save();
      if (!ok) {
        LogError(
          `ExperimentOrchestrator: failed to record iteration failure for ${iteration.ID}: ${iteration.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
      }
    } catch (saveErr) {
      LogError(`ExperimentOrchestrator: failed to record iteration failure: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
    }
  }

  // region: pruning -------------------------------------------------------------

  /**
   * Prune dominated branches after a wave (§8.3). Iterations dropped from the
   * leaderboard by the top-K / relative-threshold rules are marked `Pruned` with
   * a recorded rationale; their entries leave the leaderboard so they aren't
   * surfaced as winners.
   */
  private async applyPruning(
    leaderboard: LeaderboardEntry[],
    iterations: MJExperimentSessionIterationEntity[],
    options: ExperimentRunOptions,
    deps: ExperimentDeps,
  ): Promise<void> {
    const prunedIds = selectPrunedIterationIds(leaderboard, {
      keepTopK: options.keepTopK,
      relativePruneThreshold: options.relativePruneThreshold,
    });
    if (prunedIds.size === 0) {
      return;
    }
    const best = bestEntry(leaderboard);
    // Only entries whose `Pruned` status PERSISTED are dropped from the in-memory
    // leaderboard. If a save fails, the entry stays so the iteration isn't silently
    // lost (it remains a candidate winner with its DB Status still `Completed`).
    const persisted = new Set<string>();
    for (const id of prunedIds) {
      const iteration = iterations.find((it) => UUIDsEqual(it.ID, id));
      if (iteration && iteration.Status === 'Completed') {
        const saved = await this.markPruned(iteration, best, deps);
        if (saved) {
          persisted.add(id);
        }
      } else {
        // No completed iteration row to persist (already pruned/failed) — safe to drop.
        persisted.add(id);
      }
    }
    for (let i = leaderboard.length - 1; i >= 0; i--) {
      if (persisted.has(leaderboard[i].IterationID)) {
        leaderboard.splice(i, 1);
      }
    }
  }

  /**
   * Mark a single iteration `Pruned` with a deterministic rationale and persist it.
   * Returns whether the save succeeded so the caller can keep the leaderboard entry
   * when the persist fails (never silently drop an iteration whose status didn't stick).
   */
  private async markPruned(
    iteration: MJExperimentSessionIterationEntity,
    best: LeaderboardEntry | null,
    _deps: ExperimentDeps,
  ): Promise<boolean> {
    iteration.Status = 'Pruned';
    const bestNote = best ? ` (best so far scored ${best.Metric})` : '';
    iteration.Rationale = `${iteration.Rationale ?? ''}\nPruned: dominated branch, scored ${iteration.Score ?? 'n/a'}${bestNote}.`.trim();
    const ok = await iteration.Save();
    if (!ok) {
      LogError(
        `ExperimentOrchestrator: failed to persist Pruned status for iteration ${iteration.ID}: ${iteration.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
    }
    return ok;
  }

  // region: budget gate ---------------------------------------------------------

  /** Gate before a wave starts — used to pause cleanly when a bound is already hit. */
  private gateBeforeWave(budget: Budget, state: BudgetState, deps: ExperimentDeps): BudgetGateResult {
    return this.checkBudget(budget, state, deps);
  }

  /**
   * Trim a wave so it cannot exceed a `MaxRuns` budget — if only K more runs are
   * allowed, only the first K experiments of the wave are dispatched (no
   * overrun, §8.4).
   */
  private trimWaveToBudget(wave: ProposedExperiment[], budget: Budget, state: BudgetState): ProposedExperiment[] {
    if (budget.MaxRuns == null) {
      return wave;
    }
    const remainingRuns = Math.max(0, budget.MaxRuns - state.runs);
    return wave.slice(0, remainingRuns);
  }

  /**
   * Evaluate the session budget (§8.4): MaxRuns, MaxComputeCost, and
   * MaxWallclockMinutes (via the injected clock). Returns the first bound hit.
   */
  private checkBudget(budget: Budget, state: BudgetState, deps: ExperimentDeps): BudgetGateResult {
    if (budget.MaxRuns != null && state.runs >= budget.MaxRuns) {
      return { exceeded: true, reason: 'budget-maxRuns' };
    }
    if (budget.MaxComputeCost != null && state.computeCost >= budget.MaxComputeCost) {
      return { exceeded: true, reason: 'budget-maxComputeCost' };
    }
    if (budget.MaxWallclockMinutes != null) {
      const elapsedMin = (deps.clock.now() - state.startedAtMs) / 60000;
      if (elapsedMin >= budget.MaxWallclockMinutes) {
        return { exceeded: true, reason: 'budget-maxWallclock' };
      }
    }
    return { exceeded: false };
  }

  // region: leaderboard snapshot + finalize ------------------------------------

  /** Persist the ranked leaderboard JSON snapshot onto the session (§9.2). */
  private async snapshotLeaderboard(
    session: MJExperimentSessionEntity,
    leaderboard: LeaderboardEntry[],
    _deps: ExperimentDeps,
  ): Promise<void> {
    session.Leaderboard = JSON.stringify(rankLeaderboard(leaderboard));
    const ok = await session.Save();
    if (!ok) {
      LogError(`ExperimentOrchestrator: failed to snapshot leaderboard for session ${session.ID}: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  }

  /**
   * Finalize the session: `Completed` when the plan ran out cleanly, or `Paused`
   * when a budget bound stopped it (clean pause, never overrun). Surfaces the
   * best model.
   */
  private async finalizeSession(
    session: MJExperimentSessionEntity,
    leaderboard: LeaderboardEntry[],
    modelsByIteration: Map<string, MJMLModelEntity>,
    stopReason: SessionStopReason,
    deps: ExperimentDeps,
  ): Promise<MJMLModelEntity | null> {
    const best = bestEntry(leaderboard);
    const bestModel = best ? modelsByIteration.get(best.IterationID) ?? null : null;

    session.Leaderboard = JSON.stringify(rankLeaderboard(leaderboard));
    session.Status = stopReason === 'completed' ? 'Completed' : 'Paused';
    await this.saveOrThrow(session, `finalize session (${stopReason})`);
    return bestModel;
  }

  // region: helpers -------------------------------------------------------------

  /** Remove the dispatched wave's experiments from the remaining pool (by identity). */
  private removeFromRemaining(remaining: ProposedExperiment[], wave: ProposedExperiment[]): void {
    for (const experiment of wave) {
      const idx = remaining.indexOf(experiment);
      if (idx >= 0) {
        remaining.splice(idx, 1);
      }
    }
  }

  /** Derive a session/experiment name from the plan goal (first 80 chars). */
  private deriveName(plan: ModelingPlanSpec): string {
    const goal = (plan.Goal ?? '').trim();
    const base = goal.length > 0 ? goal : `${plan.TargetDefinition.EntityName} ${plan.TargetDefinition.ProblemType}`;
    return base.length > 80 ? `${base.slice(0, 77)}...` : base;
  }

  /**
   * Save a BaseEntity and throw with `LatestResult.CompleteMessage` on failure
   * (Save returns boolean, never throws on logical failure — CLAUDE.md).
   */
  private async saveOrThrow(
    entity: MJExperimentEntity | MJExperimentSessionEntity | MJExperimentSessionIterationEntity,
    what: string,
  ): Promise<void> {
    const ok = await entity.Save();
    if (!ok) {
      const message = entity.LatestResult?.CompleteMessage ?? 'unknown error';
      throw new Error(`ExperimentOrchestrator: failed to ${what}: ${message}`);
    }
  }
}

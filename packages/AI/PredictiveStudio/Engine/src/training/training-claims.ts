/**
 * @module training/training-claims
 *
 * Single-flight training per pipeline (D4-12, §5.7 R2): the claim is the training run row itself. One provider
 * transaction takes the pipeline lock (`Predictive Studio: Lock Pipeline For Publish`, the 30 s retry of
 * {@link PublishLocks}), reads `Predictive Studio: Running Training Run` (the pipeline's newest `Running` run younger
 * than the stale threshold) and, when there is none, saves the new run row `Running` before it commits. Two claims of
 * one pipeline therefore read the running run in turn, and the second sees the row the first committed.
 *
 * **Why a claim row and not `sp_getapplock`.** Outside a transaction an SQL Server request takes a connection from the
 * pool, so a session lock cannot be held across auto-train's calls; a row committed by a short transaction can (D4-12).
 *
 * **Within one process.** A shared provider instance has one transaction stack: a second unit of work that begins a
 * transaction while another is open joins it as a savepoint (#4786, `GenericDatabaseProvider`), so its lock query
 * would not wait and both claims would pass. Claims of one pipeline in this process are therefore run one after another
 * ({@link PipelineClaimQueue}); across processes and per-request providers the pipeline lock serialises them.
 */
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { BaseSingleton, UUIDMap } from '@memberjunction/global';

import { PipelineLockTimeoutError } from '../registry/model-versions';
import { ProviderTransactions } from '../registry/provider-transactions';
import { PUBLISH_LOCK_QUERIES, PublishLocks, SYSTEM_CLOCK, type GateClock } from '../registry/publish-locks';
import type { RegistryContext } from '../registry/registry-context';
import type { TrainingDeps } from './types';

/** The claim's outcome: the saved `Running` run, or the run that already holds the pipeline. */
export type PipelineClaim =
  | { readonly Claimed: true; readonly Run: MJMLTrainingRunEntity }
  | { readonly Claimed: false; readonly InFlightRunID: string };

/** What a claim reads: the provider and user it runs as, and the clock the stale threshold is measured on. */
export type TrainingClaimDeps = Pick<TrainingDeps, 'provider' | 'contextUser' | 'now'>;

/** Thrown when a single-flight training finds another run of the pipeline in flight; no run row was written. */
export class TrainingInFlightError extends Error {
  /**
   * @param PipelineID the pipeline that is being trained
   * @param InFlightRunID the `MJ: ML Training Runs` row that holds it
   */
  constructor(public readonly PipelineID: string, public readonly InFlightRunID: string) {
    super(`Predictive Studio: training pipeline ${PipelineID} is already being trained by run ${InFlightRunID}, so no second run was started.`);
    this.name = 'TrainingInFlightError';
  }
}

/** The process-wide queue that runs the claims of one pipeline one after another (see the module comment). */
export class PipelineClaimQueue extends BaseSingleton<PipelineClaimQueue> {
  /** The last queued claim of each pipeline (IDs compared as UUIDs); removed when it is the last and settles. */
  private readonly tails = new UUIDMap<Promise<void>>();

  protected constructor() {
    super();
  }

  /** The process's one instance. */
  public static get Instance(): PipelineClaimQueue {
    return super.getInstance<PipelineClaimQueue>();
  }

  /** Runs `work` after every earlier queued claim of the pipeline has settled, whatever their outcome. */
  public async Run<T>(pipelineId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.Get(pipelineId) || Promise.resolve();
    let release: () => void = () => undefined;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.Set(pipelineId, tail);
    try {
      await previous;
      return await work();
    } finally {
      release();
      if (this.tails.Get(pipelineId) === tail) this.tails.Delete(pipelineId);
    }
  }
}

/** The single-flight claim of a pipeline's training. */
export class TrainingClaims {
  /**
   * How old a `Running` run may be and still hold its pipeline, in hours (R7 (e)'s default, 6 h). A run that never
   * finished (its process died) stops blocking new claims after this long; the registry job then marks it failed.
   */
  public static readonly STALE_AFTER_HOURS = 6;

  /**
   * Claims the pipeline for one training: in one provider transaction, the pipeline lock, then the running-run read,
   * then `run` saved `Running` (with `StartedAt` from `deps.now`, default the current time) and committed. When a
   * `Running` run of the pipeline started within `staleAfterHours`, nothing is saved, the transaction is rolled back
   * and that run is returned.
   *
   * @param run the new, unsaved run row (its other columns set by the caller); saved by the claim
   * @param clock the clock the lock wait sleeps on (tests pass a fake)
   * @throws EntityTransactionsUnsupportedError when the provider cannot open a transaction (nothing runs)
   * @throws PipelineLockTimeoutError when the pipeline lock is not acquired within the lock wait
   * @throws Error when the running-run read fails or the run row cannot be saved (the transaction is rolled back)
   */
  public static async ClaimPipeline(
    pipelineId: string, staleAfterHours: number, deps: TrainingClaimDeps, run: MJMLTrainingRunEntity, clock: GateClock = SYSTEM_CLOCK,
  ): Promise<PipelineClaim> {
    const ctx: RegistryContext = { ContextUser: deps.contextUser, Provider: deps.provider };
    return PipelineClaimQueue.Instance.Run(pipelineId, () =>
      ProviderTransactions.Run(
        ctx,
        `the training claim of pipeline ${pipelineId}`,
        () => TrainingClaims.claimUnderLock(pipelineId, staleAfterHours, deps, run, ctx, clock),
        (claim) => claim.Claimed,
      ),
    );
  }

  /**
   * The single-flight run row of `TrainingEngine` (`TrainModelInput.SingleFlight`): {@link ClaimPipeline} with
   * {@link STALE_AFTER_HOURS}; returns the saved run.
   *
   * @throws TrainingInFlightError naming the run that holds the pipeline, when one does
   */
  public static async SaveClaimedRun(pipelineId: string, run: MJMLTrainingRunEntity, deps: TrainingClaimDeps): Promise<MJMLTrainingRunEntity> {
    const claim = await TrainingClaims.ClaimPipeline(pipelineId, TrainingClaims.STALE_AFTER_HOURS, deps, run);
    if (claim.Claimed === false) throw new TrainingInFlightError(pipelineId, claim.InFlightRunID);
    return claim.Run;
  }

  /** The ISO 8601 UTC instant before which a `Running` run is stale: `now` minus `staleAfterHours`. Pure. */
  public static StaleBefore(now: Date, staleAfterHours: number): string {
    return new Date(now.getTime() - staleAfterHours * 3_600_000).toISOString();
  }

  /** The claim's work inside its transaction (the lock lasts as long as it). */
  private static async claimUnderLock(
    pipelineId: string, staleAfterHours: number, deps: TrainingClaimDeps, run: MJMLTrainingRunEntity, ctx: RegistryContext, clock: GateClock,
  ): Promise<PipelineClaim> {
    const lock = await PublishLocks.Acquire(PUBLISH_LOCK_QUERIES.LockPipeline, { PipelineID: pipelineId }, ctx, clock);
    if (lock.Acquired === false) throw new PipelineLockTimeoutError(pipelineId, lock.Attempts, lock.LastError);
    const now = deps.now ? deps.now() : new Date();
    const inFlight = await PublishLocks.RunStored(PUBLISH_LOCK_QUERIES.RunningTrainingRun, { PipelineID: pipelineId, StartedAfter: TrainingClaims.StaleBefore(now, staleAfterHours) }, ctx);
    if (!inFlight.Success) throw new Error(`Predictive Studio: reading the running training run of pipeline ${pipelineId} failed: ${inFlight.ErrorMessage || 'unknown error'}`);
    const holder = inFlight.Results[0]?.ID;
    if (typeof holder === 'string' && holder !== '') return { Claimed: false, InFlightRunID: holder };
    run.PipelineID = pipelineId;
    run.Status = 'Running';
    run.StartedAt = now;
    if (!(await run.Save())) throw new Error(`Predictive Studio: the claimed training run of pipeline ${pipelineId} could not be saved: ${run.LatestResult?.CompleteMessage || 'unknown error'}`);
    return { Claimed: true, Run: run };
  }
}

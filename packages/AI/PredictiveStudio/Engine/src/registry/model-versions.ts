/**
 * @module registry/model-versions
 *
 * Model versions allocated under the pipeline lock (F-EXP-4, `UX_MLModel_PipelineVersion`): the pipeline row is locked
 * with the publish lock (`Predictive Studio: Lock Pipeline For Publish`, the 30 s retry of {@link PublishLocks}), then
 * the next version is read by the stored Query `Predictive Studio: Next Model Version` (`MAX(Version) + 1` under
 * `UPDLOCK, HOLDLOCK`). Every writer of a model row takes the pipeline lock first, so two allocations for one pipeline
 * cannot interleave. Both calls run inside the caller's transaction ({@link ProviderTransactions.Run}): the lock lasts
 * only as long as it. {@link ModelVersions.SaveNewRow} opens that transaction itself.
 */
import type { MJMLModelEntity } from '@memberjunction/core-entities';

import { ProviderTransactions } from './provider-transactions';
import { PUBLISH_LOCK_QUERIES, PublishLocks, SYSTEM_CLOCK, type GateClock } from './publish-locks';
import type { RegistryContext } from './registry-context';

/** Thrown when the pipeline lock could not be taken within the lock wait (another publish or allocation holds it). */
export class PipelineLockTimeoutError extends Error {
  constructor(public readonly PipelineID: string, public readonly Attempts: number, public readonly LastError: string) {
    super(`Predictive Studio: the pipeline ${PipelineID} stayed locked for ${PublishLocks.LOCK_WAIT_MS / 1000} s (${Attempts} attempts); last: ${LastError}`);
    this.name = 'PipelineLockTimeoutError';
  }
}

/** Thrown when a model row could not be saved with an allocated version, naming the attempts and the save's message. */
export class ModelVersionSaveError extends Error {
  constructor(public readonly PipelineID: string, public readonly Versions: readonly number[], public readonly SaveMessage: string) {
    super(`Predictive Studio: the model row of pipeline ${PipelineID} could not be saved as version ${Versions.join(', then ')}: ${SaveMessage}`);
    this.name = 'ModelVersionSaveError';
  }
}

/** Version allocation for new model rows. */
export class ModelVersions {
  /**
   * Locks the pipeline row and returns its next model version. Call it inside a transaction.
   *
   * @throws PipelineLockTimeoutError when the pipeline lock is not acquired within the lock wait
   * @throws Error when the version Query fails or returns no number
   */
  public static async AllocateUnderLock(pipelineId: string, ctx: RegistryContext, clock: GateClock = SYSTEM_CLOCK): Promise<number> {
    const lock = await PublishLocks.Acquire(PUBLISH_LOCK_QUERIES.LockPipeline, { PipelineID: pipelineId }, ctx, clock);
    if (lock.Acquired === false) throw new PipelineLockTimeoutError(pipelineId, lock.Attempts, lock.LastError);
    return ModelVersions.readNextVersion(pipelineId, ctx);
  }

  /**
   * Saves a new model row with a version allocated under the pipeline lock. A failed save is retried once, with a newly
   * read version, only when the re-read shows the attempted version was taken meanwhile (a writer that did not take the
   * pipeline lock: `UX_MLModel_PipelineVersion` refused the row). The decision reads the stored versions rather than the
   * error, because a failed `Save()` reports only its message. Any other failure, or a second failure, is thrown.
   * Call it inside a transaction.
   *
   * @throws PipelineLockTimeoutError when the pipeline lock is not acquired within the lock wait
   * @throws ModelVersionSaveError when the row cannot be saved
   */
  public static async SaveUnderLock(model: MJMLModelEntity, ctx: RegistryContext, clock: GateClock = SYSTEM_CLOCK): Promise<void> {
    const pipelineId = model.PipelineID;
    model.Version = await ModelVersions.AllocateUnderLock(pipelineId, ctx, clock);
    if (await model.Save()) return;
    const first = model.Version;
    const firstMessage = model.LatestResult?.CompleteMessage || 'unknown error';
    const reread = await ModelVersions.readNextVersion(pipelineId, ctx);
    if (reread <= first) throw new ModelVersionSaveError(pipelineId, [first], firstMessage);
    model.Version = reread;
    if (await model.Save()) return;
    throw new ModelVersionSaveError(pipelineId, [first, reread], model.LatestResult?.CompleteMessage || 'unknown error');
  }

  /**
   * Saves a new model row in one provider transaction of its own ({@link ProviderTransactions.Run} around
   * {@link SaveUnderLock}): the pipeline lock, the version read and the save all run inside it, so the lock is held
   * until the row is written and no other writer of the pipeline can read the same next version in between. This is
   * the trainer's model-row write (`TrainingEngine`), and what the adversarial harness races twelve times at once.
   *
   * @throws EntityTransactionsUnsupportedError when the provider cannot open a transaction (nothing runs)
   * @throws PipelineLockTimeoutError when the pipeline lock is not acquired within the lock wait
   * @throws ModelVersionSaveError when the row cannot be saved (the transaction is rolled back)
   */
  public static async SaveNewRow(model: MJMLModelEntity, ctx: RegistryContext, clock: GateClock = SYSTEM_CLOCK): Promise<void> {
    await ProviderTransactions.Run(ctx, `the model row of pipeline ${model.PipelineID}`, () => ModelVersions.SaveUnderLock(model, ctx, clock));
  }

  /** The `NextVersion` the version Query returns for the pipeline (1 for a pipeline with no model). */
  private static async readNextVersion(pipelineId: string, ctx: RegistryContext): Promise<number> {
    const r = await PublishLocks.RunStored(PUBLISH_LOCK_QUERIES.NextModelVersion, { PipelineID: pipelineId }, ctx);
    if (!r.Success) throw new Error(`Predictive Studio: reading the next model version of pipeline ${pipelineId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const next = Number(r.Results[0]?.NextVersion);
    if (!Number.isInteger(next) || next < 1) throw new Error(`Predictive Studio: the next model version of pipeline ${pipelineId} is not a positive integer (${String(r.Results[0]?.NextVersion)})`);
    return next;
  }
}

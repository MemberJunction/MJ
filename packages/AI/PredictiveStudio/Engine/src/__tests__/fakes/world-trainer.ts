/**
 * `WorldTrainer` — auto-train's train step over a {@link GateWorld}: what `TrainingEngine.trainModel` does with
 * `SingleFlight: true`, without the sidecar. The run row is saved through the real single-flight claim
 * (`TrainingClaims.SaveClaimedRun`, on the store's provider: the pipeline lock, the running-run read, the save), so a
 * second training of the pipeline in flight is refused exactly as in production; then the world stores the run's
 * results for the next queued outcome ({@link WorldTrainer.NextOutcome}) and, for a run that ships, its Draft model.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';

import type { AutoTrainedRun } from '../../scoring/auto-train';
import { TrainingClaims } from '../../training/training-claims';
import type { GateWorld } from './gate-test-store';

/** What the next training produces: the finalist ships, the simple baseline is kept, or nothing ships. */
export type WorldTrainingOutcome = 'model' | 'keep' | 'no-signal';

/** The world's trainer: claims the pipeline, then completes the run with the queued outcome (default `model`). */
export class WorldTrainer {
  private readonly outcomes: WorldTrainingOutcome[] = [];
  /** How many trainings got past the claim. */
  public Trainings = 0;

  /**
   * @param world the stored rows the run is completed in
   * @param now the clock the claim's stale threshold and `StartedAt` read (the auto-trainer's clock)
   */
  constructor(private readonly world: GateWorld, private readonly now: () => Date) {}

  /** Queues the outcome of the next training. */
  public NextOutcome(outcome: WorldTrainingOutcome): void {
    this.outcomes.push(outcome);
  }

  /**
   * The train step (`PipelineAutoTrainer`'s `train` option). Training takes longer than a claim: after the claim it
   * yields to the event loop once, so a concurrent auto-train reaches its own claim while this run is still `Running`.
   *
   * @throws TrainingInFlightError when another run of the pipeline is in flight
   */
  public readonly Train = async (pipelineId: string, provider: IMetadataProvider, user: UserInfo): Promise<AutoTrainedRun> => {
    const run = await provider.GetEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs', user);
    run.NewRecord();
    await TrainingClaims.SaveClaimedRun(pipelineId, run, { provider, contextUser: user, now: this.now });
    this.Trainings++;
    await new Promise<void>((resolve) => setImmediate(resolve));
    return this.world.TrainRun(run.ID, this.outcomes.shift() || 'model');
  };
}

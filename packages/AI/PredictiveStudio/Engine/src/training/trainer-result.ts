/**
 * @module training/trainer-result
 *
 * Records a trainer's {@link TrainerResult} on its `MJ: ML Training Runs` row. Real compute is recorded on every
 * outcome (`ComputeSeconds` is the trainer's `computeSeconds`; `ComputeCost` prices it); a failed result records its
 * stage and message and no metrics; a completed result whose `CodeVersion` lacks a required library version or
 * the thread count is refused as a lineage gap: such a run cannot be reproduced, so it is not marked Completed. The
 * gate decision is not recorded here: the gate record stores the decision computed in TypeScript.
 */
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { TrainerContract, type TrainerResult } from '@memberjunction/predictive-studio-core';
import { ComputePricing } from './compute-cost';

/** The run fields the trainer result writes. */
export type TrainerRunTarget = Pick<MJMLTrainingRunEntity, 'Status' | 'CompletedAt' | 'ComputeSeconds' | 'ComputeCost' | 'Notes' | 'CodeVersion'>;

/** Thrown when a completed result's lineage is incomplete; the run is left Failed with the gaps in its notes. */
export class TrainerLineageRefusedError extends Error {
  public readonly Gaps: readonly string[];
  constructor(gaps: readonly string[]) {
    super(`Trainer result refused: its CodeVersion lacks ${gaps.join(', ')}`);
    this.name = 'TrainerLineageRefusedError';
    this.Gaps = gaps;
  }
}

/** Records a trainer result on its run row. */
export class TrainerRunRecorder {
  /**
   * Writes status, completion time, compute seconds and cost, code version and notes. Does not save: the caller saves
   * the run (and checks `Save()`'s result) in the same flow that registers the artifacts.
   *
   * @throws TrainerLineageRefusedError when a completed result's `CodeVersion` has lineage gaps (the run is
   * marked Failed first, with its compute recorded)
   */
  public static ApplyTrainerResultToRun(run: TrainerRunTarget, result: TrainerResult, usdPerSecond: number | null): void {
    run.ComputeSeconds = result.computeSeconds;
    run.ComputeCost = ComputePricing.ComputeCostFor(result.computeSeconds, usdPerSecond);
    run.CompletedAt = new Date();
    if (result.status === 'failed') {
      run.Status = 'Failed';
      run.Notes = `Trainer failed at stage '${result.stage}': ${result.message}`;
      return;
    }
    const gaps = TrainerContract.CodeVersionGaps(result.codeVersion);
    if (gaps.length > 0) {
      run.Status = 'Failed';
      run.Notes = `Trainer result refused: CodeVersion lacks ${gaps.join(', ')}`;
      throw new TrainerLineageRefusedError(gaps);
    }
    run.CodeVersion = JSON.stringify(result.codeVersion);
    run.Status = 'Completed';
    run.Notes = `Trainer completed: finalist '${result.finalist}'.`;
  }
}

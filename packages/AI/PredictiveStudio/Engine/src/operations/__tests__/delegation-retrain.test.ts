import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MatrixData, TrainRequest, TrainResponse, TrainerRequest, TrainerResult } from '@memberjunction/predictive-studio-core';
import { TrainingDelegation } from '../delegation';
import { SnapshotRetrainer, type RetrainResult } from '../../snapshot/snapshot-retrainer';
import type { ISidecarTrainer, ITrainerEvaluator, TrainingDeps } from '../../training/types';

/** A provider whose RunView answers no rows (the deps builder only looks up the active File Storage Provider). */
const provider = {
  CurrentUser: { Email: 'spy@example.com' } as UserInfo,
  async RunView<T>(_params: RunViewParams): Promise<RunViewResult<T>> {
    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
  },
} as unknown as IMetadataProvider;
const user = { ID: 'user-1', Email: 'u@example.com' } as UserInfo;

/** A trainer for both seams that is never called: the retrainer below only records the deps it was given. */
class BothSeams implements ISidecarTrainer, ITrainerEvaluator {
  public async train(_req: TrainRequest, _holdout?: MatrixData): Promise<TrainResponse> { throw new Error('not called'); }
  public async RunTrainer(_req: TrainerRequest): Promise<TrainerResult> { throw new Error('not called'); }
}

/** Records the deps a retrain was given. */
class RecordingRetrainer extends SnapshotRetrainer {
  public Deps: TrainingDeps | null = null;
  public override async Retrain(trainingRunId: string, deps: TrainingDeps): Promise<RetrainResult> {
    this.Deps = deps;
    return { TrainingRunID: trainingRunId, TrainingSnapshotID: 'S', FilesVerified: true, ContentHashVerified: true, Original: {}, Retrained: {}, MaxAbsDiff: 0, Reproduced: false };
  }
}

describe('TrainingDelegation.RetrainFromSnapshotViaEngine', () => {
  it('retrains on the given trainer for both the legacy seam and the protocol trainer', async () => {
    const override = new BothSeams();
    const retrainer = new RecordingRetrainer();
    await TrainingDelegation.RetrainFromSnapshotViaEngine('RUN-1', provider, user, override, retrainer);
    expect(retrainer.Deps?.sidecar).toBe(override);
    expect(retrainer.Deps?.trainer).toBe(override);
  });

  it('keeps the production trainer, shared by both seams, without an override', async () => {
    const retrainer = new RecordingRetrainer();
    await TrainingDelegation.RetrainFromSnapshotViaEngine('RUN-1', provider, user, undefined, retrainer);
    expect(retrainer.Deps?.trainer).toBe(retrainer.Deps?.sidecar);
  });
});

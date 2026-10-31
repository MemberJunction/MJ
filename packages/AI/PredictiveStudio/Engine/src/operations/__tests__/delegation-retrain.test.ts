import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { TrainerRequest, TrainerResult } from '@memberjunction/predictive-studio-core';
import { TrainingDelegation } from '../delegation';
import { SnapshotRetrainer, type RetrainResult } from '../../snapshot/snapshot-retrainer';
import { MJSidecarTrainer } from '../../training/seams';
import type { ITrainerEvaluator, TrainingDeps } from '../../training/types';

/** A provider whose RunView answers no rows (the deps builder only looks up the active File Storage Provider). */
const provider = {
  CurrentUser: { Email: 'spy@example.com' } as UserInfo,
  async RunView<T>(_params: RunViewParams): Promise<RunViewResult<T>> {
    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
  },
} as unknown as IMetadataProvider;
const user = { ID: 'user-1', Email: 'u@example.com' } as UserInfo;

/** A trainer that is never called: the retrainer below only records the deps it was given. */
class UncalledTrainer implements ITrainerEvaluator {
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
  it('retrains on the given trainer', async () => {
    const override = new UncalledTrainer();
    const retrainer = new RecordingRetrainer();
    await TrainingDelegation.RetrainFromSnapshotViaEngine('RUN-1', provider, user, override, retrainer);
    expect(retrainer.Deps?.trainer).toBe(override);
  });

  it('keeps the production trainer without an override', async () => {
    const retrainer = new RecordingRetrainer();
    await TrainingDelegation.RetrainFromSnapshotViaEngine('RUN-1', provider, user, undefined, retrainer);
    expect(retrainer.Deps?.trainer).toBeInstanceOf(MJSidecarTrainer);
  });
});

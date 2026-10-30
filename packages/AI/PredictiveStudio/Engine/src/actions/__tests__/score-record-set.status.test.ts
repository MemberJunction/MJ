import { describe, it, expect } from 'vitest';
import type { BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import { ModelNeedsTrainingError, ModelNotScorableError } from '../../scoring/model-readiness';
import type { IMLModelLoader, ISidecarPredictor, MLInferenceDeps } from '../../scoring/types';

/** The model fields loadModel reads before the status check. */
class StatusModel {
  constructor(public readonly Status: MJMLModelEntity['Status'], public readonly ID = 'm1', public readonly ArtifactFileID: string | null = 'file-1') {}
}

class Loader implements IMLModelLoader {
  constructor(private readonly model: StatusModel) {}
  async loadModel(): Promise<MJMLModelEntity | null> {
    // Test double: loadModel's callers read only ID, ArtifactFileID and Status before the status refusal.
    return this.model as unknown as MJMLModelEntity;
  }
}

class CountingSidecar implements ISidecarPredictor {
  public Calls = 0;
  async predict(_req: PredictRequest): Promise<PredictResponse> {
    this.Calls++;
    return { predictions: [] };
  }
}

/** Counts Save() calls on the write-back target. */
class SaveCounter {
  public Saves = 0;
  public get EntityInfo() {
    return { Name: 'Members', Fields: [{ Name: 'TruthScore' }] };
  }
  public Set(_field: string, _value: number | string | null): void {}
  public async Save(): Promise<boolean> {
    this.Saves++;
    return true;
  }
}

class TestRunner extends ProductionScoreRecordSetRunner {
  constructor(deps: MLInferenceDeps, public readonly Target: SaveCounter) {
    super({ deps });
  }
  protected override async resolveTargetEntity(_record: RecordRef): Promise<BaseEntity> {
    return this.Target as unknown as BaseEntity;   // test double: write-back reads EntityInfo and calls Set/Save only
  }
}

describe('ProductionScoreRecordSetRunner — refused models write nothing (W1 → S7.3)', () => {
  for (const status of ['Draft', 'Archived'] as const) {
    it(`a ${status} model with write-back throws before scoring and saves 0 rows`, async () => {
      const artifacts = new InMemoryArtifactLoader();
      artifacts.Set('file-1', new TextEncoder().encode('bytes'));
      const sidecar = new CountingSidecar();
      const runner = new TestRunner({ modelLoader: new Loader(new StatusModel(status)), artifactLoader: artifacts, sidecar }, new SaveCounter());
      await expect(
        runner.run({
          modelId: 'm1',
          scope: { records: [{ ID: 'r1' }, { ID: 'r2' }] },
          writeBack: { OutputMapping: { fields: { TruthScore: '$.score' } } },
          contextUser: { ID: 'u1' } as unknown as UserInfo,          // test doubles: the refusal happens before either is used
          provider: {} as unknown as IMetadataProvider,
        }),
      ).rejects.toThrow(`is ${status} and cannot score records`);
      expect(sidecar.Calls).toBe(0);
      expect(runner.Target.Saves).toBe(0);
    });
  }
});

describe('ProductionScoreRecordSetRunner — status and artifact refusal order', () => {
  /** Run a no-write-back score against a model with this status and artifact reference. */
  const scoreWith = (status: MJMLModelEntity['Status'], artifactFileId: string | null) => {
    const runner = new TestRunner(
      { modelLoader: new Loader(new StatusModel(status, 'm1', artifactFileId)), artifactLoader: new InMemoryArtifactLoader(), sidecar: new CountingSidecar() },
      new SaveCounter(),
    );
    return runner.run({
      modelId: 'm1',
      scope: { records: [{ ID: 'r1' }] },
      contextUser: { ID: 'u1' } as unknown as UserInfo,          // test doubles: the refusal happens before either is used
      provider: {} as unknown as IMetadataProvider,
    });
  };

  it('a Draft with no artifact needs training (the auto-train path reacts to this)', async () => {
    await expect(scoreWith('Draft', null)).rejects.toBeInstanceOf(ModelNeedsTrainingError);
  });

  it('an Archived model with no artifact is refused for its status, not sent to training', async () => {
    await expect(scoreWith('Archived', null)).rejects.toBeInstanceOf(ModelNotScorableError);
  });

  it('a Published model with no artifact needs training', async () => {
    await expect(scoreWith('Published', null)).rejects.toBeInstanceOf(ModelNeedsTrainingError);
  });
});

describe('ProductionScoreRecordSetRunner — a refused model never reads its scope', () => {
  class ScopeCountingRunner extends TestRunner {
    public ScopeReads = 0;
    protected override async resolveScope(): Promise<RecordRef[]> {
      this.ScopeReads++;
      return [];
    }
  }

  it('an Archived model is refused before the scope is resolved', async () => {
    const runner = new ScopeCountingRunner(
      { modelLoader: new Loader(new StatusModel('Archived')), artifactLoader: new InMemoryArtifactLoader(), sidecar: new CountingSidecar() },
      new SaveCounter(),
    );
    await expect(
      runner.run({
        modelId: 'm1',
        scope: { filter: { entityName: 'Members' } },
        contextUser: { ID: 'u1' } as unknown as UserInfo,          // test doubles: the refusal happens before either is used
        provider: {} as unknown as IMetadataProvider,
      }),
    ).rejects.toBeInstanceOf(ModelNotScorableError);
    expect(runner.ScopeReads).toBe(0);
  });
});

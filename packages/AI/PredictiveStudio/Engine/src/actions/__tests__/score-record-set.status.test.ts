import { describe, it, expect } from 'vitest';
import type { BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import type { IMLModelLoader, ISidecarPredictor, MLInferenceDeps } from '../../scoring/types';

/** The model fields loadModel reads before the status check. */
class StatusModel {
  constructor(public readonly Status: 'Draft' | 'Archived', public readonly ID = 'm1', public readonly ArtifactFileID = 'file-1') {}
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
      artifacts.set('file-1', new TextEncoder().encode('bytes'));
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

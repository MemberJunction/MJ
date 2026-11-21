/**
 * The production model runtime's assembly of a model trained without a Prediction Unit (Task M5.6): it reads the
 * scope's rows from the scope's own entity, and a feature column those rows lack comes back as the missing-columns
 * outcome (refused `feature-schema-mismatch` by the service, naming the column), never re-read from the training entity.
 */
import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { UUIDSet } from '@memberjunction/global';
import { resolveOutcomeConfig } from '@memberjunction/predictive-studio-core';

import { FeatureAssemblyExecutor, type FeatureAssemblyResult, type SourceRow } from '../../feature-assembly';
import { MLModelInferenceProcessor } from '../ml-model-inference-processor';
import { InferenceScoringRuntime, MemoizedScoringRuntime, type IScoringModelRuntime, type IScoringPreparedModel } from '../scoring-seams';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { ScoringContext } from '../scoring-context';
import type { LoadedModel } from '../types';

/** The copy table the scope names: its rows carry the renamed `DistanceZMiles`, not the trained `DistanceZ`. */
const COPY_ROWS: Record<string, SourceRow> = { r1: { ID: 'r1', Tenure: 4, DistanceZMiles: 1.5 }, r2: { ID: 'r2', Tenure: 9, DistanceZMiles: 0.2 } };

/** A provider whose `RunViews` serves the copy table and records every entity read. */
class CopyTableProvider {
  public readonly Reads: string[] = [];
  public async RunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
    return params.map((p) => {
      this.Reads.push(String(p.EntityName));
      const ids = [...String(p.ExtraFilter).matchAll(/'([^']*)'/g)].map((m) => m[1]);
      const rows = p.EntityName === 'Copy Table' ? ids.map((id) => COPY_ROWS[id]).filter((r) => r !== undefined) : [];
      // Test double: RunViews hands back the field bags the runtime reads.
      return { Success: true, Results: rows as unknown as T[], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
    });
  }
}

/** The processor with its transform-only assembly over the frozen select step (the real executor, context on-demand). */
class SelectProcessor extends MLModelInferenceProcessor {
  public override async AssembleTransformOnly(rows: SourceRow[], context: RecordProcessorContext): Promise<FeatureAssemblyResult> {
    return new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Training Table', records: rows, sources: [{ Kind: 'Entity', Ref: 'Training Table' }],
      steps: { Steps: [{ Id: 's1', Kind: 'select', Columns: ['Tenure', 'DistanceZ'] }] }, asOf: { Mode: 'none' },
      leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 }, context: 'on-demand', contextUser: context.ContextUser, provider: context.Provider,
    });
  }
}

const LOADED: LoadedModel = {
  modelId: 'm1', targetEntityName: 'Training Table', artifactB64: '', fittedPreprocessing: {}, featureSchema: [{ Name: 'Tenure', Kind: 'numeric' }, { Name: 'DistanceZ', Kind: 'numeric' }],
  problemType: 'classification', targetVariable: 'Renewed', sourceBindings: [], featureSteps: { Steps: [] }, asOf: { Mode: 'none' },
  leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 }, outcomeConfig: resolveOutcomeConfig(), unit: null, trainingRowIds: new UUIDSet(),
};

describe('InferenceScoringRuntime — a model without a Prediction Unit', () => {
  it("reads the scope's rows from the scope's entity and reports a feature column they lack, reading nothing else", async () => {
    const provider = new CopyTableProvider();
    // Test doubles: the runtime reads only RunViews off the provider and passes the user through.
    const context: RecordProcessorContext = { ContextUser: { ID: 'u1' } as unknown as UserInfo, Provider: provider as unknown as IMetadataProvider };
    const processor = new SelectProcessor({ modelId: 'm1', deps: { modelLoader: { loadModel: async () => null }, sidecar: { predict: async () => ({ predictions: [], classOrder: null }) }, artifactLoader: { load: async () => ({ Kind: 'absent' as const, FileID: 'f1' }) } } });
    const out = await InferenceScoringRuntime.Assemble(processor, LOADED, { RecordIDs: ['r1', 'r2'], KeyField: 'ID', EntityName: 'Copy Table' }, new Date('2026-03-04T00:00:00Z'), context);
    expect(out).toEqual({ Status: 'missing-columns', Columns: ['DistanceZ'] });
    expect(provider.Reads).toEqual(['Copy Table']);
  });

  it('assembles the rows in the scope order when they carry every feature column', async () => {
    COPY_ROWS.r3 = { ID: 'r3', Tenure: 2, DistanceZ: 7 };
    COPY_ROWS.r4 = { ID: 'r4', Tenure: 5, DistanceZ: 8 };
    const provider = new CopyTableProvider();
    const context: RecordProcessorContext = { ContextUser: { ID: 'u1' } as unknown as UserInfo, Provider: provider as unknown as IMetadataProvider };
    const processor = new SelectProcessor({ modelId: 'm1', deps: { modelLoader: { loadModel: async () => null }, sidecar: { predict: async () => ({ predictions: [], classOrder: null }) }, artifactLoader: { load: async () => ({ Kind: 'absent' as const, FileID: 'f1' }) } } });
    const out = await InferenceScoringRuntime.Assemble(processor, LOADED, { RecordIDs: ['r4', 'r3'], KeyField: 'ID', EntityName: 'Copy Table' }, new Date('2026-03-04T00:00:00Z'), context);
    expect(out.Status === 'assembled' ? [out.RowIDs, out.Matrix.rows] : out).toEqual([['r4', 'r3'], [[5, 8], [2, 7]]]);
  });
});

describe('MemoizedScoringRuntime — one preparation per model per run', () => {
  /** A runtime that counts its preparations and fails the first one when asked. */
  class CountingRuntime implements IScoringModelRuntime {
    public Calls = 0;
    constructor(private failFirst = false) {}
    public async Prepare(): Promise<IScoringPreparedModel> {
      this.Calls++;
      if (this.failFirst) { this.failFirst = false; throw new Error('storage unreachable'); }
      return { Loaded: LOADED, Assemble: async () => ({ Status: 'missing-columns', Columns: [] }) };
    }
  }
  // Test doubles: the memo reads only the model's ID and registered hash, and passes the context through.
  const model = (id: string, sha: string) => ({ ID: id, ArtifactSha256: sha }) as unknown as MJMLModelEntity;
  const ctx = {} as unknown as ScoringContext;

  it('prepares a model once for every batch of the run, and again for another artifact hash', async () => {
    const inner = new CountingRuntime();
    const memo = new MemoizedScoringRuntime(inner);
    const first = await memo.Prepare(model('M1', 'aa'), new Uint8Array(), ctx);
    const second = await memo.Prepare(model('m1', 'AA'), new Uint8Array(), ctx);
    await memo.Prepare(model('M1', 'bb'), new Uint8Array(), ctx);
    expect([first === second, inner.Calls]).toEqual([true, 2]);
  });

  it('drops a failed preparation, so the next batch prepares again', async () => {
    const inner = new CountingRuntime(true);
    const memo = new MemoizedScoringRuntime(inner);
    await expect(memo.Prepare(model('M1', 'aa'), new Uint8Array(), ctx)).rejects.toThrow('storage unreachable');
    await memo.Prepare(model('M1', 'aa'), new Uint8Array(), ctx);
    expect(inner.Calls).toBe(2);
  });
});

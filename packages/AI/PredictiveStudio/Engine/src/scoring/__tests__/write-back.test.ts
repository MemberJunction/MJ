import { describe, it, expect } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { PredictRequest, PredictResponse, FeatureSchemaEntry } from '@memberjunction/predictive-studio-core';
import type {
  IRecordProcessor,
  RecordProcessorContext,
  RecordRef,
  RecordResult,
} from '@memberjunction/record-set-processor-base';

import { MLModelInferenceProcessor, type MLInferenceResultPayload } from '../ml-model-inference-processor';
import { InMemoryArtifactLoader } from '../artifact-loader';
import type { IMLModelLoader, ISidecarPredictor, MLInferenceDeps } from '../types';
import { FeatureAssemblyExecutor } from '../../feature-assembly';
import type { IFeatureDataAccess, FetchRowsParams, FetchRowsResult } from '../../feature-assembly';

/**
 * Write-back wiring tests (plan §10.1). The MLModelInferenceProcessor is
 * EPHEMERAL by default — it returns the prediction as the RecordResult payload
 * and never writes. When the Record Process has an OutputMapping, the substrate's
 * `WriteBackProcessor` wraps this processor (exactly as it does for the
 * Action/Agent/Infer siblings) and routes the score to the target column / child
 * record.
 *
 * These tests don't depend on the record-set-processor ENGINE package (only the
 * base seams). They use a faithful local `TestWriteBackWrapper` that mirrors the
 * substrate's WriteBackProcessor contract: run the inner processor, then on
 * success apply the OutputMapping via an injected write path. The point under
 * test is the WIRING — with a mapping the score lands in the target column; with
 * no mapping the result is ephemeral and the write path is never touched.
 */

const FROZEN_SCHEMA: FeatureSchemaEntry[] = [
  { Name: 'tenure', Kind: 'numeric' },
  { Name: 'city', Kind: 'categorical' },
];

class FakeMLModel {
  public ID = 'model-1';
  public ArtifactFileID: string | null = 'file-1';
  public FittedPreprocessing: string | null = JSON.stringify({});
  public FeatureSchema = JSON.stringify(FROZEN_SCHEMA);
  public ProblemType: 'classification' | 'regression' = 'classification';
  public TargetVariable = 'Renewed';
  public Pipeline: string | null = 'Members';
  public Lineage: string | null = JSON.stringify({
    targetEntityName: 'Members',
    sourceBindings: [{ Kind: 'Entity', Ref: 'Members' }],
    featureSteps: { Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure', 'city'] }] },
    asOfStrategy: { Mode: 'none' },
  });
}

class FakeModelLoader implements IMLModelLoader {
  constructor(private readonly model: FakeMLModel) {}
  async loadModel(): Promise<MJMLModelEntity | null> {
    return this.model as unknown as MJMLModelEntity;
  }
}

class FakeSidecar implements ISidecarPredictor {
  async predict(req: PredictRequest): Promise<PredictResponse> {
    return { predictions: req.rows.map(() => ({ score: 0.83, class: 'renew' })) };
  }
}

class InMemoryDataAccess implements IFeatureDataAccess {
  async fetchRows(_params: FetchRowsParams): Promise<FetchRowsResult> {
    return { Success: true, Rows: [] };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

class TestAssembler extends FeatureAssemblyExecutor {
  constructor(private readonly da: IFeatureDataAccess) {
    super();
  }
  public override assemble(params: Parameters<FeatureAssemblyExecutor['assemble']>[0]) {
    return super.assemble({ ...params, dataAccess: this.da });
  }
}

/** Mirrors the substrate's WriteBackProcessor: inner → on success apply mapping. */
type FieldMap = Record<string, string>; // EntityField -> result ref (e.g. 'Score' -> '$.score')

class TestWriteBackWrapper implements IRecordProcessor {
  /** Records written: recordId -> { field: value }. */
  public readonly Writes: Array<{ recordId: string; fields: Record<string, unknown> }> = [];

  constructor(private readonly inner: IRecordProcessor, private readonly mapping?: FieldMap) {}

  async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
    const result = await this.inner.ProcessRecord(record, context);
    if (result.Status !== 'Succeeded' || !this.mapping) {
      return result; // ephemeral when no mapping (or on failure)
    }
    const payload = result.ResultPayload as MLInferenceResultPayload;
    const fields: Record<string, unknown> = {};
    for (const [field, ref] of Object.entries(this.mapping)) {
      // resolve '$.score' / '$.class' against the prediction payload
      const key = ref.replace(/^\$\./, '') as keyof MLInferenceResultPayload;
      fields[field] = payload[key];
    }
    this.Writes.push({ recordId: record.RecordID, fields });
    return { ...result, ResultPayload: { output: payload, writeBack: { updatedRecord: true } } };
  }
}

const CTX: RecordProcessorContext = {
  contextUser: undefined as unknown as UserInfo,
  provider: undefined as unknown as IMetadataProvider,
};

function record(id: string): RecordRef {
  return { EntityID: 'ent-members', RecordID: id, Record: { ID: id, tenure: 10, city: 'NYC' } };
}

function buildInner(): MLModelInferenceProcessor {
  const deps: MLInferenceDeps = {
    modelLoader: new FakeModelLoader(new FakeMLModel()),
    artifactLoader: new InMemoryArtifactLoader(new Map([['file-1', new TextEncoder().encode('bytes')]])),
    sidecar: new FakeSidecar(),
  };
  return new MLModelInferenceProcessor({ modelId: 'model-1', deps }, new TestAssembler(new InMemoryDataAccess()));
}

describe('scoring write-back wiring (§10.1)', () => {
  it('writes the score to the target column when an OutputMapping is present', async () => {
    const inner = buildInner();
    const wrapped = new TestWriteBackWrapper(inner, { RenewalScore: '$.score', RenewalClass: '$.class' });

    const result = await wrapped.ProcessRecord(record('m1'), CTX);

    expect(result.Status).toBe('Succeeded');
    // The score landed in the target column (the write path was invoked).
    expect(wrapped.Writes.length).toBe(1);
    expect(wrapped.Writes[0]).toEqual({ recordId: 'm1', fields: { RenewalScore: 0.83, RenewalClass: 'renew' } });
    // The result now carries the write-back marker, like the substrate's wrapper.
    expect((result.ResultPayload as { writeBack: { updatedRecord: boolean } }).writeBack.updatedRecord).toBe(true);
  });

  it('writes the score timestamp to a column when $.scoredAt is mapped', async () => {
    const inner = buildInner();
    const wrapped = new TestWriteBackWrapper(inner, { RenewalScore: '$.score', LastScoredAt: '$.scoredAt' });

    const result = await wrapped.ProcessRecord(record('m1'), CTX);

    expect(result.Status).toBe('Succeeded');
    expect(wrapped.Writes.length).toBe(1);
    const written = wrapped.Writes[0].fields as { RenewalScore: number; LastScoredAt: string };
    expect(written.RenewalScore).toBe(0.83);
    // scoredAt resolved to a valid, round-trippable ISO-8601 timestamp.
    expect(typeof written.LastScoredAt).toBe('string');
    expect(new Date(written.LastScoredAt).toISOString()).toBe(written.LastScoredAt);
  });

  it('is ephemeral (no write) when no OutputMapping is present', async () => {
    const inner = buildInner();
    const ephemeral = new TestWriteBackWrapper(inner, undefined);

    const result = await ephemeral.ProcessRecord(record('m1'), CTX);

    expect(result.Status).toBe('Succeeded');
    // No mapping → nothing written; the prediction is returned in the payload only.
    expect(ephemeral.Writes.length).toBe(0);
    const payload = result.ResultPayload as MLInferenceResultPayload;
    expect(payload.score).toBe(0.83);
    expect(payload.class).toBe('renew');
    // Every prediction is stamped, even ephemeral (no write-back) runs.
    expect(new Date(payload.scoredAt).toISOString()).toBe(payload.scoredAt);
  });

  it('does not write when the inner record fails', async () => {
    // A processor whose model load fails → Failed result → write path untouched.
    const failing = new MLModelInferenceProcessor(
      {
        modelId: 'missing',
        deps: {
          modelLoader: { async loadModel() { return null; } },
          artifactLoader: new InMemoryArtifactLoader(),
          sidecar: new FakeSidecar(),
        },
      },
      new TestAssembler(new InMemoryDataAccess()),
    );
    const wrapped = new TestWriteBackWrapper(failing, { RenewalScore: '$.score' });
    const result = await wrapped.ProcessRecord(record('m1'), CTX);
    expect(result.Status).toBe('Failed');
    expect(wrapped.Writes.length).toBe(0);
  });
});

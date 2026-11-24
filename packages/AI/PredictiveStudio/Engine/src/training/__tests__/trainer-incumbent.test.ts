/**
 * The trainer's incumbent (D4-93): the pipeline's Published model, verified with the lifecycle gate's reads, sent in the
 * trainer request with a download of its stored artifact so the sidecar can store the run's `incumbentDiff`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { TrainingHarness, trainingProvider } from '../../__tests__/fakes/training-fakes';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { MetadataEntityFactory } from '../seams';
import { StorageProviderSnapshotFileStore } from '../../snapshot/snapshot-file-store';
import { PredictiveStudioStorage } from '../../storage/ps-storage-provider';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { TrainerIncumbents } from '../trainer-incumbent';
import { TrainerRequestBuilder } from '../trainer-request';
import { ProtocolRowFixture } from './fixtures/protocol-row';

const log: string[] = [];
const storage = new MemoryStorageAccount('incumbent', log);
RegisterMemoryStorage('PS Trainer Incumbent Test Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Incumbent Test Storage', 'PS Trainer Incumbent Test Storage', true);
const currentPublished = ProtocolRowFixture.Spec();
const noIncumbent = ProtocolRowFixture.Spec({ Promotion: JSON.stringify({ comparators: [], incumbent: 'none', margin: 0, lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' }) });

let store: GateTestStore;
let world: GateWorld;
let published: WorldModel;
const ctx = () => ({ ContextUser: GateWorld.User, Provider: store.Provider() });

beforeEach(() => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  published = world.Model('Published', 'model');
  world.Model('Validated', 'model');
});

describe('TrainerIncumbents.Resolve', () => {
  it("resolves the pipeline's Published model with its verified artifact", async () => {
    const row = store.Row('MJ: ML Models', published.ID);
    expect(await TrainerIncumbents.Resolve(GateWorld.PipelineID, currentPublished, ctx(), new StorageProviderArtifactLoader())).toEqual({
      Kind: 'resolved', Incumbent: { ModelID: published.ID, FileID: row?.['ArtifactFileID'], Sha256: row?.['ArtifactSha256'] },
    });
  });
  it('is no-published-model for the first model of a pipeline', async () => {
    const row = store.Row('MJ: ML Models', published.ID);
    if (row) row['Status'] = 'Archived';
    const resolution = await TrainerIncumbents.Resolve(GateWorld.PipelineID, currentPublished, ctx(), new StorageProviderArtifactLoader());
    expect([resolution, TrainerIncumbents.IncumbentOf(resolution, 'RUN-1')]).toEqual([{ Kind: 'no-published-model' }, null]);
  });
  it('is not-compared, with no read, when the protocol rule is none', async () => {
    expect(await TrainerIncumbents.Resolve(GateWorld.PipelineID, noIncumbent, ctx(), new StorageProviderArtifactLoader())).toEqual({ Kind: 'not-compared' });
    expect(store.ReadCount()).toBe(0);
  });
  it('a Published model whose artifact does not verify is not the incumbent: null, with the reason logged', async () => {
    const errors = ConsoleCapture.Errors();
    world.CorruptArtifact(published.ID);
    const resolution = await TrainerIncumbents.Resolve(GateWorld.PipelineID, currentPublished, ctx(), new StorageProviderArtifactLoader());
    expect(resolution).toEqual({ Kind: 'not-verifiable', ModelID: published.ID, Reason: 'its artifact is hash-mismatch' });
    expect(TrainerIncumbents.IncumbentOf(resolution, 'RUN-1')).toBeNull();
    expect(ConsoleCapture.Lines(errors)).toEqual([`Predictive Studio training: run RUN-1 is trained without an incumbent: Published ML Model ${published.ID} cannot be one: its artifact is hash-mismatch`]);
  });
  it('a Published model with no registered delivery (a pre-change model) is not the incumbent', async () => {
    const row = store.Row('MJ: ML Models', published.ID);
    if (row) row['Delivery'] = null;
    expect(await TrainerIncumbents.Resolve(GateWorld.PipelineID, currentPublished, ctx(), new StorageProviderArtifactLoader())).toMatchObject({ Kind: 'not-verifiable', Reason: 'it has no registered delivery (a pre-change model)' });
  });
  it('two Published models is not-verifiable naming the count', async () => {
    world.Model('Published', 'keep');
    expect(await TrainerIncumbents.Resolve(GateWorld.PipelineID, currentPublished, ctx(), new StorageProviderArtifactLoader())).toMatchObject({ Kind: 'not-verifiable', ModelID: null, Reason: expect.stringContaining('2 Published models') });
  });
});

describe('TrainerRequestBuilder with an incumbent', () => {
  it('sends the incumbent with a download issued by the provider its MJ: Files row names, for the stored object key', async () => {
    const resolution = await TrainerIncumbents.Resolve(GateWorld.PipelineID, currentPublished, ctx(), new StorageProviderArtifactLoader());
    const incumbent = TrainerIncumbents.IncumbentOf(resolution, 'RUN-1');
    const row = store.Row('MJ: ML Models', published.ID);
    const files = new StorageProviderSnapshotFileStore(new MetadataEntityFactory(ctx().Provider), new PredictiveStudioStorage(ctx().Provider, GateWorld.User));
    const fileId = String(row?.['ArtifactFileID']);
    const request = await TrainerRequestBuilder.BuildTrainerRequest({
      TrainingRunID: 'RUN-1', Files: files, Incumbent: incumbent, Protocol: currentPublished, Task: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
      // The incumbent's own file stands in for the snapshot files: every download goes the same path.
      Snapshot: { ID: 'SNAP-1', ContentHash: 'c'.repeat(64), FeatureSchemaHash: 'f'.repeat(64), MatrixFileID: fileId, MatrixSha256: String(row?.['ArtifactSha256']), RowManifestFileID: fileId, RowManifestSha256: String(row?.['ArtifactSha256']) },
      Candidates: [TrainerRequestBuilder.CandidateFromPipeline('xgb', 'ALG-1', 'xgboost', '{}')], Now: new Date('2026-11-12T00:00:00.000Z'),
    });
    expect(request.incumbent).toMatchObject({ modelId: published.ID, artifact: { fileId, url: `memory://incumbent/artifacts/${fileId}`, sha256: row?.['ArtifactSha256'] } });
  });
});

describe('TrainingEngine sends the incumbent', () => {
  afterEach(() => {
    trainingProvider.ViewRows = {};
  });
  it("a run of a pipeline with a verified Published model sends it as the trainer request's incumbent", async () => {
    const { engine, deps, pipeline, trainer, files } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const bytes = new TextEncoder().encode(JSON.stringify({ format: 'ps-predictor/v2', version: 2, candidate: 'xgb' }));
    const stored = await files.Put('artifacts/incumbent.json', 'incumbent', bytes);
    const sha = SnapshotHash.Sha256Hex(bytes);
    const loader = new InMemoryArtifactLoader();
    loader.Set(stored.FileID, bytes);
    deps.artifactLoader = loader;
    const gate = { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null };
    const delivery = { kind: 'delivered', gate, shipped: 'xgb', shippedRole: 'model', artifact: { fileId: stored.FileID, storageProviderId: 'provider-local', providerKey: 'artifacts/incumbent.json', sha256: sha, sizeBytes: bytes.byteLength, writeOnce: true } };
    trainingProvider.ViewRows = { 'MJ: ML Models': [{ ID: 'INCUMBENT-1', ArtifactFileID: stored.FileID, ArtifactSha256: sha, Delivery: JSON.stringify(delivery) }] };
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(trainer.Requests[0].incumbent).toMatchObject({ modelId: 'INCUMBENT-1', artifact: { fileId: stored.FileID, sha256: sha } });
  });
  it('a run of a pipeline with no Published model sends no incumbent', async () => {
    const { engine, deps, pipeline, trainer } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(trainer.Requests[0].incumbent).toBeNull();
  });
});

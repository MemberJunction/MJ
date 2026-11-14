import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { ReturnedArtifact, StoredFile, TrainerCompleted, TrainerRequest } from '@memberjunction/predictive-studio-core';

import { InMemoryArtifactStore } from '../artifact-store';
import { RunViewMLModelLoader } from '../../scoring/seams';
import { RegistryEntries, RegistryEntryIncompleteError, RegistryEntryInvalidError } from '../../registry/registry-entry';
import { ProtocolRowFixture } from './fixtures/protocol-row';
import { TrainerResultFixtures } from './fixtures/trainer-result';
import { FakeEvaluationProtocolStore, FakeMLModel, FakeMLRun, FakeTrainer, TrainerAnswers, TrainingHarness, fakeUser } from '../../__tests__/fakes/training-fakes';
import { FakePredictionUnitStore, UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';

/**
 * The registry entry a trainer run writes on its model row (§5.1, Task M2.3): the stored artifact's SHA-256 checked
 * against the trainer's declared one, the lineage columns, `ArtifactStatus = 'verified'` and the registered delivery.
 * The pipeline points at a Prediction Unit and an Evaluation Protocol with UUID IDs, as the database's are.
 */

const UNIT_ID = '6F1D2A40-3C5B-4E7A-9B10-0000000000D1';
const PROTOCOL_ID = '6F1D2A40-3C5B-4E7A-9B10-0000000000D2';

/** True for an 8-4-4-4-12 hexadecimal UUID. */
function IsValidUUID(value: string | null): boolean {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type UnitFixture = ReturnType<typeof TrainingHarness.ForUnit>;

interface TrainOnFixtureOptions {
  /**
   * The run creates a model row. The canned result's gate keeps the simple `glm` member (keep-simple-baseline), the one
   * shipped outcome the fixture's comparisons decide; a `model` gate outcome would ship the finalist, never a member name.
   */
  readonly Outcome?: 'model';
  /** The shipped artifact's bytes no longer hash to the SHA-256 it declares. */
  readonly CorruptArtifact?: boolean;
  /** The shipped artifact's class order, when it differs from the task's. */
  readonly ArtifactClassOrder?: readonly string[];
}

/** The completed result the fixture's trainer last answered with. */
let trainerResult: TrainerCompleted;
let engine: UnitFixture;
let store: InMemoryArtifactStore;

/** The shipped `glm` artifact first, so `artifacts[0]` is what the delivery ships. */
function shippedFirst(r: TrainerRequest, o: TrainOnFixtureOptions): TrainerCompleted {
  const canned = TrainerAnswers.CannedFor(r);
  if (canned.status !== 'completed') throw new Error('the canned trainer answer is not a completed run');
  const glm = TrainerResultFixtures.Artifact('glm', r.snapshot.featureSchemaHash);
  const shipped: ReturnedArtifact = {
    ...glm,
    // Another envelope's bytes under glm's declared hash.
    bytesBase64: o.CorruptArtifact ? TrainerResultFixtures.Artifact('tampered', r.snapshot.featureSchemaHash).bytesBase64 : glm.bytesBase64,
    classOrder: o.ArtifactClassOrder || glm.classOrder,
  };
  const others = canned.artifacts.filter((a) => a.candidate !== 'glm');
  return { ...canned, artifacts: [shipped, ...others] };
}

/** Trains the fixture's pipeline once; the model row the run created. */
async function TrainOnFixture(fixture: UnitFixture, o: TrainOnFixtureOptions): Promise<MJMLModelEntity> {
  fixture.deps.trainer = new FakeTrainer((r) => {
    trainerResult = shippedFirst(r, o);
    return trainerResult;
  });
  return TrainingHarness.ModelOf(await fixture.engine.trainModel({ pipelineId: fixture.pipeline.ID }, fixture.deps));
}

/** A unit pipeline over the unit-years world whose unit and protocol rows have UUID IDs, storing into `artifactStore`. */
function UuidUnitFixture(artifactStore: InMemoryArtifactStore): UnitFixture {
  const fixture = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
  fixture.pipeline.PredictionUnitID = UNIT_ID;
  fixture.pipeline.EvaluationProtocolID = PROTOCOL_ID;
  fixture.deps.predictionUnits = new FakePredictionUnitStore({ ...UnitYearsWorld.UnitColumns(), ID: UNIT_ID, LineageRootID: UNIT_ID });
  fixture.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ ID: PROTOCOL_ID, LineageRootID: PROTOCOL_ID, MinMinorityClassRows: 1 })]);
  fixture.deps.artifactStore = artifactStore;
  return fixture;
}

/**
 * A store whose returned `StoredFile` names a SHA-256 other than the bytes' (a store that corrupted what it wrote): on
 * every save, or only on the save numbered `misreportOnSave` (1-based). Records every file id it saved and deleted.
 */
class MisreportingArtifactStore extends InMemoryArtifactStore {
  public readonly SavedIDs: string[] = [];
  public readonly DeletedIDs: string[] = [];
  constructor(private readonly misreportOnSave: number | null = null) {
    super();
  }
  public override async save(bytes: Uint8Array, name: string): Promise<StoredFile> {
    const stored = await super.save(bytes, name);
    this.SavedIDs.push(stored.fileId);
    const misreport = this.misreportOnSave === null || this.misreportOnSave === this.SavedIDs.length;
    return misreport ? { ...stored, sha256: 'e'.repeat(64) } : stored;
  }
  public override async delete(fileId: string): Promise<void> {
    await super.delete(fileId);
    this.DeletedIDs.push(fileId);
  }
}

/** The provider slice `RunViewMLModelLoader` reads through: it answers with `row`. */
function modelRowProvider(row: MJMLModelEntity): IMetadataProvider {
  const slice = {
    async RunView<T>(_params: RunViewParams): Promise<RunViewResult<T>> {
      // One deliberate test-double cast at the seam: the field-bag model row is not a BaseEntity.
      return { Success: true, Results: [row] as unknown as T[], RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '' };
    },
  };
  return slice as unknown as IMetadataProvider;
}

/** One read a provider slice answered: the entity, the filter and the acting user. */
interface RecordedRead {
  readonly Entity: string;
  readonly Filter: RunViewParams['ExtraFilter'];
  readonly UserID: string | undefined;
}

/** The provider slice `RegistryEntries.Load` reads through: the model rows and the run rows it holds, by entity; records every read. */
function registryProvider(models: readonly FakeMLModel[], runs: readonly FakeMLRun[], reads: RecordedRead[]): IMetadataProvider {
  const slice = {
    async RunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
      reads.push({ Entity: params.EntityName || '', Filter: params.ExtraFilter, UserID: contextUser?.ID });
      const rows = params.EntityName === 'MJ: ML Models' ? models : runs;
      const matching = rows.filter((r) => params.ExtraFilter === `ID='${r.ID}'`);
      // One deliberate test-double cast at the seam: the field-bag rows are not BaseEntity objects.
      return { Success: true, Results: matching as unknown as T[], RowCount: matching.length, TotalRowCount: matching.length, ExecutionTime: 0, ErrorMessage: '' };
    },
  };
  return slice as unknown as IMetadataProvider;
}

beforeEach(() => {
  // No compute rate unless a test sets one, whatever the shell exports.
  vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '');
  store = new InMemoryArtifactStore();
  engine = UuidUnitFixture(store);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TrainingEngine — the registry entry on the trainer model row', () => {
  it('records the stored artifact hash, lineage columns and the registered delivery', async () => {
    const model = await TrainOnFixture(engine, { Outcome: 'model' });
    expect(model.ArtifactSha256).toBe(trainerResult.artifacts[0].sha256);
    expect([model.TrainingRunID, model.TrainingSnapshotID, model.EvaluationProtocolID, model.PredictionUnitID].every(IsValidUUID)).toBe(true);
    expect(JSON.parse(model.Delivery ?? 'null')).toMatchObject({ kind: 'delivered', shipped: 'glm', artifact: { sha256: model.ArtifactSha256 } });
    expect(model.ArtifactStatus).toBe('verified');
  });

  it('refuses a returned artifact whose bytes do not hash to its declared SHA-256 and leaves no file', async () => {
    await expect(TrainOnFixture(engine, { CorruptArtifact: true })).rejects.toThrow('sha256');
    expect(store.Saved.size).toBe(0);
  });

  it("keeps the artifact's class order in the registered delivery", async () => {
    const model = await TrainOnFixture(engine, { Outcome: 'model' });
    const shipped = trainerResult.artifacts[0];
    expect(JSON.parse(model.OutputSemantics ?? 'null')).toEqual({ task: { kind: 'binary', classOrder: shipped.classOrder, adverseIndex: 0 } });
    expect(JSON.parse(model.Delivery ?? 'null')).toMatchObject({ kind: 'delivered', shipped: 'glm', shippedRole: 'simpleBaseline', artifact: { sha256: shipped.sha256 } });
    // An artifact whose class order is not the task's is not delivered: no model row, and no file left stored.
    const reversedStore = new InMemoryArtifactStore();
    const reversed = UuidUnitFixture(reversedStore);
    await expect(TrainOnFixture(reversed, { ArtifactClassOrder: ['1', '0'] })).rejects.toThrow('class-order-mismatch');
    expect(reversed.models.filter((m) => m.SaveCallCount > 0)).toHaveLength(0);
    expect(reversedStore.Saved.size).toBe(0);
  });

  it('records every §5.1 registry column, and RunViewMLModelLoader reads them back on the row', async () => {
    const model = await TrainOnFixture(engine, { Outcome: 'model' });
    const read = await new RunViewMLModelLoader().loadModel(model.ID, fakeUser, modelRowProvider(model));
    expect(read).not.toBeNull();
    if (read === null) return;
    const snapshot = engine.snapshots[0];
    expect({
      TrainingRunID: read.TrainingRunID, TrainingSnapshotID: read.TrainingSnapshotID, EvaluationProtocolID: read.EvaluationProtocolID, PredictionUnitID: read.PredictionUnitID,
      SnapshotHash: read.SnapshotHash, ArtifactStatus: read.ArtifactStatus, CodeVersion: JSON.parse(read.CodeVersion ?? 'null'),
    }).toEqual({
      TrainingRunID: engine.runs[0].ID, TrainingSnapshotID: snapshot.ID, EvaluationProtocolID: PROTOCOL_ID, PredictionUnitID: UNIT_ID,
      SnapshotHash: snapshot.ContentHash, ArtifactStatus: 'verified', CodeVersion: trainerResult.codeVersion,
    });
    expect(read.FeatureSchemaHash).toBe(trainerResult.artifacts[0].featureSchemaHash);
    expect(read.ArtifactSha256).toBe(trainerResult.artifacts[0].sha256);
    expect(read.ArtifactCheckedAt).toBeInstanceOf(Date);
    expect(JSON.parse(read.OutputSemantics ?? 'null')).toMatchObject({ task: { kind: 'binary' } });
    expect(JSON.parse(read.Delivery ?? 'null')).toMatchObject({ kind: 'delivered', artifact: { fileId: read.ArtifactFileID, sha256: read.ArtifactSha256, writeOnce: true } });
  });

  // Not a coverage-table row: the store-corruption path behind the declared-hash check. The trainer's bytes match its
  // declared SHA-256, but the store reports another hash for what it wrote, so the run deletes every file it stored.
  it('deletes every stored file when the store reports a SHA-256 other than the declared one (store corruption, not a coverage-table row)', async () => {
    const misreporting = new MisreportingArtifactStore();
    const fixture = UuidUnitFixture(misreporting);
    await expect(TrainOnFixture(fixture, { Outcome: 'model' })).rejects.toThrow('sha256');
    expect(misreporting.Saved.size).toBe(0);
    expect(fixture.models).toHaveLength(0);
  });

  // Not a coverage-table row: the rollback deletes what was stored well too, not only the misreported file.
  it('deletes the first, correctly stored file too when only the second store reports a wrong SHA-256 (store corruption, not a coverage-table row)', async () => {
    const misreporting = new MisreportingArtifactStore(2);
    const fixture = UuidUnitFixture(misreporting);
    await expect(TrainOnFixture(fixture, { Outcome: 'model' })).rejects.toThrow(/was stored with sha256 e{64}, not its declared sha256 [0-9a-f]{64}; every artifact of the run was deleted/);
    expect(misreporting.SavedIDs).toHaveLength(trainerResult.artifacts.length);
    expect([...misreporting.DeletedIDs].sort()).toEqual([...misreporting.SavedIDs].sort());
    expect(misreporting.DeletedIDs).toContain(misreporting.SavedIDs[0]);
    expect(misreporting.Saved.size).toBe(0);
    expect(fixture.models).toHaveLength(0);
  });
});

describe('RegistryEntries.Load — the registry entry of a model row', () => {
  it("reads the trainer row's entry: the stored delivery, lineage, semantics and the run's stored evaluation", async () => {
    const model = await TrainOnFixture(engine, { Outcome: 'model' });
    const reads: RecordedRead[] = [];
    const entry = await RegistryEntries.Load(model.ID, { ContextUser: fakeUser, Provider: registryProvider(engine.models, engine.runs, reads) });
    const glm = trainerResult.baselines.find((b) => b.baseline.kind === 'glm');
    expect(entry).toEqual({
      ModelID: model.ID, PipelineID: engine.pipeline.ID, Version: model.Version, Status: 'Draft',
      Delivery: JSON.parse(model.Delivery ?? 'null'),
      Lineage: {
        TrainingSnapshotID: engine.snapshots[0].ID, SnapshotHash: engine.snapshots[0].ContentHash, EvaluationProtocolID: PROTOCOL_ID, PredictionUnitID: UNIT_ID,
        CodeVersion: trainerResult.codeVersion, TrainingRunID: engine.runs[0].ID, PinnedFeatureVersions: [],
      },
      FeatureSchemaHash: trainerResult.artifacts[0].featureSchemaHash,
      Semantics: { task: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 } },
      // keep-simple-baseline ships the glm member, so the entry's primary score is the member's holdout score.
      Evaluation: { Primary: glm?.holdout, Baselines: trainerResult.baselines },
      LeakageFlags: [],
    });
    expect(reads).toEqual([
      { Entity: 'MJ: ML Models', Filter: `ID='${model.ID}'`, UserID: fakeUser.ID },
      { Entity: 'MJ: ML Training Runs', Filter: `ID='${engine.runs[0].ID}'`, UserID: fakeUser.ID },
    ]);
  });

  it('returns null only when no model row has the ID', async () => {
    const reads: RecordedRead[] = [];
    expect(await RegistryEntries.Load('no-such-model', { ContextUser: fakeUser, Provider: registryProvider([], [], reads) })).toBeNull();
    expect(reads.map((r) => r.Entity)).toEqual(['MJ: ML Models']);
  });

  it('refuses a row whose Delivery is null, naming the column', async () => {
    const model = await TrainOnFixture(engine, { Outcome: 'model' });
    engine.models[0].Delivery = null;
    const load = RegistryEntries.Load(model.ID, { ContextUser: fakeUser, Provider: registryProvider(engine.models, engine.runs, []) });
    await expect(load).rejects.toBeInstanceOf(RegistryEntryIncompleteError);
    await expect(load).rejects.toMatchObject({ ModelID: model.ID, MissingColumns: ['Delivery'], message: "ML Model 'model-1' has no registry entry: Delivery is null" });
  });

  it('refuses a row whose Delivery is present but not its contract, naming the column and the failing path', async () => {
    const model = await TrainOnFixture(engine, { Outcome: 'model' });
    const stored = engine.models[0];
    const delivery = stored.DeliveryObject;
    if (delivery === null || delivery.kind !== 'delivered') throw new Error('the trained row has no delivered Delivery');
    // Valid JSON (the column's ISJSON check passes) whose artifact hash is not lower-case hex.
    stored.Delivery = JSON.stringify({ ...delivery, artifact: { ...delivery.artifact, sha256: 'NOT-A-HASH' } });
    const error = await RegistryEntries.Load(model.ID, { ContextUser: fakeUser, Provider: registryProvider(engine.models, engine.runs, []) }).then(
      () => null,
      (e: Error) => e,
    );
    expect(error).toBeInstanceOf(RegistryEntryInvalidError);
    if (!(error instanceof RegistryEntryInvalidError)) return;
    expect({ ModelID: error.ModelID, Column: error.Column, Errors: error.Errors }).toEqual({ ModelID: model.ID, Column: 'Delivery', Errors: ['artifact.sha256: Invalid'] });
    expect(error.message).toBe(`ML Model '${model.ID}': its stored Delivery is not a valid registry value: artifact.sha256: Invalid`);
  });

  it('names every null entry column of a pre-change row and reads nothing more', async () => {
    const preChange = new FakeMLModel('pre-change-model');
    const reads: RecordedRead[] = [];
    await expect(RegistryEntries.Load(preChange.ID, { ContextUser: fakeUser, Provider: registryProvider([preChange], [], reads) })).rejects.toMatchObject({
      MissingColumns: ['TrainingRunID', 'TrainingSnapshotID', 'EvaluationProtocolID', 'PredictionUnitID', 'SnapshotHash', 'FeatureSchemaHash', 'CodeVersion', 'OutputSemantics', 'Delivery', 'Lineage'],
    });
    expect(reads.map((r) => r.Entity)).toEqual(['MJ: ML Models']);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import {
  EvaluationLineage,
  EvaluationProtocol,
  InvalidMajorityBaselineRuleError,
  TrainingRunResultsParser,
  TrustVerdicts,
  type EvaluationProtocolSpec,
  type SourceColumnImportance,
  type TaskType,
  type TrainerCompleted,
  type TrainerRequest,
  type TrainerResult,
  type TrainingRunResults,
  type FeatureStepGraph,
  type AsOfStrategy,
  type ValidationStrategy,
  type StoredFile,
} from '@memberjunction/predictive-studio-core';

import { TrainerResultMalformedError } from '@memberjunction/predictive-studio-sidecar';
import { TrainingEngine } from '../training-engine';
import { TrainingRefusedError } from '../training-refusal';
import type { ITrainerEvaluator } from '../types';
import { TrainerRequestBuilder } from '../trainer-request';
import { WasTrainingLeakageFlagged } from '../../operations/delegation';
import { SnapshotRetrainer } from '../../snapshot/snapshot-retrainer';
import { InMemoryArtifactStore } from '../artifact-store';
import { ProtocolRowFixture } from './fixtures/protocol-row';
import { TrainerResultFixtures } from './fixtures/trainer-result';
import { AsOfFeatureAssembler } from '../../feature-assembly/as-of/as-of-assembler';
import type {
  IFeatureDataAccess,
  FetchRowsParams,
  FetchRowsResult,
  SourceRow,
} from '../../feature-assembly';
import { MLModelInferenceProcessor } from '../../scoring/ml-model-inference-processor';
import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import type { MLInferenceDeps } from '../../scoring/types';
import type { RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { TableDataAccess } from '../../__tests__/fakes/table-data-access';
import { InMemoryUnitVersions, UnitVersionFactory } from '../../prediction-unit/__tests__/unit-version-fakes';
import {
  FakeEntity,
  FakeEntityFactory,
  FakeEvaluationProtocolStore,
  FakeRecordLoader,
  FakeMLModel,
  FakeMLPipeline,
  FakeMLRun,
  FakeTrainer,
  FakeTrainingSnapshot,
  TrainingHarness,
  fakeProvider,
  fakeUser,
} from '../../__tests__/fakes/training-fakes';
import type { InMemorySnapshotFileStore } from '../../snapshot/snapshot-file-store';
import { SnapshotFiles, type SnapshotContent } from '../../snapshot/snapshot-serialization';

/**
 * Unit tests for the TrainingEngine. NO live DB, NO live sidecar — every seam is
 * an in-memory fake. These tests prove the orchestration of a Prediction Unit pipeline under its Evaluation Protocol
 * (unit rows → snapshot → trainer → gate → model row), the refusals before a run row exists, and Save-failure
 * surfacing. The fakes are shared (`__tests__/fakes/training-fakes`).
 */

// No compute rate unless a test sets one, whatever the shell exports: an unpriced run records a NULL cost.
beforeEach(() => {
  vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TrainingEngine.trainModel — pipelines it does not train', () => {
  it('refuses a pipeline without a Prediction Unit before any run row is written, naming how to bind one', async () => {
    const { deps, factory } = TrainingHarness.BuildDeps();
    const candidates = [TrainerRequestBuilder.CandidateFromPipeline('xgb', 'algo-xgb', 'xgboost', '{}')];
    for (const input of [{ pipelineId: 'pipe-1' }, { pipelineId: 'pipe-1', candidates }]) {
      await expect(new TrainingEngine().trainModel(input, deps)).rejects.toMatchObject({
        Refusal: { stage: 'pipeline', reason: { kind: 'unit-required', pipelineId: 'pipe-1' } },
        message: 'Refused (unit-required): pipeline pipe-1 — this pipeline has no Prediction Unit; run the "Migrate Pipelines to Prediction Units and Evaluation Protocols" Action or bind a unit (a held pipeline names what to declare in its Description)',
      });
    }
    expect([factory.Runs.length, factory.Models.length]).toEqual([0, 0]);
  });

  it('throws when the pipeline is not found', async () => {
    const { deps, factory } = TrainingHarness.BuildDeps({ pipeline: null });
    await expect(new TrainingEngine().trainModel({ pipelineId: 'missing' }, deps)).rejects.toThrow("ML Training Pipeline 'missing' not found");
    expect(factory.Runs).toHaveLength(0);
  });
});

describe('TrainingEngine — the evaluation record of a unit run', () => {
  it("records the pipeline's majority-baseline rule in Lineage.evaluation and refuses an unknown one before any row is written", async () => {
    const warned = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    warned.pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'warn' });
    const model = TrainingHarness.ModelOf(await warned.engine.trainModel({ pipelineId: warned.pipeline.ID }, warned.deps));
    expect(EvaluationLineage.Read(model.Lineage)?.MajorityBaselineRule).toBe('warn');
    const refused = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    refused.pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'off' });
    await expect(refused.engine.trainModel({ pipelineId: refused.pipeline.ID }, refused.deps)).rejects.toBeInstanceOf(InvalidMajorityBaselineRuleError);
    expect([refused.runs.length, refused.trainer.Requests.length]).toEqual([0, 0]);
  });

  it('withholds no trust from a time-indexed pipeline judged on the protocol\'s date-carved holdout, in its Lineage or its run notes', async () => {
    const h = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    h.pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', LockedHoldoutFraction: 0.2, TimeIndexColumn: 'StartDate' });
    const trained = await h.engine.trainModel({ pipelineId: h.pipeline.ID }, h.deps);
    const model = TrainingHarness.ModelOf(trained);
    expect(EvaluationLineage.Read(model.Lineage)).toMatchObject({ TimeIndexColumn: 'StartDate', WithheldReason: null });
    expect(trained.run.Notes).not.toContain('Trust withheld');
  });
});

async function storedContent(files: InMemorySnapshotFileStore, s: FakeTrainingSnapshot): Promise<SnapshotContent> {
  return SnapshotFiles.ParseSnapshotFiles(await files.Get(s.MatrixFileID), await files.Get(s.RowManifestFileID), await files.Get(s.ProvenanceFileID));
}

/** Every row of the stored snapshot, as column → value (the matrix the trainer is sent the downloads of). */
function snapshotRows(content: SnapshotContent): Array<Record<string, string | number | boolean | null>> {
  // `??`, not `||`: 0, false and '' cells are real values; only a missing cell is null.
  return content.Rows.map((r) => Object.fromEntries(content.Header.columns.map((c, i) => [c, r[i] ?? null])));
}

/** The run's stored envelope, parsed through its schema. */
function storedResults(validationResults: string | null): TrainingRunResults {
  const parsed = TrainingRunResultsParser.ParseTrainingRunResults(validationResults);
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

/** The parsed protocol row the harness binds. */
function protocolSpec(): EvaluationProtocolSpec {
  const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(ProtocolRowFixture.Row());
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

/** The completed answer the engine accepts for this request: its run, its snapshot's feature-schema hash, real artifact hashes. */
function cannedFor(r: TrainerRequest): TrainerCompleted {
  return TrainerResultFixtures.CannedCompleted(r.trainingRunId, protocolSpec(), r.snapshot.featureSchemaHash);
}

/** The answer whose gate ships the finalist (`xgb` beats the dummy and the GLM): the model row is the finalist's. */
function cannedModelFor(r: TrainerRequest): TrainerCompleted {
  return TrainerResultFixtures.CannedModelWins(r.trainingRunId, protocolSpec(), r.snapshot.featureSchemaHash);
}

/** The answer whose gate decides no-signal: nothing beats the dummy. */
function cannedNoSignalFor(r: TrainerRequest): TrainerCompleted {
  return TrainerResultFixtures.CannedNoSignal(r.trainingRunId, protocolSpec(), r.snapshot.featureSchemaHash);
}

/** A source column's held-out permutation importance, as the trainer reports it. */
function importanceOf(sourceColumn: string, value: number): SourceColumnImportance {
  return { sourceColumn, permutationImportance: TrainerResultFixtures.Mwi('log-loss', value, value, value, 8) };
}

/** An artifact store whose save of one file name fails; it records the files it deleted. */
class FailingArtifactStore extends InMemoryArtifactStore {
  public readonly DeletedIDs: string[] = [];
  constructor(private readonly failingName: string) { super(); }
  public override async save(bytes: Uint8Array, name: string): Promise<StoredFile> {
    if (name.includes(this.failingName)) throw new Error(`disk full writing ${name}`);
    return super.save(bytes, name);
  }
  public override async delete(fileId: string): Promise<void> {
    this.DeletedIDs.push(fileId);
    await super.delete(fileId);
  }
}

/** The unit harness (bound to the protocol row) with the given trainer answer, protocol row, artifact store and steps. */
function protocolHarness(
  answer: ConstructorParameters<typeof FakeTrainer>[0],
  protocolRow = TrainingHarness.UnitProtocolRow(),
  artifacts: InMemoryArtifactStore = new InMemoryArtifactStore(),
  featureSteps?: FeatureStepGraph,
): ReturnType<typeof TrainingHarness.ForUnit> & { artifacts: InMemoryArtifactStore } {
  const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns(), featureSteps);
  const trainer = new FakeTrainer(answer);
  harness.deps.protocols = new FakeEvaluationProtocolStore([protocolRow]);
  harness.deps.trainer = trainer;
  harness.deps.artifactStore = artifacts;
  return { ...harness, trainer, artifacts };
}

describe('TrainingEngine — Prediction Unit pipelines', () => {
  const years = UnitYearsWorld.Years();
  const unitColumns = UnitYearsWorld.UnitColumns();

  it('excludes the unresolved 2026 cycle, stores the counts, and records the unit in the model lineage', async () => {
    const { engine, deps, pipeline, files, snapshots } = TrainingHarness.ForUnit(years, unitColumns);
    const trained = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const model = TrainingHarness.ModelOf(trained);
    const run = trained.run;
    const rows = snapshotRows(await storedContent(files, snapshots[0]));
    expect(rows).toHaveLength(8);   // 2024 + 2025 only
    expect(rows.every((r) => r.__ps_label === '0' || r.__ps_label === '1')).toBe(true);
    const results = JSON.parse(run.ValidationResults!);
    expect(results.schema).toBe('ps-run-results/v2');
    expect(results.unitResolution).toMatchObject({ rowsRead: 12, censoredRowsExcluded: 4, resolvedRows: 8, dataCutoff: '2026-01-01' });
    expect(JSON.parse(model.Lineage!)).toMatchObject({ predictionUnitId: 'U-1', predictionUnitVersion: 1, labelVersion: 1, unitRowEntity: 'Years' });
  });

  it('reads an updatable field of another entity as of each decision date, and stores the feature spec and levels in the lineage', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }, { Id: 's2', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] }] };
    const { engine, deps, pipeline, models, files, snapshots } = TrainingHarness.ForUnit(years, unitColumns, steps);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const sent = snapshotRows(await storedContent(files, snapshots[0]));
    expect(sent).toHaveLength(8);
    const statusOf = (person: number, cycle: number) => sent.find((r) => r.EventsAttended === UnitYearsWorld.EventsAttended(person, cycle))?.Status;
    // The lapsed person's stored Status is Lapsed, but on the 2024 decision date it was still Active.
    expect(statusOf(2, 2024)).toBe('Active');
    // On the 2025 decision date it was Lapsed, a level only that locked-holdout row has: the kept levels are counted on
    // the 2024 development rows, so the holdout row folds it as scoring would, and the fold names it.
    expect(statusOf(2, 2025)).toBe('__other');
    expect(JSON.parse(snapshots[0].ColumnProvenance).find((c: { column: string }) => c.column === 'Status').categoryFold).toEqual({ kept: ['Active'], folded: ['Lapsed'] });
    for (const p of [0, 1, 3]) for (const c of [2024, 2025]) expect(statusOf(p, c)).toBe('Active');
    const lineage = JSON.parse(models[0].Lineage!);
    expect(lineage.featureSpec.map((f: { name: string }) => f.name)).toEqual(['EventsAttended', 'Status']);
    expect(lineage.categoryLevels).toEqual({ Status: ['Active'] });
  });

  it('refuses a text column declared numeric at the assembly stage, naming the column, before calling the trainer', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended', 'Region'], Encodings: { Region: 'numeric' } }] };
    const { engine, deps, trainer, pipeline, runs, models } = TrainingHarness.ForUnit(years, unitColumns, steps);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'assembly', reason: { kind: 'non-numeric-in-numeric-column', column: 'Region' } } });
    expect(trainer.Requests).toHaveLength(0);
    expect(models).toHaveLength(0);
    const results = JSON.parse(runs[0].ValidationResults!);
    expect(results.refusal.stage).toBe('assembly');
    expect(results.refusal.reason.kind).toBe('non-numeric-in-numeric-column');
  });

  it('hands the trainer a re-issue that pre-authorises fresh snapshot downloads, so a retry never resends expired URLs', async () => {
    const { engine, deps, pipeline, files } = TrainingHarness.ForUnit(years, unitColumns);
    const issued = vi.spyOn(files, 'CreatePreAuthDownload');
    const sent: TrainerRequest[] = [];
    const retrying: ITrainerEvaluator = {
      RunTrainer: async (req: TrainerRequest, reissue: () => Promise<TrainerRequest>): Promise<TrainerResult> => {
        sent.push(req, await reissue());
        return cannedFor(req);
      },
    };
    deps.trainer = retrying;
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(issued).toHaveBeenCalledTimes(4);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ ...sent[0], snapshot: { ...sent[0].snapshot, matrix: sent[1].snapshot.matrix, rowManifest: sent[1].snapshot.rowManifest } });
    expect([sent[1].snapshot.matrix.fileId, sent[1].snapshot.rowManifest.fileId]).toEqual([sent[0].snapshot.matrix.fileId, sent[0].snapshot.rowManifest.fileId]);
  });

  describe('the bound Evaluation Protocol\'s exclusions', () => {
    const steps: FeatureStepGraph = { Steps: [
      { Id: 's1', Kind: 'select', Columns: ['EventsAttended', 'Region', 'StartDate'] },
      { Id: 's2', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] },
    ] };
    /** Protocol exclusions deny `Region` (names compared case-insensitively) and the People source; the pipeline's own deny list denies `StartDate`. */
    const excludedHarness = (): ReturnType<typeof protocolHarness> => {
      const protocolRow = ProtocolRowFixture.Row({ MinMinorityClassRows: 1, Exclusions: JSON.stringify({ denyFields: ['region'], denySources: ['People'] }) });
      const harness = protocolHarness(cannedFor, protocolRow, undefined, steps);
      harness.pipeline.LeakageGuard = JSON.stringify({ DenyFields: ['StartDate'], SingleFeatureDominanceThreshold: 0.6 });
      return harness;
    };

    it('keeps protocol-excluded fields and sources out of the snapshot a training run freezes, with the pipeline\'s deny list as well', async () => {
      const { engine, deps, pipeline, files, snapshots } = excludedHarness();
      await engine.trainModel({ pipelineId: pipeline.ID }, deps);
      const content = await storedContent(files, snapshots[0]);
      const rows = snapshotRows(content);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.EventsAttended).toBeTypeOf('number');
        expect(Object.keys(row).some((k) => k === 'Region' || k === 'Status' || k.startsWith('StartDate'))).toBe(false);
      }
    });

    it('resolves the same exclusions when it assembles on its own (pipeline ID and deps only)', async () => {
      const { engine, deps, pipeline } = excludedHarness();
      const assembly = await engine.AssembleForTraining(pipeline.ID, deps);
      expect(assembly.Assembled.Status).toBe('assembled');
      expect(assembly.Features.map((f) => f.name)).toEqual(['EventsAttended']);
    });
  });

  it('assembles the same matrix on its own (pipeline ID and deps only) as the training run sends', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }, { Id: 's2', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] }] };
    const { engine, deps, pipeline } = TrainingHarness.ForUnit(years, unitColumns, steps);
    const assembly = await engine.AssembleForTraining(pipeline.ID, deps);
    expect(assembly.Assembled.Status).toBe('assembled');
    if (assembly.Assembled.Status !== 'assembled') return;
    expect(assembly.Unit.id).toBe('U-1');
    expect(assembly.Features.map((f) => f.name)).toEqual(['EventsAttended', 'Status']);
    expect(assembly.UnitRead.Rows).toHaveLength(8);
    const byId = new Map(assembly.Assembled.Rows.map((r) => [r.RowID, r.Values]));
    expect(byId.get('y2024-2')).toEqual([UnitYearsWorld.EventsAttended(2, 2024), 'Active']);
    expect(byId.get('y2025-2')).toEqual([UnitYearsWorld.EventsAttended(2, 2025), 'Lapsed']);
  });

  it('round-trips the stored lineage: the scoring path reads back what training wrote and assembles the same values', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }, { Id: 's2', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] }] };
    const { engine, deps, pipeline, models, files, snapshots } = TrainingHarness.ForUnit(years, unitColumns, steps);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const trained = models[0];
    trained.Status = 'Validated';
    trained.ArtifactFileID = 'file-1';
    const modelBytes = new TextEncoder().encode('model-bytes');
    // Scoring loads only a verified artifact: the loader holds other bytes than the run stored, so register their hash.
    trained.ArtifactSha256 = SnapshotHash.Sha256Hex(modelBytes);
    const artifacts = new InMemoryArtifactLoader();
    artifacts.Set('file-1', modelBytes);
    const scoringDeps: MLInferenceDeps = {
      // The model row training wrote (it carries the pipeline ID), read back as scoring loads it: one deliberate
      // test-double cast at the seam, as this file's entity factory does (a field-bag fake is not a BaseEntity).
      modelLoader: { loadModel: async () => trained as unknown as MJMLModelEntity },
      artifactLoader: artifacts,
      sidecar: { predict: async () => ({ predictions: [], classOrder: null }) },
      pipelineUnits: { PredictionUnitIDOf: async (id: string) => (id === pipeline.ID ? UnitYearsWorld.UnitID : null) },
      trainingRows: { TrainingRowIDsOf: async () => new Set<string>() },
      predictionUnits: deps.predictionUnits,
      assemblyMetadata: deps.assemblyMetadata,
      dataAccess: deps.dataAccess,
    };
    const context: RecordProcessorContext = { ContextUser: fakeUser, Provider: fakeProvider };
    const scored = await new MLModelInferenceProcessor({ modelId: trained.ID, deps: scoringDeps }).AssembleForScoring([{ ID: 'y2024-2' }, { ID: 'y2025-2' }], context, 'unit-rule');
    expect(scored.Status).toBe('assembled');
    if (scored.Status !== 'assembled') return;
    // The run's own matrix (the snapshot), development row y2024-2 and locked-holdout row y2025-2 included.
    const sent = snapshotRows(await storedContent(files, snapshots[0]));
    const snapshotValues = (person: number, cycle: number) => {
      const r = sent.find((x) => x.EventsAttended === UnitYearsWorld.EventsAttended(person, cycle));
      return r ? [r.EventsAttended, r.Status] : null;
    };
    expect(scored.Rows.map((r) => r.Values)).toEqual([snapshotValues(2, 2024), snapshotValues(2, 2025)]);
    expect(scored.Rows[0].Values[1]).toBe('Active');
  });

  it('refuses a one-class target before calling the trainer and records the refusal on the run', async () => {
    const { engine, deps, trainer, pipeline, runs } = TrainingHarness.ForUnit(years.filter((y) => y.Renewed === true), { ...unitColumns, Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2030-01-01' } }) });
    // Typed: the refusal is identified by its structured fields, never by the message text.
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ name: 'TrainingRefusedError', Refusal: { stage: 'unit', reason: { kind: 'single-valued-target' } } });
    expect(trainer.Requests).toHaveLength(0);
    const run = runs[0];
    expect(run.Status).toBe('Failed');
    expect(JSON.parse(run.ValidationResults!)).toMatchObject({ status: 'refused', refusal: { stage: 'unit', reason: { kind: 'single-valued-target', value: '1' } } });
  });

  it('refuses an as-of strategy for a unit pipeline before calling the trainer (decision dates come from the unit)', async () => {
    const { engine, deps, trainer, pipeline } = TrainingHarness.ForUnit(years, unitColumns);
    pipeline.AsOfStrategy = JSON.stringify({ Mode: 'column', Column: 'StartDate' } satisfies AsOfStrategy);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'asOf' } } });
    expect(trainer.Requests).toHaveLength(0);
  });

  it("records the trainer's measured seconds as the run's compute, unpriced when no rate is configured", async () => {
    const { engine, deps, pipeline } = TrainingHarness.ForUnit(years, unitColumns);
    const { run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(run.Status).toBe('Completed');
    expect(run.ComputeSeconds).toBe(12.5); // real compute, never 0
    expect(run.ComputeCost).toBeNull();
  });

  it("copies the pipeline's EvaluationProtocolID onto the run and trains through the trainer once", async () => {
    const { engine, deps, trainer, pipeline, runs } = TrainingHarness.ForUnit(years, unitColumns);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(runs[0].EvaluationProtocolID).toBe(ProtocolRowFixture.ID);
    expect(trainer.Requests.length).toBe(1);
  });

  it('freezes the unit rows into one Training Snapshot and sends the trainer its files', async () => {
    const { engine, deps, trainer, pipeline, runs, models, snapshots, files } = TrainingHarness.ForUnit(years, unitColumns);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(snapshots).toHaveLength(1);
    const s = snapshots[0];
    expect([s.ManifestRowCount, s.CensoredRowsExcluded]).toEqual([8, 4]);
    expect(runs[0].TrainingSnapshotID).toBe(s.ID);
    expect(JSON.parse(models[0].Lineage!)).toMatchObject({ trainingSnapshotId: s.ID, snapshotContentHash: s.ContentHash });
    const content = await storedContent(files, s);
    const holdout = content.Manifest.filter((m) => m.role === 'locked-holdout');
    expect(holdout.length).toBe(s.HoldoutRowCount);
    expect(holdout.length).toBeGreaterThan(0);
    const request = trainer.Requests[0];
    expect([request.snapshot.id, request.snapshot.matrix.fileId, request.snapshot.rowManifest.fileId]).toEqual([s.ID, s.MatrixFileID, s.RowManifestFileID]);
    const results = storedResults(runs[0].ValidationResults);
    expect(results.status === 'completed' ? results.trainerRequest !== null : 'not completed').toBe(true);
  });

  it('reuses the snapshot for a second training of identical data: one snapshot row, two runs pointing at it', async () => {
    const { engine, deps, pipeline, runs, snapshots, files, snapshotStore } = TrainingHarness.ForUnit(years, unitColumns);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const objectsAfterFirst = files.Saved.size;
    expect(snapshotStore.ReusedLookups).toBe(0);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(files.Saved.size).toBe(objectsAfterFirst); // the second training wrote no files
    expect(snapshotStore.ReusedLookups).toBe(1); // it found the saved snapshot and reused it
    expect(snapshots).toHaveLength(1);
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.TrainingSnapshotID)).toEqual([snapshots[0].ID, snapshots[0].ID]);
  });

  it('refuses a retraining of identical data before the trainer when the artifact store cannot write, writing no run and reusing no snapshot', async () => {
    const { engine, deps, trainer, pipeline, runs, snapshotStore } = TrainingHarness.ForUnit(years, unitColumns);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const unconfigured = 'Predictive Studio storage: storage provider "S3" is not configured on this server';
    vi.spyOn(deps.artifactStore, 'AssertWritable').mockRejectedValue(new Error(unconfigured));
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow(/refused before training: .*"S3" is not configured on this server/);
    expect(trainer.Requests).toHaveLength(1);
    expect(runs).toHaveLength(1);
    expect(snapshotStore.ReusedLookups).toBe(0);
  });

  it('refuses to train a unit pipeline without a snapshot file store, before calling the trainer', async () => {
    const { engine, deps, trainer, pipeline, snapshots, runs } = TrainingHarness.ForUnit(years, unitColumns);
    delete deps.snapshotFiles;
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow(/training deps are incomplete.*snapshot file store/);
    // A wiring error fails before anything is written: no run row, no snapshot, no trainer call.
    expect([trainer.Requests.length, snapshots.length, runs.length]).toEqual([0, 0, 0]);
  });

  it("sends the pipeline's own algorithm as the single candidate and records the finalist's hyperparameters on the run", async () => {
    const { engine, deps, pipeline, runs, models } = TrainingHarness.ForUnit(years, unitColumns);
    const trainer = new FakeTrainer((r) => TrainerResultFixtures.WithFinalist(cannedModelFor(r), 'xgboost', r.snapshot.featureSchemaHash));
    deps.trainer = trainer;
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(trainer.Requests.map((r) => r.candidates)).toEqual([[{ name: 'xgboost', algorithmId: 'algo-xgb', driverKey: 'xgboost', hyperparameters: { max_depth: 4 } }]]);
    expect(JSON.parse(runs[0].Hyperparameters!)).toEqual({ max_depth: 4 });
    expect(models[0].AlgorithmID).toBe('algo-xgb');
  });

  it('fails a run whose Hyperparameters column is not a JSON object, naming it, before calling the trainer', async () => {
    const { engine, deps, trainer, pipeline, runs } = TrainingHarness.ForUnit(years, unitColumns);
    pipeline.Hyperparameters = JSON.stringify([3, 4]);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow('Hyperparameters must be a JSON object');
    expect(trainer.Requests).toHaveLength(0);
    expect(runs[0].Status).toBe('Failed');
  });
});

describe('TrainingEngine — a time-indexed pipeline is judged only on a time-respecting holdout', () => {
  it('refuses a seeded-random holdout before any run row, and trains under a date carve', async () => {
    const seeded = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    seeded.pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', LockedHoldoutFraction: 0.2, TimeIndexColumn: 'StartDate' });
    seeded.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ MinMinorityClassRows: 1, Holdout: JSON.stringify({ kind: 'seeded-random', fraction: 0.25 }) })]);
    await expect(seeded.engine.trainModel({ pipelineId: seeded.pipeline.ID }, seeded.deps)).rejects.toMatchObject({
      Refusal: { stage: 'pipeline', reason: { kind: 'time-index-needs-time-holdout', pipelineId: seeded.pipeline.ID, protocolId: ProtocolRowFixture.ID, timeIndexColumn: 'StartDate', holdout: 'seeded-random' } },
    });
    expect([seeded.runs.length, seeded.trainer.Requests.length]).toEqual([0, 0]);
    const carved = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    carved.pipeline.ValidationStrategy = seeded.pipeline.ValidationStrategy;
    const trained = await carved.engine.trainModel({ pipelineId: carved.pipeline.ID }, carved.deps);
    expect([trained.run.Status, carved.trainer.Requests.length]).toEqual(['Completed', 1]);
  });
});

describe('TrainingEngine — a virtual (view-joined) field', () => {
  /** The world's Years rows with a view-joined `PersonName` (as stored today) and metadata declaring it virtual. */
  function withVirtualPersonName(harness: ReturnType<typeof TrainingHarness.ForUnit>): void {
    const years = UnitYearsWorld.Years().map((y) => ({ ...y, PersonName: `Person ${String(y.PersonID)}` }));
    const yearsEntity = { ...UnitYearsWorld.YearsEntity, Fields: [...UnitYearsWorld.YearsEntity.Fields, { Name: 'PersonName', SqlType: 'nvarchar', TSType: 'string' as const, AllowUpdateAPI: false, IsPrimaryKey: false, RelatedEntity: null, IsVirtual: true }] };
    const byName = new Map([yearsEntity, UnitYearsWorld.PeopleEntity].map((e) => [e.Name, e] as const));
    harness.deps.assemblyMetadata = { Entity: (name: string) => byName.get(name) || null };
    harness.deps.dataAccess = new TableDataAccess(UnitYearsWorld.Tables(years));
    harness.pipeline.FeatureSteps = JSON.stringify({ Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended', 'PersonName'] }] } satisfies FeatureStepGraph);
  }

  it('trains a unit decided on the run\'s own day, reading the virtual field as it stands that day', async () => {
    const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const units = new InMemoryUnitVersions();
    units.Seed({
      ...UnitYearsWorld.UnitColumns(), LabelWindowDays: 1,
      UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2026-10-20', advance: 'each-run' }, filter: [] }),
      Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-10-21' } }),
    });
    harness.deps.predictionUnits = units;
    harness.deps.entityFactory = new UnitVersionFactory(units, harness.deps.entityFactory);
    harness.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ MinMinorityClassRows: 1, Holdout: JSON.stringify({ kind: 'seeded-random', fraction: 0.25 }) })]);
    harness.deps.now = () => new Date('2026-11-02T09:00:00Z');
    withVirtualPersonName(harness);
    Object.assign(harness.pipeline, { TargetEntityID: '', Save: async (): Promise<boolean> => true });
    const trained = await harness.engine.trainModel({ pipelineId: harness.pipeline.ID }, harness.deps);
    expect(trained.run.Status).toBe('Completed');
    const rows = snapshotRows(await storedContent(harness.files, harness.snapshots[0]));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => typeof r.PersonName === 'string' && String(r.PersonName).startsWith('Person p'))).toBe(true);
  });

  it('refuses a unit whose rows are decided on past days, naming the virtual field, before calling the trainer', async () => {
    const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    withVirtualPersonName(harness);
    await expect(harness.engine.trainModel({ pipelineId: harness.pipeline.ID }, harness.deps))
      .rejects.toMatchObject({ Refusal: { stage: 'assembly', reason: { kind: 'virtual-field', entity: 'Years', field: 'PersonName' } } });
    expect(harness.trainer.Requests).toHaveLength(0);
  });
});

describe('TrainingEngine — an advancing fixed decision date', () => {
  it('saves the unit version dated the run day before the run, trains under it, and saves no third version the same day', async () => {
    const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const units = new InMemoryUnitVersions();
    units.Seed({
      ...UnitYearsWorld.UnitColumns(), LabelWindowDays: 1,
      UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2026-10-20', advance: 'each-run' }, filter: [] }),
      Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-10-21' } }),
    });
    harness.deps.predictionUnits = units;
    harness.deps.entityFactory = new UnitVersionFactory(units, harness.deps.entityFactory);
    harness.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ MinMinorityClassRows: 1, Holdout: JSON.stringify({ kind: 'seeded-random', fraction: 0.25 }) })]);
    harness.deps.now = () => new Date('2026-11-02T09:00:00Z');
    let saves = 0;
    const pipeline = Object.assign(harness.pipeline, { TargetEntityID: '', Save: async (): Promise<boolean> => { saves++; return true; } });
    const trained = await harness.engine.trainModel({ pipelineId: pipeline.ID }, harness.deps);
    const v2 = units.Rows.find((r) => r.Version === 2);
    expect(v2 && [JSON.parse(v2.UnitRows).decisionDate.date, JSON.parse(v2.AuthoredBy).component, pipeline.PredictionUnitID]).toEqual(['2026-11-02', 'decision-date-advance', v2?.ID]);
    expect(JSON.parse(TrainingHarness.ModelOf(trained).Lineage || '{}')).toMatchObject({ predictionUnitId: v2?.ID, predictionUnitVersion: 2 });
    await harness.engine.trainModel({ pipelineId: pipeline.ID }, harness.deps);
    expect([units.Rows.length, saves]).toEqual([2, 1]);
  });

  it('saves no new version for a pipeline refused before its run (a time index under a seeded-random holdout)', async () => {
    const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const units = new InMemoryUnitVersions();
    units.Seed({
      ...UnitYearsWorld.UnitColumns(), LabelWindowDays: 1,
      UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2026-10-20', advance: 'each-run' }, filter: [] }),
      Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-10-21' } }),
    });
    harness.deps.predictionUnits = units;
    harness.deps.entityFactory = new UnitVersionFactory(units, harness.deps.entityFactory);
    harness.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ MinMinorityClassRows: 1, Holdout: JSON.stringify({ kind: 'seeded-random', fraction: 0.25 }) })]);
    harness.deps.now = () => new Date('2026-11-02T09:00:00Z');
    harness.pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', LockedHoldoutFraction: 0.2, TimeIndexColumn: 'Year' });
    await expect(harness.engine.trainModel({ pipelineId: harness.pipeline.ID }, harness.deps)).rejects.toMatchObject({ Refusal: { reason: { kind: 'time-index-needs-time-holdout' } } });
    expect([units.Rows.length, harness.runs.length]).toEqual([1, 0]);
  });

  it('saves no new version for a pipeline refused for a unit override (a stored as-of strategy) or failed for incomplete deps (no trainer)', async () => {
    const advancing = (): { readonly harness: ReturnType<typeof TrainingHarness.ForUnit>; readonly units: InMemoryUnitVersions } => {
      const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
      const units = new InMemoryUnitVersions();
      units.Seed({
        ...UnitYearsWorld.UnitColumns(), LabelWindowDays: 1,
        UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2026-10-20', advance: 'each-run' }, filter: [] }),
        Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-10-21' } }),
      });
      harness.deps.predictionUnits = units;
      harness.deps.entityFactory = new UnitVersionFactory(units, harness.deps.entityFactory);
      harness.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ MinMinorityClassRows: 1, Holdout: JSON.stringify({ kind: 'seeded-random', fraction: 0.25 }) })]);
      harness.deps.now = () => new Date('2026-11-02T09:00:00Z');
      return { harness, units };
    };
    const overridden = advancing();
    overridden.harness.pipeline.AsOfStrategy = JSON.stringify({ Mode: 'column', Column: 'StartDate' } satisfies AsOfStrategy);
    await expect(overridden.harness.engine.trainModel({ pipelineId: overridden.harness.pipeline.ID }, overridden.harness.deps)).rejects.toMatchObject({ Refusal: { reason: { kind: 'input-not-accepted', input: 'asOf' } } });
    expect([overridden.units.Rows.length, overridden.harness.runs.length]).toEqual([1, 0]);
    const unwired = advancing();
    delete unwired.harness.deps.trainer;
    await expect(unwired.harness.engine.trainModel({ pipelineId: unwired.harness.pipeline.ID }, unwired.harness.deps)).rejects.toThrow(/no trainer \(trainer\) was supplied/);
    expect([unwired.units.Rows.length, unwired.harness.runs.length]).toEqual([1, 0]);
  });
});

describe('TrainingEngine — no unit pipeline trains without the protocol version it is bound to', () => {
  it('refuses a unit pipeline without an Evaluation Protocol before any run row is written or any row is read', async () => {
    const { engine, deps, pipeline, runs, trainer, protocols } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    pipeline.EvaluationProtocolID = null;
    const read = vi.spyOn(TableDataAccess.prototype, 'fetchRows');
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: pipeline.ID } } });
    expect([runs.length, trainer.Requests.length, protocols.Reads]).toEqual([0, 0, 0]);
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it('refuses a pipeline whose Evaluation Protocol row does not exist (protocol-required), before any run row', async () => {
    const { engine, deps, pipeline, trainer, runs } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    deps.protocols = new FakeEvaluationProtocolStore([]);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: pipeline.ID } } });
    expect([trainer.Requests.length, runs.length]).toEqual([0, 0]);
  });

  it('refuses a bound protocol row that does not parse (protocol-invalid), before any run row', async () => {
    const { engine, deps, pipeline, runs } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ Holdout: JSON.stringify({ kind: 'sideways' }) })]);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'protocol-invalid', protocolId: ProtocolRowFixture.ID } } });
    expect(runs).toHaveLength(0);
  });

  it("refuses more candidates than the protocol's budget allows, before any run row, instead of running the first ones", async () => {
    const { engine, deps, pipeline, runs, trainer } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const candidate = (name: string) => TrainerRequestBuilder.CandidateFromPipeline(name, 'algo-xgb', 'xgboost', '{}');
    const four = ['a', 'b', 'c', 'd'].map(candidate);
    await expect(engine.trainModel({ pipelineId: pipeline.ID, candidates: four }, deps)).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'too-many-candidates', pipelineId: pipeline.ID, candidates: 4, maxCandidates: 3 } } });
    expect([runs.length, trainer.Requests.length]).toEqual([0, 0]);
  });

  it("sends the search's candidates and records the finalist's algorithm and hyperparameters", async () => {
    const { engine, deps, pipeline, runs, models } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const trainer = new FakeTrainer(cannedModelFor);
    deps.trainer = trainer;
    const candidates = [TrainerRequestBuilder.CandidateFromPipeline('glm', 'algo-glm', 'logistic_regression', '{"C":0.5}'), TrainerRequestBuilder.CandidateFromPipeline('xgb', 'algo-xgb2', 'xgboost', '{"max_depth":2}')];
    await engine.trainModel({ pipelineId: pipeline.ID, candidates }, deps);
    expect(trainer.Requests[0].candidates).toEqual(candidates);
    expect(JSON.parse(runs[0].Hyperparameters!)).toEqual({ max_depth: 2 });
    expect(models[0].AlgorithmID).toBe('algo-xgb2');
  });

  it("caps the trainer's timeout at an enclosing budget's remaining seconds, 0 included, and otherwise sends the protocol's budget", async () => {
    const { engine, deps, trainer, pipeline } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    await engine.trainModel({ pipelineId: pipeline.ID, timeoutSeconds: 90 }, deps);
    await engine.trainModel({ pipelineId: pipeline.ID, timeoutSeconds: 5000 }, deps);
    await engine.trainModel({ pipelineId: pipeline.ID, timeoutSeconds: null }, deps);
    expect(trainer.Requests.map((r) => r.timeoutSeconds)).toEqual([600, 90, 600, 600]);
    expect(TrainingEngine.TimeoutSecondsFor(protocolSpec(), { timeoutSeconds: 0 })).toBe(0);
  });

  it('refuses a protocol row created after the run row, recording the refusal on the run', async () => {
    const { engine, deps, pipeline, runs, trainer } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const later = new Date(FakeMLRun.DefaultCreatedAt.getTime() + 1);
    deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row()], later);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({
      Refusal: { stage: 'pipeline', reason: { kind: 'protocol-created-after-run', protocolId: ProtocolRowFixture.ID, protocolCreatedAt: later.toISOString(), runCreatedAt: FakeMLRun.DefaultCreatedAt.toISOString() } },
    });
    expect(trainer.Requests).toHaveLength(0);
    expect(storedResults(runs[0].ValidationResults)).toMatchObject({ status: 'refused', refusal: { reason: { kind: 'protocol-created-after-run' } } });
    // A protocol created at the same instant as the run precedes it.
    const same = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    same.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row()], FakeMLRun.DefaultCreatedAt);
    expect((await same.engine.trainModel({ pipelineId: same.pipeline.ID }, same.deps)).run.Status).toBe('Completed');
  });

  it("refuses a protocol scoring another task family than the unit's, on the run, before any row is read", async () => {
    const { engine, deps, pipeline, runs, trainer } = protocolHarness(cannedFor, ProtocolRowFixture.Row({ PrimaryScore: JSON.stringify({ family: 'count', metric: 'poisson-deviance' }) }));
    const read = vi.spyOn(TableDataAccess.prototype, 'fetchRows');
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({
      Refusal: { stage: 'pipeline', reason: { kind: 'protocol-unit-mismatch', protocolId: ProtocolRowFixture.ID, problems: ["The primary score is a count score but the Prediction Unit's task is binary; candidates may only be ranked by a binary score."] } },
    });
    expect(read).not.toHaveBeenCalled();
    expect([runs[0].Status, trainer.Requests.length]).toEqual(['Failed', 0]);
    read.mockRestore();
  });

  it("refuses a protocol grouping by a key other than the unit's before any assembly or snapshot write", async () => {
    const assemble = vi.spyOn(AsOfFeatureAssembler.prototype, 'Assemble');
    const row = ProtocolRowFixture.Row({ InnerValidation: JSON.stringify({ kind: 'grouped-kfold', folds: 5, repeats: 1, groupKey: 'PersonID' }) });
    const { engine, deps, pipeline, trainer, snapshots, files, runs } = protocolHarness(cannedFor, row);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({
      Refusal: { stage: 'pipeline', reason: { kind: 'protocol-unit-mismatch', protocolId: ProtocolRowFixture.ID, problems: ['The protocol groups its inner validation by "PersonID", but the Prediction Unit has no group key (its rows are grouped by their entity key); the folds would not be grouped the way the protocol says.'] } },
    });
    expect(assemble).not.toHaveBeenCalled();
    expect([snapshots.length, files.Saved.size, trainer.Requests.length]).toEqual([0, 0, 0]);
    expect(runs[0].Status).toBe('Failed');
    assemble.mockRestore();
  });
});

describe("TrainingEngine — the protocol's locked holdout", () => {
  it('carves on the protocol cutoff, leaves the rows on or after its holdout end out of the snapshot, and stores the carve on the run', async () => {
    // A 2023 cycle before the world's 2024 and 2025 cycles: 2023 develops, 2024 is held out, 2025 is after the holdout end.
    const earlier = [0, 1, 2, 3].map((p) => ({ ID: `y2023-${p}`, PersonID: `p${p}`, StartDate: '2023-01-01', EventsAttended: 100 + p, Region: 'EU', Renewed: p !== 1 }));
    const harness = TrainingHarness.ForUnit([...earlier, ...UnitYearsWorld.Years()], UnitYearsWorld.UnitColumns());
    harness.deps.protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({
      Holdout: JSON.stringify({ kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: '2025-01-01', newEntityReport: null }),
    })]);
    harness.deps.trainer = new FakeTrainer(cannedFor);
    const { run } = await harness.engine.trainModel({ pipelineId: harness.pipeline.ID }, harness.deps);
    const content = await storedContent(harness.files, harness.snapshots[0]);
    expect(content.Manifest.map((m) => [m.rowId, m.role]).sort()).toEqual([
      ...[0, 1, 2, 3].map((p) => [`y2023-${p}`, 'development']), ...[0, 1, 2, 3].map((p) => [`y2024-${p}`, 'locked-holdout']),
    ]);
    expect(content.Rows).toHaveLength(8);
    expect([harness.snapshots[0].ManifestRowCount, harness.snapshots[0].HoldoutRowCount]).toEqual([8, 4]);
    const results = storedResults(run.ValidationResults);
    if (results.status !== 'completed') throw new Error('expected a completed run');
    expect(results.carve).toEqual({
      kind: 'date-carved', cutoff: '2024-01-01', holdoutEnd: '2025-01-01', developmentRowCount: 4, holdoutRowCount: 4, excludedAfterHoldoutEnd: 4,
      holdoutClassCounts: { 0: 1, 1: 3 }, holdoutPeriods: ['2024-01-01'], newEntity: null,
    });
  });

  it('refuses a protocol cutoff that leaves nothing to test on at the carve stage, recording the refusal on the run', async () => {
    const { engine, deps, pipeline, runs, trainer } = protocolHarness(cannedFor, ProtocolRowFixture.Row({
      Holdout: JSON.stringify({ kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2026-01-01', holdoutEnd: null, newEntityReport: null }),
    }));
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'carve', reason: { kind: 'no-holdout-rows', cutoff: '2026-01-01', holdoutEnd: null } } });
    expect(trainer.Requests).toHaveLength(0);
    const results = storedResults(runs[0].ValidationResults);
    expect(results).toMatchObject({ status: 'refused', refusal: { stage: 'carve', reason: { kind: 'no-holdout-rows' } } });
  });
});

describe('TrainingEngine — a unit pipeline trains through the trainer', () => {
  it('trains a unit pipeline through /trainer', async () => {
    const { engine, deps, pipeline, trainer, artifacts, files, snapshots } = protocolHarness(cannedFor);
    const { model, run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    // The protocol reached the snapshot: its subgroup field is a slice column of the frozen matrix.
    const content = await storedContent(files, snapshots[0]);
    expect(content.Header.sliceColumns).toEqual({ Region: '__ps_slice:Region' });
    expect(content.Header.columns).toContain('__ps_slice:Region');
    expect(snapshots[0].EvaluationProtocolID).toBe(ProtocolRowFixture.ID);
    expect(trainer.Requests).toHaveLength(1);
    const request = trainer.Requests[0];
    expect(request.snapshot.id).toBe(run.TrainingSnapshotID);
    expect(request.protocol.id).toBe(ProtocolRowFixture.ID);
    expect([run.Status, run.EvaluationProtocolID, run.ComputeSeconds, run.ComputeCost]).toEqual(['Completed', ProtocolRowFixture.ID, 12.5, null]);
    const results = storedResults(run.ValidationResults);
    expect(results.status).toBe('completed');
    if (results.status !== 'completed') return;
    expect(results.trainer?.finalist).toBe('xgb');
    expect(results.trainer?.artifacts.map((a) => a.fileId).every((id) => id.length > 0)).toBe(true);
    expect(run.ValidationResults).not.toContain('bytesBase64');
    expect(results.trainerRequest?.evaluationProtocolId).toBe(ProtocolRowFixture.ID);
    // The protocol's date carve: the 2024 cycle develops the model, the 2025 cycle is the locked holdout.
    expect(results.carve).toEqual({
      kind: 'date-carved', cutoff: '2025-01-01', holdoutEnd: null, developmentRowCount: 4, holdoutRowCount: 4, excludedAfterHoldoutEnd: 0,
      holdoutClassCounts: { 0: 1, 1: 3 }, holdoutPeriods: ['2025-01-01'], newEntity: null,
    });
    // Every returned artifact is stored (lineage); the gate kept the GLM, so the model row is the GLM's artifact.
    expect(artifacts.Saved.size).toBe(3);
    expect(results.gate?.decision).toEqual({ outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null });
    const glmFile = results.trainer?.artifacts.find((a) => a.candidate === 'glm')?.fileId;
    expect(model?.ArtifactFileID).toBe(glmFile);
    expect(run.ResultingModelID).toBe(model?.ID);
    expect(JSON.parse(model?.Lineage || '{}')).toMatchObject({ evaluationProtocolId: ProtocolRowFixture.ID, artifactFormat: 'ps-predictor/v2', trainingSnapshotId: run.TrainingSnapshotID, shippedMember: 'glm', shippedDriver: 'logistic_regression' });
  });

  it("stores the trainer's held-out permutation importance as the legacy share map and its kind in the evaluation record", async () => {
    const importance = [importanceOf('EventsAttended', 0.375), importanceOf('Region', 0.125), importanceOf('StartDate', -0.01)];
    const { engine, deps, pipeline } = protocolHarness((r) => ({ ...cannedModelFor(r), importance }));
    const { model } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(JSON.parse(model?.FeatureImportance || 'null')).toEqual({ EventsAttended: 0.75, Region: 0.25, StartDate: 0 });
    expect(EvaluationLineage.Read(model?.Lineage)?.ImportanceKind).toBe('held_out_permutation');
  });

  it('flags a run whose trainer importance is dominated by one feature with the LEAKAGE WARNING note, and keeps the model Draft', async () => {
    const importance = [importanceOf('EventsAttended', 0.95), importanceOf('Region', 0.01)];
    const { engine, deps, pipeline } = protocolHarness((r) => ({ ...cannedModelFor(r), importance }));
    const result = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(result.run.Notes).toMatch(/^Trainer completed: finalist 'xgb'\. The model beats the flat guess by 0\.0680 \[0\.0500, 0\.0850\] and the best simple baseline by 0\.0060 \[0\.0020, 0\.0100\] \(log-loss, lower is better\)\. LEAKAGE WARNING: one field \("EventsAttended"\) is doing almost all the predicting \(99\.0% of total importance, over the 60% threshold\)/);
    expect(WasTrainingLeakageFlagged(result)).toBe(true);
    expect(result.model?.Status).toBe('Draft');
  });

  it('notes no dominance when no feature dominates the trainer importance, or the trainer measured none', async () => {
    for (const importance of [[importanceOf('EventsAttended', 0.5), importanceOf('Region', 0.5)], []]) {
      const { engine, deps, pipeline } = protocolHarness((r) => ({ ...cannedFor(r), importance }));
      const result = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
      expect(result.run.Notes).toBe("Trainer completed: finalist 'xgb'. The simple baseline glm beats the flat guess by 0.0650 [0.0480, 0.0820] (log-loss); the trained model does not beat it, so the simple baseline is kept. Training completed. No single-feature dominance detected.");
      expect(WasTrainingLeakageFlagged(result)).toBe(false);
    }
  });

  it('stores an empty importance map with no importance kind when the trainer measured none (a forecast reports none)', async () => {
    const { engine, deps, pipeline } = protocolHarness(cannedFor);
    const model = TrainingHarness.ModelOf(await engine.trainModel({ pipelineId: pipeline.ID }, deps));
    expect(model.FeatureImportance).toBe('{}');
    expect(EvaluationLineage.Read(model.Lineage)?.ImportanceKind).toBe('none');
  });

  it('prices the trainer seconds at the rate read before training, even when the rate changes while the trainer runs', async () => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '0.5');
    const { engine, deps, pipeline } = protocolHarness((r) => {
      vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '9');
      return cannedFor(r);
    });
    const { run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect([run.ComputeSeconds, run.ComputeCost]).toEqual([12.5, 12.5 * 0.5]);
  });

  it.each([
    ['an artifact whose bytes do not match its SHA-256', (r: TrainerRequest): TrainerCompleted => {
      const c = cannedFor(r);
      return { ...c, artifacts: c.artifacts.map((a) => (a.candidate === 'glm' ? { ...a, sha256: 'd'.repeat(64) } : a)) };
    }, /artifact 'glm': its bytes have sha256 [0-9a-f]{64}, not the stated sha256 dddd/],
    ['an artifact built for another feature schema', (r: TrainerRequest): TrainerCompleted => {
      const c = cannedFor(r);
      return { ...c, artifacts: c.artifacts.map((a) => (a.candidate === 'oneFeature' ? { ...a, featureSchemaHash: 'e'.repeat(64) } : a)) };
    }, /artifact 'oneFeature' was built for feature schema eeee.*, not the snapshot's/],
    ['an answer for another training run', (r: TrainerRequest): TrainerCompleted => ({ ...cannedFor(r), trainingRunId: '00000000-0000-0000-0000-0000000000ff' }),
      /answered for training run 00000000-0000-0000-0000-0000000000ff, not/],
  ])('fails the run and stores nothing for %s', async (_what, answer, message) => {
    const { engine, deps, pipeline, runs, models, artifacts } = protocolHarness(answer);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow(message);
    expect(runs[0].Status).toBe('Failed');
    expect(runs[0].Notes).toMatch(message);
    expect(runs[0].ComputeSeconds).toBe(12.5);
    expect(artifacts.Saved.size).toBe(0);
    expect(models).toHaveLength(0);
  });

  it('accepts an answer whose run ID differs from the run only in letter case', async () => {
    const { engine, deps, pipeline } = protocolHarness((r) => ({ ...cannedFor(r), trainingRunId: r.trainingRunId.toUpperCase() }));
    const { run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(run.Status).toBe('Completed');
  });

  it('deletes the artifacts already saved when one save fails, then fails the run', async () => {
    const store = new FailingArtifactStore('-glm.');
    const { engine, deps, pipeline, runs, models } = protocolHarness(cannedFor, ProtocolRowFixture.Row(), store);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow(/disk full writing trainer-.*-glm\.json/);
    expect(store.DeletedIDs).toHaveLength(2);
    expect(store.Saved.size).toBe(0);
    expect(runs[0].Status).toBe('Failed');
    expect(models).toHaveLength(0);
  });

  it('deletes every stored artifact when the model row fails to save, and reports the save error', async () => {
    const store = new FailingArtifactStore('no artifact name fails');
    const { engine, deps, pipeline, runs } = protocolHarness(cannedFor, TrainingHarness.UnitProtocolRow(), store);
    const save = FakeEntity.prototype.Save;
    vi.spyOn(FakeEntity.prototype, 'Save').mockImplementation(async function (this: FakeEntity): Promise<boolean> {
      if (this instanceof FakeMLModel) { this.LatestResult = { CompleteMessage: 'the ML Models table is locked' }; return false; }
      return save.call(this);
    });
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow('TrainingEngine: failed to create ML Model: the ML Models table is locked');
    expect([store.DeletedIDs.length, store.Saved.size]).toEqual([3, 0]);
    expect([runs[0].Status, runs[0].ResultingModelID]).toEqual(['Failed', null]);
    expect(runs[0].Notes).toContain('the ML Models table is locked');
  });

  it('deletes the model row and every stored artifact when the run fails to complete, and reports the run error', async () => {
    const store = new FailingArtifactStore('no artifact name fails');
    const { engine, deps, pipeline, runs, models } = protocolHarness(cannedFor, TrainingHarness.UnitProtocolRow(), store);
    const save = FakeEntity.prototype.Save;
    vi.spyOn(FakeEntity.prototype, 'Save').mockImplementation(async function (this: FakeEntity): Promise<boolean> {
      if (this instanceof FakeMLRun && this.ValidationResults?.includes('"status":"completed"')) {
        this.LatestResult = { CompleteMessage: 'the ML Training Runs table is locked' };
        return false;
      }
      return save.call(this);
    });
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow('TrainingEngine: failed to finalize ML Training Run: the ML Training Runs table is locked');
    expect(models.map((m) => m.Deleted)).toEqual([true]);
    expect([store.DeletedIDs.length, store.Saved.size]).toEqual([3, 0]);
    expect([runs[0].Status, runs[0].ResultingModelID]).toEqual(['Failed', null]);
    // The failed run keeps no 'completed' result pointing at the artifact files that were just deleted.
    expect([runs[0].ValidationResults, runs[0].FeaturesUsed, runs[0].Hyperparameters]).toEqual([null, null, null]);
  });

  it('slices by an assembled date-part column, named as the assembler names it, and completes', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended', 'StartDate'] }] };
    const row = ProtocolRowFixture.Row({ Slices: JSON.stringify({ outOfTime: true, subgroups: ['StartDate__days_since_decision'] }) });
    const { engine, deps, pipeline, files, snapshots } = protocolHarness(cannedFor, row, new InMemoryArtifactStore(), steps);
    const { run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(run.Status).toBe('Completed');
    const content = await storedContent(files, snapshots[0]);
    expect(content.Header.sliceColumns).toEqual({ StartDate__days_since_decision: '__ps_slice:StartDate__days_since_decision' });
  });

  it('refuses a slice field that is neither a feature column nor a unit-row field before any assembly or snapshot write', async () => {
    const assemble = vi.spyOn(AsOfFeatureAssembler.prototype, 'Assemble');
    const row = ProtocolRowFixture.Row({ Slices: JSON.stringify({ outOfTime: true, subgroups: ['Planet'] }) });
    const { engine, deps, pipeline, trainer, snapshots, files } = protocolHarness(cannedFor, row);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'assembly', reason: { kind: 'unresolved-column', field: 'Planet' } } });
    expect(assemble).not.toHaveBeenCalled();
    expect([snapshots.length, files.Saved.size, trainer.Requests.length]).toEqual([0, 0, 0]);
    assemble.mockRestore();
  });

  it('stores a failed trainer result as a trainer refusal', async () => {
    const { engine, deps, pipeline, runs, models } = protocolHarness((r) => TrainerResultFixtures.CannedFailed(r.trainingRunId));
    const training = engine.trainModel({ pipelineId: pipeline.ID }, deps);
    await expect(training).rejects.toBeInstanceOf(TrainingRefusedError);
    await expect(training).rejects.toThrow(/trainer-failed.*inner-cv/);
    expect([runs[0].Status, runs[0].ComputeSeconds]).toEqual(['Failed', 3.25]);
    expect(storedResults(runs[0].ValidationResults)).toEqual({
      schema: 'ps-run-results/v2', status: 'refused',
      refusal: { stage: 'trainer', reason: { kind: 'trainer-failed', stage: 'inner-cv', message: "candidate 'xgb': only one class in a fold", computeSeconds: 3.25 } },
    });
    expect(models).toHaveLength(0);
  });

  it('refuses a trainer report that pruned a candidate (selection-invalid), keeping its compute and storing no artifact or model', async () => {
    const pruned = (r: TrainerRequest): TrainerCompleted => {
      const canned = cannedFor(r);
      return { ...canned, innerScores: [...canned.innerScores, { candidate: 'rf', inner: TrainerResultFixtures.Mwi('log-loss', 0.5, 0.48, 0.52, 3668), folds: 5, optimistic: true }] };
    };
    const { engine, deps, pipeline, runs, models, artifacts } = protocolHarness(pruned);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow('Refused (selection-invalid): candidate-pruned — rf was scored on 5 folds, the others on 15');
    expect([runs[0].Status, runs[0].ComputeSeconds]).toEqual(['Failed', 12.5]);
    expect(storedResults(runs[0].ValidationResults)).toEqual({
      schema: 'ps-run-results/v2', status: 'refused',
      refusal: { stage: 'trainer', reason: { kind: 'selection-invalid', reason: 'candidate-pruned', detail: 'rf was scored on 5 folds, the others on 15' } },
    });
    expect([models.length, artifacts.Saved.size]).toEqual([0, 0]);
  });

  it('refuses a trainer report whose holdout was read for another candidate than its finalist (selection-invalid)', async () => {
    const elsewhere = (r: TrainerRequest): TrainerCompleted => ({ ...cannedFor(r), holdoutAccess: { accessedAt: '2026-10-12T00:00:00.000Z', count: 1, finalist: 'glm' } });
    const { engine, deps, pipeline, models } = protocolHarness(elsewhere);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'trainer', reason: { kind: 'selection-invalid', reason: 'holdout-not-read-once-for-finalist' } } });
    expect(models).toHaveLength(0);
  });

  it('retrains a trainer run from its snapshot and reproduces the holdout metrics', async () => {
    const { engine, deps, pipeline, trainer } = protocolHarness(cannedFor);
    const { run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const retrained = await new SnapshotRetrainer().Retrain(run.ID, deps);
    expect(retrained).toMatchObject({ FilesVerified: true, ContentHashVerified: true, MaxAbsDiff: 0, Reproduced: true });
    expect(retrained.Original).toEqual({ 'log-loss': 0.452, auc: 0.67, brier: 0.15 });
    expect(retrained.Retrained).toEqual({ 'log-loss': 0.452, auc: 0.67, brier: 0.15 });
    expect(trainer.Requests).toHaveLength(2);
    const [first, second] = trainer.Requests;
    expect([second.candidates, second.seed, second.threads, second.timeoutSeconds, second.maxRetries]).toEqual([first.candidates, first.seed, first.threads, first.timeoutSeconds, first.maxRetries]);
    expect(second.snapshot.matrix).not.toBe(first.snapshot.matrix);
    expect([second.snapshot.matrix.fileId, second.snapshot.rowManifest.fileId]).toEqual([first.snapshot.matrix.fileId, first.snapshot.rowManifest.fileId]);
  });

  it('records a malformed trainer answer as a failed run naming the mismatch, with no model', async () => {
    const { engine, deps, pipeline, runs, models } = protocolHarness(() => { throw new TrainerResultMalformedError(['holdout.primary.metric: Invalid enum value']); });
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toBeInstanceOf(TrainerResultMalformedError);
    expect(runs[0].Status).toBe('Failed');
    expect(runs[0].Notes).toBe("Training failed: The sidecar's /trainer answer is not a TrainerResult: holdout.primary.metric: Invalid enum value");
    expect(models).toHaveLength(0);
  });

  it('fails a unit run whose deps carry no trainer, before any snapshot is written', async () => {
    const { engine, deps, pipeline, runs, snapshots } = protocolHarness((r) => TrainerResultFixtures.CannedFailed(r.trainingRunId));
    delete deps.trainer;
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow(/no trainer \(trainer\) was supplied/);
    expect([snapshots.length, runs.length]).toEqual([0, 0]);
  });
});

describe('TrainingEngine — compute pricing on the run', () => {
  it('prices a Prediction Unit run by the same rule', async () => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '0');
    const { engine, deps, pipeline } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const { run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect([run.ComputeSeconds, run.ComputeCost]).toEqual([12.5, 0]);
  });

  it('refuses a malformed rate before any row is written or any model is trained', async () => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', 'cheap');
    const { engine, deps, pipeline, runs, models, trainer } = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow(RangeError);
    expect([trainer.Requests.length, runs.length, models.length]).toEqual([0, 0, 0]);
  });
});

describe('TrainingEngine — the gate decision decides what ships', () => {
  /** The C1-shaped heuristic member "renewed last year", the lowest simple score, which the model does not beat. */
  const heuristicKept = (r: TrainerRequest): TrainerCompleted => {
    const canned = cannedFor(r);
    return {
      ...canned,
      baselines: [...canned.baselines, { baseline: { kind: 'incumbent-heuristic', name: 'renewed last year' }, role: 'simple', holdout: TrainerResultFixtures.Mwi('log-loss', 0.44, 0.42, 0.46, 1205) }],
      comparisons: {
        ...canned.comparisons,
        'heuristic:renewed last yearVsDummy': { value: 0.08, ci: [0.06, 0.1], beats: true },
        'modelVs:heuristic:renewed last year': { value: -0.012, ci: [-0.02, -0.004], beats: false },
      },
      gate: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'heuristic:renewed last year', shippedRole: 'simpleBaseline', note: null },
    };
  };

  it("creates the kept GLM's model row: its artifact, its catalog algorithm, its holdout score, and no inner score, importance or hyperparameters", async () => {
    // The finalist is the request's candidate (`xgboost`, with its own hyperparameters and inner score); the gate keeps the GLM.
    const kept = (r: TrainerRequest): TrainerCompleted => {
      const canned = cannedFor(r);
      const renamed = TrainerResultFixtures.WithFinalist({ ...canned, importance: [importanceOf('EventsAttended', 0.4)] }, 'xgboost', r.snapshot.featureSchemaHash);
      return { ...renamed, artifacts: [...renamed.artifacts, ...canned.artifacts.filter((a) => a.candidate !== 'xgb')] };
    };
    const { engine, deps, pipeline, runs, models } = protocolHarness(kept);
    const loader = new FakeRecordLoader(pipeline);
    deps.recordLoader = loader;
    const { model, run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const results = storedResults(run.ValidationResults);
    if (results.status !== 'completed') throw new Error('not completed');
    expect(models).toHaveLength(1);
    expect(model?.ArtifactFileID).toBe(results.trainer?.artifacts.find((a) => a.candidate === 'glm')?.fileId);
    expect(loader.DriverLookups).toEqual(['logistic_regression']);
    expect([model?.AlgorithmID, model?.Metrics, model?.FeatureImportance, runs[0].Hyperparameters]).toEqual(['algo-logreg', '{}', '{}', '{}']);
    expect(JSON.parse(model?.HoldoutMetrics || 'null')).toEqual({ 'log-loss': 0.455 });
    expect(JSON.parse(model?.Lineage || '{}')).toMatchObject({ shippedMember: 'glm', shippedDriver: 'logistic_regression' });
    // The finalist's importance was measured, but the row is the GLM's: its evaluation record names no importance kind.
    expect(EvaluationLineage.Read(model?.Lineage)?.ImportanceKind).toBe('none');
    expect([results.gate?.decision.outcome, results.gate?.reason.code, results.gate?.holdoutRows]).toEqual(['keep-simple-baseline', 'simple-baseline-carries-signal', 1205]);
  });

  it("names the pipeline's algorithm when the kept member's driver has no catalog row, and stores the shipped driver in the lineage", async () => {
    // The finalist candidate runs on its own algorithm row (`algo-xgb2`), so the row must name the pipeline's, not the finalist's.
    const { engine, deps, pipeline } = protocolHarness(cannedFor);
    deps.recordLoader = new FakeRecordLoader(pipeline, {});
    const candidates = [TrainerRequestBuilder.CandidateFromPipeline('xgb', 'algo-xgb2', 'xgboost', '{"max_depth":2}')];
    const { model } = await engine.trainModel({ pipelineId: pipeline.ID, candidates }, deps);
    expect(model?.AlgorithmID).toBe('algo-xgb');
    expect(JSON.parse(model?.Lineage || '{}')).toMatchObject({ shippedMember: 'glm', shippedDriver: 'logistic_regression' });
  });

  it("creates the finalist's model row when the gate ships the model", async () => {
    // The finalist is the request's one candidate (the pipeline's own algorithm, `xgboost`).
    const wins = (r: TrainerRequest): TrainerCompleted => TrainerResultFixtures.WithFinalist({ ...cannedModelFor(r), importance: [importanceOf('EventsAttended', 0.4)] }, 'xgboost', r.snapshot.featureSchemaHash);
    const { engine, deps, pipeline, runs } = protocolHarness(wins);
    const { model, run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const results = storedResults(run.ValidationResults);
    if (results.status !== 'completed') throw new Error('not completed');
    expect(model?.ArtifactFileID).toBe(results.trainer?.artifacts.find((a) => a.candidate === 'xgboost')?.fileId);
    expect([model?.AlgorithmID, model?.Metrics, model?.FeatureImportance, runs[0].Hyperparameters]).toEqual(['algo-xgb', '{"log-loss":0.45}', '{"EventsAttended":1}', '{"max_depth":4}']);
    expect(JSON.parse(model?.Lineage || '{}')).toMatchObject({ shippedMember: 'xgboost', shippedDriver: 'xgboost' });
    expect([results.gate?.decision.outcome, results.gate?.guards.modelAucInterval]).toEqual(['model', { level: 0.95, lower: 0.63, upper: 0.71 }]);
  });

  it('completes a no-signal run with its gate record and the reason, stores every artifact and creates no model row', async () => {
    const { engine, deps, pipeline, runs, models, artifacts } = protocolHarness(cannedNoSignalFor);
    const { model, run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const results = storedResults(run.ValidationResults);
    if (results.status !== 'completed') throw new Error('not completed');
    expect([model, models.length, run.ResultingModelID, runs[0].Status, artifacts.Saved.size]).toEqual([null, 0, null, 'Completed', 3]);
    expect([results.gate?.decision.outcome, results.gate?.reason.code]).toEqual(['no-signal', 'nothing-beats-dummy']);
    expect(run.Notes).toContain('nor any simple baseline beats the flat guess on log-loss: no signal.');
    expect(TrainingEngine.NoModelReason({ model, run })).toBe(results.gate?.reason.text);
  });

  it('refuses a run whose sidecar gate differs from the engine decision: Failed, a gate-stage refusal, no artifact and no model', async () => {
    const differs = (r: TrainerRequest): TrainerCompleted => ({ ...cannedFor(r), gate: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'oneFeature', shippedRole: 'simpleBaseline', note: null } });
    const { engine, deps, pipeline, runs, models, artifacts } = protocolHarness(differs);
    const training = engine.trainModel({ pipelineId: pipeline.ID }, deps);
    await expect(training).rejects.toBeInstanceOf(TrainingRefusedError);
    await expect(training).rejects.toThrow("Refused (sidecar-gate-mismatch): the trainer decided b:keep-simple-baseline (oneFeature) but the engine's transcription decided b:keep-simple-baseline (glm)");
    expect([runs[0].Status, runs[0].ResultingModelID, models.length, artifacts.Saved.size]).toEqual(['Failed', null, 0, 0]);
    const stored = storedResults(runs[0].ValidationResults);
    expect(stored.status === 'refused' ? [stored.refusal.stage, stored.refusal.reason.kind] : null).toEqual(['gate', 'sidecar-gate-mismatch']);
  });

  it('says no model was created, and promises no Draft model, when a no-signal run has a dominant feature', async () => {
    const { engine, deps, pipeline } = protocolHarness((r) => ({ ...cannedNoSignalFor(r), importance: [importanceOf('EventsAttended', 0.95), importanceOf('Region', 0.01)] }));
    const result = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(result.model).toBeNull();
    expect(result.run.Notes).toContain(`No model was created: ${TrainerResultFixtures.NoSignalReason}`);
    expect(result.run.Notes).toContain('LEAKAGE WARNING: one field ("EventsAttended")');
    expect(result.run.Notes).toContain('No model was created from this run, so there is nothing to promote.');
    expect(result.run.Notes).not.toContain('kept in Draft');
  });

  it("stores no-signal with the guard's reason when the holdout's minority class is below the protocol minimum, and creates no model row", async () => {
    const { engine, deps, pipeline, models } = protocolHarness(cannedFor, ProtocolRowFixture.Row());
    const { model, run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const results = storedResults(run.ValidationResults);
    if (results.status !== 'completed') throw new Error('not completed');
    expect([model, models.length]).toEqual([null, 0]);
    expect([results.gate?.transcribed.outcome, results.gate?.decision.outcome, results.gate?.reason.code]).toEqual(['keep-simple-baseline', 'no-signal', 'minority-class-below-minimum']);
    expect(results.gate?.guards.holdoutClassCounts).toEqual({ 0: 1, 1: 3 });
  });

  it("stores a kept heuristic rule's decision and creates no model row (a rule is not an artifact)", async () => {
    const { engine, deps, pipeline, models } = protocolHarness(heuristicKept);
    const { model, run } = await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    const results = storedResults(run.ValidationResults);
    if (results.status !== 'completed') throw new Error('not completed');
    expect([model, models.length, run.ResultingModelID, run.Hyperparameters]).toEqual([null, 0, null, '{}']);
    expect([results.gate?.decision.shipped, results.gate?.reason.code]).toEqual(['heuristic:renewed last year', 'heuristic-carries-signal']);
  });

  it('fails a run whose trainer returned no artifact for the shipped member before anything is stored', async () => {
    const noGlm = (r: TrainerRequest): TrainerCompleted => { const c = cannedFor(r); return { ...c, artifacts: c.artifacts.filter((a) => a.candidate !== 'glm') }; };
    const { engine, deps, pipeline, runs, models, artifacts } = protocolHarness(noGlm);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toThrow("the trainer returned no artifact for the shipped 'glm' (returned: xgb, oneFeature)");
    expect([runs[0].Status, models.length, artifacts.Saved.size]).toEqual(['Failed', 0, 0]);
  });

  it("maps the GLM and one-feature members of each task family to the sidecar's GLM_DRIVER (Sidecar/src/python/app/baselines.py), and the series members to forecast.py's", () => {
    const sidecar = (file: string): string => readFileSync(fileURLToPath(new URL(`../../../../Sidecar/src/python/app/${file}`, import.meta.url)), 'utf8');
    const table = /^GLM_DRIVER: Dict\[TabularFamily, str\] = \{([^}]*)\}/m.exec(sidecar('baselines.py'));
    if (table === null) throw new Error('baselines.py no longer declares GLM_DRIVER as this test reads it');
    const python = Object.fromEntries([...table[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
    const tasks: Record<string, TaskType> = {
      binary: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
      multiclass: { kind: 'multiclass', classOrder: ['a', 'b', 'c'], adverseIndices: [0] },
      continuous: { kind: 'continuous' }, count: { kind: 'count' }, 'non-negative': { kind: 'non-negative', tweediePower: 1.5 },
    };
    const glm = { kind: 'glm', family: 'logistic', penalty: 'l2' } as const;
    const oneFeature = { kind: 'one-feature', selection: 'best-single-feature-inner-cv' } as const;
    expect(Object.keys(python).sort()).toEqual(Object.keys(tasks).sort());
    for (const [family, task] of Object.entries(tasks)) {
      expect([family, TrainingEngine.MemberDriverKey(glm, task), TrainingEngine.MemberDriverKey(oneFeature, task)]).toEqual([family, python[family], python[family]]);
    }
    const forecast = sidecar('forecast.py');
    for (const [kind, driver] of [['naive', 'naive'], ['seasonal-naive', 'seasonal-naive']] as const) {
      expect(forecast).toContain(`T.SeriesBaseline("${driver}"`);
      expect(TrainingEngine.MemberDriverKey(kind === 'naive' ? { kind } : { kind, season: 12 }, { kind: 'forecast', valueKind: 'continuous' })).toBe(driver);
    }
  });

  it("maps a shippable member to the driver the trainer fits it with, and refuses a yardstick", () => {
    const binary: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 };
    const glm = { kind: 'glm', family: 'logistic', penalty: 'l2' } as const;
    const oneFeature = { kind: 'one-feature', selection: 'best-single-feature-inner-cv' } as const;
    expect(TrainingEngine.MemberDriverKey(glm, binary)).toBe('logistic_regression');
    expect(TrainingEngine.MemberDriverKey(oneFeature, { kind: 'multiclass', classOrder: ['a', 'b', 'c'], adverseIndices: [0] })).toBe('logistic_regression');
    expect(TrainingEngine.MemberDriverKey(oneFeature, { kind: 'continuous' })).toBe('ridge');
    expect(TrainingEngine.MemberDriverKey(glm, { kind: 'count' })).toBe('poisson_glm');
    expect(TrainingEngine.MemberDriverKey(glm, { kind: 'non-negative', tweediePower: 1.5 })).toBe('tweedie_glm');
    expect(TrainingEngine.MemberDriverKey(glm, { kind: 'forecast', valueKind: 'count' })).toBe('poisson_glm');
    expect(TrainingEngine.MemberDriverKey({ kind: 'naive' }, { kind: 'forecast', valueKind: 'continuous' })).toBe('naive');
    expect(TrainingEngine.MemberDriverKey({ kind: 'seasonal-naive', season: 12 }, { kind: 'forecast', valueKind: 'continuous' })).toBe('seasonal-naive');
    expect(() => TrainingEngine.MemberDriverKey({ kind: 'dummy', name: 'base-rate' }, binary)).toThrow('a dummy baseline is a yardstick and never ships as an artifact');
  });
});

describe('TrainingEngine — the carve decides which rows training sees', () => {
  // Decided 334 days after StartDate: development 2024-11-30, locked holdout 2025-01-29, after holdoutEnd 2025-11-30.
  const row = (id: string, person: number, start: string, region: string, renewed: boolean): SourceRow =>
    ({ ID: id, PersonID: `p${person}`, StartDate: start, EventsAttended: person, Region: region, Renewed: renewed });
  const dev = (renewed: readonly boolean[]): SourceRow[] => renewed.map((r, p) => row(`d${p}`, p, '2024-01-01', p % 2 === 0 ? 'EU' : 'US', r));
  const holdout = [row('h0', 0, '2024-03-01', 'HOLD', true), row('h1', 1, '2024-03-01', 'EU', false)];
  const late = [row('l0', 0, '2025-01-01', 'LATE', true), row('l1', 1, '2025-01-01', 'LATE', false)];
  const unitColumns = { ...UnitYearsWorld.UnitColumns(), Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-06-01' } }) };
  const protocolRow = ProtocolRowFixture.Row({
    MinMinorityClassRows: 1,
    Holdout: JSON.stringify({ kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2025-01-01', holdoutEnd: '2025-06-01', newEntityReport: null }),
  });
  const harnessFor = (years: SourceRow[], steps: FeatureStepGraph) => {
    const h = TrainingHarness.ForUnit(years, unitColumns, steps);
    h.deps.protocols = new FakeEvaluationProtocolStore([protocolRow]);
    return h;
  };
  const regionSteps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended', 'Region'] }] };

  it('keeps the levels of development rows only, and folds a level first seen on a holdout row as scoring would', async () => {
    const { engine, deps, pipeline, models, files, snapshots } = harnessFor([...dev([true, false, true, false]), ...holdout, ...late], regionSteps);
    await engine.trainModel({ pipelineId: pipeline.ID }, deps);
    expect(JSON.parse(models[0].Lineage!).categoryLevels).toEqual({ Region: ['EU', 'US'] });
    const sent = snapshotRows(await storedContent(files, snapshots[0]));
    expect(sent.map((r) => [r.EventsAttended, r.Region]).sort()).toEqual([[0, 'EU'], [0, '__other'], [1, 'EU'], [1, 'US'], [2, 'EU'], [3, 'US']]);
  });

  it('validates the target over the development rows: one outcome there refuses, whatever the holdout and later rows hold', async () => {
    const { engine, deps, pipeline, trainer } = harnessFor([...dev([true, true, true, true]), ...holdout, ...late], regionSteps);
    await expect(engine.trainModel({ pipelineId: pipeline.ID }, deps)).rejects.toMatchObject({ Refusal: { stage: 'unit', reason: { kind: 'single-valued-target', value: '1', rows: 4 } } });
    expect(trainer.Requests).toHaveLength(0);
  });

  it('does not assemble rows decided after holdoutEnd, so one whose history is not covered does not refuse the run', async () => {
    const years = [...dev([true, false, true, false]), ...holdout, row('l9', 9, '2025-01-01', 'LATE', true)];
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }, { Id: 's2', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] }] };
    const h = harnessFor(years, steps);
    const tables = UnitYearsWorld.Tables(years);
    // p9's history starts with a Snapshot after its only row's decision day: that row cannot be read as of its day.
    tables.People = [...tables.People, { ID: 'p9', Status: 'Active' }];
    tables['MJ: Record Changes'] = [...tables['MJ: Record Changes'], {
      ID: 'rc-snap-p9', EntityID: UnitYearsWorld.PeopleEntity.ID, Status: 'Complete', RecordID: 'ID|p9', Type: 'Snapshot', Source: 'Internal',
      ChangedAt: new Date('2026-01-01T00:00:00Z'), ChangesJSON: '{}', FullRecordJSON: JSON.stringify({ ID: 'p9', Status: 'Active' }),
    }];
    h.deps.dataAccess = new TableDataAccess(tables);
    const trained = await h.engine.trainModel({ pipelineId: h.pipeline.ID }, h.deps);
    expect(storedResults(trained.run.ValidationResults)).toMatchObject({ status: 'completed', carve: { developmentRowCount: 4, holdoutRowCount: 2, excludedAfterHoldoutEnd: 1 } });
  });
});

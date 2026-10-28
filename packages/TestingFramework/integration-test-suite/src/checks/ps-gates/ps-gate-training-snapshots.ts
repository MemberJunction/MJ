/**
 * Training Snapshot gate measurements: W1 → S5.5 (snapshot reproducibility) and W1 → S3.2 (per-value provenance).
 * Training runs go through MJAPI exactly as a user's would (`h.Train`); the retrain from the snapshot, the training
 * assembly and the scoring assembly run in-process through the product's own paths on the harness's client provider.
 * Each returns a GateMeasurement and throws only when it cannot measure.
 */
import type { MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import type { FeatureColumnSpec, ValueProvenance } from '@memberjunction/predictive-studio-core';
import {
  BuildProductionMLInferenceDeps, MLModelInferenceProcessor, RunViewTrainingSnapshotStore, SnapshotFiles, SnapshotHash, SnapshotIntegrityError,
  StorageProviderSnapshotFileStore, TrainingDelegation, TrainingEngine, UtcDay,
  type AsOfAssembledMatrix, type AssembledRow, type MatrixCell, type RetrainResult, type SourceRow,
} from '@memberjunction/predictive-studio';
import { HarnessSidecar, ProvenanceResolver, UnitFixtures, type GateMeasurement, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** The W1-signal s42 unit rows: every membership year resolves, so the manifest holds all of them. */
const W1_MANIFEST_ROWS = 16776;
/** How many scored rows the provenance gate samples, and the sampler's seed. */
const PROVENANCE_SAMPLE = 20;
const PROVENANCE_SEED = 20261012;

/** What the gate recomputed from the stored files: the manifest's row count and whether the content hash matches the row's. */
interface StoredSnapshotCheck { readonly ManifestRows: number; readonly ContentHashRecomputed: boolean; readonly DataCutoffDay: string }

/** One scored row's provenance outcome: how many values it carried and how many resolved. */
interface RowResolution { readonly Values: number; readonly Resolved: number }

/** The Training Snapshot and provenance gate bodies (G1.10, G1.11), as static members on one owner class. */
export class TrainingSnapshotGates {
  /** The run's Training Snapshot row, read through the product's snapshot store. */
  private static async snapshotOf(h: TruthHarness, run: MJMLTrainingRunEntity): Promise<MJTrainingSnapshotEntity | null> {
    if (!run.TrainingSnapshotID) return null;
    return new RunViewTrainingSnapshotStore(h.Provider, h.User).LoadSnapshot(run.TrainingSnapshotID);
  }

  /**
   * Reads the matrix and manifest back from storage, counts the manifest's rows and recomputes the content hash from
   * the two files' bytes and the row's identity columns, independently of the retrainer.
   */
  private static async checkStoredFiles(h: TruthHarness, s: MJTrainingSnapshotEntity): Promise<StoredSnapshotCheck> {
    const files = new StorageProviderSnapshotFileStore(UnitFixtures.EntityFactory(h), h.Provider, h.User);
    const [matrix, manifest] = await Promise.all([files.Get(s.MatrixFileID), files.Get(s.RowManifestFileID)]);
    const dataCutoffDay = UtcDay.UtcDayIso(s.DataCutoff);
    const recomputed = SnapshotFiles.ComputeSnapshotContentHash({
      MatrixSha256: SnapshotHash.Sha256Hex(matrix),
      RowManifestSha256: SnapshotHash.Sha256Hex(manifest),
      FeatureSchemaHash: s.FeatureSchemaHash,
      PredictionUnitID: s.PredictionUnitID,
      LabelVersion: s.LabelVersion,
      FeatureSpecVersion: s.FeatureSpecVersion,
      EvaluationProtocolID: s.EvaluationProtocolID,
      DataCutoff: dataCutoffDay,
    });
    return { ManifestRows: SnapshotFiles.ParseManifestLines(manifest).length, ContentHashRecomputed: recomputed === s.ContentHash, DataCutoffDay: dataCutoffDay };
  }

  /** The retrain through the suite's sidecar, or the integrity error that stopped it before the trainer was called. */
  private static async retrain(h: TruthHarness, runId: string): Promise<RetrainResult | SnapshotIntegrityError> {
    const url = h.UseSuiteSidecar();
    try {
      return await TrainingDelegation.RetrainFromSnapshotViaEngine(runId, h.Provider, h.User, HarnessSidecar.SuiteTrainer(url));
    } catch (e) {
      if (e instanceof SnapshotIntegrityError) return e;
      throw e;
    }
  }

  /** G1.10 W1 → S5.5. The in-process retrain uses the suite's single-threaded sidecar, the one MJAPI trained on. */
  public static async MeasureW1SnapshotRetrain(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionW1ProvenancePipeline(h);
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const s = await TrainingSnapshotGates.snapshotOf(h, run);
    if (!s) return { Passed: false, Measured: { runStatus: run.Status }, Detail: `run ${run.ID} has no Training Snapshot: ${run.Notes || ''}` };
    const stored = await TrainingSnapshotGates.checkStoredFiles(h, s);
    const comparison = await TrainingSnapshotGates.retrain(h, run.ID);
    if (comparison instanceof SnapshotIntegrityError) {
      return {
        Passed: false,
        Measured: { manifestRows: stored.ManifestRows, contentHashVerified: false, integrityFile: comparison.File, stored: comparison.Expected, read: comparison.Actual, dataCutoff: s.DataCutoff.toISOString(), dataCutoffDay: stored.DataCutoffDay },
        Detail: comparison.message,
      };
    }
    // The retrainer's flag records its own recompute; the gate's recompute above is independent of it.
    const contentHashVerified = stored.ContentHashRecomputed && comparison.ContentHashVerified === true;
    const passed = stored.ManifestRows === W1_MANIFEST_ROWS && s.ManifestRowCount === W1_MANIFEST_ROWS && contentHashVerified && comparison.Reproduced;
    return {
      Passed: passed,
      Measured: { manifestRows: stored.ManifestRows, manifestRowCount: s.ManifestRowCount, contentHashVerified, maxAbsDiff: comparison.MaxAbsDiff, reproduced: comparison.Reproduced },
      Detail: `manifest ${stored.ManifestRows} rows (row says ${s.ManifestRowCount}), content hash ${contentHashVerified ? 'recomputed and matched' : 'did not match'}, retrain max |diff| ${comparison.MaxAbsDiff} over ${Object.keys(comparison.Original).join(', ')}`,
    };
  }

  /** The cells each feature's provenance entry stands for: the matrix columns whose feature is the entry's column, in column order. */
  private static cellsOf(matrix: AsOfAssembledMatrix, row: AssembledRow, p: ValueProvenance): MatrixCell[] {
    return matrix.Columns.flatMap((c, k) => (c.FeatureName === p.column ? [row.Values[k]] : []));
  }

  /** Resolves every provenance entry of one scored row against its source through the harness. */
  private static async resolveRow(h: TruthHarness, matrix: AsOfAssembledMatrix, row: AssembledRow, specs: ReadonlyMap<string, FeatureColumnSpec>, folds: ReadonlyMap<string, readonly string[]>): Promise<RowResolution> {
    const outcomes = await Promise.all(row.Provenance.map((p) => {
      const spec = specs.get(p.column);
      const cells = TrainingSnapshotGates.cellsOf(matrix, row, p);
      if (!spec || cells.length === 0) return Promise.resolve(false);
      return h.ResolveProvenance(p, cells, spec, folds.get(p.column) || []);
    }));
    return { Values: outcomes.length, Resolved: outcomes.filter(Boolean).length };
  }

  /** G1.11 W1 → S3.2. The model is promoted to Validated before the scoring path loads it (scoring refuses Draft models). */
  public static async MeasureW1Provenance(h: TruthHarness): Promise<GateMeasurement> {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionW1ProvenancePipeline(h);
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    if (!run.ResultingModelID) return { Passed: false, Measured: {}, Detail: `training run ${run.ID} produced no model: ${run.Notes || ''}` };
    const s = await TrainingSnapshotGates.snapshotOf(h, run);
    if (!s) return { Passed: false, Measured: {}, Detail: `run ${run.ID} has no Training Snapshot` };
    const promoted = await h.Promote(run.ResultingModelID, 'Validated', 'G1.11: scoring-path provenance');
    if (!promoted.Promoted) return { Passed: false, Measured: { modelStatus: promoted.Status }, Detail: `model ${run.ResultingModelID} could not be validated for scoring` };
    const training = await new TrainingEngine().AssembleForTraining(pipeline.ID, await TrainingDelegation.BuildTrainingDeps(h.Provider, h.User));
    const specs = new Map(training.Features.map((f) => [f.name, f] as const));
    const ids = await h.SampleRowIds(w1, PROVENANCE_SAMPLE, PROVENANCE_SEED);
    const keyField = training.UnitRead.RowEntity.PrimaryKey;
    const records: SourceRow[] = ids.map((id) => ({ [keyField]: id }));
    const scoring = new MLModelInferenceProcessor({ modelId: run.ResultingModelID, deps: BuildProductionMLInferenceDeps() });
    const scored = await scoring.AssembleForScoring(records, { ContextUser: h.User, Provider: h.Provider }, 'unit-rule');
    if (scored.Status !== 'assembled') return { Passed: false, Measured: { sampled: ids.length }, Detail: `scoring assembly refused: ${JSON.stringify(scored.Refusal)}` };
    const folds = ProvenanceResolver.FoldedLevels(s.ColumnProvenance);
    let resolved = 0;
    let values = 0;
    let valuesResolved = 0;
    for (const row of scored.Rows) {
      const r = await TrainingSnapshotGates.resolveRow(h, scored, row, specs, folds);
      values += r.Values;
      valuesResolved += r.Resolved;
      if (r.Values > 0 && r.Resolved === r.Values) resolved++;
    }
    return {
      Passed: resolved === PROVENANCE_SAMPLE && scored.Rows.length === PROVENANCE_SAMPLE,
      Measured: { resolved, sampled: scored.Rows.length, values, valuesResolved },
      Detail: `${resolved} of ${PROVENANCE_SAMPLE} sampled rows resolve every value (${valuesResolved} of ${values} values)`,
    };
  }
}


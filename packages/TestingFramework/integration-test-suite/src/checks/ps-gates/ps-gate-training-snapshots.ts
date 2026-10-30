/**
 * Training Snapshot gate measurements: W1 → S5.5 (snapshot reproducibility) and W1 → S3.2 (per-value provenance).
 * Training runs go through MJAPI exactly as a user's would (`h.Train`); the retrain from the snapshot, the training
 * assembly and the scoring assembly run in-process through the product's own paths on the harness's client provider.
 * Each returns a GateMeasurement and throws only when it cannot measure.
 */
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDMap, UUIDSet } from '@memberjunction/global';
import type { MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import type { FeatureColumnSpec, PredictionUnitSpec, ValueProvenance } from '@memberjunction/predictive-studio-core';
import {
  BuildProductionMLInferenceDeps, MLModelInferenceProcessor, PredictionUnitRowReader, RunViewTrainingSnapshotStore, SnapshotFiles, SnapshotHash, SnapshotIntegrityError,
  StorageProviderSnapshotFileStore, TrainingDelegation, TrainingEngine, UtcDay,
  type AsOfAssembledMatrix, type AssembledRow, type MatrixCell, type RetrainResult, type SourceRow, type UnitTrainingAssembly,
} from '@memberjunction/predictive-studio';
import { HarnessSidecar, ProvenanceResolver, UnitFixtures, type GateMeasurement, type ScoredRowBinding, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** The W1-signal s42 unit rows: every membership year resolves, so the manifest holds all of them. */
const W1_MANIFEST_ROWS = 16776;
/** How many scored rows the provenance gate samples, and the sampler's seed. */
const PROVENANCE_SAMPLE = 20;
const PROVENANCE_SEED = 20261012;
/** The provenance pipeline's features: four year columns and one windowed aggregate, one provenance entry each per row. */
const W1_PROVENANCE_FEATURES = 5;

/** What the gate recomputed from the stored files: the manifest's row count and whether the content hash matches the row's. */
interface StoredSnapshotCheck { readonly ManifestRows: number; readonly ContentHashRecomputed: boolean; readonly DataCutoffDay: string }

/** One scored row's provenance outcome: the entries it carried, the expected values that resolved, the matrix columns no entry covers. */
interface RowResolution { readonly Seen: number; readonly Resolved: number; readonly Uncovered: number }

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

  /** The row-entity fields the binding reads: the key, the unit's dating columns and every feature's join key field. */
  private static bindingFields(unit: PredictionUnitSpec, features: readonly FeatureColumnSpec[], primaryKey: string): string[] {
    const fields: string[] = [primaryKey];
    if (unit.rows.kind === 'grain-x-periods') fields.push(unit.rows.periodDate);
    else if (unit.rows.decisionDate.kind !== 'fixed') fields.push(unit.rows.decisionDate.column);
    for (const f of features) {
      const src = f.source;
      if ((src.kind === 'immutable-field' || src.kind === 'record-changes') && src.keyField) fields.push(src.keyField);
      if (src.kind === 'windowed-aggregate' && src.ownerKeyField) fields.push(src.ownerKeyField);
    }
    return [...new Set(fields)];
  }

  /**
   * Each sampled row as read from the row entity, independently of the assembly: its stored join fields and its
   * decision date by the unit's own rule (`PredictionUnitRowReader.UnitDecisionDate`). A row whose decision date the
   * rule cannot compute is absent, so none of its values resolves.
   */
  private static async rowBindings(h: TruthHarness, training: UnitTrainingAssembly, ids: readonly string[]): Promise<UUIDMap<ScoredRowBinding>> {
    const rowEntity = training.UnitRead.RowEntity;
    const keyList = ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<SourceRow>({
      EntityName: rowEntity.Name, ExtraFilter: `[${rowEntity.PrimaryKey}] IN (${keyList})`, Fields: TrainingSnapshotGates.bindingFields(training.Unit, training.Features, rowEntity.PrimaryKey), ResultType: 'simple',
    }, h.User);
    if (!r.Success) throw new Error(`Reading the sampled ${rowEntity.Name} rows failed: ${r.ErrorMessage || 'unknown error'}`);
    const out = new UUIDMap<ScoredRowBinding>();
    for (const row of r.Results) {
      const decision = PredictionUnitRowReader.UnitDecisionDate(training.Unit, row);
      const id = String(row[rowEntity.PrimaryKey]);
      if (decision !== null) out.Set(id, { Entity: rowEntity.Name, RowId: id, DecisionDate: decision, Fields: row });
    }
    return out;
  }

  /** Whether the scored rows are exactly the sampled rows: as many, each one sampled, none twice. */
  private static rowsAligned(ids: readonly string[], rows: readonly AssembledRow[]): boolean {
    const sampled = new UUIDSet(ids);
    const scored = new UUIDSet(rows.map((r) => r.RowId));
    return rows.length === ids.length && scored.Size === rows.length && rows.every((r) => sampled.Has(r.RowId));
  }

  /**
   * Resolves one scored row: every expected feature must have exactly one provenance entry, each resolved against its
   * source and bound to this row; a matrix column no entry stands for is uncovered.
   */
  private static async resolveRow(h: TruthHarness, matrix: AsOfAssembledMatrix, row: AssembledRow, expected: readonly FeatureColumnSpec[], folds: ReadonlyMap<string, readonly string[]>, binding: ScoredRowBinding | undefined): Promise<RowResolution> {
    const named = new Set(row.Provenance.map((p) => p.column));
    const uncovered = matrix.Columns.filter((c) => !named.has(c.FeatureName)).length;
    const outcomes = await Promise.all(expected.map((spec) => {
      const entries = row.Provenance.filter((p) => p.column === spec.name);
      const p = entries[0];
      if (!binding || entries.length !== 1 || !p) return Promise.resolve(false);
      const cells = TrainingSnapshotGates.cellsOf(matrix, row, p);
      if (cells.length === 0) return Promise.resolve(false);
      return h.ResolveProvenance({ Provenance: p, Cells: cells, Spec: spec, Folded: folds.get(spec.name) || [], Row: binding });
    }));
    return { Seen: row.Provenance.length, Resolved: outcomes.filter(Boolean).length, Uncovered: uncovered };
  }

  /** Trains the provenance pipeline, promotes its model for scoring and returns what the gate reads, or why it cannot. */
  private static async trainedForScoring(h: TruthHarness): Promise<{ readonly PipelineID: string; readonly ModelID: string; readonly Snapshot: MJTrainingSnapshotEntity } | GateMeasurement> {
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionW1ProvenancePipeline(h);
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    if (!run.ResultingModelID) return { Passed: false, Measured: {}, Detail: `training run ${run.ID} produced no model: ${run.Notes || ''}` };
    const s = await TrainingSnapshotGates.snapshotOf(h, run);
    if (!s) return { Passed: false, Measured: {}, Detail: `run ${run.ID} has no Training Snapshot` };
    const promoted = await h.Promote(run.ResultingModelID, 'Validated', 'G1.11: scoring-path provenance');
    if (!promoted.Promoted) return { Passed: false, Measured: { modelStatus: promoted.Status }, Detail: `model ${run.ResultingModelID} could not be validated for scoring` };
    return { PipelineID: pipeline.ID, ModelID: run.ResultingModelID, Snapshot: s };
  }

  /**
   * G1.11 W1 → S3.2. The model is promoted to Validated before the scoring path loads it (scoring refuses Draft models).
   * Every value must name its own scored row (the row's key, its stored owner key, its decision day computed by the
   * unit's rule), every sampled row must carry one provenance entry per feature, and every matrix column must be
   * covered by one.
   */
  public static async MeasureW1Provenance(h: TruthHarness): Promise<GateMeasurement> {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const trained = await TrainingSnapshotGates.trainedForScoring(h);
    if ('Passed' in trained) return trained;
    const training = await new TrainingEngine().AssembleForTraining(trained.PipelineID, await TrainingDelegation.BuildTrainingDeps(h.Provider, h.User));
    const expected = training.Features.filter((f) => f.encoding.kind !== 'identifier');
    const ids = await h.SampleRowIds(w1, PROVENANCE_SAMPLE, PROVENANCE_SEED);
    const keyField = training.UnitRead.RowEntity.PrimaryKey;
    const scoring = new MLModelInferenceProcessor({ modelId: trained.ModelID, deps: BuildProductionMLInferenceDeps() });
    const scored = await scoring.AssembleForScoring(ids.map((id): SourceRow => ({ [keyField]: id })), { ContextUser: h.User, Provider: h.Provider }, 'unit-rule');
    if (scored.Status !== 'assembled') return { Passed: false, Measured: { sampled: ids.length }, Detail: `scoring assembly refused: ${JSON.stringify(scored.Refusal)}` };
    const folds = ProvenanceResolver.FoldedLevels(trained.Snapshot.ColumnProvenance);
    const bindings = await TrainingSnapshotGates.rowBindings(h, training, ids);
    const rowsAligned = TrainingSnapshotGates.rowsAligned(ids, scored.Rows);
    let resolved = 0;
    let valuesSeen = 0;
    let valuesResolved = 0;
    let columnsUncovered = 0;
    for (const row of scored.Rows) {
      const r = await TrainingSnapshotGates.resolveRow(h, scored, row, expected, folds, bindings.Get(row.RowId));
      valuesSeen += r.Seen;
      valuesResolved += r.Resolved;
      columnsUncovered += r.Uncovered;
      if (r.Resolved === expected.length && r.Seen === expected.length && r.Uncovered === 0) resolved++;
    }
    const valuesExpected = W1_PROVENANCE_FEATURES * PROVENANCE_SAMPLE;
    const complete = expected.length === W1_PROVENANCE_FEATURES && valuesSeen === valuesExpected && valuesResolved === valuesExpected && columnsUncovered === 0;
    return {
      Passed: rowsAligned && resolved === PROVENANCE_SAMPLE && scored.Rows.length === PROVENANCE_SAMPLE && complete,
      Measured: { resolved, sampled: scored.Rows.length, rowsAligned, valuesExpected, valuesSeen, valuesResolved, columnsUncovered },
      Detail: `${resolved} of ${PROVENANCE_SAMPLE} sampled rows resolve every value bound to the row (${valuesResolved} of ${valuesExpected} expected values, ${valuesSeen} seen, ${columnsUncovered} uncovered columns)${rowsAligned ? '' : '; the scored rows are not the sampled rows'}`,
    };
  }
}


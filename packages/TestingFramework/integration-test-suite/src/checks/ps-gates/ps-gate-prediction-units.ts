/**
 * Prediction Unit gate measurements. Each trains through MJAPI exactly as a user would
 * (`h.Train`, the PredictiveStudio.TrainModel remote operation) and reads the stored rows; the unit-row checks also
 * run the same reader in-process. Each returns a GateMeasurement and throws only when it cannot measure.
 */
import { join } from 'node:path';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import type { MJMLModelEntity, MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { DOMINANCE_THRESHOLD_DEFAULT, JsonParse, TrainingRunResultsParser, type FeatureImportance, type PredictionUnitSpec, type SnapshotRowKey } from '@memberjunction/predictive-studio-core';
import { DetectSingleFeatureDominance, PredictionUnitRowReader, ProviderAssemblyMetadata, RunViewDataAccess, PredictionUnitVersioning, SnapshotManifest, StorageProviderSnapshotFileStore, type UnitRowReadResult } from '@memberjunction/predictive-studio';
import { C1CorpusFixture, C1_CORPUS_DIR, UnitFixtures, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type GateMeasurement, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** The Training Snapshot columns the snapshot assertions read. */
type SnapshotCounts = Pick<MJTrainingSnapshotEntity, 'ManifestRowCount' | 'CensoredRowsExcluded' | 'LabelKnownRowsExcluded' | 'RowManifestFileID' | 'RowManifestSha256'>;

/** A key set compared with the reference's keys. */
interface KeyComparison { readonly Matched: number; readonly Expected: number; readonly Extra: number }

/** W5's newest (censored) cycle is decided on this day: StartDate 2026-01-01 plus the unit's 334-day offset. */
const W5_CENSORED_DECISION_DAY = '2026-12-01';

/**
 * The Prediction Unit gate bodies (G1.1, G1.2, G1.3, G1.6, G1.7, G1.8), as static members on one owner class.
 */
export class PredictionUnitGates {
  private static async readUnitRows(h: TruthHarness, unit: PredictionUnitSpec): Promise<UnitRowReadResult> {
    return new PredictionUnitRowReader().Read(unit, {
      DataAccess: new RunViewDataAccess(h.User, h.Provider),
      Metadata: new ProviderAssemblyMetadata(h.Provider),
      Read: { mode: 'complete' },
      Now: new Date(),
    });
  }

  /** The Training Snapshot counts the snapshot gates assert, and its manifest file. */
  private static async snapshotCounts(h: TruthHarness, run: MJMLTrainingRunEntity): Promise<SnapshotCounts | null> {
    if (!run.TrainingSnapshotID) return null;
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<SnapshotCounts>({
      EntityName: 'MJ: Training Snapshots', ExtraFilter: `ID='${EscapeSQLString(run.TrainingSnapshotID)}'`,
      Fields: ['ManifestRowCount', 'CensoredRowsExcluded', 'LabelKnownRowsExcluded', 'RowManifestFileID', 'RowManifestSha256'], ResultType: 'simple',
    }, h.User);
    if (!r.Success) throw new Error(`Reading Training Snapshot ${run.TrainingSnapshotID} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }

  /** The snapshot's row manifest, read back from storage, verified against the row's SHA-256 and parsed. */
  private static async manifestOf(h: TruthHarness, snapshot: Pick<SnapshotCounts, 'RowManifestFileID' | 'RowManifestSha256'>): Promise<SnapshotRowKey[]> {
    const files = new StorageProviderSnapshotFileStore(UnitFixtures.EntityFactory(h), h.Provider, h.User);
    return SnapshotManifest.ReadSnapshotManifest(snapshot, files);
  }

  /** The reference's resolved C1 keys, `<person id>|<period index>` lower-cased. */
  private static async referenceC1Keys(): Promise<Set<string>> {
    const keys = await C1CorpusFixture.ReadC1CorpusCsv(join(C1_CORPUS_DIR, 'person_years_keys.csv'));
    return new Set(keys.Rows.map((k) => `${k.person_id.toLowerCase()}|${k.period_index}`));
  }

  /** How many reference keys a key set matched, how many the reference holds, and how many of the set it does not. */
  private static compareKeys(expected: ReadonlySet<string>, actual: ReadonlySet<string>): KeyComparison {
    const matched = [...expected].filter((k) => actual.has(k)).length;
    const extra = [...actual].filter((k) => !expected.has(k)).length;
    return { Matched: matched, Expected: expected.size, Extra: extra };
  }

  /**
   * Each manifest row's `(PersonID, PeriodIndex)` through the dues period its row id names; a row id with no dues
   * period counts as an unmatched key of its own, so it is extra.
   */
  private static async manifestC1Keys(h: TruthHarness, manifest: readonly SnapshotRowKey[]): Promise<Set<string>> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<{ ID: string; PersonID: string; PeriodIndex: number }>({
      EntityName: UnitFixtures.TruthEntityName(h, 'C1DuesPeriod'), Fields: ['ID', 'PersonID', 'PeriodIndex'], ResultType: 'simple', IgnoreMaxRows: true,
    }, h.User);
    if (!r.Success) throw new Error(`Reading pstruth.C1DuesPeriod failed: ${r.ErrorMessage || 'unknown error'}`);
    const periods = new UUIDMap<{ ID: string; PersonID: string; PeriodIndex: number }>();
    for (const p of r.Results) periods.Set(p.ID, p);
    return new Set(manifest.map((m) => {
      const p = periods.Get(m.rowId);
      return p ? `${p.PersonID.toLowerCase()}|${p.PeriodIndex}` : `unmapped:${m.rowId}`;
    }));
  }

  /** The trained model's most important feature and its share of total importance (what the promotion leakage check reads). */
  private static async dominantFeature(h: TruthHarness, modelId: string): Promise<{ readonly Feature: string; readonly Share: number }> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLModelEntity, 'FeatureImportance'>>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['FeatureImportance'], ResultType: 'simple' }, h.User);
    if (!r.Success) throw new Error(`Reading the feature importance of model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const parsed = JsonParse.ParseJsonText(r.Results[0]?.FeatureImportance || '{}', 'FeatureImportance');
    const importance: FeatureImportance = {};
    if (parsed.Ok && JsonParse.IsJsonObject(parsed.Value)) {
      for (const key of Object.keys(parsed.Value)) {
        const v = JsonParse.JsonNumber(parsed.Value, key);
        if (v !== null) importance[key] = v;
      }
    }
    const d = DetectSingleFeatureDominance(importance, DOMINANCE_THRESHOLD_DEFAULT);
    return { Feature: d.TopFeature || 'none', Share: d.TopShare === undefined ? -1 : d.TopShare };
  }

  /** G1.1 C1 → S1.1 */
  public static async MeasureC1UnitKeys(h: TruthHarness): Promise<GateMeasurement> {
    const { Unit: unit } = await UnitFixtures.ProvisionC1RenewalPipeline(h);
    const read = await PredictionUnitGates.readUnitRows(h, unit);
    if (read.Status !== 'read') return { Passed: false, Measured: {}, Detail: `unit refused: ${JSON.stringify(read.Refusal)}` };
    const actual = new Set(read.Rows.map((r) => `${r.EntityKey.toLowerCase()}|${String(r.Source.PeriodIndex)}`));
    const c = PredictionUnitGates.compareKeys(await PredictionUnitGates.referenceC1Keys(), actual);
    return { Passed: c.Matched === 4873 && c.Expected === 4873 && c.Extra === 0, Measured: { matched: c.Matched, expected: c.Expected, extra: c.Extra }, Detail: `${c.Matched} of ${c.Expected} matched, ${c.Extra} extra` };
  }

  /**
   * G1.2 C1 → S2.2. The run's Training Snapshot is asserted too: its exclusion counts and manifest row count, and its
   * manifest rows mapped through their dues periods give the reference's keys (G1.1 reads the unit in-process and never
   * trains, so the manifest check lives here, on the same unit).
   */
  public static async MeasureC1CensoredExcluded(h: TruthHarness): Promise<GateMeasurement> {
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1RenewalPipeline(h);
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const results = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    const stored = results.Ok && results.Value.status === 'completed' ? results.Value.unitResolution.censoredRowsExcluded : -1;
    const resolved = results.Ok && results.Value.status === 'completed' ? results.Value.unitResolution.resolvedRows : -1;
    const snapshot = await PredictionUnitGates.snapshotCounts(h, run);
    if (!snapshot) return { Passed: false, Measured: { censoredRowsExcluded: stored, resolvedRows: resolved }, Detail: `run ${run.ID} has no Training Snapshot` };
    const manifest = await PredictionUnitGates.manifestOf(h, snapshot);
    const keys = PredictionUnitGates.compareKeys(await PredictionUnitGates.referenceC1Keys(), await PredictionUnitGates.manifestC1Keys(h, manifest));
    const snapshotHolds = snapshot.CensoredRowsExcluded === 1756 && snapshot.LabelKnownRowsExcluded === 44 && snapshot.ManifestRowCount === 4873 && manifest.length === 4873;
    const manifestHolds = keys.Matched === 4873 && keys.Expected === 4873 && keys.Extra === 0;
    return {
      Passed: stored === 1756 && resolved === 4873 && snapshotHolds && manifestHolds,
      Measured: {
        censoredRowsExcluded: stored, resolvedRows: resolved, snapshotCensoredRowsExcluded: snapshot.CensoredRowsExcluded, snapshotLabelKnownRowsExcluded: snapshot.LabelKnownRowsExcluded,
        manifestRowCount: snapshot.ManifestRowCount, manifestRows: manifest.length, manifestMatched: keys.Matched, manifestExpected: keys.Expected, manifestExtra: keys.Extra,
      },
      Detail: `stored excluded count ${stored}; snapshot excluded ${snapshot.CensoredRowsExcluded} censored and ${snapshot.LabelKnownRowsExcluded} label-known, manifest ${manifest.length} rows: ${keys.Matched} of ${keys.Expected} reference keys matched, ${keys.Extra} extra`,
    };
  }

  /**
   * G1.3 W5 → S2.2. The scored model is promoted to Validated first: scoring refuses Draft models. The run's Training
   * Snapshot must record the censored exclusions and hold no row decided on the censored cycle's decision day.
   */
  public static async MeasureW5Censoring(h: TruthHarness): Promise<GateMeasurement> {
    const w5 = await h.EnsureLoaded({ Kind: 'world', ID: 'W5-censor', Seed: 42 });
    // AutoRenew and EventsAttended are planted true drivers of the world generator, not leakage, and either can carry
    // most of a model's importance: the dominance threshold is raised to 0.75 so a true driver never keeps the model Draft.
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W5-censor', { Features: [...W_WORLD_FEATURES], LeakageGuard: { DenyFields: [...W_WORLD_DENY_FIELDS], SingleFeatureDominanceThreshold: 0.75 } });
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const results = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    if (!results.Ok || results.Value.status !== 'completed') return { Passed: false, Measured: {}, Detail: 'run did not complete' };
    const { unitResolution } = results.Value;
    // Every resolved row the matrix holds is a manifest row of the run's snapshot.
    const snapshot = await PredictionUnitGates.snapshotCounts(h, run);
    if (!snapshot) return { Passed: false, Measured: { censoredRowsExcluded: unitResolution.censoredRowsExcluded }, Detail: `run ${run.ID} has no Training Snapshot` };
    const censoredInMatrix = unitResolution.resolvedRows - snapshot.ManifestRowCount;
    const truth = await h.ReadWorldTruth(w5);
    const newest = [...truth.values()].filter((t) => t.Censored);
    if (!run.ResultingModelID) return { Passed: false, Measured: {}, Detail: `run ${run.ID} produced no model` };
    const dominant = await PredictionUnitGates.dominantFeature(h, run.ResultingModelID);
    const promoted = await h.Promote(run.ResultingModelID, 'Validated', 'G1.3: dry-run preview of the newest cycle');
    if (!promoted.Promoted) return { Passed: false, Measured: { modelStatus: promoted.Status, dominantFeature: dominant.Feature, dominantShare: dominant.Share }, Detail: `model ${run.ResultingModelID} could not be validated for the dry run` };
    const scores = await h.Score(run.ResultingModelID, { scope: { filter: { entityName: w5.Entity.Name, extraFilter: '[Year] = 2026' } }, dryRun: true });
    if (!scores.Ok || scores.Predictions.length === 0) throw new Error(`dry-run scoring of W5 2026 failed: ${scores.ErrorMessage || 'no predictions'}`);
    const meanPrediction = scores.Predictions.reduce((s, p) => s + p.Score, 0) / scores.Predictions.length;
    const meanTrue = newest.reduce((s, t) => s + t.TrueP, 0) / newest.length;
    const censoredDecisionRows = (await PredictionUnitGates.manifestOf(h, snapshot)).filter((m) => m.decisionDate === W5_CENSORED_DECISION_DAY).length;
    const snapshotHolds = snapshot.CensoredRowsExcluded === 2147 && censoredDecisionRows === 0;
    const passed = unitResolution.censoredRowsExcluded === 2147 && censoredInMatrix === 0 && Math.abs(meanPrediction - meanTrue) <= 0.05 && snapshotHolds;
    return {
      Passed: passed,
      Measured: {
        censoredRowsExcluded: unitResolution.censoredRowsExcluded, censoredInMatrix, meanPrediction, meanTrue, dominantFeature: dominant.Feature, dominantShare: dominant.Share,
        snapshotCensoredRowsExcluded: snapshot.CensoredRowsExcluded, manifestRowsOnCensoredDecisionDay: censoredDecisionRows,
      },
      Detail: `newest cycle mean prediction ${meanPrediction.toFixed(4)} vs true ${meanTrue.toFixed(4)}; snapshot excluded ${snapshot.CensoredRowsExcluded}, ${censoredDecisionRows} manifest rows decided on ${W5_CENSORED_DECISION_DAY}`,
    };
  }

  /** G1.6 C1 → S2.3 */
  public static async MeasureC1LabelVersioning(h: TruthHarness): Promise<GateMeasurement> {
    const { Pipeline: pipeline, UnitRow: unitRow } = await UnitFixtures.ProvisionC1RenewalPipeline(h);
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const rv = RunView.FromMetadataProvider(h.Provider);
    const models = await rv.RunView<Pick<MJMLModelEntity, 'Lineage'>>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(run.ResultingModelID)}'`, Fields: ['Lineage'], ResultType: 'simple' }, h.User);
    if (!models.Success) throw new Error(`Reading the lineage of model ${run.ResultingModelID} failed: ${models.ErrorMessage || 'unknown error'}`);
    // Typed read of the two lineage keys (no cast of JSON.parse's result).
    const lineageJson = JsonParse.ParseJsonText(models.Results[0]?.Lineage || '{}', 'Lineage');
    const lineage = lineageJson.Ok && JsonParse.IsJsonObject(lineageJson.Value) ? lineageJson.Value : {};
    const modelUnitId = JsonParse.JsonString(lineage, 'predictionUnitId');
    const modelUnitVersion = JsonParse.JsonInteger(lineage, 'predictionUnitVersion');
    const v2 = await PredictionUnitVersioning.CreateNextPredictionUnitVersion(unitRow, { LabelWindowDays: 365 }, { kind: 'human', userId: h.User.ID }, UnitFixtures.EntityFactory(h), h.User);
    h.Created.RecordPredictionUnit(v2.ID);
    unitRow.LabelWindowDays = 365;
    const inPlaceRefused = !(await unitRow.Save());
    const v2SameLineage = UUIDsEqual(v2.LineageRootID, unitRow.ID);
    const modelReferencesV1Unit = UUIDsEqual(modelUnitId, unitRow.ID);
    const measuredUnitVersion = modelUnitVersion === null ? -1 : modelUnitVersion;
    const passed = v2.Version === 2 && v2.LabelVersion === 2 && v2SameLineage && modelReferencesV1Unit && modelUnitVersion === 1 && inPlaceRefused;
    return {
      Passed: passed,
      Measured: { v2Version: v2.Version, v2LabelVersion: v2.LabelVersion, v2SameLineage, modelReferencesV1Unit, modelUnitVersion: measuredUnitVersion, inPlaceRefused },
      Detail: `label edit created version ${v2.Version} (LabelVersion ${v2.LabelVersion}${v2SameLineage ? ', same lineage' : ', different lineage'}); model references unit version ${measuredUnitVersion}${modelReferencesV1Unit ? ' of the edited unit' : ' of another unit'}; in-place edit ${inPlaceRefused ? 'refused' : 'saved'}`,
    };
  }

  /** G1.7 W1 → S1.4 */
  public static async MeasureW1OneClassRefused(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W1-signal', { Features: ['EventsAttended'], OneClassVariant: true });
    const attempt = await h.Train(pipeline);
    const error = attempt.Ok ? null : (attempt.ErrorMessage || 'refused without a message');
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const results = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    const kind = results.Ok && results.Value.status === 'refused' ? results.Value.refusal.reason.kind : 'none';
    return { Passed: kind === 'single-valued-target' && run.ResultingModelID === null && error !== null, Measured: { refusal: kind, modelCreated: run.ResultingModelID !== null }, Detail: error || 'trained' };
  }

  /** G1.8 R3 → S1.4 */
  public static async MeasureR3CountTaskType(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'scenario', ID: 'R3', Seed: UnitFixtures.ScenarioBaseSeed('R3') });
    const asContinuous = await UnitFixtures.ProvisionScenarioPipeline(h, 'R3', { kind: 'continuous' });
    await h.Train(asContinuous.Pipeline);
    const r1 = TrainingRunResultsParser.ParseTrainingRunResults((await UnitFixtures.LatestRun(h, asContinuous.Pipeline.ID)).ValidationResults);
    const asCount = await UnitFixtures.ProvisionScenarioPipeline(h, 'R3', { kind: 'count' });
    await h.Train(asCount.Pipeline);
    const run2: MJMLTrainingRunEntity = await UnitFixtures.LatestRun(h, asCount.Pipeline.ID);
    const refusedContinuous = r1.Ok && r1.Value.status === 'refused' && r1.Value.refusal.reason.kind === 'task-type-mismatch';
    return { Passed: refusedContinuous && run2.Status === 'Completed', Measured: { refusedContinuous, countRunStatus: run2.Status }, Detail: `declared continuous: ${refusedContinuous ? 'refused (task-type-mismatch)' : 'not refused'}; declared count: run ${run2.Status}` };
  }
}

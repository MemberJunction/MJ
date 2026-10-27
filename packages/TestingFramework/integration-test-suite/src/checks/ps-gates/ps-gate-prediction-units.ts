/**
 * Prediction Unit gate measurements. Each trains through MJAPI exactly as a user would
 * (`h.Train`, the PredictiveStudio.TrainModel remote operation) and reads the stored rows; the unit-row checks also
 * run the same reader in-process. Each returns a GateMeasurement and throws only when it cannot measure.
 */
import { join } from 'node:path';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { DOMINANCE_THRESHOLD_DEFAULT, JsonParse, TrainingRunResultsParser, type FeatureImportance, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { DetectSingleFeatureDominance, PredictionUnitRowReader, ProviderAssemblyMetadata, RunViewDataAccess, PredictionUnitVersioning, type UnitRowReadResult } from '@memberjunction/predictive-studio';
import { C1CorpusFixture, C1_CORPUS_DIR, UnitFixtures, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type GateMeasurement, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

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

  /** The trained model's most important feature and its share of total importance (what the promotion leakage check reads). */
  private static async dominantFeature(h: TruthHarness, modelId: string): Promise<{ readonly Feature: string; readonly Share: number }> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLModelEntity, 'FeatureImportance'>>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['FeatureImportance'], ResultType: 'simple' }, h.User);
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
    const keys = await C1CorpusFixture.ReadC1CorpusCsv(join(C1_CORPUS_DIR, 'person_years_keys.csv'));
    const expected = new Set(keys.Rows.map((k) => `${k.person_id.toLowerCase()}|${k.period_index}`));
    const actual = new Set(read.Rows.map((r) => `${r.EntityKey.toLowerCase()}|${String(r.Source.PeriodIndex)}`));
    const matched = [...expected].filter((k) => actual.has(k)).length;
    const extra = [...actual].filter((k) => !expected.has(k)).length;
    return { Passed: matched === 4873 && expected.size === 4873 && extra === 0, Measured: { matched, expected: expected.size, extra }, Detail: `${matched} of ${expected.size} matched, ${extra} extra` };
  }

  /** G1.2 C1 → S2.2 */
  public static async MeasureC1CensoredExcluded(h: TruthHarness): Promise<GateMeasurement> {
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1RenewalPipeline(h);
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const results = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    const stored = results.Ok && results.Value.status === 'completed' ? results.Value.unitResolution.censoredRowsExcluded : -1;
    const resolved = results.Ok && results.Value.status === 'completed' ? results.Value.unitResolution.resolvedRows : -1;
    return { Passed: stored === 1756 && resolved === 4873, Measured: { censoredRowsExcluded: stored, resolvedRows: resolved }, Detail: `stored excluded count ${stored}` };
  }

  /** G1.3 W5 → S2.2. The scored model is promoted to Validated first: scoring refuses Draft models. */
  public static async MeasureW5Censoring(h: TruthHarness): Promise<GateMeasurement> {
    const w5 = await h.EnsureLoaded({ Kind: 'world', ID: 'W5-censor', Seed: 42 });
    // AutoRenew is a planted true driver of the world generator (about 0.74 of importance here), not leakage: the dominance threshold is raised just above it.
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W5-censor', { features: [...W_WORLD_FEATURES], leakageGuard: { DenyFields: [...W_WORLD_DENY_FIELDS], SingleFeatureDominanceThreshold: 0.75 } });
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const results = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    if (!results.Ok || results.Value.status !== 'completed' || !results.Value.legacy) return { Passed: false, Measured: {}, Detail: 'run did not complete' };
    const { unitResolution, legacy } = results.Value;
    const censoredInMatrix = unitResolution.resolvedRows - (legacy.trainingRowCount + legacy.holdoutRowCount);
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
    const passed = unitResolution.censoredRowsExcluded === 2147 && censoredInMatrix === 0 && Math.abs(meanPrediction - meanTrue) <= 0.05;
    return { Passed: passed, Measured: { censoredRowsExcluded: unitResolution.censoredRowsExcluded, censoredInMatrix, meanPrediction, meanTrue, dominantFeature: dominant.Feature, dominantShare: dominant.Share }, Detail: `newest cycle mean prediction ${meanPrediction.toFixed(4)} vs true ${meanTrue.toFixed(4)}` };
  }

  /** G1.6 C1 → S2.3 */
  public static async MeasureC1LabelVersioning(h: TruthHarness): Promise<GateMeasurement> {
    const { Pipeline: pipeline, UnitRow: unitRow } = await UnitFixtures.ProvisionC1RenewalPipeline(h);
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const rv = RunView.FromMetadataProvider(h.Provider);
    const models = await rv.RunView<Pick<MJMLModelEntity, 'Lineage'>>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(run.ResultingModelID)}'`, Fields: ['Lineage'], ResultType: 'simple' }, h.User);
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
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W1-signal', { features: ['EventsAttended'], oneClassVariant: true });
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

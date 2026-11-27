/**
 * Gate G7.4 "C1 → C2.4" (owner PR 5, phase 7, B2): a Feature Pipeline's values enter a model's matrix as of each row's
 * decision date, read from the version the model is pinned to, never as today's value (F-FP-11, I3).
 *
 * Server transport: the planted values are `Pipeline` Feature Values, which only the Feature Pipelines write path may
 * save (B1's guard, D5-30), so the check saves them in this process through `FeatureValueWriteAuthorisations`. On the
 * C1 corpus (the truth suite's `pstruth.C1*` tables, loaded by `truth:load-c1`), for every dues period of the corpus (the year-cutoff holdout
 * then holds enough rows of each class for the gate to ship a model):
 *  1. a fixture job-title Feature Pipeline (a `MJ: Record Processes` row with one Active, ungated version) holds, per
 *     dues period, a dated job-title history — title A from 2015, title B (today's, the open row) from a change date
 *     (the title at the decision date agrees with the outcome on 3 rows of 4, so the trained model ships),
 *     30 days after the row's decision date for half the rows and on the decision date itself for the other half (the
 *     `≤` boundary) — and version 2
 *     of the same pipeline holds today's title on every row, effective from 2016;
 *  2. a C1 renewal pipeline over those periods (the product's default date-carved holdout) selects `PeriodIndex` and the pipeline's `GateJobTitle` (an
 *     `llm-derived` step): training's own assembly (`TrainingEngine.AssembleForTraining`, the pin resolved at train time)
 *     gives the planted value at the decision date on 100% of rows and today's value on 0 of the rows where they differ;
 *  3. (attack 7) the trained model's Training Snapshot `PinnedFeatureVersions` and its Lineage carry the pin of the
 *     pipeline's Active version. Needs the truth sidecar.
 * Mutation: `≤` → `<` on the effective-date comparison, or drop the pinned-version filter (`as-of-assembler.ts`
 * `valueInEffect` / `featureValueFilter`) → G1 red.
 */
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import type {
  MJFeaturePipelineVersionEntity, MJFeatureValueEntity, MJMLAlgorithmEntity, MJMLModelEntity, MJMLTrainingPipelineEntity, MJMLTrainingSnapshotEntity, MJRecordProcessEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { FeatureValueWriteAuthorisations } from '@memberjunction/feature-pipelines';
import {
  EvaluationProtocolVersioning, MetadataEntityFactory, PredictionUnitVersioning, ProtocolDefaults, ProviderAssemblyMetadata, RunViewDataAccess, RunViewPredictionUnitStore,
  TrainingDelegation, TrainingEngine, UnitModelLineageParser, type AsOfAssembledMatrix,
} from '@memberjunction/predictive-studio';
import {
  EvaluationProtocolRules, FeatureValuePins, JsonParse, PredictionUnit, UtcDay,
  type FeatureStepGraph, type FeatureValuePin, type FeatureVersionPin, type PredictionUnitSpec, type UnitDraft,
} from '@memberjunction/predictive-studio-core';
import { HarnessSidecar } from '@memberjunction/predictive-studio-truth-suite';
import { Assert, AssertEqual, IntegrationCheckRegistry, type BundleLifecycle, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';

/** The planted feature's name on the fixture pipeline. */
const FEATURE = 'GateJobTitle';
/** The fixture pipeline's pin: its version-1 prompt and parameters hashes (no AI model: the values are planted). */
const PROMPT_HASH = 'g7-4-prompt-v1';
const PARAMETERS_HASH = 'g7-4-parameters-v1';
/** Names of every row the gate creates; teardown finds them by it. */
const NAME_PREFIX = 'PSTruth: G7.4 C1 → C2.4';
/** Days after a row's decision date its planted title changes, on the rows whose title changes after it. */
const CHANGE_OFFSET_DAYS = 30;
/**
 * The title in effect at the decision date carries the outcome on 3 rows of 4 (a renewal reads "Director", a lapse
 * "Clerk"; every fourth row the other one), so the model it trains beats the flat guess and ships, and its lineage can be
 * read (attack 7); the agreement stays well below the leakage audit's single-feature ceiling. The other title of a row
 * is "Analyst" or "Manager", so a read of the wrong one is never mistaken for the right one.
 */
const SIGNAL_TITLES = { renewed: 'Director', lapsed: 'Clerk' } as const;
const OTHER_TITLES = ['Analyst', 'Manager'] as const;

/** One unit row's planted history: the title in effect at its decision date, and today's (the open row's). */
interface PlantedRow { readonly RowID: string; readonly AtDecision: string; readonly Today: string }
/** What the fixture created. */
interface G74Fixture {
  readonly RecordProcessID: string;
  readonly Pin: FeatureVersionPin;
  readonly Pipeline: MJMLTrainingPipelineEntity;
  readonly RowEntityID: string;
  readonly Planted: readonly PlantedRow[];
}

/** The gate's steps: the fixture pipeline and its values, the unit pipeline, and the reads that measure it. */
class PsGateC1C24Steps {
  /** The fixture's build, shared by the bundle's checks (they may run at once, so the promise is shared, not its result). */
  private static fixture: Promise<G74Fixture> | null = null;

  /** The fixture, built once per bundle run. */
  public static Fixture(ctx: IntegrationCheckContext): Promise<G74Fixture> {
    if (!PsGateC1C24Steps.fixture) PsGateC1C24Steps.fixture = PsGateC1C24Steps.build(ctx);
    return PsGateC1C24Steps.fixture;
  }

  public static Forget(): void {
    PsGateC1C24Steps.fixture = null;
  }

  /** The pstruth entity registered for a base table. */
  public static TruthEntity(provider: IMetadataProvider, baseTable: string): string {
    const e = provider.Entities.find((x) => x.SchemaName === 'pstruth' && x.BaseTable === baseTable);
    if (!e) throw new Error(`G7.4 needs pstruth.${baseTable}: run truth:provision and truth:load-c1`);
    return e.Name;
  }

  private static async build(ctx: IntegrationCheckContext): Promise<G74Fixture> {
    const stamp = new Date().toISOString();
    const process = await PsGateC1C24Steps.createRecordProcess(ctx, stamp);
    const pin = await PsGateC1C24Steps.createActiveVersion(ctx, process.ID);
    const pipeline = await PsGateC1C24Steps.createUnitPipeline(ctx, stamp, process.ID);
    // Training's own assembly before the values exist: it resolves the pin and reads the unit's rows (and refuses).
    const before = await PsGateC1C24Steps.Assemble(ctx, pipeline.ID);
    const planted = await PsGateC1C24Steps.plant(ctx, process.ID, before.UnitRead.RowEntity.ID, before.UnitRead.Rows);
    return { RecordProcessID: process.ID, Pin: pin, Pipeline: pipeline, RowEntityID: before.UnitRead.RowEntity.ID, Planted: planted };
  }

  /** Training's assembly of the pipeline, as training runs it (deps built for the check's provider and user). */
  public static async Assemble(ctx: IntegrationCheckContext, pipelineId: string): ReturnType<TrainingEngine['AssembleForTraining']> {
    return new TrainingEngine().AssembleForTraining(pipelineId, await TrainingDelegation.BuildTrainingDeps(ctx.Provider, ctx.User));
  }

  private static async createRecordProcess(ctx: IntegrationCheckContext, stamp: string): Promise<MJRecordProcessEntity> {
    const rp = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
    rp.NewRecord();
    rp.Name = `${NAME_PREFIX} job-title pipeline ${stamp}`;
    rp.Description = 'G7.4 fixture: planted dated job titles; never run.';
    rp.EntityID = PsGateC1C24Steps.entityId(ctx.Provider, PsGateC1C24Steps.TruthEntity(ctx.Provider, 'C1DuesPeriod'));
    rp.WorkType = 'Infer';
    rp.ScopeType = 'Filter';
    rp.Status = 'Draft';
    Assert(await rp.Save(), `saving the fixture Record Process: ${rp.LatestResult?.CompleteMessage}`);
    return rp;
  }

  /** Version 1 Active (ungated), version 2 Retired: the pin is version 1, so version 2's values must never be read. */
  private static async createActiveVersion(ctx: IntegrationCheckContext, recordProcessId: string): Promise<FeatureVersionPin> {
    for (const [version, status] of [[1, 'Active'], [2, 'Retired']] as const) {
      const v = await ctx.Provider.GetEntityObject<MJFeaturePipelineVersionEntity>('MJ: Feature Pipeline Versions', ctx.User);
      v.NewRecord();
      v.RecordProcessID = recordProcessId;
      v.Version = version;
      v.PinHash = `g7-4-pin-v${version}`;
      v.SpecHash = 'g7-4-spec';
      v.PromptVersionHash = version === 1 ? PROMPT_HASH : 'g7-4-prompt-v2';
      v.ParametersHash = PARAMETERS_HASH;
      v.Status = status;
      v.Gated = false;
      Assert(await v.Save(), `saving Feature Pipeline Version ${version}: ${v.LatestResult?.CompleteMessage}`);
    }
    return { featurePipelineRecordProcessId: recordProcessId, pipelineVersion: 1, promptVersionHash: PROMPT_HASH, aiModelId: null, parametersHash: PARAMETERS_HASH };
  }

  /** The C1 renewal unit, its default protocol (seeded holdout), and the pipeline. */
  private static async createUnitPipeline(ctx: IntegrationCheckContext, stamp: string, recordProcessId: string): Promise<MJMLTrainingPipelineEntity> {
    const factory = new MetadataEntityFactory(ctx.Provider);
    const unitRow = await PredictionUnitVersioning.CreatePredictionUnitV1(PsGateC1C24Steps.unitDraft(ctx.Provider, stamp), { kind: 'human', userId: ctx.User.ID }, factory, ctx.User);
    const parsed = PredictionUnit.ParsePredictionUnitRow(unitRow);
    if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
    const pipeline = await factory.getEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', ctx.User);
    pipeline.Name = `${NAME_PREFIX} renewal ${stamp}`;
    pipeline.AlgorithmID = await PsGateC1C24Steps.algorithmId(ctx, 'Logistic Regression');
    const steps: FeatureStepGraph = { Steps: [
      { Id: 'select', Kind: 'select', Columns: ['PeriodIndex'] },
      { Id: 'job-title', Kind: 'llm-derived', FeaturePipelineRef: recordProcessId, Columns: [FEATURE] },
    ] };
    pipeline.FeatureSteps = JSON.stringify(steps);
    pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 });
    RunViewPredictionUnitStore.ApplyUnitToPipeline(pipeline, unitRow.ID, parsed.Value, new ProviderAssemblyMetadata(ctx.Provider));
    pipeline.EvaluationProtocolID = await PsGateC1C24Steps.protocolId(ctx, parsed.Value, `${NAME_PREFIX} protocol ${stamp}`);
    Assert(await pipeline.Save(), `saving the unit pipeline: ${pipeline.LatestResult?.CompleteMessage}`);
    return pipeline;
  }

  /** The reference C1 renewal unit: renewed = the next dues period within 400 days. */
  private static unitDraft(provider: IMetadataProvider, stamp: string): UnitDraft {
    return {
      Name: `${NAME_PREFIX} C1 renewal ${stamp}`, Description: 'G7.4: the C1 renewal unit, with a planted dated job title.',
      UnitRows: {
        kind: 'grain-x-periods', grainEntity: PsGateC1C24Steps.TruthEntity(provider, 'C1Person'), childEntity: PsGateC1C24Steps.TruthEntity(provider, 'C1DuesPeriod'),
        foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [],
      },
      LabelRule: { kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 }, LabelWindowDays: 400, LabelGapDays: 0,
      TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
      Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: PsGateC1C24Steps.TruthEntity(provider, 'C1OrderHeader'), field: 'OrderDate' } },
      ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: 'PersonID', TemporalSpec: null,
      DecisionSpec: { action: 'renewal outreach', actorRole: 'membership team', capacityPerPeriod: null, period: 'month' },
      IncumbentHeuristic: { kind: 'none' },
    };
  }

  /** The unit's default protocol: the product's default holdout of a dated unit (date-carved at the year cutoff), no incumbent comparator. */
  private static async protocolId(ctx: IntegrationCheckContext, unit: PredictionUnitSpec, name: string): Promise<string> {
    const holdout = await ProtocolDefaults.DefaultHoldoutFor(unit, { DataAccess: new RunViewDataAccess(ctx.User, ctx.Provider), Metadata: new ProviderAssemblyMetadata(ctx.Provider), Now: new Date() });
    const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: unit, Holdout: holdout, Candidates: 1, Seed: ProtocolDefaults.DEFAULT_SEED, Name: name });
    const row = await EvaluationProtocolVersioning.CreateEvaluationProtocolV1(
      { ...draft, baselines: draft.baselines.filter((b) => b.kind !== 'incumbent-heuristic') }, { kind: 'human', userId: ctx.User.ID }, new MetadataEntityFactory(ctx.Provider), ctx.User);
    return row.ID;
  }

  private static async algorithmId(ctx: IntegrationCheckContext, name: string): Promise<string> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJMLAlgorithmEntity, 'ID'>>({ EntityName: 'MJ: ML Algorithms', ExtraFilter: `Name='${EscapeSQLString(name)}'`, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
    if (!r.Success || !r.Results[0]) throw new Error(`ML Algorithm "${name}" not found`);
    return r.Results[0].ID;
  }

  private static entityId(provider: IMetadataProvider, entityName: string): string {
    const e = provider.EntityByName(entityName);
    if (!e) throw new Error(`entity ${entityName} is not registered`);
    return e.ID;
  }

  /** Plants each unit row's dated history (version 1: A then B; version 2: B throughout) through the write path's authorisation. */
  private static async plant(ctx: IntegrationCheckContext, recordProcessId: string, entityId: string, rows: readonly { RowID: string; DecisionDate: Date; Label: string | number }[]): Promise<PlantedRow[]> {
    const planted: PlantedRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const renewed = (String(r.Label) === '1') !== (i % 4 === 3);
      const atDecision = renewed ? SIGNAL_TITLES.renewed : SIGNAL_TITLES.lapsed;
      const other = OTHER_TITLES[i % OTHER_TITLES.length];
      const changeAfterDecision = i % 2 === 0;
      // The title changes after the decision date on even rows (A is in effect then, B today) and on the decision date
      // itself on odd rows (B is in effect then: `EffectiveAsOf` ≤ the decision date).
      const titleA = changeAfterDecision ? atDecision : other;
      const titleB = changeAfterDecision ? other : atDecision;
      const change = UtcDay.AddUtcDays(UtcDay.ToUtcDay(r.DecisionDate) || r.DecisionDate, changeAfterDecision ? CHANGE_OFFSET_DAYS : 0);
      await PsGateC1C24Steps.saveValue(ctx, { recordProcessId, entityId, recordId: r.RowID, version: 1, value: titleA, from: new Date('2015-01-01T00:00:00Z'), to: change });
      await PsGateC1C24Steps.saveValue(ctx, { recordProcessId, entityId, recordId: r.RowID, version: 1, value: titleB, from: change, to: null });
      await PsGateC1C24Steps.saveValue(ctx, { recordProcessId, entityId, recordId: r.RowID, version: 2, value: titleB, from: new Date('2016-01-01T00:00:00Z'), to: null });
      planted.push({ RowID: r.RowID, AtDecision: changeAfterDecision ? titleA : titleB, Today: titleB });
    }
    return planted;
  }

  private static async saveValue(ctx: IntegrationCheckContext, v: { recordProcessId: string; entityId: string; recordId: string; version: number; value: string; from: Date; to: Date | null }): Promise<void> {
    const fv = await ctx.Provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', ctx.User);
    fv.NewRecord();
    fv.RecordProcessID = v.recordProcessId;
    fv.EntityID = v.entityId;
    fv.RecordID = v.recordId;
    fv.FeatureName = FEATURE;
    fv.Source = 'Pipeline';
    fv.Role = 'Champion';
    fv.PipelineVersion = v.version;
    fv.PromptVersionHash = v.version === 1 ? PROMPT_HASH : 'g7-4-prompt-v2';
    fv.ParametersHash = PARAMETERS_HASH;
    fv.ValueText = v.value;
    fv.EffectiveAsOf = v.from;
    fv.EffectiveTo = v.to;
    fv.ComputedAt = v.from;
    Assert(await FeatureValueWriteAuthorisations.Save(fv), `saving a planted Feature Value: ${fv.LatestResult?.CompleteMessage}`);
  }

  /** Per row of the matrix: the assembled `GateJobTitle`, keyed by row ID (lower-cased). */
  public static ColumnByRow(matrix: AsOfAssembledMatrix): Map<string, string | number | null> {
    const at = matrix.Columns.findIndex((c) => c.Name === FEATURE);
    Assert(at >= 0, `the matrix has no ${FEATURE} column (columns: ${matrix.Columns.map((c) => c.Name).join(', ')})`);
    return new Map(matrix.Rows.map((r) => [r.RowID.toLowerCase(), r.Values[at]]));
  }

  /** The pins a stored `PinnedFeatureVersions` / lineage feature spec carries for {@link FEATURE}. */
  public static PinsIn(snapshot: MJMLTrainingSnapshotEntity, model: MJMLModelEntity): { Snapshot: readonly FeatureValuePin[]; Lineage: readonly FeatureValuePin[] } {
    const stored = JsonParse.ParseJsonText(snapshot.PinnedFeatureVersions, 'PinnedFeatureVersions');
    Assert(stored.Ok === true && Array.isArray(stored.Value), `the snapshot's PinnedFeatureVersions is not a JSON array: ${snapshot.PinnedFeatureVersions}`);
    const lineage = UnitModelLineageParser.ParseUnitModelLineage(model.Lineage);
    Assert(lineage.Ok === true, `the model's Lineage does not parse: ${lineage.Ok === false ? lineage.Errors.join('; ') : ''}`);
    const fromLineage = lineage.Ok === true ? lineage.Value.featureSpec.flatMap((c) => (c.name === FEATURE && c.source.kind === 'feature-value' && c.source.pin ? [c.source.pin] : [])) : [];
    const fromSnapshot = UnitModelLineageParser.ParseUnitModelLineage(JSON.stringify({
      predictionUnitId: 'pins', predictionUnitVersion: 1, labelVersion: 1, featureSpecVersion: 1, unitRowEntity: 'pins', categoryLevels: {}, trainingSnapshotId: 'pins', snapshotContentHash: 'pins',
      featureSpec: (stored.Ok === true && Array.isArray(stored.Value) ? stored.Value : []).map((pin) => ({ name: FEATURE, source: { kind: 'feature-value', featureName: FEATURE, pin }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } })),
    }));
    Assert(fromSnapshot.Ok === true, `the snapshot's PinnedFeatureVersions holds a pin that does not parse: ${snapshot.PinnedFeatureVersions}`);
    const snapshotPins = fromSnapshot.Ok === true ? fromSnapshot.Value.featureSpec.flatMap((c) => (c.source.kind === 'feature-value' && c.source.pin ? [c.source.pin] : [])) : [];
    return { Snapshot: snapshotPins, Lineage: fromLineage };
  }

  /**
   * Deletes every fixture Record Process (found by {@link NAME_PREFIX}, so an interrupted run's rows go too) with its
   * versions and values. Never throws; a read or delete that fails is logged.
   */
  public static async Teardown(ctx: IntegrationCheckContext): Promise<void> {
    PsGateC1C24Steps.Forget();
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const del = async <T extends MJFeatureValueEntity | MJFeaturePipelineVersionEntity | MJRecordProcessEntity>(entity: string, filter: string): Promise<void> => {
      const r = await rv.RunView<T>({ EntityName: entity, ExtraFilter: filter, ResultType: 'entity_object', IgnoreMaxRows: true, BypassCache: true }, ctx.User);
      if (!r.Success) console.warn(`      ⚠ G7.4 teardown: reading ${entity}: ${r.ErrorMessage}`);
      for (const row of r.Success ? r.Results : []) if (!(await row.Delete())) console.warn(`      ⚠ G7.4 teardown: deleting ${entity} ${row.ID}: ${row.LatestResult?.CompleteMessage}`);
    };
    // N'…': the prefix holds "→", which a non-Unicode literal turns into '?', matching nothing.
    const processes = `RecordProcessID IN (SELECT ID FROM [__mj].[vwRecordProcesses] WHERE Name LIKE N'${EscapeSQLString(NAME_PREFIX)}%')`;
    await del<MJFeatureValueEntity>('MJ: Feature Values', processes);
    await del<MJFeaturePipelineVersionEntity>('MJ: Feature Pipeline Versions', processes);
    await del<MJRecordProcessEntity>('MJ: Record Processes', `Name LIKE N'${EscapeSQLString(NAME_PREFIX)}%'`);
  }
}

/** The gate's people as of their decision dates: 100% planted, 0 today's. */
async function measureAssembly(ctx: IntegrationCheckContext): Promise<void> {
  const fx = await PsGateC1C24Steps.Fixture(ctx);
  const assembly = await PsGateC1C24Steps.Assemble(ctx, fx.Pipeline.ID);
  Assert(assembly.Assembled.Status === 'assembled', `training's assembly refused: ${JSON.stringify(assembly.Assembled.Status === 'refused' ? assembly.Assembled.Refusal : null)}`);
  if (assembly.Assembled.Status !== 'assembled') return;
  const column = PsGateC1C24Steps.ColumnByRow(assembly.Assembled);
  const pin = assembly.Features.find((f) => f.name === FEATURE)?.source;
  Assert(pin?.kind === 'feature-value' && pin.pin !== null && FeatureValuePins.VersionOf(pin.pin) === FeatureValuePins.VersionOf(fx.Pin), `the ${FEATURE} column is pinned to ${JSON.stringify(pin)}, not the Active version ${FeatureValuePins.VersionOf(fx.Pin)}`);
  const rows = fx.Planted.filter((p) => column.has(p.RowID.toLowerCase()));
  const planted = rows.filter((p) => column.get(p.RowID.toLowerCase()) === p.AtDecision).length;
  const differing = rows.filter((p) => p.AtDecision !== p.Today);
  const today = differing.filter((p) => column.get(p.RowID.toLowerCase()) === p.Today).length;
  console.log(`      → G7.4: ${planted}/${rows.length} rows read the planted title at the decision date; ${today}/${differing.length} rows whose title changed after it read today's  ${JSON.stringify({ rows: rows.length, planted, differing: differing.length, today })}`);
  Assert(rows.length > 0 && rows.length === assembly.Assembled.Rows.length, `the matrix holds ${assembly.Assembled.Rows.length} rows, ${rows.length} of them planted`);
  AssertEqual(planted, rows.length, 'rows reading the planted title at the decision date');
  AssertEqual(today, 0, 'rows reading today\'s title');
}

/** Attack 7: the trained model's snapshot and lineage carry the pin. */
async function measurePins(ctx: IntegrationCheckContext): Promise<void> {
  HarnessSidecar.DefaultToSuiteSidecar();
  const fx = await PsGateC1C24Steps.Fixture(ctx);
  const result = await TrainingDelegation.TrainModelViaEngine({ pipelineId: fx.Pipeline.ID }, ctx.Provider, ctx.User);
  Assert(!!result.model, `training produced no model (run ${result.run.ID}, status ${result.run.Status}): ${result.run.ValidationResults}`);
  if (!result.model) return;
  const snapshot = await ctx.Provider.GetEntityObject<MJMLTrainingSnapshotEntity>('MJ: ML Training Snapshots', ctx.User);
  Assert(!!result.run.TrainingSnapshotID && (await snapshot.Load(result.run.TrainingSnapshotID)), `the run's Training Snapshot ${result.run.TrainingSnapshotID} could not be loaded`);
  const pins = PsGateC1C24Steps.PinsIn(snapshot, result.model);
  const expected = FeatureValuePins.VersionOf(fx.Pin);
  console.log(`      → G7.4 pins: snapshot ${JSON.stringify(pins.Snapshot)} · lineage ${JSON.stringify(pins.Lineage)} · model ${result.model.ID}`);
  Assert(pins.Snapshot.length === 1 && FeatureValuePins.VersionOf(pins.Snapshot[0]) === expected, `the snapshot's PinnedFeatureVersions is ${snapshot.PinnedFeatureVersions}, expected the pin ${expected}`);
  Assert(pins.Lineage.length === 1 && FeatureValuePins.VersionOf(pins.Lineage[0]) === expected, `the model's lineage carries ${JSON.stringify(pins.Lineage)}, expected the pin ${expected}`);
}

export const PsGateC1C24Checks: NamedCheck[] = [
  { Id: 'ps-gate-c1-c2-4.G7.4', Name: 'G7.4 C1 → C2.4: the snapshot column is the planted value at the decision date (100%), today\'s value (0)', RequiresMutation: true, Fn: measureAssembly },
  { Id: 'ps-gate-c1-c2-4.G7.4-pins', Name: 'G7.4 C1 → C2.4: the model\'s Training Snapshot and Lineage carry the pin', RequiresMutation: true, Fn: measurePins },
];

/** Nothing to create up front (the fixture is built by the first check); teardown deletes the planted pipeline and values. */
export const PsGateC1C24Lifecycle: BundleLifecycle = {
  Setup: async () => { PsGateC1C24Steps.Forget(); },
  Teardown: async (ctx) => {
    try {
      await PsGateC1C24Steps.Teardown(ctx);
    } catch (e) {
      console.warn(`      ⚠ G7.4 teardown: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

for (const c of PsGateC1C24Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-c2-4', PsGateC1C24Lifecycle);

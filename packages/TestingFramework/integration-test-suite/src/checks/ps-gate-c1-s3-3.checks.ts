/**
 * Gate G7.6 "C1 → S3.3" (owner PR 5, phase 7, B3): scoring a C1 model with a job-title Feature Pipeline version other
 * than the one it is pinned to is refused, 1 of 1 (F-FP-11, the scoring half; §5.2.3).
 *
 * Server transport: the planted values are `Pipeline` Feature Values, which only the Feature Pipelines write path may
 * save, so the check saves them in this process through `FeatureValueWriteAuthorisations` (as G7.4 does). On the C1
 * corpus (`truth:load-c1`):
 *  1. a fixture job-title Feature Pipeline holds version 1 (Active, ungated) and version 2 (Retired), and, per dues
 *     period, a version-1 title that carries the outcome on 3 rows of 4 (so the model ships) and a version-2 title;
 *  2. a C1 renewal pipeline with an `llm-derived` step on that feature is trained (the pin is resolved at train time:
 *     version 1) — the model's lineage carries the version-1 pin and `FeaturePinCheck` passes it;
 *  3. the pipeline's Active version moves to 2 (version 1 Retired), and the model is scored on the model path (Score
 *     Record Set): refused `feature-version-mismatch` naming version 1 pinned and version 2 active, with its refused
 *     `MJ: ML Scoring Runs` row, before any record — 0 Feature Values written.
 * Needs the truth sidecar. Mutation: remove the pin comparison from `ScoringService.RunChecksBeforeAssembly`
 * (`CheckFeaturePins`) → red.
 */
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import type {
  MJFeaturePipelineVersionEntity, MJFeatureValueEntity, MJMLAlgorithmEntity, MJMLModelEntity, MJMLScoringRunEntity, MJMLTrainingPipelineEntity, MJRecordProcessEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { FeatureValueWriteAuthorisations } from '@memberjunction/feature-pipelines';
import {
  EvaluationProtocolVersioning, FeaturePinCheck, MetadataEntityFactory, PredictionUnitVersioning, ProtocolDefaults, ProviderAssemblyMetadata, RunViewDataAccess,
  RunViewPredictionUnitStore, ScoringRunRecorder, ScoringSeamDefaults, ScoringService, TrainingDelegation, TrainingEngine, type ScoringContext,
} from '@memberjunction/predictive-studio';
import {
  EvaluationProtocolRules, PredictionUnit, type FeatureStepGraph, type FeatureVersionPin, type PredictionUnitSpec, type UnitDraft,
} from '@memberjunction/predictive-studio-core';
import { HarnessSidecar } from '@memberjunction/predictive-studio-truth-suite';
import { Assert, AssertEqual, IntegrationCheckRegistry, type BundleLifecycle, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';

/** The planted feature's name on the fixture pipeline. */
const FEATURE = 'GateJobTitleS33';
/** Names of every row the gate creates; teardown finds them by it. */
const NAME_PREFIX = 'PSTruth: G7.6 C1 → S3.3';
/** The title in effect carries the outcome on 3 rows of 4 (as G7.4's), so the model trained on it ships. */
const SIGNAL_TITLES = { renewed: 'Director', lapsed: 'Clerk' } as const;

/** What the fixture created. */
interface G76Fixture {
  readonly RecordProcessID: string;
  readonly Pipeline: MJMLTrainingPipelineEntity;
  readonly RowIDs: readonly string[];
}

/** The gate's steps. */
class PsGateC1S33Steps {
  public static TruthEntity(provider: IMetadataProvider, baseTable: string): string {
    const e = provider.Entities.find((x) => x.SchemaName === 'pstruth' && x.BaseTable === baseTable);
    if (!e) throw new Error(`G7.6 needs pstruth.${baseTable}: run truth:provision and truth:load-c1`);
    return e.Name;
  }

  public static async Build(ctx: IntegrationCheckContext): Promise<G76Fixture> {
    const stamp = new Date().toISOString();
    const process = await PsGateC1S33Steps.createRecordProcess(ctx, stamp);
    await PsGateC1S33Steps.saveVersion(ctx, process.ID, 1, 'Active');
    await PsGateC1S33Steps.saveVersion(ctx, process.ID, 2, 'Retired');
    const pipeline = await PsGateC1S33Steps.createUnitPipeline(ctx, stamp, process.ID);
    const read = await new TrainingEngine().AssembleForTraining(pipeline.ID, await TrainingDelegation.BuildTrainingDeps(ctx.Provider, ctx.User));
    const rows = read.UnitRead.Rows;
    for (let i = 0; i < rows.length; i++) {
      const renewed = (String(rows[i].Label) === '1') !== (i % 4 === 3);
      await PsGateC1S33Steps.saveValue(ctx, process.ID, read.UnitRead.RowEntity.ID, rows[i].RowID, 1, renewed ? SIGNAL_TITLES.renewed : SIGNAL_TITLES.lapsed);
      await PsGateC1S33Steps.saveValue(ctx, process.ID, read.UnitRead.RowEntity.ID, rows[i].RowID, 2, i % 2 === 0 ? 'Analyst' : 'Manager');
    }
    return { RecordProcessID: process.ID, Pipeline: pipeline, RowIDs: rows.map((r) => r.RowID) };
  }

  private static async createRecordProcess(ctx: IntegrationCheckContext, stamp: string): Promise<MJRecordProcessEntity> {
    const rp = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
    rp.NewRecord();
    rp.Name = `${NAME_PREFIX} job-title pipeline ${stamp}`;
    rp.Description = 'G7.6 fixture: planted job titles at versions 1 and 2; never run.';
    rp.EntityID = PsGateC1S33Steps.entityId(ctx.Provider, PsGateC1S33Steps.TruthEntity(ctx.Provider, 'C1DuesPeriod'));
    rp.WorkType = 'Infer';
    rp.ScopeType = 'Filter';
    rp.Status = 'Draft';
    Assert(await rp.Save(), `saving the fixture Record Process: ${rp.LatestResult?.CompleteMessage}`);
    return rp;
  }

  private static async saveVersion(ctx: IntegrationCheckContext, recordProcessId: string, version: number, status: MJFeaturePipelineVersionEntity['Status']): Promise<void> {
    const v = await ctx.Provider.GetEntityObject<MJFeaturePipelineVersionEntity>('MJ: Feature Pipeline Versions', ctx.User);
    v.NewRecord();
    v.RecordProcessID = recordProcessId;
    v.Version = version;
    v.PinHash = `g7-6-pin-v${version}`;
    v.SpecHash = 'g7-6-spec';
    v.PromptVersionHash = `g7-6-prompt-v${version}`;
    v.ParametersHash = 'g7-6-parameters';
    v.Status = status;
    v.Gated = false;
    Assert(await v.Save(), `saving Feature Pipeline Version ${version}: ${v.LatestResult?.CompleteMessage}`);
  }

  /** Moves the pipeline's Active version from 1 to 2 (version 1 Retired first: one Active version per pipeline). */
  public static async ActivateVersion2(ctx: IntegrationCheckContext, recordProcessId: string): Promise<void> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJFeaturePipelineVersionEntity>({
      EntityName: 'MJ: Feature Pipeline Versions', ExtraFilter: `RecordProcessID='${EscapeSQLString(recordProcessId)}'`, OrderBy: 'Version', ResultType: 'entity_object', BypassCache: true,
    }, ctx.User);
    Assert(r.Success && r.Results.length === 2, `reading the fixture versions: ${r.ErrorMessage}`);
    const [v1, v2] = r.Results;
    v1.Status = 'Retired';
    Assert(await v1.Save(), `retiring version 1: ${v1.LatestResult?.CompleteMessage}`);
    v2.Status = 'Active';
    Assert(await v2.Save(), `activating version 2: ${v2.LatestResult?.CompleteMessage}`);
  }

  private static async createUnitPipeline(ctx: IntegrationCheckContext, stamp: string, recordProcessId: string): Promise<MJMLTrainingPipelineEntity> {
    const factory = new MetadataEntityFactory(ctx.Provider);
    const unitRow = await PredictionUnitVersioning.CreatePredictionUnitV1(PsGateC1S33Steps.unitDraft(ctx.Provider, stamp), { kind: 'human', userId: ctx.User.ID }, factory, ctx.User);
    const parsed = PredictionUnit.ParsePredictionUnitRow(unitRow);
    if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
    const pipeline = await factory.getEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', ctx.User);
    pipeline.Name = `${NAME_PREFIX} renewal ${stamp}`;
    pipeline.AlgorithmID = await PsGateC1S33Steps.algorithmId(ctx, 'Logistic Regression');
    const steps: FeatureStepGraph = { Steps: [
      { Id: 'select', Kind: 'select', Columns: ['PeriodIndex'] },
      { Id: 'job-title', Kind: 'llm-derived', FeaturePipelineRef: recordProcessId, Columns: [FEATURE] },
    ] };
    pipeline.FeatureSteps = JSON.stringify(steps);
    pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 });
    RunViewPredictionUnitStore.ApplyUnitToPipeline(pipeline, unitRow.ID, parsed.Value, new ProviderAssemblyMetadata(ctx.Provider));
    pipeline.EvaluationProtocolID = await PsGateC1S33Steps.protocolId(ctx, parsed.Value, `${NAME_PREFIX} protocol ${stamp}`);
    Assert(await pipeline.Save(), `saving the unit pipeline: ${pipeline.LatestResult?.CompleteMessage}`);
    return pipeline;
  }

  /** The reference C1 renewal unit (G7.4's): renewed = the next dues period within 400 days. */
  private static unitDraft(provider: IMetadataProvider, stamp: string): UnitDraft {
    return {
      Name: `${NAME_PREFIX} C1 renewal ${stamp}`, Description: 'G7.6: the C1 renewal unit, with a planted job title at two pipeline versions.',
      UnitRows: {
        kind: 'grain-x-periods', grainEntity: PsGateC1S33Steps.TruthEntity(provider, 'C1Person'), childEntity: PsGateC1S33Steps.TruthEntity(provider, 'C1DuesPeriod'),
        foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [],
      },
      LabelRule: { kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 }, LabelWindowDays: 400, LabelGapDays: 0,
      TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
      Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: PsGateC1S33Steps.TruthEntity(provider, 'C1OrderHeader'), field: 'OrderDate' } },
      ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: 'PersonID', TemporalSpec: null,
      DecisionSpec: { action: 'renewal outreach', actorRole: 'membership team', capacityPerPeriod: null, period: 'month' },
      IncumbentHeuristic: { kind: 'none' },
    };
  }

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

  private static async saveValue(ctx: IntegrationCheckContext, recordProcessId: string, entityId: string, recordId: string, version: number, value: string): Promise<void> {
    const fv = await ctx.Provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', ctx.User);
    fv.NewRecord();
    fv.RecordProcessID = recordProcessId;
    fv.EntityID = entityId;
    fv.RecordID = recordId;
    fv.FeatureName = FEATURE;
    fv.Source = 'Pipeline';
    fv.Role = 'Champion';
    fv.PipelineVersion = version;
    fv.PromptVersionHash = `g7-6-prompt-v${version}`;
    fv.ParametersHash = 'g7-6-parameters';
    fv.ValueText = value;
    fv.EffectiveAsOf = new Date('2015-01-01T00:00:00Z');
    fv.EffectiveTo = null;
    fv.ComputedAt = new Date('2015-01-01T00:00:00Z');
    Assert(await FeatureValueWriteAuthorisations.Save(fv), `saving a planted Feature Value: ${fv.LatestResult?.CompleteMessage}`);
  }

  /** How many `MJ: Feature Values` rows the database holds (the refused run must add none). */
  public static async FeatureValueCount(ctx: IntegrationCheckContext): Promise<number> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJFeatureValueEntity, 'ID'>>({ EntityName: 'MJ: Feature Values', Fields: ['ID'], ResultType: 'count_only', BypassCache: true }, ctx.User);
    Assert(r.Success && typeof r.TotalRowCount === 'number', `counting Feature Values: ${r.ErrorMessage || 'no total row count returned'}`);
    return typeof r.TotalRowCount === 'number' ? r.TotalRowCount : Number.NaN;
  }

  /** The model path's scoring call (Score Record Set without a binding), in this process. */
  public static async Predict(ctx: IntegrationCheckContext, modelId: string, ids: readonly string[], entity: string): ReturnType<ScoringService['Predict']> {
    const sctx: ScoringContext = {
      ContextUser: ctx.User, Provider: ctx.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null, Seams: ScoringSeamDefaults.Resolve(undefined),
    };
    return new ScoringService(sctx).Predict({
      ScoringRunID: '', ModelID: modelId, Scope: { kind: 'record-ids', entity, ids }, EntityMapping: null, AsOfDate: new Date().toISOString(),
      Read: { mode: 'complete' }, DryRun: false, RequestedBy: ScoringRunRecorder.RequestedBy(sctx),
    });
  }

  /** Deletes every fixture row (found by {@link NAME_PREFIX}); never throws. */
  public static async Teardown(ctx: IntegrationCheckContext): Promise<void> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const del = async <T extends MJFeatureValueEntity | MJFeaturePipelineVersionEntity | MJRecordProcessEntity>(entity: string, filter: string): Promise<void> => {
      const r = await rv.RunView<T>({ EntityName: entity, ExtraFilter: filter, ResultType: 'entity_object', IgnoreMaxRows: true, BypassCache: true }, ctx.User);
      if (!r.Success) console.warn(`      ⚠ G7.6 teardown: reading ${entity}: ${r.ErrorMessage}`);
      for (const row of r.Success ? r.Results : []) if (!(await row.Delete())) console.warn(`      ⚠ G7.6 teardown: deleting ${entity} ${row.ID}: ${row.LatestResult?.CompleteMessage}`);
    };
    // N'…': the prefix holds "→", which a non-Unicode literal turns into '?', matching nothing.
    const processes = `RecordProcessID IN (SELECT ID FROM [__mj].[vwRecordProcesses] WHERE Name LIKE N'${EscapeSQLString(NAME_PREFIX)}%')`;
    await del<MJFeatureValueEntity>('MJ: Feature Values', processes);
    await del<MJFeaturePipelineVersionEntity>('MJ: Feature Pipeline Versions', processes);
    await del<MJRecordProcessEntity>('MJ: Record Processes', `Name LIKE N'${EscapeSQLString(NAME_PREFIX)}%'`);
  }
}

/** G7.6: a model trained on version 1, the Active version moved to 2 → scoring refused before any record, 1 of 1. */
async function measureRefusal(ctx: IntegrationCheckContext): Promise<void> {
  HarnessSidecar.DefaultToSuiteSidecar();
  const fx = await PsGateC1S33Steps.Build(ctx);
  const result = await TrainingDelegation.TrainModelViaEngine({ pipelineId: fx.Pipeline.ID }, ctx.Provider, ctx.User);
  Assert(!!result.model, `training produced no model (run ${result.run.ID}, status ${result.run.Status}): ${result.run.ValidationResults}`);
  if (!result.model) return;
  const model: MJMLModelEntity = result.model;
  const pinned = FeaturePinCheck.PinsOf(model.Lineage).find((p) => p.Name === FEATURE);
  Assert(pinned !== undefined && !('mlModelScoringBindingId' in pinned.Pin) && pinned.Pin.pipelineVersion === 1, `the model's lineage pins ${JSON.stringify(pinned)}, expected version 1`);
  AssertEqual(await FeaturePinCheck.ForModel(model, ctx.Provider, ctx.User), null, 'the pin check of a model pinned to the Active version');

  await PsGateC1S33Steps.ActivateVersion2(ctx, fx.RecordProcessID);
  const before = await PsGateC1S33Steps.FeatureValueCount(ctx);
  const entity = PsGateC1S33Steps.TruthEntity(ctx.Provider, 'C1DuesPeriod');
  const scored = await PsGateC1S33Steps.Predict(ctx, model.ID, fx.RowIDs.slice(0, 50), entity);
  const after = await PsGateC1S33Steps.FeatureValueCount(ctx);
  const reason = scored.Result.Status === 'refused' ? scored.Result.Reason : null;
  const runRow = await ctx.Provider.GetEntityObject<MJMLScoringRunEntity>('MJ: ML Scoring Runs', ctx.User);
  Assert(await runRow.Load(scored.Result.ScoringRunID), `the refused run row ${scored.Result.ScoringRunID} could not be loaded`);
  console.log(`      → G7.6: ${JSON.stringify({ status: scored.Result.Status, reason, written: after - before, runStatus: runRow.Status, model: model.ID })}`);
  AssertEqual(scored.Result.Status, 'refused', 'the scoring call of a model pinned to a retired version');
  Assert(reason !== null && reason.kind === 'feature-version-mismatch', `refused ${JSON.stringify(reason)}, expected feature-version-mismatch`);
  if (reason === null || reason.kind !== 'feature-version-mismatch') return;
  AssertEqual(reason.featureName, FEATURE, 'the refused feature');
  const pinnedVersion = 'pipelineVersion' in reason.pinned ? reason.pinned.pipelineVersion : null;
  const activeVersion = 'pipelineVersion' in reason.active ? reason.active.pipelineVersion : null;
  AssertEqual(pinnedVersion, 1, 'the refusal\'s pinned version');
  AssertEqual(activeVersion, 2, 'the refusal\'s active version');
  AssertEqual(runRow.Status, 'refused', 'the scoring run row');
  AssertEqual(after - before, 0, 'Feature Values written by the refused scoring call');
  AssertEqual(scored.Rows.length, 0, 'rows scored');
  const v: FeatureVersionPin | null = 'pipelineVersion' in reason.pinned ? reason.pinned : null;
  Assert(v !== null && v.featurePipelineRecordProcessId.toLowerCase() === fx.RecordProcessID.toLowerCase(), 'the refusal names the fixture pipeline');
}

export const PsGateC1S33Checks: NamedCheck[] = [
  { Id: 'ps-gate-c1-s3-3.G7.6', Name: 'G7.6 C1 → S3.3: scoring a model pinned to job-title version 1 after version 2 is activated is refused (1 of 1), 0 Feature Values written', RequiresMutation: true, Fn: measureRefusal },
];

/** Teardown deletes the planted pipeline, versions and values (the trained model and its runs stay, as G7.4's do). */
export const PsGateC1S33Lifecycle: BundleLifecycle = {
  Setup: async () => undefined,
  Teardown: async (ctx) => {
    try {
      await PsGateC1S33Steps.Teardown(ctx);
    } catch (e) {
      console.warn(`      ⚠ G7.6 teardown: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

for (const c of PsGateC1S33Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s3-3', PsGateC1S33Lifecycle);

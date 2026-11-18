/**
 * predictive-shadow-drift.checks.ts — the 'predictive-shadow-drift' bundle (PSD1–PSD2): deterministic integration
 * checks for Predictive Studio's live challenger and `PredictiveStudioEvaluateDriftAction`.
 *
 * PSD1 (D-069, §5.8.3 step 5): a bound Record Process with a `ChallengerConfiguration` scored through `ScoringService`
 * writes its champion's and its challenger's predictions as `Source = 'Model'` rows, each role under its own
 * `MJ: ML Scoring Runs` row, and no `Source = 'Pipeline'` row. The sidecar and the model runtime are doubles (no model is
 * trained); the challenger is read from the Record Process by the production `ShadowScoringCoordinator`.
 * PSD2: the drift action over `MJ: Feature Values` (M6.8 supersedes it).
 */
import { createHash } from 'node:crypto';
import { DatabaseProviderBase, RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, FilterByUUIDs, IndexByUUID, MJGlobal, UUIDSet, UUIDsEqual, type UUIDMap } from '@memberjunction/global';
import type {
    MJFeatureValueEntity,
    MJFileEntity,
    MJKnowledgeHubSavedSearchEntity,
    MJMLModelEntity,
    MJMLModelScoringBindingEntity,
    MJMLScoringRunEntity,
    MJMLTrainingPipelineEntity,
    MJRecordProcessEntity,
    MJUserNotificationEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer, BaseAction } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    EVALUATE_DRIFT_DRIVER_CLASS,
    EvaluateFeatureAndPredictionDriftAction,
    InMemoryArtifactLoader,
    LoadMLModelInferenceProcessor,
    LoadPredictiveStudioActions,
    ScoringBindings,
    ScoringService,
    type IScoringModelRuntime,
    type IScoringPreparedModel,
    type ISidecarPredictor,
    type LoadedModel,
    type ScoringContext,
} from '@memberjunction/predictive-studio';
import { resolveOutcomeConfig, type FeatureSchemaEntry, type PredictRequest, type PredictResponse } from '@memberjunction/predictive-studio-core';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    SkipCheck,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';

const TAG = '(mj-integration-test — safe to delete)';

LoadMLModelInferenceProcessor();
LoadPredictiveStudioActions();

async function resolveFirstId(
    entityName: string,
    user: UserInfo,
    provider: IMetadataProvider,
): Promise<string | undefined> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<{ ID: string }>(
        { EntityName: entityName, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
        user,
    );
    return res.Results?.[0]?.ID;
}

/** PSD1's target entity: a plain MJ entity with no save hooks. */
const PSD1_TARGET = 'MJ: Knowledge Hub Saved Searches';
const PSD1_FEATURES: readonly FeatureSchemaEntry[] = [{ Name: 'Tenure', Kind: 'numeric' }];
/** The adverse-class probability the champion's and the challenger's double return for every record. */
const PSD1_SCORES = { Champion: 0.3, Challenger: 0.8 } as const;
const PSD1_RECORDS = 3;

/** The rows PSD1 creates, so its teardown finds them. */
interface Psd1Fixtures {
    readonly Tag: string;
    readonly Pipeline: MJMLTrainingPipelineEntity;
    readonly Champion: MJMLModelEntity;
    readonly Challenger: MJMLModelEntity;
    readonly RecordProcess: MJRecordProcessEntity;
    readonly Binding: MJMLModelScoringBindingEntity;
    readonly RecordIDs: readonly string[];
    readonly Artifacts: InMemoryArtifactLoader;
}

/** `[schema].[table]` of an entity, read from metadata. */
function tableOf(provider: IMetadataProvider, entityName: string): string {
    const entity = provider.EntityByName(entityName);
    if (!entity) throw new Error(`entity ${entityName} is not in metadata`);
    return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** Saves a new row of `entityName` with `fill` applied; fails the check with the provider's message when it does not save. */
async function createRow<T extends BaseEntity>(ctx: IntegrationCheckContext, entityName: string, fill: (row: T) => void): Promise<T> {
    const row = await ctx.Provider.GetEntityObject<T>(entityName, ctx.User);
    row.NewRecord();
    fill(row);
    Assert(await row.Save(), `PSD1 fixture ${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
    return row;
}

/** The sidecar double: the champion's artifact scores every row `PSD1_SCORES.Champion`, the challenger's `.Challenger`. */
class Psd1Sidecar implements ISidecarPredictor {
    public async predict(req: PredictRequest): Promise<PredictResponse> {
        const p = Buffer.from(req.artifact_b64 || '', 'base64').toString('utf8').includes('challenger') ? PSD1_SCORES.Challenger : PSD1_SCORES.Champion;
        return { classOrder: ['renewed', 'lapsed'], predictions: req.rows.map(() => ({ score: p, class: p >= 0.5 ? 'lapsed' : 'renewed', probabilities: [1 - p, p] })) };
    }
}

/** The model runtime double: a model trained without a unit on the target entity, its artifact the stored bytes. */
class Psd1Runtime implements IScoringModelRuntime {
    public async Prepare(model: MJMLModelEntity, bytes: Uint8Array): Promise<IScoringPreparedModel> {
        const loaded: LoadedModel = {
            modelId: model.ID, targetEntityName: PSD1_TARGET, artifactB64: Buffer.from(bytes).toString('base64'), fittedPreprocessing: {}, featureSchema: [...PSD1_FEATURES],
            problemType: 'classification', targetVariable: 'Lapsed', sourceBindings: [], featureSteps: { Steps: [] }, asOf: { Mode: 'none' },
            leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 }, outcomeConfig: resolveOutcomeConfig(), unit: null, trainingRowIds: new UUIDSet(),
        };
        return {
            Loaded: loaded,
            Assemble: async (ids) => ({ Status: 'assembled', Matrix: { columns: ['Tenure'], rows: ids.map(() => [1]) }, Columns: [...PSD1_FEATURES], HashColumns: null, RowIDs: [...ids] }),
        };
    }
}

/** Sets a fixture model's status, artifact and output semantics by SQL: Status is the lifecycle gate's to write. */
async function placeModel(provider: DatabaseProviderBase, model: MJMLModelEntity, status: MJMLModelEntity['Status'], file: MJFileEntity, bytes: Uint8Array): Promise<void> {
    const semantics = JSON.stringify({ task: { kind: 'binary', classOrder: ['renewed', 'lapsed'], adverseIndex: 1 } });
    await provider.ExecuteSQL(
        `UPDATE ${tableOf(provider, 'MJ: ML Models')} SET Status = '${EscapeSQLString(status)}', ArtifactFileID = '${EscapeSQLString(file.ID)}', ` +
            `ArtifactSha256 = '${createHash('sha256').update(bytes).digest('hex')}', OutputSemantics = '${EscapeSQLString(semantics)}' WHERE ID = '${EscapeSQLString(model.ID)}'`,
        undefined, { isMutation: true, description: 'PSD1: place a fixture model outside the lifecycle gate' }, undefined,
    );
}

/** A fixture model of the pipeline with its artifact file; `status` is set by SQL. */
async function createModel(ctx: IntegrationCheckContext, provider: DatabaseProviderBase, pipeline: MJMLTrainingPipelineEntity, version: number, status: MJMLModelEntity['Status'], artifacts: InMemoryArtifactLoader, tag: string): Promise<MJMLModelEntity> {
    const providerId = await resolveFirstId('MJ: File Storage Providers', ctx.User, ctx.Provider);
    Assert(!!providerId, 'Could not resolve a MJ: File Storage Providers row');
    const role = version === 1 ? 'champion' : 'challenger';
    const file = await createRow<MJFileEntity>(ctx, 'MJ: Files', (f) => { f.Name = `${tag} ${role}.bin`; f.ProviderID = providerId!; });
    const bytes = new TextEncoder().encode(`${role} artifact of ${tag}`);
    artifacts.Set(file.ID, bytes);
    const model = await createRow<MJMLModelEntity>(ctx, 'MJ: ML Models', (m) => {
        m.PipelineID = pipeline.ID; m.AlgorithmID = pipeline.AlgorithmID; m.Version = version; m.FeatureSchema = JSON.stringify(PSD1_FEATURES);
        m.TargetVariable = 'Lapsed'; m.ProblemType = 'classification';
    });
    await placeModel(provider, model, status, file, bytes);
    return model;
}

/** The pipeline, champion (Published), challenger (Validated), a Record Process naming the challenger, its binding and three target records. */
async function createPsd1Fixtures(ctx: IntegrationCheckContext, provider: DatabaseProviderBase): Promise<Psd1Fixtures> {
    const tag = `PSD1 ${Date.now()} ${TAG}`;
    const targetEntityId = ctx.Provider.EntityByName(PSD1_TARGET)?.ID;
    const algorithmId = await resolveFirstId('MJ: ML Algorithms', ctx.User, ctx.Provider);
    Assert(!!targetEntityId && !!algorithmId, `Could not resolve ${PSD1_TARGET} or a MJ: ML Algorithms row`);
    const artifacts = new InMemoryArtifactLoader();
    const pipeline = await createRow<MJMLTrainingPipelineEntity>(ctx, 'MJ: ML Training Pipelines', (p) => {
        p.Name = tag; p.Status = 'Draft'; p.TargetEntityID = targetEntityId!; p.TargetVariable = 'Lapsed'; p.ProblemType = 'classification'; p.AlgorithmID = algorithmId!;
    });
    const champion = await createModel(ctx, provider, pipeline, 1, 'Published', artifacts, tag);
    const challenger = await createModel(ctx, provider, pipeline, 2, 'Validated', artifacts, tag);
    const recordProcess = await createRow<MJRecordProcessEntity>(ctx, 'MJ: Record Processes', (rp) => {
        rp.Name = tag; rp.EntityID = targetEntityId!; rp.WorkType = 'ML Model'; rp.ScopeType = 'Filter'; rp.ScopeFilter = '1=0'; rp.Status = 'Active';
        rp.ScheduleEnabled = false; rp.OnDemandEnabled = true; rp.Configuration = JSON.stringify({ modelId: champion.ID });
        rp.ChallengerConfigurationObject = { Enabled: true, SampleRate: 1, WorkType: 'ML Model', ChallengerModelID: challenger.ID };
    });
    const binding = await createRow<MJMLModelScoringBindingEntity>(ctx, 'MJ: ML Model Scoring Bindings', (b) => {
        b.MLTrainingPipelineID = pipeline.ID; b.FeatureName = tag; b.TargetEntityID = targetEntityId!; b.RecordProcessID = recordProcess.ID; b.Mode = 'OnDemand'; b.Status = 'Active';
        b.ViewAuthorizationID = ScoringBindings.ResolveViewAuthorizationID(null, ctx.Provider);
    });
    const recordIds: string[] = [];
    for (let i = 0; i < PSD1_RECORDS; i++) {
        recordIds.push((await createRow<MJKnowledgeHubSavedSearchEntity>(ctx, PSD1_TARGET, (t) => { t.Name = `${tag} r${i}`; t.UserID = ctx.User.ID; t.Query = tag; })).ID);
    }
    return { Tag: tag, Pipeline: pipeline, Champion: champion, Challenger: challenger, RecordProcess: recordProcess, Binding: binding, RecordIDs: recordIds, Artifacts: artifacts };
}

/** Deletes every row PSD1 created, children first, by SQL (the binding refuses an entity delete before withdrawal). */
async function deletePsd1Fixtures(provider: DatabaseProviderBase, tag: string): Promise<void> {
    const t = (entityName: string): string => tableOf(provider, entityName);
    const name = `'${EscapeSQLString(tag)}'`;
    const like = `'${EscapeSQLString(tag)}%'`;
    const bindings = `SELECT ID FROM ${t('MJ: ML Model Scoring Bindings')} WHERE FeatureName = ${name}`;
    const pipelines = `SELECT ID FROM ${t('MJ: ML Training Pipelines')} WHERE Name = ${name}`;
    await provider.ExecuteSQL(`
        DELETE FROM ${t('MJ: Feature Values')} WHERE MLModelScoringBindingID IN (${bindings});
        DELETE FROM ${t('MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID IN (${bindings});
        DELETE FROM ${t('MJ: ML Model Scoring Bindings')} WHERE FeatureName = ${name};
        DELETE FROM ${t('MJ: Record Processes')} WHERE Name = ${name};
        DELETE FROM ${t('MJ: ML Models')} WHERE PipelineID IN (${pipelines});
        DELETE FROM ${t('MJ: ML Training Pipelines')} WHERE Name = ${name};
        DELETE FROM ${t('MJ: Files')} WHERE Name LIKE ${like};
        DELETE FROM ${t(PSD1_TARGET)} WHERE Name LIKE ${like};`, undefined, { isMutation: true, description: 'PSD1: delete its fixtures' }, undefined);
}

/** The scoring context of the check's user: the sidecar, model runtime and artifact loader are doubles; the challenger source is production's. */
function psd1Context(ctx: IntegrationCheckContext, artifacts: InMemoryArtifactLoader): ScoringContext {
    return {
        ContextUser: ctx.User, Provider: ctx.Provider, Path: 'record-process', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null,
        Seams: { Sidecar: new Psd1Sidecar(), Runtime: new Psd1Runtime(), ArtifactLoader: artifacts },
    };
}

/** The binding's rows of one role and the scoring runs of the binding. */
type Psd1Row = Pick<MJFeatureValueEntity, 'ID' | 'Source' | 'Role' | 'RecordID' | 'MLModelID' | 'MLScoringRunID' | 'ValueNumeric'>;
type Psd1Run = Pick<MJMLScoringRunEntity, 'ID' | 'ModelID' | 'Status' | 'Written'>;

/** Asserts one role: its model's run completed with a row per record, and each row is a Model row of that model and run holding its score. */
function assertPsd1Role(role: 'Champion' | 'Challenger', model: MJMLModelEntity, score: number, rows: readonly Psd1Row[], runsByModel: UUIDMap<Psd1Run>): void {
    const ofRole = rows.filter((r) => r.Role === role);
    const run = runsByModel.Get(model.ID);
    Assert(!!run && run.Status === 'completed' && run.Written === PSD1_RECORDS, `the ${role} run completed with ${PSD1_RECORDS} rows (got ${JSON.stringify(run)})`);
    AssertEqual(ofRole.length, PSD1_RECORDS, `one ${role} row per record`);
    const ofModel = FilterByUUIDs(ofRole, [model.ID], (r) => r.MLModelID || '');
    const ofRun = FilterByUUIDs(ofRole, [run!.ID], (r) => r.MLScoringRunID || '');
    Assert(ofRole.every((r) => r.Source === 'Model') && ofModel.length === ofRole.length && ofRun.length === ofRole.length, `every ${role} row is a Model row of the ${role} model and its run`);
    Assert(ofRole.every((r) => Math.abs(Number(r.ValueNumeric) - score) < 1e-9), `every ${role} row holds the ${role} score ${score}`);
}

/** Asserts the binding's rows: a Model row of each role per record, each role under its own run of its own model, no Pipeline row. */
async function assertPsd1Rows(ctx: IntegrationCheckContext, f: Psd1Fixtures): Promise<void> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const [values, pipelineRows] = await rv.RunViews<Psd1Row>([
        { EntityName: 'MJ: Feature Values', ExtraFilter: `MLModelScoringBindingID = '${EscapeSQLString(f.Binding.ID)}'`, ResultType: 'simple', BypassCache: true,
          Fields: ['ID', 'Source', 'Role', 'RecordID', 'MLModelID', 'MLScoringRunID', 'ValueNumeric'] },
        { EntityName: 'MJ: Feature Values', ExtraFilter: `RecordProcessID = '${EscapeSQLString(f.RecordProcess.ID)}' AND Source = 'Pipeline'`, ResultType: 'simple', BypassCache: true,
          Fields: ['ID', 'Source', 'Role', 'RecordID', 'MLModelID', 'MLScoringRunID', 'ValueNumeric'] },
    ], ctx.User);
    const runs = await rv.RunView<Psd1Run>({
        EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `MLModelScoringBindingID = '${EscapeSQLString(f.Binding.ID)}'`, ResultType: 'simple', BypassCache: true, Fields: ['ID', 'ModelID', 'Status', 'Written'],
    }, ctx.User);
    Assert(values.Success && runs.Success && pipelineRows.Success, `PSD1 reads failed: ${values.ErrorMessage || runs.ErrorMessage || pipelineRows.ErrorMessage}`);
    const rows = values.Results;
    const runRows = runs.Results;
    AssertEqual(runRows.length, 2, 'one MJ: ML Scoring Runs row per role');
    AssertEqual(pipelineRows.Results.length, 0, "the Record Process has no Source = 'Pipeline' row");
    const runsByModel = IndexByUUID(runRows, (r) => r.ModelID || '');
    assertPsd1Role('Champion', f.Champion, PSD1_SCORES.Champion, rows, runsByModel);
    assertPsd1Role('Challenger', f.Challenger, PSD1_SCORES.Challenger, rows, runsByModel);
}

export const PredictiveShadowDriftChecks: NamedCheck[] = [
    {
        Id: 'predictive-shadow-drift.PSD1',
        Name: "PSD1: a bound Record Process's ChallengerConfiguration mirrors the champion to the challenger: both roles are Source = 'Model' rows, each under its own MJ: ML Scoring Runs row, and no Pipeline row is written",
        Fn: async (ctx: IntegrationCheckContext) => {
            if (!(ctx.Provider instanceof DatabaseProviderBase)) SkipCheck('PSD1 needs a database provider: its fixtures place model status by SQL');
            const provider = ctx.Provider;
            let fixtures: Psd1Fixtures | null = null;
            const tagOf = (): string => fixtures?.Tag || '';
            try {
                fixtures = await createPsd1Fixtures(ctx, provider);
                const asOf = new Date();
                const result = await new ScoringService(psd1Context(ctx, fixtures.Artifacts)).Score(
                    fixtures.Binding, { kind: 'record-ids', entity: PSD1_TARGET, ids: [...fixtures.RecordIDs] }, asOf, false,
                );
                AssertEqual(result.Status, 'completed', `the binding run completed (${JSON.stringify(result)})`);
                await assertPsd1Rows(ctx, fixtures);
            } finally {
                if (tagOf() !== '') await deletePsd1Fixtures(provider, tagOf());
            }
        },
    },
    {
        Id: 'predictive-shadow-drift.PSD2',
        Name: 'PSD2: PredictiveStudioEvaluateDriftAction loads baseline and evaluation windows from MJ: Feature Values, enforces MinSampleSize=100 InsufficientData gating, detects Critical PSI drift, and emits an alert record',
        Fn: async (ctx: IntegrationCheckContext) => {
            const md = ctx.Provider;
            const user = ctx.User;
            const createdFeatureValues: MJFeatureValueEntity[] = [];
            let recordProcess: MJRecordProcessEntity | null = null;
            const createdAlertIds: string[] = [];

            try {
                const targetEntityId = await resolveFirstId('MJ: Entities', user, md);
                Assert(!!targetEntityId, 'Could not resolve a seed MJ: Entities row');

                recordProcess = await md.GetEntityObject<MJRecordProcessEntity>(
                    'MJ: Record Processes',
                    user,
                );
                recordProcess.NewRecord();
                recordProcess.Name = `PSD2 Drift Record Process ${TAG}`;
                recordProcess.EntityID = targetEntityId!;
                recordProcess.WorkType = 'ML Model';
                recordProcess.ScopeType = 'Filter';
                recordProcess.ScopeFilter = '1=0';
                recordProcess.Status = 'Active';
                recordProcess.ScheduleEnabled = false;
                recordProcess.OnDemandEnabled = true;
                Assert(
                    await recordProcess.Save(),
                    `Failed to save PSD2 RecordProcess: ${recordProcess.LatestResult?.CompleteMessage}`,
                );

                // Seed 12 baseline Champion rows inside the 28-day baseline window (14 days ago)
                // and 12 evaluation Champion rows inside the 7-day evaluation window (1 day ago).
                const DAY_MS = 86_400_000;
                const nowMs = Date.now();
                for (let i = 0; i < 12; i++) {
                    const baseRow = await md.GetEntityObject<MJFeatureValueEntity>(
                        'MJ: Feature Values',
                        user,
                    );
                    baseRow.NewRecord();
                    baseRow.RecordProcessID = recordProcess.ID;
                    baseRow.EntityID = targetEntityId!;
                    baseRow.RecordID = `psd2-base-${i}`;
                    baseRow.FeatureName = 'ChurnRisk';
                    baseRow.Role = 'Champion';
                    baseRow.Source = 'Pipeline';
                    baseRow.ValueNumeric = (i + 1) / 15;
                    baseRow.Confidence = 0.9;
                    baseRow.ComputedAt = new Date(nowMs - 14 * DAY_MS + i * 60_000);
                    Assert(
                        await baseRow.Save(),
                        `Failed to save baseline Feature Value: ${baseRow.LatestResult?.CompleteMessage}`,
                    );
                    createdFeatureValues.push(baseRow);
                }

                for (let i = 0; i < 12; i++) {
                    const evalRow = await md.GetEntityObject<MJFeatureValueEntity>(
                        'MJ: Feature Values',
                        user,
                    );
                    evalRow.NewRecord();
                    evalRow.RecordProcessID = recordProcess.ID;
                    evalRow.EntityID = targetEntityId!;
                    evalRow.RecordID = `psd2-eval-${i}`;
                    evalRow.FeatureName = 'ChurnRisk';
                    evalRow.Role = 'Champion';
                    evalRow.Source = 'Pipeline';
                    evalRow.ValueNumeric = 0.99;
                    evalRow.Confidence = 0.45;
                    evalRow.ComputedAt = new Date(nowMs - 1 * DAY_MS + i * 60_000);
                    Assert(
                        await evalRow.Save(),
                        `Failed to save evaluation Feature Value: ${evalRow.LatestResult?.CompleteMessage}`,
                    );
                    createdFeatureValues.push(evalRow);
                }

                await ActionEngineServer.Instance.Config(false, user);
                const driftAction = ActionEngineServer.Instance.Actions.find(
                    (a) => a.DriverClass === EVALUATE_DRIFT_DRIVER_CLASS,
                );
                Assert(
                    !!driftAction,
                    `Expected MJ: Actions row with DriverClass='${EVALUATE_DRIFT_DRIVER_CLASS}' in ActionEngineServer.Instance.Actions`,
                );
                const resolvedInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(
                    BaseAction,
                    driftAction!.DriverClass,
                );
                Assert(
                    resolvedInstance instanceof EvaluateFeatureAndPredictionDriftAction,
                    `Expected ClassFactory to resolve EvaluateFeatureAndPredictionDriftAction for '${driftAction!.DriverClass}'`,
                );

                // 1. Default MinSampleSize=100 guard: 12 samples per window < 100 -> InsufficientData=true, OverallSeverity='None'
                const insufficientParams = new RunActionParams();
                insufficientParams.Action = driftAction!;
                insufficientParams.ContextUser = user;
                insufficientParams.Provider = md;
                insufficientParams.SkipActionLog = true;
                insufficientParams.Params = [
                    { Name: 'RecordProcessID', Type: 'Input', Value: recordProcess.ID },
                    { Name: 'MinSampleSize', Type: 'Input', Value: 100 },
                    { Name: 'EmitAlertOnDrift', Type: 'Input', Value: true },
                ];

                const insufficientResult = await ActionEngineServer.Instance.RunAction(insufficientParams);
                Assert(
                    insufficientResult.Success,
                    `Evaluate Feature and Prediction Drift (MinSampleSize=100) failed: ${insufficientResult.Message}`,
                );
                const insufficientFlag = insufficientParams.Params.find(
                    (p) => p.Name === 'InsufficientData' && p.Type === 'Output',
                )?.Value;
                const insufficientSeverity = insufficientParams.Params.find(
                    (p) => p.Name === 'OverallSeverity' && p.Type === 'Output',
                )?.Value;
                const insufficientAlert = insufficientParams.Params.find(
                    (p) => p.Name === 'AlertEmitted' && p.Type === 'Output',
                )?.Value;
                AssertEqual(insufficientFlag, true, 'Expected InsufficientData=true at MinSampleSize=100');
                AssertEqual(insufficientSeverity, 'None', 'Expected OverallSeverity=None at MinSampleSize=100');
                AssertEqual(insufficientAlert, false, 'Expected AlertEmitted=false at MinSampleSize=100');

                // 2. MinSampleSize=10 without NotifyUserID: drift detected (Critical). The caller is notified,
                //    except the system user, who notifies no one without a NotifyUserID.
                const callerIsSystem = UUIDsEqual(user.ID, UserCache.Instance.GetSystemUser()?.ID);
                const callerParams = new RunActionParams();
                callerParams.Action = driftAction!;
                callerParams.ContextUser = user;
                callerParams.Provider = md;
                callerParams.SkipActionLog = true;
                callerParams.Params = [
                    { Name: 'RecordProcessID', Type: 'Input', Value: recordProcess.ID },
                    { Name: 'MinSampleSize', Type: 'Input', Value: 10 },
                    { Name: 'EmitAlertOnDrift', Type: 'Input', Value: true },
                ];

                const callerResult = await ActionEngineServer.Instance.RunAction(callerParams);
                Assert(
                    callerResult.Success,
                    `Evaluate Feature and Prediction Drift (no NotifyUserID) failed: ${callerResult.Message}`,
                );
                AssertEqual(
                    callerParams.Params.find((p) => p.Name === 'OverallSeverity' && p.Type === 'Output')?.Value,
                    'Critical',
                    'Expected OverallSeverity=Critical without NotifyUserID',
                );
                AssertEqual(
                    callerParams.Params.find((p) => p.Name === 'ShouldAlert' && p.Type === 'Output')?.Value,
                    true,
                    'Expected ShouldAlert=true without NotifyUserID',
                );
                AssertEqual(
                    callerParams.Params.find((p) => p.Name === 'AlertEmitted' && p.Type === 'Output')?.Value,
                    !callerIsSystem,
                    callerIsSystem
                        ? 'Expected AlertEmitted=false for the system user without NotifyUserID'
                        : 'Expected AlertEmitted=true: a caller without NotifyUserID is notified themselves',
                );
                const callerAlertId = callerParams.Params.find((p) => p.Name === 'AlertID' && p.Type === 'Output')?.Value;
                if (typeof callerAlertId === 'string') {
                    createdAlertIds.push(callerAlertId);
                }

                // 3. MinSampleSize=10 with NotifyUserID = the caller: honoured for the system user or an Owner,
                //    and the caller is the fallback for anyone else, so the alert reaches this user either way.
                const runParams = new RunActionParams();
                runParams.Action = driftAction!;
                runParams.ContextUser = user;
                runParams.Provider = md;
                runParams.SkipActionLog = true;
                runParams.Params = [
                    { Name: 'RecordProcessID', Type: 'Input', Value: recordProcess.ID },
                    { Name: 'MinSampleSize', Type: 'Input', Value: 10 },
                    { Name: 'EmitAlertOnDrift', Type: 'Input', Value: true },
                    { Name: 'NotifyUserID', Type: 'Input', Value: user.ID },
                ];

                const result = await ActionEngineServer.Instance.RunAction(runParams);
                Assert(result.Success, `Evaluate Feature and Prediction Drift failed: ${result.Message}`);

                const overallSeverity = runParams.Params.find(
                    (p) => p.Name === 'OverallSeverity' && p.Type === 'Output',
                )?.Value;
                const shouldAlert = runParams.Params.find(
                    (p) => p.Name === 'ShouldAlert' && p.Type === 'Output',
                )?.Value;
                const alertEmitted = runParams.Params.find(
                    (p) => p.Name === 'AlertEmitted' && p.Type === 'Output',
                )?.Value;
                const alertId = runParams.Params.find(
                    (p) => p.Name === 'AlertID' && p.Type === 'Output',
                )?.Value;

                AssertEqual(overallSeverity, 'Critical', 'Expected OverallSeverity=Critical');
                AssertEqual(shouldAlert, true, 'Expected ShouldAlert=true');
                AssertEqual(alertEmitted, true, 'Expected AlertEmitted=true');
                Assert(typeof alertId === 'string' && alertId.length > 0, 'Expected AlertID output parameter');
                createdAlertIds.push(alertId as string);

                // The saved alert is addressed to the caller and titled from the stored Record Process name.
                const alertRes = await RunView.FromMetadataProvider(md).RunView<MJUserNotificationEntity>(
                    {
                        EntityName: 'MJ: User Notifications',
                        ExtraFilter: `ID = '${alertId as string}'`,
                        ResultType: 'entity_object',
                        BypassCache: true,
                    },
                    user,
                );
                const alert = alertRes.Results?.[0];
                Assert(!!alert, 'Expected the drift alert to be readable as its recipient');
                Assert(UUIDsEqual(alert!.UserID, user.ID), 'Expected the drift alert to be addressed to the caller');
                Assert(
                    (alert!.Title ?? '').includes(recordProcess!.Name),
                    `Expected the alert title to name the stored Record Process, got '${alert!.Title}'`,
                );
            } finally {
                if (createdAlertIds.length > 0) {
                    const rv = RunView.FromMetadataProvider(md);
                    const notifRes = await rv.RunView<MJUserNotificationEntity>(
                        {
                            EntityName: 'MJ: User Notifications',
                            ExtraFilter: `ID IN (${createdAlertIds.map((id) => `'${id}'`).join(', ')})`,
                            ResultType: 'entity_object',
                            BypassCache: true,
                        },
                        user,
                    );
                    for (const n of notifRes.Results ?? []) {
                        await n.Delete().catch(() => undefined);
                    }
                }
                for (const fv of createdFeatureValues) {
                    await fv.Delete().catch(() => undefined);
                }
                if (recordProcess?.IsSaved) {
                    await recordProcess.Delete().catch(() => undefined);
                }
            }
        },
    },
];

for (const check of PredictiveShadowDriftChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

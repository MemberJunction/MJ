/**
 * predictive-shadow-drift.checks.ts — the 'predictive-shadow-drift' bundle (PSD1–PSD2):
 * deterministic integration checks for Predictive Studio shadow scoring (`Role = 'Challenger'`
 * vs `Role = 'Champion'` isolation in `MJ: Feature Values` and `FeatureValueCacheService`)
 * and `PredictiveStudioEvaluateDriftAction` end-to-end execution over `MJ: Feature Values`.
 */
import { createHash } from 'node:crypto';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    MJFeatureValueEntity,
    MJMLModelEntity,
    MJMLTrainingPipelineEntity,
    MJRecordProcessEntity,
    MJUserNotificationEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer, BaseAction } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import { FeatureValueCacheService } from '@memberjunction/feature-pipelines';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RecordProcessorRegistry } from '@memberjunction/record-set-processor-base';
import {
    EVALUATE_DRIFT_DRIVER_CLASS,
    EvaluateFeatureAndPredictionDriftAction,
    FeatureAssemblyExecutor,
    FeatureValueShadowAuditSink,
    InMemoryArtifactLoader,
    LoadMLModelInferenceProcessor,
    LoadPredictiveStudioActions,
    MLModelChallengerScoreRunner,
    MLModelInferenceProcessor,
    ML_INFERENCE_WORK_TYPE,
    RegisterMLScoringProcessor,
    ShadowScoringCoordinator,
    type FetchRowsParams,
    type FetchRowsResult,
    type IFeatureDataAccess,
    type MLInferenceDeps,
} from '@memberjunction/predictive-studio';
import type {
    AsOfStrategy,
    FeatureSchemaEntry,
    FeatureStepGraph,
    PredictRequest,
    PredictResponse,
    SourceBinding,
} from '@memberjunction/predictive-studio-core';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    SkipCheck,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';

const TAG = '(mj-integration-test — safe to delete)';

/**
 * PSD1 skips, visibly, until M6.8 rewrites it: its fixture creates its champion as `Published`, which the lifecycle
 * gate's status guard refuses (`create-not-draft`). M6.8 deletes this with the rewrite (PR 4 D4-94).
 */
const PSD1_SKIP_REASON: string | null = 'awaits M6.8: its fixture publishes a model outside the lifecycle gate (PR 4 D4-94)';

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

class InMemoryDataAccess implements IFeatureDataAccess {
    public async fetchRows(_params: FetchRowsParams): Promise<FetchRowsResult> {
        return { Success: true, Rows: [], TotalRowCount: 0 };
    }
    public async fetchEmbedding(): Promise<number[] | null> {
        return null;
    }
}

class TestAssembler extends FeatureAssemblyExecutor {
    constructor(private readonly dataAccess: IFeatureDataAccess) {
        super();
    }
    public override assemble(params: Parameters<FeatureAssemblyExecutor['assemble']>[0]) {
        return super.assemble({ ...params, dataAccess: this.dataAccess });
    }
}

export const PredictiveShadowDriftChecks: NamedCheck[] = [
    {
        Id: 'predictive-shadow-drift.PSD1',
        Name: 'PSD1: RecordProcess ChallengerConfigurationObject writes Role=Challenger (ValueKeyHash=null) alongside Role=Champion and FeatureValueCacheService isolates Champion reads',
        Fn: async (ctx: IntegrationCheckContext) => {
            if (PSD1_SKIP_REASON !== null) SkipCheck(PSD1_SKIP_REASON);
            const md = ctx.Provider;
            const user = ctx.User;
            const createdFeatureValues: MJFeatureValueEntity[] = [];
            let recordProcess: MJRecordProcessEntity | null = null;
            let challengerModel: MJMLModelEntity | null = null;
            let championModel: MJMLModelEntity | null = null;
            let pipeline: MJMLTrainingPipelineEntity | null = null;

            try {
                const targetEntityId = await resolveFirstId('MJ: Entities', user, md);
                Assert(!!targetEntityId, 'Could not resolve a seed MJ: Entities row');
                const algorithmId = await resolveFirstId('MJ: ML Algorithms', user, md);
                Assert(!!algorithmId, 'Could not resolve a seed MJ: ML Algorithms row');

                pipeline = await md.GetEntityObject<MJMLTrainingPipelineEntity>(
                    'MJ: ML Training Pipelines',
                    user,
                );
                pipeline.NewRecord();
                pipeline.Name = `PSD1 Shadow Pipeline ${TAG}`;
                pipeline.Status = 'Draft';
                pipeline.TargetEntityID = targetEntityId!;
                pipeline.TargetVariable = 'RenewalScore';
                pipeline.ProblemType = 'classification';
                pipeline.AlgorithmID = algorithmId!;
                Assert(
                    await pipeline.Save(),
                    `Failed to save test pipeline: ${pipeline.LatestResult?.CompleteMessage}`,
                );

                const schema: FeatureSchemaEntry[] = [{ Name: 'tenure', Kind: 'numeric' }];
                const lineage = JSON.stringify({
                    targetEntityName: 'Members',
                    sourceBindings: [{ Kind: 'Entity', Ref: 'Members' }] satisfies SourceBinding[],
                    featureSteps: {
                        Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure'] }],
                    } satisfies FeatureStepGraph,
                    asOfStrategy: { Mode: 'none' } satisfies AsOfStrategy,
                });

                championModel = await md.GetEntityObject<MJMLModelEntity>('MJ: ML Models', user);
                championModel.NewRecord();
                championModel.PipelineID = pipeline.ID;
                championModel.Version = 1;
                championModel.AlgorithmID = algorithmId!;
                championModel.FeatureSchema = JSON.stringify(schema);
                championModel.FittedPreprocessing = JSON.stringify({});
                championModel.Lineage = lineage;
                championModel.TargetVariable = 'RenewalScore';
                championModel.ProblemType = 'classification';
                championModel.Status = 'Published';
                Assert(
                    await championModel.Save(),
                    `Failed to save champion model: ${championModel.LatestResult?.CompleteMessage}`,
                );

                challengerModel = await md.GetEntityObject<MJMLModelEntity>('MJ: ML Models', user);
                challengerModel.NewRecord();
                challengerModel.PipelineID = pipeline.ID;
                challengerModel.Version = 2;
                challengerModel.AlgorithmID = algorithmId!;
                challengerModel.FeatureSchema = JSON.stringify(schema);
                challengerModel.FittedPreprocessing = JSON.stringify({});
                challengerModel.Lineage = lineage;
                challengerModel.TargetVariable = 'RenewalScore';
                challengerModel.ProblemType = 'classification';
                challengerModel.Status = 'Validated';
                Assert(
                    await challengerModel.Save(),
                    `Failed to save challenger model: ${challengerModel.LatestResult?.CompleteMessage}`,
                );

                recordProcess = await md.GetEntityObject<MJRecordProcessEntity>(
                    'MJ: Record Processes',
                    user,
                );
                recordProcess.NewRecord();
                recordProcess.Name = `PSD1 Shadow Record Process ${TAG}`;
                recordProcess.EntityID = targetEntityId!;
                recordProcess.WorkType = 'ML Model';
                recordProcess.ScopeType = 'Filter';
                recordProcess.ScopeFilter = '1=0';
                recordProcess.Status = 'Active';
                recordProcess.ScheduleEnabled = false;
                recordProcess.OnDemandEnabled = true;
                recordProcess.Configuration = JSON.stringify({ modelId: championModel.ID });
                recordProcess.ChallengerConfigurationObject = {
                    Enabled: true,
                    SampleRate: 1.0,
                    WorkType: 'ML Model',
                    ChallengerModelID: challengerModel.ID,
                    MaxLatencyMs: 2000,
                };
                Assert(
                    await recordProcess.Save(),
                    `Failed to save RecordProcess with ChallengerConfigurationObject: ${recordProcess.LatestResult?.CompleteMessage}`,
                );

                const artifacts = new InMemoryArtifactLoader();
                const championBytes = new Uint8Array(Buffer.from('champion-bytes'));
                const challengerBytes = new Uint8Array(Buffer.from('challenger-bytes'));
                artifacts.Set('artifact-champion', championBytes);
                artifacts.Set('artifact-challenger', challengerBytes);
                championModel.ArtifactFileID = 'artifact-champion';
                challengerModel.ArtifactFileID = 'artifact-challenger';
                // Scoring serves only a verified artifact: register the hash of the bytes each in-memory file holds.
                championModel.ArtifactSha256 = createHash('sha256').update(championBytes).digest('hex');
                challengerModel.ArtifactSha256 = createHash('sha256').update(challengerBytes).digest('hex');

                const champRef = championModel;
                const challRef = challengerModel;
                const deps: MLInferenceDeps = {
                    modelLoader: {
                        loadModel: async (id) => {
                            if (UUIDsEqual(id, champRef.ID)) return champRef;
                            if (UUIDsEqual(id, challRef.ID)) return challRef;
                            return null;
                        },
                    },
                    artifactLoader: artifacts,
                    sidecar: {
                        predict: async (req: PredictRequest): Promise<PredictResponse> => {
                            const isChallenger = Buffer.from(req.artifact_b64 ?? '', 'base64')
                                .toString('utf8')
                                .includes('challenger');
                            return {
                                predictions: [
                                    isChallenger
                                        ? { score: 0.91, class: 'challenger-band', probabilities: null }
                                        : { score: 0.35, class: 'champion-band', probabilities: null },
                                ],
                                classOrder: null,
                            };
                        },
                    },
                };

                const coordinator = new ShadowScoringCoordinator({
                    ChallengerRunner: new MLModelChallengerScoreRunner(deps),
                    AuditSink: new FeatureValueShadowAuditSink(),
                });
                RegisterMLScoringProcessor(deps, undefined, coordinator);

                const resolved = RecordProcessorRegistry.Instance.Resolve({
                    WorkType: ML_INFERENCE_WORK_TYPE,
                    RecordProcessID: recordProcess.ID,
                    EntityID: targetEntityId!,
                    Configuration: recordProcess.Configuration,
                    RecordProcess: {
                        ID: recordProcess.ID,
                        ChallengerConfigurationObject: recordProcess.ChallengerConfigurationObject,
                    },
                });
                Assert(
                    resolved instanceof MLModelInferenceProcessor,
                    'Expected RecordProcessorRegistry to resolve MLModelInferenceProcessor',
                );

                const processor = new MLModelInferenceProcessor(
                    {
                        modelId: championModel.ID,
                        deps,
                        recordProcessId: recordProcess.ID,
                        challengerConfig: recordProcess.ChallengerConfigurationObject ?? undefined,
                        shadowCoordinator: coordinator,
                    },
                    new TestAssembler(new InMemoryDataAccess()),
                );

                const testRecordId = `psd1-rec-${Date.now()}`;
                const procResult = await processor.ProcessRecord(
                    {
                        EntityID: targetEntityId!,
                        RecordID: testRecordId,
                        Record: { ID: testRecordId, tenure: 12 },
                    },
                    {
                        ContextUser: user,
                        Provider: md,
                        RecordProcessID: recordProcess.ID,
                        EntityID: targetEntityId!,
                    },
                );
                AssertEqual(procResult.Status, 'Succeeded', 'Champion scoring succeeded');
                await coordinator.FlushInFlight();

                const rv = RunView.FromMetadataProvider(md);
                const fvRes = await rv.RunView<MJFeatureValueEntity>(
                    {
                        EntityName: 'MJ: Feature Values',
                        ExtraFilter: `RecordProcessID = '${recordProcess.ID}' AND RecordID = '${testRecordId}'`,
                        ResultType: 'entity_object',
                        BypassCache: true,
                    },
                    user,
                );
                Assert(fvRes.Success, `RunView on MJ: Feature Values failed: ${fvRes.ErrorMessage}`);
                const rows = fvRes.Results ?? [];
                createdFeatureValues.push(...rows);

                const champRow = rows.find((r) => r.Role === 'Champion');
                const challRow = rows.find((r) => r.Role === 'Challenger');
                Assert(!!champRow, 'Expected Role=Champion row in MJ: Feature Values');
                Assert(!!challRow, 'Expected Role=Challenger row in MJ: Feature Values');
                Assert(
                    typeof champRow!.ValueKeyHash === 'string' && champRow!.ValueKeyHash.length > 0,
                    'Champion row must have non-null ValueKeyHash',
                );
                AssertEqual(challRow!.ValueKeyHash, null, 'Challenger row must have ValueKeyHash = null');
                Assert(
                    UUIDsEqual(champRow!.MLModelID, championModel.ID),
                    'Champion row must record championModel.ID in MLModelID',
                );
                AssertEqual(champRow!.AIModelID, null, 'Champion row must leave AIModelID null for ML Model');
                Assert(
                    UUIDsEqual(challRow!.MLModelID, challengerModel.ID),
                    'Challenger row must record challengerModel.ID in MLModelID',
                );
                AssertEqual(challRow!.AIModelID, null, 'Challenger row must leave AIModelID null for ML Model');

                const latest = await FeatureValueCacheService.Instance.GetLatestValue({
                    RecordProcessID: recordProcess.ID,
                    EntityID: targetEntityId!,
                    RecordID: testRecordId,
                    FeatureName: 'RenewalScore',
                    Source: 'Pipeline',
                    ContextUser: user,
                    Provider: md,
                });
                Assert(!!latest, 'GetLatestValue returned the champion feature value');
                AssertEqual(
                    Number(latest!.ValueNumeric),
                    0.35,
                    'GetLatestValue returned the champion score (0.35), never challenger (0.91)',
                );
            } finally {
                for (const fv of createdFeatureValues) {
                    await fv.Delete().catch(() => undefined);
                }
                if (recordProcess?.IsSaved) {
                    await recordProcess.Delete().catch(() => undefined);
                }
                if (challengerModel?.IsSaved) {
                    await challengerModel.Delete().catch(() => undefined);
                }
                if (championModel?.IsSaved) {
                    await championModel.Delete().catch(() => undefined);
                }
                if (pipeline?.IsSaved) {
                    await pipeline.Delete().catch(() => undefined);
                }
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

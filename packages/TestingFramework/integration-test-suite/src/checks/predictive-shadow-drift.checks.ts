/**
 * predictive-shadow-drift.checks.ts — the 'predictive-shadow-drift' bundle (PSD1–PSD2):
 * deterministic integration checks for Predictive Studio shadow scoring (`Role = 'Challenger'`
 * vs `Role = 'Champion'` isolation in `MJ: Feature Values` and `FeatureValueCacheService`)
 * and `PredictiveStudioEvaluateDriftAction` end-to-end execution over `MJ: Feature Values`.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJFeatureValueEntity,
    MJMLModelEntity,
    MJMLTrainingPipelineEntity,
    MJRecordProcessEntity,
    MJUserNotificationEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import { FeatureValueCacheService } from '@memberjunction/feature-pipelines';
import { RecordProcessorRegistry } from '@memberjunction/record-set-processor-base';
import {
    EVALUATE_DRIFT_DRIVER_CLASS,
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
                artifacts.set('artifact-champion', new Uint8Array(Buffer.from('champion-bytes')));
                artifacts.set('artifact-challenger', new Uint8Array(Buffer.from('challenger-bytes')));
                championModel.ArtifactFileID = 'artifact-champion';
                challengerModel.ArtifactFileID = 'artifact-challenger';

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
                                        ? { score: 0.91, class: 'challenger-band' }
                                        : { score: 0.35, class: 'champion-band' },
                                ],
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
                await FeatureValueCacheService.Instance.RecordFeatureValues({
                    recordProcessID: recordProcess.ID,
                    entityID: targetEntityId!,
                    recordID: testRecordId,
                    outputs: [{ featureName: 'RenewalScore', value: 0.35, confidence: 0.88 }],
                    promptVersionHash: null,
                    pipelineVersion: 1,
                    aiModelID: null,
                    parametersHash: null,
                    inputHash: 'input-hash-psd1',
                    source: 'Pipeline',
                    contextUser: user,
                    provider: md,
                });

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
        Name: 'PSD2: PredictiveStudioEvaluateDriftAction loads baseline and evaluation windows from MJ: Feature Values, detects Critical PSI drift, and emits an alert record',
        Fn: async (ctx: IntegrationCheckContext) => {
            const md = ctx.Provider;
            const user = ctx.User;
            const createdFeatureValues: MJFeatureValueEntity[] = [];
            let recordProcess: MJRecordProcessEntity | null = null;
            let createdAlertId: string | undefined;

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

                // Seed 12 baseline Champion rows spread across [0.1 .. 0.9] and 12 evaluation Champion rows shifted to 0.99
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
                    baseRow.ComputedAt = new Date(Date.UTC(2026, 0, 1, 0, i));
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
                    evalRow.ComputedAt = new Date(Date.UTC(2026, 0, 2, 0, i));
                    Assert(
                        await evalRow.Save(),
                        `Failed to save evaluation Feature Value: ${evalRow.LatestResult?.CompleteMessage}`,
                    );
                    createdFeatureValues.push(evalRow);
                }

                await ActionEngineServer.Instance.Config(false, user);
                const driftAction =
                    ActionEngineServer.Instance.Actions.find(
                        (a) => a.DriverClass === EVALUATE_DRIFT_DRIVER_CLASS,
                    ) ??
                    ({
                        ID: '6A2D5E81-3C49-4F8B-91B2-0D8E4F7C1A00',
                        Name: 'Evaluate Feature and Prediction Drift',
                        DriverClass: EVALUATE_DRIFT_DRIVER_CLASS,
                        Type: 'Custom',
                        Status: 'Active',
                    } as RunActionParams['Action']);

                const runParams = new RunActionParams();
                runParams.Action = driftAction;
                runParams.ContextUser = user;
                runParams.Provider = md;
                runParams.SkipActionLog = true;
                runParams.Params = [
                    { Name: 'RecordProcessID', Type: 'Input', Value: recordProcess.ID },
                    { Name: 'MinSampleSize', Type: 'Input', Value: 10 },
                    { Name: 'EmitAlertOnDrift', Type: 'Input', Value: true },
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
                createdAlertId = runParams.Params.find(
                    (p) => p.Name === 'AlertID' && p.Type === 'Output',
                )?.Value as string | undefined;

                AssertEqual(overallSeverity, 'Critical', 'Expected OverallSeverity=Critical');
                AssertEqual(shouldAlert, true, 'Expected ShouldAlert=true');
                AssertEqual(alertEmitted, true, 'Expected AlertEmitted=true');
                Assert(
                    typeof createdAlertId === 'string' && createdAlertId.length > 0,
                    'Expected AlertID output parameter',
                );
            } finally {
                if (createdAlertId) {
                    const rv = RunView.FromMetadataProvider(md);
                    const notifRes = await rv.RunView<MJUserNotificationEntity>(
                        {
                            EntityName: 'MJ: User Notifications',
                            ExtraFilter: `ID = '${createdAlertId}'`,
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

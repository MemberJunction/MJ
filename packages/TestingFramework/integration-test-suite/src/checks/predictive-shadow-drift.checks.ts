/**
 * predictive-shadow-drift.checks.ts — the 'predictive-shadow-drift' bundle (PSD1–PSD2): deterministic integration
 * checks for Predictive Studio's live challenger and its divergence on the monitoring period row.
 *
 * PSD1 (D-069, §5.8.3 step 5): a bound Record Process with a `ChallengerConfiguration` scored through `ScoringService`
 * writes its champion's and its challenger's predictions as `Source = 'Model'` rows, each role under its own
 * `MJ: ML Scoring Runs` row, and no `Source = 'Pipeline'` row. The sidecar and the model runtime are doubles (no model is
 * trained); the challenger is read from the Record Process by the production `ShadowScoringCoordinator`.
 * PSD2 (M6.8, D-069): the same binding's live mirror measured by the monitoring driver's divergence step and stored on
 * the champion's `MJ: ML Monitoring Results` row (`ChallengerResult.mirror`): paired records, agreement, mean score
 * delta and failures. #6180's PSI drift action is gone; drift is procedure M in the monitoring job.
 */
import { createHash } from 'node:crypto';
import { DatabaseProviderBase, RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, FilterByUUIDs, IndexByUUID, UUIDSet, type UUIDMap } from '@memberjunction/global';
import type {
    MJFeatureValueEntity,
    MJFileEntity,
    MJKnowledgeHubSavedSearchEntity,
    MJMLModelEntity,
    MJMLModelScoringBindingEntity,
    MJMLMonitoringResultEntity,
    MJMLScoringRunEntity,
    MJMLTrainingPipelineEntity,
    MJRecordProcessEntity,
} from '@memberjunction/core-entities';
import {
    InMemoryArtifactLoader,
    MonitoringPeriods,
    PredictiveStudioModelMonitoringJobDriver,
    LoadMLModelInferenceProcessor,
    ScoringBindings,
    ScoringService,
    type IScoringModelRuntime,
    type IScoringPreparedModel,
    type ISidecarPredictor,
    type LoadedModel,
    type MonitoredBinding,
    type MonitoredModel,
    type MonitoredUnit,
    type MonitoringPeriod,
    type OutcomeJoinResult,
    type PeriodPlan,
    type ScoringContext,
} from '@memberjunction/predictive-studio';
import {
    JsonParse,
    UtcDay,
    resolveOutcomeConfig,
    type FeatureSchemaEntry,
    type MonitoringJobReadSpec,
    type MonitoringMirror,
    type PredictionUnitSpec,
    type PredictRequest,
    type PredictResponse,
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

LoadMLModelInferenceProcessor();

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
            Assemble: async (ids) => ({ Status: 'assembled', Matrix: { columns: ['Tenure'], rows: ids.map(() => [1]) }, Columns: [...PSD1_FEATURES], HashColumns: null, RowIDs: [...ids], Skipped: [] }),
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

/**
 * Deletes every row PSD1 created, children first: PSD2's `MJ: ML Monitoring Results` rows through `BaseEntity.Delete`
 * (nothing guards them), then the rest by SQL (the binding refuses an entity delete before withdrawal).
 */
async function deletePsd1Fixtures(provider: DatabaseProviderBase, user: UserInfo, tag: string): Promise<void> {
    await deletePsd2PeriodRows(provider, user, tag);
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

/** PSD2's period rows of the tag's models, each deleted through `BaseEntity.Delete`. @throws naming a read or delete that failed */
async function deletePsd2PeriodRows(provider: DatabaseProviderBase, user: UserInfo, tag: string): Promise<void> {
    const rv = RunView.FromMetadataProvider(provider);
    const pipelines = await rv.RunView<Pick<MJMLTrainingPipelineEntity, 'ID'>>({ EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `Name = '${EscapeSQLString(tag)}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user);
    if (!pipelines.Success) throw new Error(`PSD teardown: reading the ${tag} pipelines failed: ${pipelines.ErrorMessage}`);
    if (pipelines.Results.length === 0) return;
    const pipelineIds = pipelines.Results.map((p) => `'${EscapeSQLString(p.ID)}'`).join(',');
    const models = await rv.RunView<Pick<MJMLModelEntity, 'ID'>>({ EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID IN (${pipelineIds})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user);
    if (!models.Success) throw new Error(`PSD teardown: reading the ${tag} models failed: ${models.ErrorMessage}`);
    if (models.Results.length === 0) return;
    const rows = await rv.RunView<MJMLMonitoringResultEntity>({
        EntityName: 'MJ: ML Monitoring Results', ExtraFilter: `ModelID IN (${models.Results.map((m) => `'${EscapeSQLString(m.ID)}'`).join(',')})`, ResultType: 'entity_object', BypassCache: true,
    }, user);
    if (!rows.Success) throw new Error(`PSD teardown: reading the ${tag} period rows failed: ${rows.ErrorMessage}`);
    for (const row of rows.Results) {
        if (!(await row.Delete())) throw new Error(`PSD teardown: deleting period row ${row.ID} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
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

/**
 * The monitoring driver with its divergence and period-row steps exposed (PSD2 runs them on the fixture binding; the
 * unit test runs them over an in-memory store through the constructor's seams).
 */
export class Psd2MirrorDriver extends PredictiveStudioModelMonitoringJobDriver {
    /**
     * The binding's mirror over `period`, measured by the driver's own step and stored on the champion's period row.
     *
     * @throws Error when the binding names no live challenger (the period then has no mirror)
     */
    public async MeasureAndStore(ctx: IntegrationCheckContext, champion: MonitoredModel, binding: MonitoredBinding, period: MonitoringPeriod): Promise<MonitoringMirror> {
        const monitoring = this.ContextFor(ctx.User, ctx.Provider, null);
        const unit: MonitoredUnit = { ID: PSD2_UNIT.id, Spec: PSD2_UNIT, LabelWindowDays: 365, LabelGapDays: 0, RowEntity: PSD1_TARGET };
        const plan: PeriodPlan = {
            Model: champion, Unit: unit, Task: { kind: 'binary', classOrder: ['renewed', 'lapsed'], adverseIndex: 1 }, Spec: psd2Spec(champion.ID),
            Initiator: { kind: 'human', userId: ctx.User.ID },
        };
        const join: OutcomeJoinResult = { Path: 'binding', Binding: binding, ShadowScoringRunID: null, ScoredRows: 0, ExcludedInTrainingRows: 0, Rows: [] };
        const mirror = await this.MeasureDivergence(plan, join, period, monitoring);
        if (mirror === null) throw new Error('PSD2: the binding names no live challenger, so the period has no mirror');
        await this.WritePeriod({
            ModelID: champion.ID, ScheduledJobRunID: null, Period: period, State: 'window-open', ScoredRows: PSD1_RECORDS, JoinedRows: 0, ExcludedInTrainingRows: 0,
            Primary: null, Tracked: null, Calibration: null, DriftLook: null, DriftAlarms: [], Parity: null, TriggersFired: [], ChallengerRunID: null,
            Challenger: { outcome: 'none', trainingRunId: null, recordId: null, reason: null, mirror }, Rollback: null, ErrorMessage: null,
        }, monitoring);
        return mirror;
    }
}

/** The unit PSD2's plan names (the divergence step reads no unit; the plan's type carries one). */
const PSD2_UNIT: PredictionUnitSpec = {
    id: 'psd2', lineageRootId: 'psd2', version: 1, name: 'psd2',
    rows: { kind: 'grain', grainEntity: PSD1_TARGET, decisionDate: { kind: 'fixed', date: '2026-01-01' }, filter: [] },
    label: { rule: { kind: 'column', column: 'Lapsed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['renewed', 'lapsed'], adverseIndex: 1 }, labelVersion: 1 },
    censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } }, history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, groupKey: null, temporal: null,
    decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'month' }, incumbent: { kind: 'none' }, authoredBy: { kind: 'system', component: 'psd2' },
};

/** The monitoring spec PSD2's plan carries (the divergence step reads none of it). */
function psd2Spec(modelId: string): MonitoringJobReadSpec {
    return {
        modelId, evaluationProtocolId: 'psd2', schedule: { cronExpression: '0 3 1 * *', timezone: 'UTC' },
        outcomeJoin: { predictionUnitId: 'psd2', runWhen: 'label-window-closed', joinOn: 'entity-and-as-of-date', excludeInTrainingRows: true },
        performance: { primaryScore: { family: 'binary', metric: 'log-loss' }, period: 'month', interval: { level: 0.95, method: 'bootstrap', resamples: 100, pairedTest: 'paired-bootstrap' }, calibration: true, minScoredRowsPerPeriod: 10 },
        drift: { features: 'all-model-features', statistic: 'z-mean', fdr: { method: 'benjamini-hochberg', q: 0.0095 }, nullCalibration: { kind: 'empirical-replay', looks: 12, inputs: 1, replays: 4_000_000, q: 0.0095 }, documentedFalseAlarmRate: 0.05, action: 'alert' },
        challenger: { comparison: 'same-row-ids', score: { family: 'binary', metric: 'log-loss' }, onPass: 'publish-through-gate' },
        retrainTriggers: [], rollback: null, parity: { sampleRows: 100, tolerance: 1e-9 },
    };
}

/** Asserts the champion's period row stores the measured mirror in `ChallengerResult` (camelCase JSON). */
async function assertPsd2Row(ctx: IntegrationCheckContext, champion: MJMLModelEntity, period: MonitoringPeriod, mirror: MonitoringMirror): Promise<void> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJMLMonitoringResultEntity, 'ID' | 'State' | 'ChallengerResult'>>({
        EntityName: 'MJ: ML Monitoring Results', ExtraFilter: `ModelID = '${EscapeSQLString(champion.ID)}' AND PeriodGrain = 'month' AND Period = '${UtcDay.UtcDayIso(period.Start)}'`,
        Fields: ['ID', 'State', 'ChallengerResult'], ResultType: 'simple', BypassCache: true,
    }, ctx.User);
    Assert(rows.Success && rows.Results.length === 1, `one period row of the champion (got ${rows.Results.length}: ${rows.ErrorMessage})`);
    const stored = JsonParse.ParseJsonText(rows.Results[0].ChallengerResult, 'ChallengerResult');
    Assert(stored.Ok === true && JsonParse.IsJsonObject(stored.Value), 'the period row stores its ChallengerResult as JSON');
    const value = stored.Ok === true && JsonParse.IsJsonObject(stored.Value) ? JsonParse.JsonObjectField(stored.Value, 'mirror') : null;
    Assert(value !== null && JsonParse.JsonNumber(value, 'paired') === mirror.paired && JsonParse.JsonNumber(value, 'failures') === mirror.failures
        && JsonParse.JsonString(value, 'challengerModelId') === mirror.challengerModelId, `the stored mirror equals the measured one (${JSON.stringify(value)})`);
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
                if (tagOf() !== '') await deletePsd1Fixtures(provider, ctx.User, tagOf());
            }
        },
    },
    {
        Id: 'predictive-shadow-drift.PSD2',
        Name: "PSD2: the live mirror's divergence over the period (paired records, agreement, mean score delta, failures) is stored on the champion's MJ: ML Monitoring Results row",
        Fn: async (ctx: IntegrationCheckContext) => {
            if (!(ctx.Provider instanceof DatabaseProviderBase)) SkipCheck('PSD2 needs a database provider: its fixtures place model status by SQL');
            const provider = ctx.Provider;
            let fixtures: Psd1Fixtures | null = null;
            const tagOf = (): string => fixtures?.Tag || '';
            try {
                fixtures = await createPsd1Fixtures(ctx, provider);
                const asOf = new Date();
                const scored = await new ScoringService(psd1Context(ctx, fixtures.Artifacts)).Score(
                    fixtures.Binding, { kind: 'record-ids', entity: PSD1_TARGET, ids: [...fixtures.RecordIDs] }, asOf, false,
                );
                AssertEqual(scored.Status, 'completed', `the binding run completed (${JSON.stringify(scored)})`);
                const period = MonitoringPeriods.Containing(asOf, 'month');
                const mirror = await new Psd2MirrorDriver().MeasureAndStore(ctx, fixtures.Champion, fixtures.Binding, period);
                AssertEqual(mirror.paired, PSD1_RECORDS, 'every champion record is paired with its challenger row');
                AssertEqual(mirror.failures, 0, 'no champion record is missing its challenger row');
                AssertEqual(mirror.agreement, 0, `the champion (${PSD1_SCORES.Champion}) and the challenger (${PSD1_SCORES.Challenger}) fall on opposite sides of 0.5`);
                Assert(Math.abs(mirror.meanScoreDelta - (PSD1_SCORES.Challenger - PSD1_SCORES.Champion)) < 1e-9, `the mean score delta is challenger minus champion (got ${mirror.meanScoreDelta})`);
                await assertPsd2Row(ctx, fixtures.Champion, period, mirror);
            } finally {
                if (tagOf() !== '') await deletePsd1Fixtures(provider, ctx.User, tagOf());
            }
        },
    },
];

for (const check of PredictiveShadowDriftChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

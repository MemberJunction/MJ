/**
 * ps-prediction-serving.checks.ts — the 'ps-prediction-serving' bundle, "IT180 - PS Prediction Serving — Zero Schema
 * Change" (Task M5b.6, D4-47, D-058, D-078): a model's prediction reaches a record as a `Source = 'Model'` Feature
 * Value, read live through `MJ: Latest Feature Values` and gated by the binding's view authorization, with no column, no
 * migration and no CodeGen run.
 *
 * Deterministic, server transport (the deterministic lane has no sidecar, so nothing is trained): the fixture model is
 * placed Published by SQL as IT166's is (Status is the lifecycle gate's to write; G5.6, in the mutation tier, publishes
 * the trained C1 model through the gate), and scoring runs the production `ScoringService` in this process with its
 * sidecar and model runtime replaced by doubles — the service Score Record Set calls with the binding's `BindingID`.
 *
 * THE IDENTITY MODEL (fls-client.checks.ts): a GraphQL client authenticates as one wire identity, so per-user
 * enforcement is observed through per-user authentication. The lifecycle creates two scratch users — the restricted one
 * holding the UI role and neither Developer nor Integration, the authorized one holding Developer (no seeded integration
 * user holds either: `metadata-optional/integration-test/users/` seeds none with UI or Developer) — mints one user API key
 * for each and builds a secondary `GraphQLDataProvider` per key; teardown deletes the keys and the users.
 *
 * Z1 the fixture model Published with a registered artifact, and the schema fingerprint read before it (the stored
 *    query "Predictive Studio: Schema Column Fingerprint"); Z2 a binding with no TargetColumn scored, one completed run;
 * Z3 the fingerprint, the applied-migration count and the newest MJ: Entities change unchanged; Z4 every scored
 *    record has a Model row whose lineage joins; Z5 the latest-value entity holds each, with no refresh call; Z6 the
 *    restricted identity reads none from either entity and the panel's RunViews shows no card, the authorized identity
 *    reads all and the panel shows its card; Z7 a same-asOf re-run keeps the row count and updates the values, and a run
 *    failed at its second batch keeps its first; Z8 a backfill with an older asOf adds history, leaves the latest values
 *    and does not overwrite the column of a second binding that copies into one.
 */
import { createHash } from 'node:crypto';
import {
    AuthorizationEvaluator, DatabaseProviderBase, RunView,
    type BaseEntity, type IMetadataProvider, type UserInfo,
} from '@memberjunction/core';
import type {
    MJFeatureValueEntity, MJFileEntity, MJKnowledgeHubSavedSearchEntity, MJMLModelEntity, MJMLModelScoringBindingEntity,
    MJMLTrainingPipelineEntity, MJUserEntity, MJUserRoleEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    InMemoryArtifactLoader, LoadMLModelInferenceProcessor, PublishLocks, ScoringBindings, ScoringService,
    type IScoringModelRuntime, type IScoringPreparedModel, type ISidecarPredictor, type LoadedModel, type ScoringContext,
} from '@memberjunction/predictive-studio';
import {
    PredictionPanelQueries, resolveOutcomeConfig, type FeatureSchemaEntry, type PredictRequest, type PredictResponse, type ScoringResult,
} from '@memberjunction/predictive-studio-core';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { BuildUserKeyProviderWithRetry, DeleteMintedUserKeys, MintFullAccessUserKey, type MintedUserKeyIds } from './fls-client.checks';
import { ScoringLineage, type LineageModelRow, type LineageRunRow, type LineageValueRow } from './ps-gates/ps-gate-scoring-lineage';
import { WaitUntil } from './wait-until';

LoadMLModelInferenceProcessor();

/** The stored query the zero-schema-change checks read (in the Predictive Studio query category, as the registry's are). */
export const SCHEMA_FINGERPRINT_QUERY = { Name: 'Predictive Studio: Schema Column Fingerprint' } as const;
/** How long a freshly minted identity may take to read through MJAPI (user cache, scope cache). */
const IDENTITY_PROPAGATION_MS = 180_000;

/** The schema fingerprint the stored query returns. */
export interface SchemaFingerprint {
    readonly ColumnCount: number;
    readonly ColumnChecksum: number;
    readonly MigrationCount: number;
    /** The newest `MJ: Entities.__mj_UpdatedAt` (ISO text). */
    readonly EntityMetadataUpdatedAt: string;
}

/** What changed between two fingerprints. */
export interface FingerprintDelta {
    /** 0 when every column is as before; else at least 1 (the count difference when the count moved). */
    readonly ColumnsChanged: number;
    /** Migrations applied in between. */
    readonly MigrationsAdded: number;
    /** 1 when an MJ: Entities row changed in between (a CodeGen run), else 0. */
    readonly EntityMetadataChanged: number;
}

/** One wire identity: its user and the secondary provider authenticated by its API key. */
export interface ServingIdentity {
    readonly UserID: string;
    readonly Email: string;
    readonly Provider: IMetadataProvider;
}

/** The two identities and what teardown removes. */
export interface ServingIdentities {
    /** UI role only. */
    readonly Restricted: ServingIdentity;
    /** Developer role (holds "View Model Predictions"). */
    readonly Authorized: ServingIdentity;
    /** The minted keys and scope rules. */
    readonly Keys: MintedUserKeyIds;
    /** The scratch users and their role rows, for teardown. */
    readonly UserIDs: readonly string[];
}

/** A binding's prediction counts read through one identity. */
export interface ModelRowReads {
    /** `Source = 'Model'` rows of the feature in `MJ: Feature Values`. */
    readonly FeatureValues: number;
    /** Rows of the feature in `MJ: Latest Feature Values`. */
    readonly LatestFeatureValues: number;
}

/** What the record panel's batch returned for one binding on one record through one identity. */
export interface PanelReplay {
    /** 1 when the panel would render the binding's card, else 0. */
    readonly Cards: number;
    /** 1 when the server returned a latest value of the binding, else 0. */
    readonly ValuesReturned: number;
    /** The failed read's message, or null. */
    readonly ReadError: string | null;
}

/** The bundle's fixture rows. */
interface ServingFixture {
    readonly Tag: string;
    readonly TargetEntityID: string;
    readonly PipelineID: string;
    readonly ModelID: string;
    readonly Artifacts: InMemoryArtifactLoader;
    readonly RecordIDs: readonly string[];
    /** The binding with no TargetColumn (Z2). */
    readonly Binding: MJMLModelScoringBindingEntity;
    /** A second binding copying into `MinScore` (Z8). */
    readonly CopyBinding: MJMLModelScoringBindingEntity;
    readonly Before: SchemaFingerprint;
    /** The scoring run Setup completed (Z2). */
    readonly Run: ScoringResult;
    readonly Identities: ServingIdentities;
}

const TARGET = 'MJ: Knowledge Hub Saved Searches';
const FEATURES: readonly FeatureSchemaEntry[] = [{ Name: 'Tenure', Kind: 'numeric' }];
const RECORDS = 4;
const DAY1 = new Date('2026-10-01T00:00:00Z');
const DAY3 = new Date('2026-10-03T00:00:00Z');
const DAY5 = new Date('2026-10-05T00:00:00Z');
const TAG_SUFFIX = '(mj-integration-test — safe to delete)';

let fixture: ServingFixture | null = null;

// ------------------------------------------------------------------------------------------------ shared steps ----

/** The shared steps of IT180 and gate G5.6: the two wire identities, the gated reads, the panel replay, the fingerprint. */
export class PsPredictionServing {
    /** The bundle's fixture; throws when Setup did not build it. */
    public static Fixture(): ServingFixture {
        if (fixture === null) throw new Error('ps-prediction-serving: the bundle fixture was not built (Setup failed; see its log)');
        return fixture;
    }

    /**
     * Creates the restricted (UI role) and authorized (Developer role) scratch users as `ctx.User`, mints a user API key
     * for each and waits until each authenticates through MJAPI and reads `MJ: Latest Feature Values`.
     */
    public static async MintIdentities(ctx: IntegrationCheckContext, tag: string): Promise<ServingIdentities> {
        const keys: MintedUserKeyIds = { CreatedKeyIds: [], CreatedScopeRuleIds: [] };
        const userIds: string[] = [];
        const make = async (label: string, roleName: string): Promise<ServingIdentity> => {
            const roleId = await PsPredictionServing.FirstId(ctx, 'MJ: Roles', `Name = '${EscapeSQLString(roleName)}'`);
            const email = `ps-serving-${label}-${Date.now()}@integration.test`;
            const user = await PsPredictionServing.CreateRow<MJUserEntity>(ctx, 'MJ: Users', (u) => { u.Name = `${tag} ${label}`; u.Email = email; u.Type = 'User'; u.IsActive = true; });
            userIds.push(user.ID);
            await PsPredictionServing.CreateRow<MJUserRoleEntity>(ctx, 'MJ: User Roles', (ur) => { ur.UserID = user.ID; ur.RoleID = roleId; });
            const raw = await MintFullAccessUserKey(ctx, keys, user.ID, `${tag} ${label}`);
            const provider = await BuildUserKeyProviderWithRetry(raw);
            await WaitUntil(async () => (await PsPredictionServing.canRead(provider)), `${label} identity reads MJ: Latest Feature Values through MJAPI`, { TimeoutMs: IDENTITY_PROPAGATION_MS });
            return { UserID: user.ID, Email: email, Provider: provider };
        };
        const restricted = await make('restricted', 'UI');
        const authorized = await make('authorized', 'Developer');
        return { Restricted: restricted, Authorized: authorized, Keys: keys, UserIDs: userIds };
    }

    /** Deletes the identities' keys, role rows and users, best effort (teardown never throws). */
    public static async ReleaseIdentities(ctx: IntegrationCheckContext, ids: ServingIdentities): Promise<void> {
        await DeleteMintedUserKeys(ctx, ids.Keys);
        for (const userId of ids.UserIDs) {
            const roles = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJUserRoleEntity>({ EntityName: 'MJ: User Roles', ExtraFilter: `UserID = '${EscapeSQLString(userId)}'`, ResultType: 'entity_object' }, ctx.User);
            for (const r of roles.Results || []) await r.Delete();
            const user = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
            if (await user.Load(userId)) await user.Delete();
        }
    }

    /** The feature's prediction rows each gated entity returns through `provider` (its key's identity). */
    public static async ReadModelRows(provider: IMetadataProvider, featureName: string): Promise<ModelRowReads> {
        const feature = `FeatureName = '${EscapeSQLString(featureName)}'`;
        const [values, latest] = await RunView.FromMetadataProvider(provider).RunViews<Pick<MJFeatureValueEntity, 'ID'>>([
            { EntityName: 'MJ: Feature Values', ExtraFilter: `${feature} AND Source = 'Model'`, Fields: ['ID'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
            { EntityName: 'MJ: Latest Feature Values', ExtraFilter: `${feature} AND Source = 'Model'`, Fields: ['ID'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
        ]);
        if (!values.Success || !latest.Success) throw new Error(`reading ${featureName}'s predictions failed: ${values.ErrorMessage || latest.ErrorMessage}`);
        return { FeatureValues: values.Results.length, LatestFeatureValues: latest.Results.length };
    }

    /**
     * What the record panel gets for `binding` on one record through `provider`: its own batch
     * (`PredictionPanelQueries.For`, what `ModelPredictionPanel` sends). `ValuesReturned` is 1 when the server returned a
     * latest value of the binding to this identity — the view gate's guarantee, which no client-side check can undo.
     * `Cards` is 1 when the panel would render the card: the binding listed, its view authorization held
     * (`AuthorizationEvaluator.UserCanExecuteWithAncestors`, the panel's rule) and a value returned. A failed read
     * returns nothing (the panel renders nothing) and is reported; the value read is judged apart from the binding read.
     */
    public static async PanelCards(provider: IMetadataProvider, entityId: string, recordId: string, binding: Pick<MJMLModelScoringBindingEntity, 'ID' | 'ViewAuthorizationID'>): Promise<PanelReplay> {
        // No feature narrowing: the panel sends its first batch with none (it learns the bound features from it).
        const queries = PredictionPanelQueries.For(entityId, recordId, []);
        const results = await RunView.FromMetadataProvider(provider).RunViews<Pick<MJFeatureValueEntity, 'ID' | 'MLModelScoringBindingID'>>(queries);
        const bindings = results[PredictionPanelQueries.Index.Bindings];
        const latest = results[PredictionPanelQueries.Index.Latest];
        // The value read is judged on its own: a binding read the identity may not make must not hide a value that reached it.
        const value = latest.Success && latest.Results.some((r) => r.MLModelScoringBindingID !== null && UUIDsEqual(r.MLModelScoringBindingID, binding.ID));
        const readError = !bindings.Success || !latest.Success ? bindings.ErrorMessage || latest.ErrorMessage || 'a panel read failed' : null;
        const listed = bindings.Success && bindings.Results.some((b) => UUIDsEqual(b.ID, binding.ID));
        const authorization = provider.Authorizations.find((a) => binding.ViewAuthorizationID !== null && UUIDsEqual(a.ID, binding.ViewAuthorizationID));
        const user = provider.CurrentUser;
        const held = authorization !== undefined && user !== undefined && user !== null && new AuthorizationEvaluator().UserCanExecuteWithAncestors(authorization, user, provider.Authorizations);
        return { Cards: listed && held && value ? 1 : 0, ValuesReturned: value ? 1 : 0, ReadError: readError };
    }

    /** The schema fingerprint through the stored query, on `provider` as `user`. */
    public static async Fingerprint(provider: IMetadataProvider, user: UserInfo): Promise<SchemaFingerprint> {
        const r = await PublishLocks.RunStored(SCHEMA_FINGERPRINT_QUERY.Name, {}, { ContextUser: user, Provider: provider });
        const row = r.Success ? r.Results[0] : undefined;
        if (!row) throw new Error(`the "${SCHEMA_FINGERPRINT_QUERY.Name}" query failed: ${r.ErrorMessage || 'no row'} (push metadata/queries)`);
        return {
            ColumnCount: Number(row['ColumnCount']), ColumnChecksum: Number(row['ColumnChecksum']), MigrationCount: Number(row['MigrationCount']),
            EntityMetadataUpdatedAt: new Date(String(row['EntityMetadataUpdatedAt'])).toISOString(),
        };
    }

    /** What changed between `before` and `after`. Pure. */
    public static Delta(before: SchemaFingerprint, after: SchemaFingerprint): FingerprintDelta {
        const countMoved = Math.abs(after.ColumnCount - before.ColumnCount);
        return {
            ColumnsChanged: countMoved > 0 ? countMoved : after.ColumnChecksum === before.ColumnChecksum ? 0 : 1,
            MigrationsAdded: after.MigrationCount - before.MigrationCount,
            EntityMetadataChanged: after.EntityMetadataUpdatedAt === before.EntityMetadataUpdatedAt ? 0 : 1,
        };
    }

    /** True when `provider` reads the latest-value entity (its identity authenticated, its scope rule honored). */
    private static async canRead(provider: IMetadataProvider): Promise<boolean> {
        const r = await RunView.FromMetadataProvider(provider).RunView<Pick<MJFeatureValueEntity, 'ID'>>({ EntityName: 'MJ: Latest Feature Values', Fields: ['ID'], MaxRows: 1, ResultType: 'simple', BypassCache: true });
        return r.Success;
    }

    /** The first row ID of `entityName` matching `filter`; throws naming the entity. */
    public static async FirstId(ctx: IntegrationCheckContext, entityName: string, filter = ''): Promise<string> {
        const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({ EntityName: entityName, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User);
        const id = r.Success ? r.Results[0]?.ID : undefined;
        if (!id) throw new Error(`no ${entityName} row${filter ? ` where ${filter}` : ''}`);
        return id;
    }

    /** Saves a new row of `entityName` with `fill` applied as `ctx.User`; throws with the provider's message. */
    public static async CreateRow<T extends BaseEntity>(ctx: IntegrationCheckContext, entityName: string, fill: (row: T) => void): Promise<T> {
        const row = await ctx.Provider.GetEntityObject<T>(entityName, ctx.User);
        row.NewRecord();
        fill(row);
        if (!(await row.Save())) throw new Error(`${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
        return row;
    }
}

// -------------------------------------------------------------------------------------------- the IT180 world ----

/** The sidecar double: every row's adverse probability is its `Tenure` cell plus `Offset`; it can fail one call. */
class ServingSidecar implements ISidecarPredictor {
    /** Added to every probability (a re-run with another offset updates the values). */
    public Offset = 0;
    /** The 1-based call that throws, or null. */
    public FailCall: number | null = null;
    private calls = 0;
    public async predict(req: PredictRequest): Promise<PredictResponse> {
        this.calls++;
        if (this.FailCall !== null && this.calls === this.FailCall) throw new Error(`ServingSidecar: call ${this.calls} fails (Z7)`);
        return {
            classOrder: ['renewed', 'lapsed'],
            predictions: req.rows.map((row) => {
                const p = Math.min(0.99, Number(row['Tenure']) + this.Offset);
                return { score: p, class: p >= 0.5 ? 'lapsed' : 'renewed', probabilities: [1 - p, p] };
            }),
        };
    }
}

/** The model runtime double: a unitless model on the target entity; each record's `Tenure` is 0.1 + its index / 10. */
class ServingRuntime implements IScoringModelRuntime {
    constructor(private readonly recordIds: readonly string[]) {}
    public async Prepare(model: MJMLModelEntity, bytes: Uint8Array): Promise<IScoringPreparedModel> {
        const index = new Map(this.recordIds.map((id, i) => [id.toLowerCase(), i]));
        const loaded: LoadedModel = {
            modelId: model.ID, targetEntityName: TARGET, artifactB64: Buffer.from(bytes).toString('base64'), fittedPreprocessing: {}, featureSchema: [...FEATURES],
            problemType: 'classification', targetVariable: 'Lapsed', sourceBindings: [], featureSteps: { Steps: [] }, asOf: { Mode: 'none' },
            leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 }, outcomeConfig: resolveOutcomeConfig(), unit: null, trainingRowIds: new UUIDSet(),
        };
        return {
            Loaded: loaded,
            Assemble: async (ids) => ({
                Status: 'assembled', Matrix: { columns: ['Tenure'], rows: ids.map((id) => [0.1 + (index.get(id.toLowerCase()) || 0) / 10]) },
                Columns: [...FEATURES], HashColumns: null, RowIDs: [...ids],
            }),
        };
    }
}

/** `[schema].[table]` of an entity. */
function tableOf(provider: IMetadataProvider, entityName: string): string {
    const entity = provider.EntityByName(entityName);
    if (!entity) throw new Error(`entity ${entityName} is not in metadata`);
    return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** The bundle's SQL provider (server transport). */
function sqlProvider(ctx: IntegrationCheckContext): DatabaseProviderBase {
    if (!(ctx.Provider instanceof DatabaseProviderBase)) throw new Error('IT180 runs on the server transport (Configuration.transport = "server")');
    return ctx.Provider;
}

/** Scores `binding` over `recordIds` on `asOf` as `ctx.User`, with `sidecar` and the batch size given. */
function score(ctx: IntegrationCheckContext, f: Pick<ServingFixture, 'Artifacts' | 'RecordIDs'>, binding: MJMLModelScoringBindingEntity, asOf: Date, sidecar: ServingSidecar, batchSize?: number): Promise<ScoringResult> {
    const sc: ScoringContext = {
        ContextUser: ctx.User, Provider: ctx.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null,
        Seams: { Sidecar: sidecar, Runtime: new ServingRuntime(f.RecordIDs), ArtifactLoader: f.Artifacts, ...(batchSize === undefined ? {} : { BatchSize: batchSize }) },
    };
    return new ScoringService(sc).Score(binding, { kind: 'record-ids', entity: TARGET, ids: [...f.RecordIDs] }, asOf, false);
}

/** The binding's Model rows, as the system identity reads them. */
async function modelRows(ctx: IntegrationCheckContext, bindingId: string): Promise<Pick<MJFeatureValueEntity, 'ID' | 'RecordID' | 'ValueNumeric' | 'EffectiveAsOf'>[]> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJFeatureValueEntity, 'ID' | 'RecordID' | 'ValueNumeric' | 'EffectiveAsOf'>>({
        EntityName: 'MJ: Feature Values', ExtraFilter: `MLModelScoringBindingID = '${EscapeSQLString(bindingId)}' AND Source = 'Model'`,
        Fields: ['ID', 'RecordID', 'ValueNumeric', 'EffectiveAsOf'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
    }, ctx.User);
    if (!r.Success) throw new Error(`reading binding ${bindingId}'s Model rows failed: ${r.ErrorMessage}`);
    return r.Results;
}

/** The latest value of each record of `featureName`, as the system identity reads it, by record ID (lower case). */
async function latestByRecord(ctx: IntegrationCheckContext, featureName: string): Promise<Map<string, string>> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJFeatureValueEntity, 'RecordID' | 'EffectiveAsOf'>>({
        EntityName: 'MJ: Latest Feature Values', ExtraFilter: `FeatureName = '${EscapeSQLString(featureName)}'`, Fields: ['RecordID', 'EffectiveAsOf'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
    }, ctx.User);
    if (!r.Success) throw new Error(`reading ${featureName}'s latest values failed: ${r.ErrorMessage}`);
    return new Map(r.Results.map((row) => [row.RecordID.toLowerCase(), row.EffectiveAsOf === null ? 'null' : new Date(row.EffectiveAsOf).toISOString()]));
}

/** The target records' `MinScore`, by record ID (lower case). */
async function minScores(ctx: IntegrationCheckContext, recordIds: readonly string[]): Promise<Map<string, number | null>> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJKnowledgeHubSavedSearchEntity, 'ID' | 'MinScore'>>({
        EntityName: TARGET, ExtraFilter: `ID IN (${recordIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`, Fields: ['ID', 'MinScore'], ResultType: 'simple', BypassCache: true,
    }, ctx.User);
    if (!r.Success) throw new Error(`reading ${TARGET} failed: ${r.ErrorMessage}`);
    return new Map(r.Results.map((row) => [row.ID.toLowerCase(), row.MinScore === null ? null : Number(row.MinScore)]));
}

/** Builds the world: fingerprint, pipeline, Published model, records, two bindings, one scoring run, the two identities. */
async function setup(ctx: IntegrationCheckContext): Promise<void> {
    fixture = null;
    const provider = sqlProvider(ctx);
    const tag = `IT180 ${Date.now()} ${TAG_SUFFIX}`;
    const before = await PsPredictionServing.Fingerprint(ctx.Provider, ctx.User);
    const targetEntityId = ctx.Provider.EntityByName(TARGET)?.ID;
    if (!targetEntityId) throw new Error(`${TARGET} is not in metadata`);
    const algorithmId = await PsPredictionServing.FirstId(ctx, 'MJ: ML Algorithms');
    const storageId = await PsPredictionServing.FirstId(ctx, 'MJ: File Storage Providers');
    const pipeline = await PsPredictionServing.CreateRow<MJMLTrainingPipelineEntity>(ctx, 'MJ: ML Training Pipelines', (p) => {
        p.Name = tag; p.Status = 'Draft'; p.TargetEntityID = targetEntityId; p.TargetVariable = 'Lapsed'; p.ProblemType = 'classification'; p.AlgorithmID = algorithmId;
    });
    const file = await PsPredictionServing.CreateRow<MJFileEntity>(ctx, 'MJ: Files', (x) => { x.Name = `${tag}.bin`; x.ProviderID = storageId; });
    const bytes = new TextEncoder().encode(`artifact of ${tag}`);
    const artifacts = new InMemoryArtifactLoader();
    artifacts.Set(file.ID, bytes);
    const model = await PsPredictionServing.CreateRow<MJMLModelEntity>(ctx, 'MJ: ML Models', (m) => {
        m.PipelineID = pipeline.ID; m.AlgorithmID = algorithmId; m.Version = 1; m.FeatureSchema = JSON.stringify(FEATURES); m.TargetVariable = 'Lapsed'; m.ProblemType = 'classification';
    });
    const semantics = JSON.stringify({ task: { kind: 'binary', classOrder: ['renewed', 'lapsed'], adverseIndex: 1 } });
    await provider.ExecuteSQL(
        `UPDATE ${tableOf(provider, 'MJ: ML Models')} SET Status = 'Published', ArtifactFileID = '${EscapeSQLString(file.ID)}', ` +
            `ArtifactSha256 = '${createHash('sha256').update(bytes).digest('hex')}', OutputSemantics = '${EscapeSQLString(semantics)}' WHERE ID = '${EscapeSQLString(model.ID)}'`,
        undefined, { isMutation: true, description: 'IT180: place the fixture model Published outside the lifecycle gate (no sidecar in this tier)' }, undefined,
    );
    const recordIds: string[] = [];
    for (let i = 0; i < RECORDS; i++) {
        recordIds.push((await PsPredictionServing.CreateRow<MJKnowledgeHubSavedSearchEntity>(ctx, TARGET, (t) => { t.Name = `${tag} r${i}`; t.UserID = ctx.User.ID; t.Query = tag; })).ID);
    }
    const viewAuthorizationId = ScoringBindings.ResolveViewAuthorizationID(null, ctx.Provider);
    const newBinding = (label: string, column: string | null): Promise<MJMLModelScoringBindingEntity> =>
        PsPredictionServing.CreateRow<MJMLModelScoringBindingEntity>(ctx, 'MJ: ML Model Scoring Bindings', (b) => {
            b.MLTrainingPipelineID = pipeline.ID; b.FeatureName = `${tag} ${label}`; b.TargetEntityID = targetEntityId; b.Mode = 'OnDemand'; b.Status = 'Active';
            b.ViewAuthorizationID = viewAuthorizationId; b.TargetColumn = column; b.TargetColumnSource = column === null ? null : '$.AdverseProbability';
        });
    const binding = await newBinding('renewal', null);
    const copyBinding = await newBinding('copied', 'MinScore');
    const base = { Artifacts: artifacts, RecordIDs: recordIds };
    const run = await score(ctx, base, binding, DAY3, new ServingSidecar());
    const identities = await PsPredictionServing.MintIdentities(ctx, tag);
    fixture = {
        Tag: tag, TargetEntityID: targetEntityId, PipelineID: pipeline.ID, ModelID: model.ID, Artifacts: artifacts, RecordIDs: recordIds,
        Binding: binding, CopyBinding: copyBinding, Before: before, Run: run, Identities: identities,
    };
}

/** Deletes the world, children first (the binding refuses an entity delete before withdrawal, so this is SQL). */
async function teardown(ctx: IntegrationCheckContext): Promise<void> {
    const f = fixture;
    fixture = null;
    if (f === null) return;
    try {
        await PsPredictionServing.ReleaseIdentities(ctx, f.Identities);
        const provider = sqlProvider(ctx);
        const t = (entityName: string): string => tableOf(provider, entityName);
        const like = `'${EscapeSQLString(f.Tag)}%'`;
        const bindings = `SELECT ID FROM ${t('MJ: ML Model Scoring Bindings')} WHERE FeatureName LIKE ${like}`;
        await provider.ExecuteSQL(`
            DELETE FROM ${t('MJ: Feature Values')} WHERE MLModelScoringBindingID IN (${bindings});
            DELETE FROM ${t('MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID IN (${bindings});
            DELETE FROM ${t('MJ: ML Model Scoring Bindings')} WHERE FeatureName LIKE ${like};
            DELETE FROM ${t('MJ: ML Models')} WHERE ID = '${EscapeSQLString(f.ModelID)}';
            DELETE FROM ${t('MJ: ML Training Pipelines')} WHERE ID = '${EscapeSQLString(f.PipelineID)}';
            DELETE FROM ${t('MJ: Files')} WHERE Name LIKE ${like};
            DELETE FROM ${t(TARGET)} WHERE Name LIKE ${like};`, undefined, { isMutation: true, description: 'IT180: delete its fixtures' }, undefined);
    } catch (e) {
        console.warn(`      ⚠ IT180 teardown: ${e instanceof Error ? e.message : String(e)}`);
    }
}

// ----------------------------------------------------------------------------------------------------- checks ----

export const PsPredictionServingChecks: NamedCheck[] = [
    {
        Id: 'ps-prediction-serving.Z1', Name: 'Z1: the fixture model is Published with a registered artifact, and the schema fingerprint was read before it',
        Fn: async (ctx) => {
            const f = PsPredictionServing.Fixture();
            const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJMLModelEntity, 'Status' | 'ArtifactSha256'>>({
                EntityName: 'MJ: ML Models', ExtraFilter: `ID = '${EscapeSQLString(f.ModelID)}'`, Fields: ['Status', 'ArtifactSha256'], ResultType: 'simple', BypassCache: true,
            }, ctx.User);
            AssertEqual(r.Results[0]?.Status, 'Published', 'Z1: the fixture model is Published');
            Assert(!!r.Results[0]?.ArtifactSha256, 'Z1: the model has a registered artifact hash');
            Assert(f.Before.ColumnCount > 0 && f.Before.MigrationCount > 0, `Z1: the fingerprint was read before the publish (${JSON.stringify(f.Before)})`);
        },
    },
    {
        Id: 'ps-prediction-serving.Z2', Name: 'Z2: a binding with no TargetColumn scores every record in one completed run',
        Fn: async () => {
            const f = PsPredictionServing.Fixture();
            AssertEqual(f.Binding.TargetColumn, null, 'Z2: the binding names no column');
            Assert(f.Run.Status === 'completed', `Z2: the run completed (${JSON.stringify(f.Run)})`);
            if (f.Run.Status === 'completed') AssertEqual(f.Run.Written, RECORDS, 'Z2: one prediction per record');
        },
    },
    {
        Id: 'ps-prediction-serving.Z3', Name: 'Z3: no column, migration or CodeGen run was added by the publish, binding and scoring',
        Fn: async (ctx) => {
            const f = PsPredictionServing.Fixture();
            const delta = PsPredictionServing.Delta(f.Before, await PsPredictionServing.Fingerprint(ctx.Provider, ctx.User));
            AssertEqual(delta.ColumnsChanged, 0, 'Z3: sys.columns unchanged');
            AssertEqual(delta.MigrationsAdded, 0, 'Z3: no flyway_schema_history row added');
            AssertEqual(delta.EntityMetadataChanged, 0, 'Z3: no MJ: Entities row changed (no CodeGen run)');
        },
    },
    {
        Id: 'ps-prediction-serving.Z4', Name: 'Z4: every scored record has a Model row whose lineage joins its run and model',
        Fn: async (ctx) => {
            const f = PsPredictionServing.Fixture();
            if (f.Run.Status !== 'completed') throw new Error('Z4: the Setup run did not complete');
            const runId = `'${EscapeSQLString(f.Run.ScoringRunID)}'`;
            const [values, runs, models] = await RunView.FromMetadataProvider(ctx.Provider).RunViews<LineageValueRow | LineageRunRow | LineageModelRow>([
                { EntityName: 'MJ: Feature Values', ExtraFilter: `Source = 'Model' AND MLScoringRunID = ${runId}`, Fields: ['ID', 'RecordID', 'MLModelID', 'MLScoringRunID', 'EffectiveAsOf'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
                { EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `ID = ${runId}`, Fields: ['ID', 'ModelID', 'ArtifactSha256', 'AsOfDate'], ResultType: 'simple', BypassCache: true },
                { EntityName: 'MJ: ML Models', ExtraFilter: `ID = '${EscapeSQLString(f.ModelID)}'`, Fields: ['ID', 'ArtifactSha256'], ResultType: 'simple', BypassCache: true },
            ], ctx.User);
            const joined = ScoringLineage.Join(
                values.Results.filter((r): r is LineageValueRow => 'MLScoringRunID' in r),
                runs.Results.filter((r): r is LineageRunRow => 'AsOfDate' in r),
                models.Results.filter((r): r is LineageModelRow => !('MLScoringRunID' in r) && !('AsOfDate' in r)),
            );
            const scored = new UUIDSet(joined.filter((row) => ScoringLineage.Complete(row)).map((row) => row.Value.RecordID));
            AssertEqual(f.RecordIDs.filter((id) => scored.Has(id)).length, RECORDS, `Z4: every scored record's lineage joins (${joined.map((row) => ScoringLineage.Lacks(row)).join('; ')})`);
        },
    },
    {
        Id: 'ps-prediction-serving.Z5', Name: 'Z5: MJ: Latest Feature Values holds each scored record with no refresh call',
        Fn: async (ctx) => {
            const f = PsPredictionServing.Fixture();
            const latest = await latestByRecord(ctx, f.Binding.FeatureName);
            AssertEqual(f.RecordIDs.filter((id) => latest.get(id.toLowerCase()) === DAY3.toISOString()).length, RECORDS, 'Z5: each record\'s latest value is the run\'s');
        },
    },
    {
        Id: 'ps-prediction-serving.Z6', Name: 'Z6: a user without the binding\'s authorization reads no prediction from either entity and no panel card; the authorized user reads all',
        Fn: async () => {
            const f = PsPredictionServing.Fixture();
            const restricted = await PsPredictionServing.ReadModelRows(f.Identities.Restricted.Provider, f.Binding.FeatureName);
            const authorized = await PsPredictionServing.ReadModelRows(f.Identities.Authorized.Provider, f.Binding.FeatureName);
            AssertEqual(restricted.FeatureValues + restricted.LatestFeatureValues, 0, 'Z6: a user without the binding\'s authorization reads no prediction');
            AssertEqual(authorized.LatestFeatureValues, RECORDS, 'Z6: the authorized user reads every scored record');
            const restrictedPanel = await PsPredictionServing.PanelCards(f.Identities.Restricted.Provider, f.TargetEntityID, f.RecordIDs[0], f.Binding);
            const authorizedPanel = await PsPredictionServing.PanelCards(f.Identities.Authorized.Provider, f.TargetEntityID, f.RecordIDs[0], f.Binding);
            AssertEqual(restrictedPanel.Cards + restrictedPanel.ValuesReturned, 0, `Z6: the panel shows the restricted user nothing${restrictedPanel.ReadError ? ` (its read: ${restrictedPanel.ReadError})` : ''}`);
            AssertEqual(authorizedPanel.Cards, 1, `Z6: the panel shows the authorized user the prediction${authorizedPanel.ReadError ? ` (read error: ${authorizedPanel.ReadError})` : ''}`);
        },
    },
    {
        Id: 'ps-prediction-serving.Z7', Name: 'Z7: a same-asOf re-run keeps the row count and updates the values; a run failed at its second batch keeps its first',
        Fn: async (ctx) => {
            const f = PsPredictionServing.Fixture();
            const before = await modelRows(ctx, f.Binding.ID);
            const sidecar = new ServingSidecar();
            sidecar.Offset = 0.05;
            const rerun = await score(ctx, f, f.Binding, DAY3, sidecar);
            AssertEqual(rerun.Status, 'completed', 'Z7: the re-run completed');
            const after = await modelRows(ctx, f.Binding.ID);
            AssertEqual(after.length, before.length, 'Z7: a same-asOf re-run adds no row (UQ_FeatureValue_ModelRow replaces in place)');
            const oldValue = new Map(before.map((r) => [r.RecordID.toLowerCase(), r.ValueNumeric]));
            Assert(after.every((r) => r.ValueNumeric !== oldValue.get(r.RecordID.toLowerCase())), 'Z7: every value was updated');
            const failing = new ServingSidecar();
            failing.FailCall = 2;
            const failed = await score(ctx, f, f.Binding, DAY5, failing, 2);
            AssertEqual(failed.Status, 'failed', 'Z7: the run fails at its second batch');
            const day5 = (await modelRows(ctx, f.Binding.ID)).filter((r) => r.EffectiveAsOf !== null && new Date(r.EffectiveAsOf).getTime() === DAY5.getTime());
            AssertEqual(day5.length, 2, 'Z7: the first batch\'s two rows are kept');
        },
    },
    {
        Id: 'ps-prediction-serving.Z8', Name: 'Z8: a backfill with an older asOf adds history, keeps the latest values and leaves another binding\'s column copy',
        Fn: async (ctx) => {
            const f = PsPredictionServing.Fixture();
            const copied = await score(ctx, f, f.CopyBinding, DAY3, new ServingSidecar());
            AssertEqual(copied.Status, 'completed', 'Z8: the copying binding scored');
            const columnBefore = await minScores(ctx, f.RecordIDs);
            Assert([...columnBefore.values()].every((v) => v !== null), 'Z8: the copying binding wrote its column');
            const latestBefore = await latestByRecord(ctx, f.Binding.FeatureName);
            const rowsBefore = (await modelRows(ctx, f.Binding.ID)).length;
            const older = new ServingSidecar();
            older.Offset = 0.2;
            AssertEqual((await score(ctx, f, f.Binding, DAY1, older)).Status, 'completed', 'Z8: the backfill completed');
            AssertEqual((await score(ctx, f, f.CopyBinding, DAY1, older)).Status, 'completed', 'Z8: the copying binding\'s backfill completed');
            AssertEqual((await modelRows(ctx, f.Binding.ID)).length, rowsBefore + RECORDS, 'Z8: the backfill adds one history row per record');
            AssertEqual(JSON.stringify([...(await latestByRecord(ctx, f.Binding.FeatureName)).entries()].sort()), JSON.stringify([...latestBefore.entries()].sort()), 'Z8: the latest values are unchanged');
            AssertEqual(JSON.stringify([...(await minScores(ctx, f.RecordIDs)).entries()].sort()), JSON.stringify([...columnBefore.entries()].sort()), 'Z8: the older backfill does not overwrite the column copy');
        },
    },
];

for (const c of PsPredictionServingChecks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-prediction-serving', {
    Setup: async (ctx) => {
        try {
            await setup(ctx);
        } catch (e) {
            console.warn(`      ⚠ IT180 setup: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
    Teardown: teardown,
});

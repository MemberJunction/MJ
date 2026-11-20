/**
 * ps-prediction-serving.checks.ts — the 'ps-prediction-serving' bundle, "IT183 - PS Prediction Serving — Zero Schema
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
    type BaseEntity, type IMetadataProvider, type RunViewResult, type UserInfo,
} from '@memberjunction/core';
import type {
    MJFeatureValueEntity, MJFileEntity, MJKnowledgeHubSavedSearchEntity, MJMLModelEntity, MJMLModelScoringBindingEntity,
    MJMLTrainingPipelineEntity, MJUserEntity, MJUserRoleEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    InMemoryArtifactLoader, LoadMLModelInferenceProcessor, PublishLocks, ScoringBindings, ScoringService,
    type IScoringModelRuntime, type IScoringPreparedModel, type ISidecarPredictor, type LoadedModel, type ScoringContext,
} from '@memberjunction/predictive-studio';
import {
    PredictionPanelQueries, resolveOutcomeConfig, type FeatureSchemaEntry, type PredictRequest, type PredictResponse, type ScoringResult,
} from '@memberjunction/predictive-studio-core';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { BuildSystemKeyProvider, BuildUserKeyProviderWithRetry, DeleteMintedUserKeys, MintFullAccessUserKey, type MintedUserKeyIds } from './fls-client.checks';
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
/** The tag of the Setup in progress, registered before its first write: the teardown removes its rows even when Setup failed. */
let setupTag: string | null = null;

// ------------------------------------------------------------------------------------------------ shared steps ----

/** The shared steps of IT183 and gate G5.6: the two wire identities, the gated reads, the panel replay, the fingerprint. */
export class PsPredictionServing {
    /** The bundle's fixture; throws when Setup did not build it. */
    public static Fixture(): ServingFixture {
        if (fixture === null) throw new Error('ps-prediction-serving: the bundle fixture was not built (Setup failed; see its log)');
        return fixture;
    }

    /**
     * Creates the restricted (UI role) and authorized (Developer role) scratch users, mints a user API key for each and
     * waits until each authenticates through MJAPI and reads `MJ: Latest Feature Values`. The users, roles, keys and
     * scope rules are written THROUGH MJAPI on a system-key connection, so MJAPI's own user and key-scope caches see
     * them at once (written in process on a server transport, MJAPI saw them only on its timed reload: IT183 Setup was
     * refused "No matching key scope rules" for over 200 s). When minting fails, whatever was created is released
     * before the error is rethrown (Setup's failure leaves no identity behind).
     */
    public static async MintIdentities(ctx: IntegrationCheckContext, tag: string): Promise<ServingIdentities> {
        const keys: MintedUserKeyIds = { CreatedKeyIds: [], CreatedScopeRuleIds: [] };
        const userIds: string[] = [];
        const wire = await BuildSystemKeyProvider();
        const make = async (label: string, roleName: string): Promise<ServingIdentity> => {
            const roleId = await PsPredictionServing.FirstId(ctx, 'MJ: Roles', `Name = '${EscapeSQLString(roleName)}'`);
            const email = `ps-serving-${label}-${Date.now()}@integration.test`;
            const user = await PsPredictionServing.CreateWireRow<MJUserEntity>(wire, 'MJ: Users', (u) => { u.Name = `${tag} ${label}`; u.Email = email; u.Type = 'User'; u.IsActive = true; });
            userIds.push(user.ID);
            await PsPredictionServing.CreateWireRow<MJUserRoleEntity>(wire, 'MJ: User Roles', (ur) => { ur.UserID = user.ID; ur.RoleID = roleId; });
            const raw = await MintFullAccessUserKey(ctx, keys, user.ID, `${tag} ${label}`, wire);
            const provider = await BuildUserKeyProviderWithRetry(raw);
            await WaitUntil(async () => (await PsPredictionServing.canRead(provider)), `${label} identity reads MJ: Latest Feature Values through MJAPI`, { TimeoutMs: IDENTITY_PROPAGATION_MS });
            return { UserID: user.ID, Email: email, Provider: provider };
        };
        try {
            const restricted = await make('restricted', 'UI');
            const authorized = await make('authorized', 'Developer');
            return { Restricted: restricted, Authorized: authorized, Keys: keys, UserIDs: userIds };
        } catch (e) {
            for (const warning of await PsPredictionServing.releaseCreated(ctx, keys, userIds)) console.warn(`      ⚠ ${tag}: ${warning}`);
            throw e;
        }
    }

    /**
     * Deletes the identities' keys, role rows and users, best effort: every step runs whatever an earlier one did, and
     * each failure is returned as a warning (teardown never throws).
     *
     * @returns what could not be released, one line each; empty when everything was
     */
    public static async ReleaseIdentities(ctx: IntegrationCheckContext, ids: ServingIdentities): Promise<string[]> {
        return PsPredictionServing.releaseCreated(ctx, ids.Keys, ids.UserIDs);
    }

    /** Deletes minted keys (with their scope rules and usage logs), then each user's role rows and the user; returns the failures. */
    private static async releaseCreated(ctx: IntegrationCheckContext, keys: MintedUserKeyIds, userIds: readonly string[]): Promise<string[]> {
        const warnings: string[] = [];
        try {
            await DeleteMintedUserKeys(ctx, keys);
        } catch (e) {
            warnings.push(`deleting the minted keys failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        for (const userId of userIds) {
            try {
                warnings.push(...(await PsPredictionServing.releaseUser(ctx, userId)));
            } catch (e) {
                warnings.push(`releasing user ${userId} failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return warnings;
    }

    /** Deletes one scratch user's role rows, then the user (a user whose role row stays is left active: say so). */
    private static async releaseUser(ctx: IntegrationCheckContext, userId: string): Promise<string[]> {
        const roles = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJUserRoleEntity>({ EntityName: 'MJ: User Roles', ExtraFilter: `UserID = '${EscapeSQLString(userId)}'`, ResultType: 'entity_object' }, ctx.User);
        if (!roles.Success) return [`reading user ${userId}'s role rows failed: ${roles.ErrorMessage || 'unknown error'}; the user and its roles are left`];
        const warnings: string[] = [];
        for (const r of roles.Results) {
            if (!(await r.Delete())) warnings.push(`user ${userId}'s role row ${r.ID} was not deleted: ${r.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
        const user = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
        if (!(await user.Load(userId))) return warnings;
        if (!(await user.Delete())) warnings.push(`user ${userId} was not deleted: ${user.LatestResult?.CompleteMessage || 'unknown error'}`);
        return warnings;
    }

    /** The feature's prediction rows each gated entity returns through `provider` (its key's identity). */
    public static async ReadModelRows(provider: IMetadataProvider, featureName: string): Promise<ModelRowReads> {
        const feature = `FeatureName = '${EscapeSQLString(featureName)}'`;
        const [values, latest] = await RunView.FromMetadataProvider(provider).RunViews<Pick<MJFeatureValueEntity, 'ID'>>([
            { EntityName: 'MJ: Feature Values', ExtraFilter: `${feature} AND Source = 'Model'`, Fields: ['ID'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
            { EntityName: 'MJ: Latest Feature Values', ExtraFilter: `${feature} AND Source = 'Model'`, Fields: ['ID'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
        ]);
        if (!values.Success || !latest.Success) throw new Error(`reading ${featureName}'s predictions failed: ${values.ErrorMessage || latest.ErrorMessage || 'unknown error'}`);
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

    /**
     * APPROVED EXCEPTION to "no direct DML on entities" (audit M5b-5): the teardown deletes by SQL. It must remove the
     * rows of a Setup that failed at any step, keyed only by its tag, and the entity layer refuses the steps it would
     * need — `MJMLModelScoringBindingEntityServer.Delete` refuses an Active binding and any binding a Feature Value still
     * names — so an entity-layer teardown would first have to withdraw each binding (clearing column copies, a scoring
     * side effect) and still could not run for a Setup that failed before its rows were read back. The rows are this
     * bundle's own fixtures (the tag carries "safe to delete"); no Record Change is wanted for them.
     *
     * The teardown's SQL for the rows a Setup tagged `tag` can have written, children before the rows they reference:
     * the Feature Values and scoring runs of the tagged bindings, the bindings, the models of the tagged pipelines, the
     * pipelines, the files and the target records. Keyed by the tag alone, so a Setup that failed before its fixture
     * was built leaves nothing behind (D4-230). `table` names an entity's `[schema].[table]`. Pure.
     */
    public static TeardownSql(tag: string, table: (entityName: string) => string): string {
        const like = `'${EscapeSQLString(tag)}%'`;
        const bindings = `SELECT ID FROM ${table('MJ: ML Model Scoring Bindings')} WHERE FeatureName LIKE ${like}`;
        const pipelines = `SELECT ID FROM ${table('MJ: ML Training Pipelines')} WHERE Name LIKE ${like}`;
        return [
            `DELETE FROM ${table('MJ: Feature Values')} WHERE MLModelScoringBindingID IN (${bindings})`,
            `DELETE FROM ${table('MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID IN (${bindings})`,
            `DELETE FROM ${table('MJ: ML Model Scoring Bindings')} WHERE FeatureName LIKE ${like}`,
            `DELETE FROM ${table('MJ: ML Models')} WHERE PipelineID IN (${pipelines})`,
            `DELETE FROM ${table('MJ: ML Training Pipelines')} WHERE Name LIKE ${like}`,
            `DELETE FROM ${table('MJ: Files')} WHERE Name LIKE ${like}`,
            `DELETE FROM ${table(TARGET)} WHERE Name LIKE ${like}`,
        ].join(';\n') + ';';
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

    /** Saves a new `entityName` row through MJAPI on `wire` (a system-key connection), as its current user; throws on failure. */
    public static async CreateWireRow<T extends BaseEntity>(wire: IMetadataProvider, entityName: string, fill: (row: T) => void): Promise<T> {
        const row = await wire.GetEntityObject<T>(entityName, wire.CurrentUser);
        row.NewRecord();
        fill(row);
        if (!(await row.Save())) throw new Error(`${entityName} did not save through MJAPI: ${row.LatestResult?.CompleteMessage}`);
        return row;
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

// -------------------------------------------------------------------------------------------- the IT183 world ----

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
        const index = new UUIDMap<number>();
        this.recordIds.forEach((id, i) => index.Set(id, i));
        const loaded: LoadedModel = {
            modelId: model.ID, targetEntityName: TARGET, artifactB64: Buffer.from(bytes).toString('base64'), fittedPreprocessing: {}, featureSchema: [...FEATURES],
            problemType: 'classification', targetVariable: 'Lapsed', sourceBindings: [], featureSteps: { Steps: [] }, asOf: { Mode: 'none' },
            leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 }, outcomeConfig: resolveOutcomeConfig(), unit: null, trainingRowIds: new UUIDSet(),
        };
        return {
            Loaded: loaded,
            Assemble: async (ids) => ({
                Status: 'assembled', Matrix: { columns: ['Tenure'], rows: ids.map((id) => [0.1 + (index.Get(id) || 0) / 10]) },
                Columns: [...FEATURES], HashColumns: null, RowIDs: [...ids],
            }),
        };
    }
}

/** `result` when it succeeded; throws naming `what` with the read's message when it failed or is missing. */
function succeeded<T>(result: RunViewResult<T> | undefined, what: string): RunViewResult<T> {
    if (!result?.Success) throw new Error(`${what} failed: ${result?.ErrorMessage || 'the view returned no result'}`);
    return result;
}

/** `[schema].[table]` of an entity. */
function tableOf(provider: IMetadataProvider, entityName: string): string {
    const entity = provider.EntityByName(entityName);
    if (!entity) throw new Error(`entity ${entityName} is not in metadata`);
    return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** The bundle's SQL provider (server transport). */
function sqlProvider(ctx: IntegrationCheckContext): DatabaseProviderBase {
    if (!(ctx.Provider instanceof DatabaseProviderBase)) throw new Error('IT183 runs on the server transport (Configuration.transport = "server")');
    return ctx.Provider;
}

/** Scores `binding` over `recordIds` on `asOf` as `ctx.User`, with `sidecar` and the batch size given; the run's clock reads `asOf` (the fixture model has no Prediction Unit, so it scores only its run date). */
function score(ctx: IntegrationCheckContext, f: Pick<ServingFixture, 'Artifacts' | 'RecordIDs'>, binding: MJMLModelScoringBindingEntity, asOf: Date, sidecar: ServingSidecar, batchSize?: number): Promise<ScoringResult> {
    const sc: ScoringContext = {
        ContextUser: ctx.User, Provider: ctx.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null,
        Seams: { Sidecar: sidecar, Runtime: new ServingRuntime(f.RecordIDs), ArtifactLoader: f.Artifacts, Clock: { Now: () => asOf }, ...(batchSize === undefined ? {} : { BatchSize: batchSize }) },
    };
    return new ScoringService(sc).Score(binding, { kind: 'record-ids', entity: TARGET, ids: [...f.RecordIDs] }, asOf, false);
}

/** The binding's Model rows, as the system identity reads them. */
async function modelRows(ctx: IntegrationCheckContext, bindingId: string): Promise<Pick<MJFeatureValueEntity, 'ID' | 'RecordID' | 'ValueNumeric' | 'EffectiveAsOf'>[]> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJFeatureValueEntity, 'ID' | 'RecordID' | 'ValueNumeric' | 'EffectiveAsOf'>>({
        EntityName: 'MJ: Feature Values', ExtraFilter: `MLModelScoringBindingID = '${EscapeSQLString(bindingId)}' AND Source = 'Model'`,
        Fields: ['ID', 'RecordID', 'ValueNumeric', 'EffectiveAsOf'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
    }, ctx.User);
    if (!r.Success) throw new Error(`reading binding ${bindingId}'s Model rows failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results;
}

/** The latest value of each record of `featureName`, as the system identity reads it, by record ID. */
async function latestByRecord(ctx: IntegrationCheckContext, featureName: string): Promise<UUIDMap<string>> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJFeatureValueEntity, 'RecordID' | 'EffectiveAsOf'>>({
        EntityName: 'MJ: Latest Feature Values', ExtraFilter: `FeatureName = '${EscapeSQLString(featureName)}'`, Fields: ['RecordID', 'EffectiveAsOf'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
    }, ctx.User);
    if (!r.Success) throw new Error(`reading ${featureName}'s latest values failed: ${r.ErrorMessage || 'unknown error'}`);
    const byRecord = new UUIDMap<string>();
    for (const row of r.Results) byRecord.Set(row.RecordID, row.EffectiveAsOf === null ? 'null' : new Date(row.EffectiveAsOf).toISOString());
    return byRecord;
}

/** The target records' `MinScore`, by record ID. */
async function minScores(ctx: IntegrationCheckContext, recordIds: readonly string[]): Promise<UUIDMap<number | null>> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJKnowledgeHubSavedSearchEntity, 'ID' | 'MinScore'>>({
        EntityName: TARGET, ExtraFilter: `ID IN (${recordIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`, Fields: ['ID', 'MinScore'], ResultType: 'simple', BypassCache: true,
    }, ctx.User);
    if (!r.Success) throw new Error(`reading ${TARGET} failed: ${r.ErrorMessage || 'unknown error'}`);
    const byRecord = new UUIDMap<number | null>();
    for (const row of r.Results) byRecord.Set(row.ID, row.MinScore === null ? null : Number(row.MinScore));
    return byRecord;
}

/** Builds the world: fingerprint, pipeline, Published model, records, two bindings, one scoring run, the two identities. */
async function setup(ctx: IntegrationCheckContext): Promise<void> {
    fixture = null;
    const tag = `IT183 ${Date.now()} ${TAG_SUFFIX}`;
    setupTag = tag;
    const before = await PsPredictionServing.Fingerprint(ctx.Provider, ctx.User);
    const targetEntityId = ctx.Provider.EntityByName(TARGET)?.ID;
    if (!targetEntityId) throw new Error(`${TARGET} is not in metadata`);
    const published = await createPublishedModel(ctx, tag, targetEntityId);
    const recordIds: string[] = [];
    for (let i = 0; i < RECORDS; i++) {
        recordIds.push((await PsPredictionServing.CreateRow<MJKnowledgeHubSavedSearchEntity>(ctx, TARGET, (t) => { t.Name = `${tag} r${i}`; t.UserID = ctx.User.ID; t.Query = tag; })).ID);
    }
    const binding = await createBinding(ctx, tag, published.PipelineID, targetEntityId, 'renewal', null);
    const copyBinding = await createBinding(ctx, tag, published.PipelineID, targetEntityId, 'copied', 'MinScore');
    const run = await score(ctx, { Artifacts: published.Artifacts, RecordIDs: recordIds }, binding, DAY3, new ServingSidecar());
    const identities = await PsPredictionServing.MintIdentities(ctx, tag);
    fixture = {
        Tag: tag, TargetEntityID: targetEntityId, PipelineID: published.PipelineID, ModelID: published.ModelID, Artifacts: published.Artifacts, RecordIDs: recordIds,
        Binding: binding, CopyBinding: copyBinding, Before: before, Run: run, Identities: identities,
    };
}

/** The fixture pipeline and its Published model, with the model's artifact held in memory. */
interface PublishedFixtureModel {
    readonly PipelineID: string;
    readonly ModelID: string;
    readonly Artifacts: InMemoryArtifactLoader;
}

/**
 * Creates the pipeline tagged `tag` and its model, and places the model Published with a registered artifact.
 *
 * APPROVED EXCEPTION to "no direct DML on entities" (audit M5b-5), as IT166's fixture: `Status` is the lifecycle gate's
 * to write — the PreSave status guard re-derives every move into `Published` from the model's stored training and
 * evaluation evidence — and the deterministic tier has no sidecar, so nothing is trained and no evidence exists for the
 * gate to accept. G5.6 (mutation tier) publishes the trained C1 model through the gate itself.
 */
async function createPublishedModel(ctx: IntegrationCheckContext, tag: string, targetEntityId: string): Promise<PublishedFixtureModel> {
    const provider = sqlProvider(ctx);
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
        undefined, { isMutation: true, description: 'IT183: place the fixture model Published outside the lifecycle gate (no sidecar in this tier)' }, undefined,
    );
    return { PipelineID: pipeline.ID, ModelID: model.ID, Artifacts: artifacts };
}

/** An Active OnDemand binding of the fixture pipeline, feature `<tag> <label>`, copying into `column` when given. */
function createBinding(ctx: IntegrationCheckContext, tag: string, pipelineId: string, targetEntityId: string, label: string, column: string | null): Promise<MJMLModelScoringBindingEntity> {
    const viewAuthorizationId = ScoringBindings.ResolveViewAuthorizationID(null, ctx.Provider);
    return PsPredictionServing.CreateRow<MJMLModelScoringBindingEntity>(ctx, 'MJ: ML Model Scoring Bindings', (b) => {
        b.MLTrainingPipelineID = pipelineId; b.FeatureName = `${tag} ${label}`; b.TargetEntityID = targetEntityId; b.Mode = 'OnDemand'; b.Status = 'Active';
        b.ViewAuthorizationID = viewAuthorizationId; b.TargetColumn = column; b.TargetColumnSource = column === null ? null : '$.AdverseProbability';
    });
}

/**
 * Deletes the world, children first (the binding refuses an entity delete before withdrawal, so this is SQL), by the
 * Setup's tag: whatever a Setup wrote is removed even when it failed before building the fixture (D4-230). A failed
 * Setup's identities were already released by `MintIdentities`.
 */
async function teardown(ctx: IntegrationCheckContext): Promise<void> {
    const f = fixture;
    const tag = f !== null ? f.Tag : setupTag;
    fixture = null;
    setupTag = null;
    if (tag === null) return;
    // Two independent steps: a failed identity release never skips the fixture cleanup.
    if (f !== null) {
        try {
            for (const warning of await PsPredictionServing.ReleaseIdentities(ctx, f.Identities)) console.warn(`      ⚠ IT183 teardown: ${warning}`);
        } catch (e) {
            console.warn(`      ⚠ IT183 teardown (identities): ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    try {
        const provider = sqlProvider(ctx);
        await provider.ExecuteSQL(PsPredictionServing.TeardownSql(tag, (entityName) => tableOf(provider, entityName)), undefined, { isMutation: true, description: 'IT183: delete its fixtures' }, undefined);
    } catch (e) {
        console.warn(`      ⚠ IT183 teardown (fixtures): ${e instanceof Error ? e.message : String(e)}`);
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
            Assert(r.Success, `Z1: reading the fixture model failed: ${r.ErrorMessage || 'unknown error'}`);
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
            const results = await RunView.FromMetadataProvider(ctx.Provider).RunViews([
                { EntityName: 'MJ: Feature Values', ExtraFilter: `Source = 'Model' AND MLScoringRunID = ${runId}`, Fields: ['ID', 'RecordID', 'MLModelID', 'MLScoringRunID', 'EffectiveAsOf'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
                { EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `ID = ${runId}`, Fields: ['ID', 'ModelID', 'ArtifactSha256', 'AsOfDate'], ResultType: 'simple', BypassCache: true },
                { EntityName: 'MJ: ML Models', ExtraFilter: `ID = '${EscapeSQLString(f.ModelID)}'`, Fields: ['ID', 'ArtifactSha256'], ResultType: 'simple', BypassCache: true },
            ], ctx.User);
            // RunViews answers in request order: the values, the run, the model.
            const values = succeeded<LineageValueRow>(results[0], 'Z4: reading the lineage values');
            const runs = succeeded<LineageRunRow>(results[1], 'Z4: reading the lineage run');
            const models = succeeded<LineageModelRow>(results[2], 'Z4: reading the lineage model');
            const joined = ScoringLineage.Join(values.Results, runs.Results, models.Results);
            const scored = new UUIDSet(joined.filter((row) => ScoringLineage.Complete(row)).map((row) => row.Value.RecordID));
            AssertEqual(f.RecordIDs.filter((id) => scored.Has(id)).length, RECORDS, `Z4: every scored record's lineage joins (${joined.map((row) => ScoringLineage.Lacks(row)).join('; ')})`);
        },
    },
    {
        Id: 'ps-prediction-serving.Z5', Name: 'Z5: MJ: Latest Feature Values holds each scored record with no refresh call',
        Fn: async (ctx) => {
            const f = PsPredictionServing.Fixture();
            const latest = await latestByRecord(ctx, f.Binding.FeatureName);
            AssertEqual(f.RecordIDs.filter((id) => latest.Get(id) === DAY3.toISOString()).length, RECORDS, 'Z5: each record\'s latest value is the run\'s');
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
            AssertEqual(after.length, before.length, 'Z7: a same-asOf re-run adds no row (the writer replaces each row on its Model-row key in place)');
            const oldValue = new UUIDMap<number | null>();
            for (const r of before) oldValue.Set(r.RecordID, r.ValueNumeric);
            Assert(after.every((r) => r.ValueNumeric !== oldValue.Get(r.RecordID)), 'Z7: every value was updated');
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
            Assert([...columnBefore.Values()].every((v) => v !== null), 'Z8: the copying binding wrote its column');
            const latestBefore = await latestByRecord(ctx, f.Binding.FeatureName);
            const rowsBefore = (await modelRows(ctx, f.Binding.ID)).length;
            const older = new ServingSidecar();
            older.Offset = 0.2;
            AssertEqual((await score(ctx, f, f.Binding, DAY1, older)).Status, 'completed', 'Z8: the backfill completed');
            AssertEqual((await score(ctx, f, f.CopyBinding, DAY1, older)).Status, 'completed', 'Z8: the copying binding\'s backfill completed');
            AssertEqual((await modelRows(ctx, f.Binding.ID)).length, rowsBefore + RECORDS, 'Z8: the backfill adds one history row per record');
            AssertEqual(JSON.stringify([...(await latestByRecord(ctx, f.Binding.FeatureName))].sort()), JSON.stringify([...latestBefore].sort()), 'Z8: the latest values are unchanged');
            AssertEqual(JSON.stringify([...(await minScores(ctx, f.RecordIDs))].sort()), JSON.stringify([...columnBefore].sort()), 'Z8: the older backfill does not overwrite the column copy');
        },
    },
];

for (const c of PsPredictionServingChecks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-prediction-serving', {
    Setup: async (ctx) => {
        try {
            await setup(ctx);
        } catch (e) {
            console.warn(`      ⚠ IT183 setup: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
    Teardown: teardown,
});

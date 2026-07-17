/**
 * check.ts — the integration-check contract.
 *
 * A check is a FUNCTION that THROWS on failure (the harness Assert* helpers throw)
 * and RETURNS on pass. Bodies are lifted verbatim from the tsx harness, so
 * migration is a lift-and-register, not a rewrite. The IntegrationTestDriver wraps
 * each check in try/catch and maps the outcome onto an OracleResult — there is no
 * separate per-check result interface.
 */
import type { UserInfo, IMetadataProvider, RowLevelSecurityFilterInfo } from '@memberjunction/core';
import type {
    MJQueryEntity,
    MJQueryCategoryEntity,
    MJRecordProcessEntity,
    MJScheduledJobEntity,
    MJTemplateEntity,
    MJTemplateContentEntity,
    MJAISkillEntity,
    MJRemoteOperationEntity,
    MJMLTrainingPipelineEntity,
    MJMLModelEntity,
    MJMLModelScoringBindingEntity,
    MJUserRoutineEntity
} from '@memberjunction/core-entities';
import type sql from 'mssql';
import type { InstrumentedLocalStorageProvider } from './instrumented-cache';

/**
 * The self-contained Query/Category fixtures the `runquery-cache` bundle needs:
 * one Query Category and two Queries (TTL-mode + smart-validation-mode), created
 * before the bundle's checks run and torn down afterwards. Lifted from
 * runquery-cache-tests.ts's Ctx; threaded onto IntegrationCheckContext.Fixtures so
 * the Q-checks read them identically whether driven by the driver or the tsx script.
 */
export interface RunQueryFixtures {
    /** "Integration Test Queries <ts>" category owning the fixture queries. */
    Category: MJQueryCategoryEntity;
    /** Query WITHOUT CacheValidationSQL → TTL caching mode. */
    TtlQuery: MJQueryEntity;
    /** Query WITH CacheValidationSQL → smart-validation caching mode. */
    ValidatedQuery: MJQueryEntity;
}

/**
 * Two users with DIFFERENT effective Row-Level-Security predicates for the same
 * entity, DISCOVERED (never minted) from the provider's RLS filters + the user
 * cache by the `rls-isolation` bundle. Discovery has the safest possible teardown:
 * nothing to delete. When the deployment has only RLS-exempt admins (no two users
 * with distinct non-empty clauses), `Usable` is false and the RLS checks degrade
 * gracefully (skip-as-pass with a logged note) rather than failing.
 */
export interface RlsFixture {
    /** First discovered non-exempt user. */
    UserA: UserInfo;
    /** Second discovered non-exempt user, with a DIFFERENT effective RLS clause than UserA. */
    UserB: UserInfo;
    /** The RLS-protected entity both users can Read but with different effective predicates. */
    EntityName: string;
    /** True iff discovery found two distinct users with DIFFERENT non-empty Read RLS clauses. */
    Usable: boolean;
    /** Why the fixture is unusable (for the skip note), when Usable is false. */
    Reason?: string;
    /**
     * A `{{UserID}}`-scoped RLS filter discovered from the provider's RowLevelSecurityFilters,
     * for the token-substitution (RLS1) and distinct-predicate-text (RLS2) checks. Present
     * independently of `Usable` — those checks only need a `{{UserID}}` filter (+ one or two
     * distinct users), NOT two divergent effective clauses. Undefined ⇒ those checks skip-as-pass.
     */
    TokenFilter?: RowLevelSecurityFilterInfo;
    /**
     * A single non-exempt (user, entity) pair — a user with a NON-empty effective Read clause
     * for that entity — for the live-RunView scoping check (RLS5). Present independently of the
     * two-user `Usable` flag (needs only one non-exempt user). Undefined ⇒ RLS5 skips-as-pass.
     */
    LivePair?: { User: UserInfo; EntityName: string };
    /**
     * The two seeded, purpose-built RLS test users (`it-rls-a@` / `it-rls-b@integration.test`), each in
     * ONLY the "Integration Test: RLS Scoped Reader" role — so both are genuinely scoped (non-exempt) on
     * `MJ: AI Agent Runs`. Resolved by email from the user cache. When present, the deterministic checks
     * RLS8/RLS9 exercise real multi-user isolation without depending on which pair discovery happens to
     * pick; undefined (seed not pushed) ⇒ those checks skip-as-pass.
     */
    SeededScopedA?: UserInfo;
    SeededScopedB?: UserInfo;
    /**
     * The seeded no-grant test user (`it-nogrant@integration.test`, no roles) — has NO read permission on
     * `MJ: AI Agent Runs`, for the negative isolation check RLS10 (a user with no grant is served no rows).
     * Replaces the incidental reliance on `anonymous@magic-link.local`. Undefined ⇒ RLS10 skips-as-pass.
     */
    SeededNoGrant?: UserInfo;
}

/** An accumulator of `{ entity, id }` rows a mutating bundle created and must delete in FK-safe order. */
export interface CreatedRow {
    entity: string;
    id: string;
}

/** Minimal shape of a cached catalog entry (Action / Agent) the ai-skills fixture references by id + name. */
export interface NamedRef {
    ID: string;
    Name: string;
}

/**
 * Shared fixture for the `record-process-facade` bundle: one real `MJ: Record Processes`
 * definition (0-row Filter scope, deterministic) reused by both checks, plus the ProcessRun
 * IDs the checks create (appended at run time) so teardown can remove them before the process.
 */
export interface RecordProcessFacadeFixture {
    Rp: MJRecordProcessEntity;
    CreatedRunIds: string[];
}

/**
 * Shared fixture for the `scheduled-jobs` bundle: one real `MJ: Scheduled Jobs` row (pointed at a
 * missing Record Process so its driver fails fast + deterministically) reused across the ordered
 * SJ1→SJ2 lifecycle checks. SchedulingEngine is a singleton accessed directly by the checks.
 */
export interface ScheduledJobsFixture {
    Job: MJScheduledJobEntity;
}

/**
 * Shared fixture for the `field-rules-bulk-update` bundle: the resolved entity ID + the IDs of the
 * three throwaway `MJ: Action Categories` created in setup and reused across the ordered FR1→FR3 checks.
 */
export interface FieldRulesFixture {
    EntityID: string;
    Ids: string[];
}

/**
 * Shared fixture for the `remote-operations` bundle: a throwaway Template (+ Text content), a
 * FieldRules Record Process, and two Action Categories, reused across the ordered RO1→RO7 checks.
 * `ControlRunID` is set by RO6 and consumed by RO7 (the control-op run).
 */
export interface RemoteOpsFixture {
    Tmpl: MJTemplateEntity;
    Content: MJTemplateContentEntity;
    Rp: MJRecordProcessEntity;
    CatIds: string[];
    ActEntity: string;
    ControlRunID?: string;
}

/**
 * Shared fixture for the `ai-skills` bundle: the four skills + referenced FKs created/resolved in
 * setup, plus the mutable teardown accumulators the checks append to (import checks create new skills
 * that must be tracked). Deleted in FK-safe order: run steps+runs, grants, junctions, permissions, skills.
 */
export interface AiSkillsFixture {
    SkillActive: MJAISkillEntity;
    SkillDeprecated: MJAISkillEntity;
    SkillOpen: MJAISkillEntity;
    SkillAuto: MJAISkillEntity;
    AnyAction: NamedRef;
    BundledSubAgent: NamedRef;
    GrantTargetAgent: NamedRef;
    CreatedSkillIds: string[];
    CreatedJunctionRows: CreatedRow[];
    CreatedGrantIds: string[];
    CreatedPermissionIds: string[];
    CreatedRunFixtures: CreatedRow[];
}

/**
 * Shared fixture for the `predictive-studio` bundle: a Pipeline → Model → Scoring Binding lineage chain
 * (+ resolved FKs) created in setup and reused across the ordered PS1–PS5 seam checks, deleted child→parent.
 */
export interface PredictiveStudioFixture {
    Pipeline: MJMLTrainingPipelineEntity;
    Model: MJMLModelEntity;
    Binding: MJMLModelScoringBindingEntity;
    TargetEntityID: string;
    AlgorithmID: string;
}

/**
 * Shared fixture for the `remote-op-ai-authoring` bundle (live-model): one `MJ: Remote Operations` row
 * (GenerationType='AI') created in setup and reused across the ordered RO4-1→RO4-3 checks (save→approve→emit),
 * deleted after.
 */
export interface RemoteOpAiAuthoringFixture {
    Op: MJRemoteOperationEntity;
}

/**
 * Shared fixture for the `remote-op-wire-progress` bundle (client transport, needs MJAPI): a FieldRules
 * Record Process + two Action Categories created over the wire and torn down after the WIRE1 check.
 */
export interface RemoteOpWireProgressFixture {
    Rp: MJRecordProcessEntity;
    CatIds: string[];
}

/**
 * Shared fixture for the `lists` bundle: one throwaway `MJ: Lists` row + its members (`MJ: List Details`),
 * created in setup and reused across the ordered LS1–LS3 keyset-pagination checks, deleted after.
 */
export interface ListsFixture {
    ListID: string;
}

/**
 * Shared fixture for the `open-app-teardown` bundle: the throwaway `__mj` metadata rows seeded for the
 * teardown scenario (a used app's SchemaInfo/Entity/EntityField + a blocking RecordChange + a link-less
 * nav Application), reused by OAT1/OAT2 and removed in FK-safe order in teardown.
 */
export interface OpenAppTeardownFixture {
    AppSchema: string;
    EntityID: string;
    FieldID: string;
    RecordChangeID: string;
    ApplicationID: string;
    Tag: string;
}

/**
 * Shared fixture for the `user-routines` bundle: the resolved (never-mutated) 'Calculate Expression'
 * Action target, the mutable FK-safe teardown accumulators, and the cross-check routine references the
 * ordered UR1–UR16 checks read/append (e.g. RoutineDue set by UR9, run by UR10/11, deleted by UR14).
 */
export interface UserRoutinesFixture {
    CalcActionID: string;
    CreatedRoutineIds: string[];
    CreatedRecipientIds: string[];
    OrphanedActionLogIds: string[];
    OrphanedRunIds: string[];
    CreatedConversationIds: string[];
    RoutineDue?: MJUserRoutineEntity;
    RoutineFutureStart?: MJUserRoutineEntity;
    RoutineSunset?: MJUserRoutineEntity;
    RoutineSeed?: MJUserRoutineEntity;
    FirstRunId?: string | null;
}

/** The bootstrapped, run-scoped real provider stack handed to every check. */
export interface IntegrationCheckContext {
    /** Resolved context user threaded from the engine (server) or bootstrap. */
    User: UserInfo;
    /** Run-scoped provider — SQLServerDataProvider (server) or GraphQLDataProvider (client). */
    Provider: IMetadataProvider;
    /** Instrumented cache wrapper: per-category Get/Set counters; ResetCounts(). */
    Storage: InstrumentedLocalStorageProvider;
    /** Present for server-side bundles that need raw SQL fixtures; undefined for client bundles. */
    Pool?: sql.ConnectionPool;
    /** Core schema (e.g. '__mj') for fixture SQL that references views directly. */
    Schema?: string;
    /** Bundle-specific setup state populated by the driver/script before the bundle runs. */
    Fixtures?: RunQueryFixtures;
    /** Discovered two-user RLS fixture for the `rls-isolation` bundle (suite-scoped). */
    RlsFixture?: RlsFixture;
    /** Shared fixture for the `record-process-facade` bundle (setup → checks → teardown). */
    RpFacadeFixture?: RecordProcessFacadeFixture;
    /** Shared fixture for the `scheduled-jobs` bundle. */
    ScheduledJobsFixture?: ScheduledJobsFixture;
    /** Shared fixture for the `field-rules-bulk-update` bundle. */
    FieldRulesFixture?: FieldRulesFixture;
    /** Shared fixture for the `remote-operations` bundle. */
    RemoteOpsFixture?: RemoteOpsFixture;
    /** Shared fixture for the `ai-skills` bundle. */
    AiSkillsFixture?: AiSkillsFixture;
    /** Shared fixture for the `predictive-studio` bundle. */
    PredictiveStudioFixture?: PredictiveStudioFixture;
    /** Shared fixture for the `remote-op-ai-authoring` bundle (live-model). */
    RemoteOpAiAuthoringFixture?: RemoteOpAiAuthoringFixture;
    /** Shared fixture for the `remote-op-wire-progress` bundle (client transport). */
    RemoteOpWireProgressFixture?: RemoteOpWireProgressFixture;
    /** Shared fixture for the `lists` bundle. */
    ListsFixture?: ListsFixture;
    /** Shared fixture for the `open-app-teardown` bundle. */
    OpenAppTeardownFixture?: OpenAppTeardownFixture;
    /** Shared fixture for the `user-routines` bundle. */
    UserRoutinesFixture?: UserRoutinesFixture;
    /**
     * The opaque per-selector `config` bag from `Test.Configuration.checks[].config`,
     * set by the driver/script before each bundle runs. Bundles read their own keys
     * from it (e.g. `dataset-cache` reads `datasetName`, `aggregates-cache` reads
     * `entityName`) with sensible defaults when absent.
     */
    Config?: Record<string, unknown>;
}

/**
 * A single integration check. THROWS on failure (the harness Assert* helpers
 * throw); returns on pass.
 */
export type IntegrationCheckFn = (ctx: IntegrationCheckContext) => Promise<void>;

/** A registered check. Id is '<bundle>.<localId>', e.g. 'server-cache.S1'. */
export interface NamedCheck {
    Id: string;
    Name: string;
    Fn: IntegrationCheckFn;
    /** Gated tier — runs only when RUN_MUTATION_TESTS is set (mutation-active checks). */
    RequiresMutation?: boolean;
    /** Gated tier — runs only when RUN_AGENT_TESTS is set (live-model checks). */
    RequiresLiveModel?: boolean;
}

/**
 * Bundle-scoped setup/teardown for a mutating bundle. Setup creates the shared fixture and assigns
 * it onto the context (e.g. `ctx.AiSkillsFixture = ...`); Teardown removes everything the bundle
 * created in FK-safe order. The driver and the standalone dispatcher scripts both wrap a bundle's
 * checks in `Setup` → run → `Teardown` (guaranteed finally), so the two front-ends share one
 * definition. Teardown must be best-effort (never throw) so a check failure still cleans up.
 */
export interface BundleLifecycle {
    Setup(ctx: IntegrationCheckContext): Promise<void>;
    Teardown(ctx: IntegrationCheckContext): Promise<void>;
}

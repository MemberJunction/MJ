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
    MJConversationEntity,
    MJConversationDetailEntity,
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
    /**
     * The effective Read RLS clauses discovery actually compared to set `Usable` — UserA's and
     * UserB's, in that order. Empty strings when `Usable` is false.
     *
     * Carried on the fixture rather than left to be re-derived by each check, because discovery runs
     * ONCE per suite against the SERVER provider while client-transport checks hold a Network
     * provider that does not reproduce these clauses (it returns empty for every user). A check that
     * re-derived them there saw two identical clauses and reported a cache leak that did not exist.
     */
    ClauseA: string;
    ClauseB: string;
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
 * Shared fixture for the `entity-writes` bundle: the resolved entity IDs the write-side checks need
 * plus the FK-safe teardown accumulators. Nothing is created in Setup — each mutating check creates
 * exactly the throwaway rows it needs and appends their IDs here, so teardown can delete them in
 * REVERSE creation order (children before parents, which is FK-safe for the self-referencing
 * `MJ: Action Categories.ParentID`). `StartedAtIso` bounds the Record Changes query window so RC
 * fidelity never has to scan the entity's whole history.
 */
export interface EntityWritesFixture {
    /** `EntityInfo.ID` of `MJ: Action Categories` — the low-risk throwaway fixture entity. */
    ActionCategoryEntityID: string;
    /** `EntityInfo.ID` of `MJ: Record Changes` — for the "versioning does not version itself" leg. */
    RecordChangeEntityID: string;
    /** Unique per-run name prefix stamped on every fixture row. */
    Prefix: string;
    /** ISO instant captured before any fixture write — the lower bound of the Record Changes window. */
    StartedAtIso: string;
    /** Every `MJ: Action Categories` row the bundle created, in creation order. */
    CategoryIds: string[];
    /** Every `MJ: Lists` row the bundle created, in creation order. */
    ListIds: string[];
    /** EW9's conversation fixtures (details swept before conversations). */
    ConversationIds?: string[];
    ConversationDetailIds?: string[];
}

/**
 * Shared accumulator fixture for the `entity-graph-client` bundle (client transport, mutating).
 *
 * Setup creates nothing — it only resolves the two ids the checks need to reference, so a
 * deterministic-only run writes no rows at all. Each mutating check appends what it created, and
 * Teardown sweeps FK-safe: `AgentPromptIds` before `AgentIds`, since a prompt row references its
 * agent.
 */
export interface EntityGraphClientFixture {
    /** Unique per-run name prefix stamped on every fixture agent. */
    Prefix: string;
    /**
     * Two DISTINCT existing `MJ: AI Prompts` ids — the required FK on every child row the bundle
     * stages. Two, not one, because `UQ_AIAgentPrompt_Agent_Prompt_Config` is unique on
     * (AgentID, PromptID, ConfigurationID): staging the same prompt twice on one agent would fail
     * the constraint rather than the behavior under test.
     */
    PromptIDs: string[];
    /** An existing `MJ: AI Agent Types` id, when one exists. Optional on the schema, and leaving it
     *  unset also skips the server subclass's TypeConfiguration validation, which is not under test. */
    AgentTypeID?: string;
    /** Every `MJ: AI Agents` row the bundle created, in creation order. */
    AgentIds: string[];
    /** Every `MJ: AI Agent Prompts` row the bundle created, in creation order. */
    AgentPromptIds: string[];
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

/**
 * Shared fixture for the `permission-engine` bundle's MUTATION checks only (PE11/PE12). Setup is
 * gated on `IsTierEnabled('mutation')`, so on the deterministic path this fixture is undefined and
 * those two checks skip-as-pass — PE1–PE10 are entirely read-only. The rows are two throwaway
 * `MJ: Permission Domains` records: one naming a class that is NEVER registered (proving an
 * unresolvable domain is skipped, not fatal) and one naming a deliberately-throwing provider
 * (proving the `GetAllUserPermissions` fan-out is fault-isolated).
 */
export interface PermissionEngineFixture {
    /** Name of the domain row whose `ProviderClassName` is never registered on the ClassFactory. */
    UnresolvableDomainName: string;
    /** Name of the domain row bound to the deliberately-throwing provider class. */
    ThrowingDomainName: string;
    /** Every domain Name this bundle created — used to exclude them when auditing REAL domains. */
    CreatedDomainNames: string[];
    /** IDs of the created domain rows, deleted in a best-effort Teardown. */
    CreatedDomainIds: string[];
}

/**
 * Shared fixture for the `transaction-groups` bundle (client transport, mutating): the resolved
 * `MJ: Action Categories` entity ID plus the unique per-run name prefix stamped on every fixture
 * row. Teardown sweeps ALL categories whose Name starts with the prefix (children before parents),
 * so even a check that fails mid-transaction — or a pre-fix scope-bypass run that leaked a row —
 * cannot orphan fixtures. The TG4 API-key fixtures (key + scope rules + usage logs) self-clean
 * inside the check's own try/finally, mirroring the `api-keys` bundle's AK3.
 */
export interface TransactionGroupsFixture {
    /** `EntityInfo.ID` of `MJ: Action Categories` — the low-risk throwaway fixture entity. */
    ActionCategoryEntityID: string;
    /** Unique per-run name prefix stamped on every fixture row (swept by teardown via LIKE). */
    Prefix: string;
}

/**
 * Shared fixture for the `templates` bundle: one throwaway `MJ: Templates` row (+ its Text
 * `MJ: Template Contents` and the two `MJ: Template Params` created in setup — a required
 * param and a defaulted param) rendered through the REAL TemplateEngineServer by the ordered
 * TP checks. Teardown deletes params (including any the render pipeline auto-extracted),
 * then content, then the template (FK-safe order).
 */
export interface TemplatesFixture {
    /** The throwaway `MJ: Templates` fixture row (Name carries the unique run prefix). */
    Template: MJTemplateEntity;
    /** The Text-type `MJ: Template Contents` row holding the fixture template body. */
    Content: MJTemplateContentEntity;
    /** The exact template body written to Content.TemplateText (round-trip baseline). */
    TemplateText: string;
    /** Unique per-run name for FindTemplate lookups. */
    TemplateName: string;
    /** IDs of the `MJ: Template Params` rows created in setup (teardown also sweeps auto-extracted ones). */
    ParamIds: string[];
}

/**
 * Shared fixture for the `communication` bundle (DryRun end-to-end): the Active communication
 * provider (+ message type) selected from live metadata whose provider class is registered on
 * the ClassFactory, plus the unique per-run subject marker used to find (and tear down) the
 * Communication Run/Log audit rows the dry-run send creates. `Provider` is undefined when the
 * deployment has no usable provider — the checks then skip-as-pass loudly.
 */
export interface CommunicationFixture {
    /** Name of the selected Active provider (undefined ⇒ checks skip-as-pass). */
    ProviderName?: string;
    /** Name of the selected provider message type. */
    MessageTypeName?: string;
    /** Why no provider was usable (for the skip note), when ProviderName is undefined. */
    SkipReason?: string;
    /** Unique per-run subject marker stamped on the dry-run message for audit-row lookup + teardown. */
    SubjectMarker: string;
    /** Communication Log IDs discovered/created by the checks (torn down best-effort). */
    LogIds: string[];
    /** Communication Run IDs discovered/created by the checks (torn down best-effort, after logs). */
    RunIds: string[];
    /** Set by CM2 (the dry-run send) for CM3's audit assertions. */
    DryRunResultSuccess?: boolean;
    DryRunResultMarked?: boolean;
}

/** The bootstrapped, run-scoped real provider stack handed to every check. */
/**
 * Accumulator fixture for the `conversation-compaction` bundle (CC1–CC10, graduated from
 * conversation-compaction-tests.ts / PR #2732). Unlike the create-up-front fixtures above,
 * compaction fixtures are created INSIDE the ordered checks (CC1 creates the conversation the
 * CC2–CC7 window checks then reuse), so the lifecycle's job is accumulation + guaranteed
 * FK-ordered teardown (steps → runs → details → conversations), not up-front setup.
 * `AgentRuns`/`Steps` are typed as BaseEntity-compatible records via their entity interfaces'
 * Delete surface only — the bundle stores the extended AI entities it created.
 */
export interface ConversationCompactionFixture {
    /** Conversation + ordered detail rows, per fixture conversation created by a check. */
    Conversations: Array<{ Conversation: MJConversationEntity; Details: MJConversationDetailEntity[] }>;
    /** Tagged MJ: AI Agent Runs fixture rows (deleted before conversations). */
    AgentRuns: Array<{ Delete(): Promise<boolean> }>;
    /** Tagged MJ: AI Agent Run Steps fixture rows (deleted first). */
    Steps: Array<{ Delete(): Promise<boolean> }>;
}

/**
 * Shared fixture for the `agent-skills-live` bundle (SL1–SL5, live-model): the resolved IT: Probe
 * Skill ID + the run IDs the checks create over real agent runs. Every AI Agent Run the bundle
 * spawns (initial + any resumed) is accumulated here so teardown can FK-order-delete its steps,
 * any MJ: AI Agent Requests rows, and the run itself. No skills/agents are mutated — the roster is
 * seeded metadata, referenced read-only.
 */
export interface AgentSkillsLiveFixture {
    /** Resolved ID of the seeded 'IT: Probe Skill' (RequestedOnly, bundles Calculate Expression). */
    ProbeSkillID: string;
    /** Every AI Agent Run this bundle created (initial + resumed), swept child-first in teardown. */
    CreatedRunIds: string[];
}

/**
 * Shared fixture for the `agent-plan-mode` bundle (PM1–PM6, live-model): the run IDs the checks
 * spawn (initial paused runs AND the entity-driven resumed runs discovered via ResumingAgentRunID)
 * plus the MJ: AI Agent Requests rows the plan gate creates. Teardown deletes requests → steps →
 * runs (FK-safe). The plan/always-plan agents themselves are seeded metadata, referenced read-only.
 */
export interface AgentPlanModeFixture {
    /** Every AI Agent Run this bundle created — initial paused runs AND resumed runs. */
    CreatedRunIds: string[];
    /** Every MJ: AI Agent Requests row the plan gate created (deleted before the runs they link). */
    CreatedRequestIds: string[];
}

/**
 * Accumulator fixture for the `agent-compaction-e2e` bundle (CE1–CE9): the fabricated conversation
 * histories (created INSIDE the checks, fabricate-then-observe) + the AI Agent Run IDs the live
 * turns spawn. Teardown deletes run steps → runs → conversation details → conversations (FK-safe).
 */
export interface AgentCompactionE2EFixture {
    /** Fabricated conversation + ordered detail rows per fixture history a check created. */
    Conversations: Array<{ Conversation: MJConversationEntity; Details: MJConversationDetailEntity[] }>;
    /** Every AI Agent Run the live compaction-observing turns created. */
    CreatedRunIds: string[];
}

/**
 * Shared fixture for the `agent-memory-guards` bundle (MG1–MG5, live-model): the per-run marker
 * string that isolates + cleans up the MJ: AI Agent Notes rows the writes create (the rig's
 * isolation technique), plus the AI Agent Run IDs. Teardown deletes notes carrying the marker,
 * then run steps → runs. The IT: Memory Writer agent is seeded metadata, referenced read-only.
 */
export interface AgentMemoryGuardsFixture {
    /** Unique per-run marker embedded in every instructed memory-write content string. */
    Marker: string;
    /** Every AI Agent Run this bundle created (swept child-first after the marker notes). */
    CreatedRunIds: string[];
}

/**
 * Shared fixture for the `agent-rag-search` bundle (RS1–RS7, split-tier): the seeded sentinel
 * MJ: AI Agent Notes rows (the searchable corpus), the resolved IT: Integration Test Scope ID, the
 * marker/log prefix used for isolation + audit-row sweep, and the AI Agent Run IDs the live legs
 * spawn. Teardown deletes the seeded notes, the SearchExecutionLog audit rows carrying the prefix,
 * then run steps → runs.
 */
export interface AgentRagSearchFixture {
    /** Resolved ID of the seeded 'IT: Integration Test Scope' (Database provider, MJ: AI Agent Notes). */
    ScopeID: string;
    /** Unique per-run sentinel token embedded in the seeded notes' text (≥3 chars, isolates the corpus). */
    Marker: string;
    /** Query prefix stamped on every SearchEngine query so teardown can sweep the audit rows. */
    LogQueryPrefix: string;
    /** IDs of ALL sentinel MJ: AI Agent Notes rows created in Setup (in-scope + excluded; deleted in teardown). */
    SeededNoteIds: string[];
    /** Subset of SeededNoteIds carrying the IT-SCOPE-EXCLUDED marker (must be filtered out by the scope). */
    ExcludedNoteIds: string[];
    /** Every AI Agent Run the live legs (RS4/RS6) created. */
    CreatedRunIds: string[];
}

/**
 * Shared accumulator fixture for the LIVE-MODEL, CLIENT-TRANSPORT agent bundles (`agent-loop-live`,
 * `shipped-agents-live`, `agent-carry-forward`). Each bundle gets its own instance on its own context
 * field. Unlike create-up-front fixtures, these accumulate IDs as the ordered checks run real wire
 * runs + hand-fabricate prior state, then the lifecycle Teardown removes everything FK-ordered:
 * live runs are purged (AIPromptRuns → AIAgentRunSteps → AIAgentRun), fabricated tool steps + prior
 * runs deleted, then every ConversationDetail in each fixture conversation, then the conversation.
 * All rows carry the "(mj-integration-test — safe to delete)" tag. `Marker` isolates this run's rows.
 */
export interface AgentLiveFixture {
    /** Unique per-run marker embedded in fixture names for isolation. */
    Marker: string;
    /** Fixture conversation IDs (deleted last; their details are swept first). */
    ConversationIds: string[];
    /** ConversationDetail IDs the checks explicitly created (teardown also sweeps run-created details). */
    ConversationDetailIds: string[];
    /** AIAgentRun IDs produced by real wire runs — FK-purged (prompt runs → steps → run) in teardown. */
    LiveRunIds: string[];
    /** Hand-fabricated prior AIAgentRun IDs (fabricate-then-observe) — deleted after their steps. */
    FabricatedRunIds: string[];
    /** Hand-fabricated AIAgentRunStep IDs (the prior-turn Tool steps) — deleted before their runs. */
    FabricatedStepIds: string[];
}

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
    /** Shared fixture for the `entity-writes` bundle (client transport, mutating). */
    EntityWritesFixture?: EntityWritesFixture;
    /** Accumulator fixture for the `entity-graph-client` bundle (client transport, mutating). */
    EntityGraphClientFixture?: EntityGraphClientFixture;
    /** Shared fixture for the `transaction-groups` bundle (client transport, mutating). */
    TransactionGroupsFixture?: TransactionGroupsFixture;
    /** Shared fixture for the `user-routines` bundle. */
    UserRoutinesFixture?: UserRoutinesFixture;
    /** Shared fixture for the `permission-engine` bundle's mutation checks (PE11/PE12) only. */
    PermissionEngineFixture?: PermissionEngineFixture;
    /** Accumulator fixture for the `conversation-compaction` bundle (created by checks, torn down by lifecycle). */
    CompactionFixture?: ConversationCompactionFixture;
    /** Shared fixture for the `agent-skills-live` bundle (live-model). */
    AgentSkillsLiveFixture?: AgentSkillsLiveFixture;
    /** Shared fixture for the `agent-plan-mode` bundle (live-model). */
    AgentPlanModeFixture?: AgentPlanModeFixture;
    /** Accumulator fixture for the `agent-compaction-e2e` bundle (fabricate-then-observe). */
    AgentCompactionE2EFixture?: AgentCompactionE2EFixture;
    /** Shared fixture for the `agent-memory-guards` bundle (live-model, marker-isolated). */
    AgentMemoryGuardsFixture?: AgentMemoryGuardsFixture;
    /** Shared fixture for the `agent-rag-search` bundle (split-tier: deterministic engine + live agent legs). */
    AgentRagSearchFixture?: AgentRagSearchFixture;
    /** Shared fixture for the `templates` bundle. */
    TemplatesFixture?: TemplatesFixture;
    /** Shared fixture for the `communication` bundle (DryRun end-to-end). */
    CommunicationFixture?: CommunicationFixture;
    /** Accumulator fixture for the `agent-loop-live` bundle (live-model, client transport). */
    AgentLoopLiveFixture?: AgentLiveFixture;
    /** Accumulator fixture for the `shipped-agents-live` bundle (live-model, client transport). */
    ShippedAgentsLiveFixture?: AgentLiveFixture;
    /** Accumulator fixture for the `agent-carry-forward` bundle (live-model, client transport, fabricate-then-observe). */
    AgentCarryForwardFixture?: AgentLiveFixture;
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

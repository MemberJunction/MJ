/**
 * @fileoverview GraphQL resolvers for the CLIENT-DIRECT realtime voice topology (P5b-ii).
 *
 * These resolvers are **thin**: they wire two already-built pieces together —
 * {@link RealtimeClientSessionService} (in `@memberjunction/ai-agents`, the server-side half of the
 * client-direct contract) and {@link SessionManager} (the durable `AIAgentSession` record manager) —
 * over a request's `contextUser` + request-scoped `IMetadataProvider`.
 *
 * In the client-direct topology the browser opens its OWN provider socket (e.g. WebRTC) using a
 * server-minted ephemeral token, but the server retains authority over the system prompt + tool set
 * and **executes** every tool call the browser relays back. The three mutations here cover the MVP:
 *
 * 1. {@link RealtimeClientSessionResolver.StartRealtimeClientSession} — authorize, create the
 *    session (storing the target agent id server-side, authoritatively), mint the ephemeral config.
 * 2. {@link RealtimeClientSessionResolver.ExecuteRealtimeSessionTool} — execute a relayed tool call,
 *    reading the target agent id from the session (NOT the client) so the browser can't swap targets.
 * 3. {@link RealtimeClientSessionResolver.RelayRealtimeTranscript} — persist a transcript turn as a
 *    `Conversation Detail`.
 *
 * Authorization model:
 * - **Start**: the caller must have `CanRun` on the *target* agent (the Realtime Co-Agent is an internal
 *   orchestration agent, so the meaningful gate is the agent doing the real work).
 * - **Execute / Relay**: inbound ownership — the session's `UserID` must equal `contextUser.ID`.
 *
 * @module @memberjunction/server
 */
import { Resolver, Mutation, Arg, Ctx, Int, ObjectType, Field, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { AuthorizationEvaluator, UserInfo, IMetadataProvider, LogError, LogStatus, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJAIAgentEntity,
    MJAIAgentSessionEntity,
    MJAIAgentSessionChannelEntity,
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJConversationDetailArtifactEntity,
    MJConversationDetailEntity,
} from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIAgentPermissionHelper, AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    RealtimeClientSessionService,
    DelegatedRunArtifact,
    RealtimeChannelServerHost,
    RealtimeCoAgentConfig,
    EvaluateRuntimeOverrideAuthorization,
    ParseRealtimeTypeConfiguration,
    ResolveEffectiveRealtimeConfig,
    REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION,
    resolveRecordingStorageAccountID,
    storeRealtimeRecording,
} from '@memberjunction/ai-agents';
import { AgentExecutionProgressCallback, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { RealtimeToolDefinition } from '@memberjunction/ai';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import { GetReadWriteProvider } from '../util.js';
import { SessionManager } from '../agentSessions/index.js';

/**
 * Progress steps worth narrating to the realtime model — mirrors the normal agent-run path's filter
 * in {@link import('./RunAIAgentResolver.js').RunAIAgentResolver}. Initialization/validation/finalization
 * noise is dropped so the model only narrates meaningful work.
 */
const SIGNIFICANT_PROGRESS_STEPS = ['prompt_execution', 'action_execution', 'subagent_execution', 'decision_processing'];

/**
 * The seeded name of the internal orchestration agent that fronts a target agent in realtime
 * sessions (voice + interactive channels). This is the GLOBAL DEFAULT co-agent — the final step of
 * the co-agent resolution chain (see {@link RealtimeClientSessionResolver.resolveCoAgentID}).
 * Deployments can override it per agent (`AIAgent.DefaultCoAgentID`), per agent type (an
 * `AIAgentCoAgent` row with `TargetAgentTypeID` + `IsDefault`), or per call (the `coAgentId`
 * mutation argument) without
 * touching this seed.
 */
const REALTIME_CO_AGENT_NAME = 'Realtime Co-Agent';

/**
 * DEPRECATED legacy seed name of {@link REALTIME_CO_AGENT_NAME}, from before the agent's rename
 * from "Voice Co-Agent" to "Realtime Co-Agent". Deployments that have not re-synced the agent seed
 * still carry this name, so {@link RealtimeClientSessionResolver.resolveGlobalCoAgentID} falls
 * back to it (with a deprecation log) when no agent named {@link REALTIME_CO_AGENT_NAME} exists.
 */
const LEGACY_REALTIME_CO_AGENT_NAME = 'Voice Co-Agent';

/**
 * The seeded name of the Realtime agent TYPE. Every co-agent candidate (explicit or metadata
 * default) must be an Active agent of this type — a co-agent drives a streaming full-duplex
 * realtime session, which only `RealtimeAgentType`-driven agents support.
 */
const REALTIME_AGENT_TYPE_NAME = 'Realtime';

/** Entity name — centralised so the `MJ:`-prefix convention is applied in exactly one place. */
const SESSION_ENTITY = 'MJ: AI Agent Sessions';
const CO_AGENT_ENTITY = 'MJ: AI Agent Co Agents';
const CONVERSATION_DETAIL_ENTITY = 'MJ: Conversation Details';
const CHANNEL_ENTITY = 'MJ: AI Agent Channels';
const SESSION_CHANNEL_ENTITY = 'MJ: AI Agent Session Channels';
const ARTIFACT_ENTITY = 'MJ: Artifacts';
const ARTIFACT_VERSION_ENTITY = 'MJ: Artifact Versions';
const ARTIFACT_TYPE_ENTITY = 'MJ: Artifact Types';
const CONVERSATION_DETAIL_ARTIFACT_ENTITY = 'MJ: Conversation Detail Artifacts';

/**
 * The seeded name of the artifact type that {@link RealtimeClientSessionResolver.SaveSessionChannelArtifact}
 * stamps onto saved channel-state artifacts (e.g. the live whiteboard's board JSON). Seeded in
 * `metadata/artifact-types/` — its absence is a graceful structured failure, never a throw.
 */
const WHITEBOARD_ARTIFACT_TYPE_NAME = 'Whiteboard';

/**
 * Maximum number of client-declared UI tools accepted at session mint. Sized to comfortably fit
 * MULTIPLE interactive channels at once plus headroom: the Whiteboard channel alone declares 17 tools
 * and the Remote Browser channel 10, so a session with both is ~27 — the old cap of 16 silently rejected
 * the ENTIRE set (parseClientTools is all-or-nothing), leaving the co-agent with only invoke-target-agent
 * and forcing it to delegate every channel request. This is an abuse ceiling, not a working limit.
 */
const MAX_CLIENT_TOOLS = 64;
/** Maximum accepted size (chars) of the serialized client tool declarations. Raised in step with
 *  {@link MAX_CLIENT_TOOLS} — multi-channel tool sets with verbose descriptions + JSON schemas run large. */
const MAX_CLIENT_TOOLS_JSON_CHARS = 256_000;
/** Maximum accepted size (chars) of a persisted channel state blob. */
const MAX_CHANNEL_STATE_CHARS = 2_000_000;

/** Maximum prior-leg transcript TURNS hydrated into a resumed session's system prompt (newest kept). */
const MAX_PRIOR_TRANSCRIPT_TURNS = 30;
/** Maximum prior-leg transcript CHARS hydrated into a resumed session's system prompt (oldest dropped). */
const MAX_PRIOR_TRANSCRIPT_CHARS = 8_000;
/** Maximum prior-session chain legs walked when hydrating a resumed session's transcript. */
const MAX_PRIOR_TRANSCRIPT_LEGS = 5;

/**
 * Authoritative shape persisted in `AIAgentSession.Config_` for a client-direct voice session.
 * The target agent id is stored here at start and read back on every relay — the browser never
 * re-supplies it, so it cannot swap targets mid-session.
 */
interface RealtimeSessionConfig {
    /** The top-level target agent the co-agent voices on behalf of. */
    targetAgentID: string;
    /**
     * ID of the server-side co-agent observability `AIAgentRun` for this session. Used as the
     * `ParentRunID` for delegated target-agent runs and finalized on session close. Optional —
     * absent when observability run creation was skipped/failed (best-effort).
     */
    coAgentRunID?: string;
    /** ID of the co-agent `AIPromptRun` linked to {@link RealtimeSessionConfig.coAgentRunID}. Optional. */
    promptRunID?: string;
    /**
     * ID of the co-agent run's single system-prompt `MJ: AI Agent Run Steps` row (the one Timeline
     * entry of {@link RealtimeSessionConfig.coAgentRunID}); finalized on session close. Optional.
     */
    coAgentRunStepID?: string;
    /**
     * ID of a delegated target-agent run that paused awaiting user feedback (Status `AwaitingFeedback`,
     * e.g. an interactive agent like Query Builder). Set when a relayed tool call left a run paused;
     * consumed (and cleared) on the NEXT relayed tool call so that the user's answer RESUMES that run
     * rather than starting fresh. Re-stored if the resumed run pauses again.
     */
    pendingFeedbackRunID?: string;
}

/**
 * Result of {@link RealtimeClientSessionResolver.StartRealtimeClientSession} — everything the
 * browser needs to open its own provider socket plus the durable session linkage.
 */
@ObjectType()
export class StartRealtimeClientSessionResult {
    /** ID of the newly created `AIAgentSession` record. */
    @Field(() => String)
    AgentSessionId: string;

    /** ID of the conversation the session is attached to (supplied or freshly created). */
    @Field(() => String)
    ConversationId: string;

    /** The provider that minted the credential (e.g. `'openai'`). */
    @Field(() => String)
    Provider: string;

    /** The provider realtime model id the session is scoped to (e.g. `gpt-realtime`). */
    @Field(() => String)
    Model: string;

    /** The short-lived client secret the browser presents to the provider to authenticate. */
    @Field(() => String)
    EphemeralToken: string;

    /** ISO-8601 timestamp at which {@link StartRealtimeClientSessionResult.EphemeralToken} expires. */
    @Field(() => String)
    ExpiresAt: string;

    /** JSON string of the provider-native session config the browser applies verbatim. */
    @Field(() => String)
    SessionConfigJson: string;

    /** Display name of the realtime model the session uses (e.g. `GPT Realtime 2`). Null when unknown. */
    @Field(() => String, { nullable: true })
    ModelName?: string;

    /**
     * DB-driven progress-narration instruction template (contains a `{{ progressMessage }}`
     * placeholder). Null when the narration prompt is not present in this deployment's metadata —
     * the browser falls back to its built-in narration text.
     */
    @Field(() => String, { nullable: true })
    NarrationInstructionsTemplate?: string;

    /**
     * JSON object string keyed by channel NAME mapping to that channel's persisted state JSON from
     * the caller's PRIOR session (`lastSessionId`) — e.g. `{"Whiteboard":"{...board scene...}"}`.
     * Null when no `lastSessionId` was supplied, the prior session has no persisted channel state,
     * the prior session is not owned by the caller, or the restore failed for any reason (restore
     * is strictly best-effort — a session start NEVER fails because of it).
     */
    @Field(() => String, { nullable: true })
    PriorChannelStatesJson?: string;

    /**
     * The effective narration pace (`realtime.narration.paceMs` from the co-agent's effective
     * configuration) — minimum gap in ms between spoken progress updates. Null when not
     * configured (the browser uses its built-in pacing default). In the client-direct topology
     * narration pacing is enforced CLIENT-side, so the server surfaces the configured value here.
     */
    @Field(() => Int, { nullable: true })
    NarrationPaceMs?: number;

    /**
     * JSON of the RESOLVED effective realtime configuration for this session (type
     * `DefaultConfiguration` ← agent `TypeConfiguration` ← authorized runtime overrides,
     * deep-merged + normalized server-side). The browser uses it to apply client-side concerns
     * (e.g. per-provider voice settings consumed by client drivers, narration pacing). Null only
     * when the prepare service did not resolve a config (back-compat).
     */
    @Field(() => String, { nullable: true })
    EffectiveConfigJson?: string;
}

/**
 * Result of {@link RealtimeClientSessionResolver.SaveSessionChannelArtifact} — a structured
 * success/failure envelope (graceful failures like a missing artifact type must not throw).
 */
@ObjectType()
export class SaveSessionChannelArtifactResult {
    /** True when the artifact + first version were both persisted. */
    @Field(() => Boolean)
    Success: boolean;

    /** Human-readable failure reason. Null on success. */
    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** ID of the created `MJ: Artifacts` row. Null when creation failed before the header saved. */
    @Field(() => String, { nullable: true })
    ArtifactID?: string;

    /** ID of the created `MJ: Artifact Versions` row (version 1). Null on failure. */
    @Field(() => String, { nullable: true })
    ArtifactVersionID?: string;

    /**
     * True when the version was also linked into conversation history via a
     * `MJ: Conversation Detail Artifacts` junction row. False when the session has no
     * conversation, no conversation detail was stamped with this session id yet, or the
     * (best-effort) junction save failed — none of which fail the overall save.
     */
    @Field(() => Boolean)
    ConversationDetailLinked: boolean;
}

/**
 * Result of {@link RealtimeClientSessionResolver.CancelRealtimeSessionTool} — a structured
 * success/failure envelope, mirroring {@link SaveSessionChannelArtifactResult}: tolerated
 * problems (an unexpected registry error) come back as `Success: false`, never a throw, while
 * authn/ownership violations still throw like the sibling mutations.
 */
@ObjectType()
export class CancelRealtimeSessionToolResult {
    /**
     * How many in-flight delegations were aborted. `0` is a legitimate SUCCESS outcome — the
     * work the user wanted dead may simply have finished (or never started) already.
     */
    @Field(() => Int)
    AbortedCount: number;

    /** True when the cancel request was processed (even when nothing was in flight). */
    @Field(() => Boolean)
    Success: boolean;

    /** Human-readable failure reason. Null on success. */
    @Field(() => String, { nullable: true })
    ErrorMessage?: string;
}

/**
 * Result of {@link RealtimeClientSessionResolver.UploadRealtimeRecording} — a structured
 * success/failure envelope. A recording-storage failure must never throw to the browser (the
 * session it belongs to has already ended), so problems come back as `Success: false` with a
 * human-readable reason; only ownership/authn violations (from `loadOwnedSession`) still throw.
 */
@ObjectType()
export class UploadRealtimeRecordingResult {
    /** True when the audio was stored and the session was stamped with the recording file. */
    @Field(() => Boolean)
    Success: boolean;

    /** Human-readable failure reason. Null on success. */
    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    /** ID of the created `MJ: Files` row holding the uploaded recording. Null on failure. */
    @Field(() => String, { nullable: true })
    FileID?: string;
}

/**
 * Resolver for the client-direct realtime voice topology. A single {@link SessionManager} and a
 * single {@link RealtimeClientSessionService} are shared across requests — neither holds per-user or
 * per-provider state; every method is passed the request `contextUser` + provider explicitly.
 */
@Resolver()
export class RealtimeClientSessionResolver extends ResolverBase {
    private readonly sessionManager = new SessionManager();
    private readonly clientSessionService = new RealtimeClientSessionService();

    /**
     * Start a client-direct realtime voice session targeting `targetAgentId`.
     *
     * Flow:
     * 1. Authorize — the caller must have `CanRun` on the **target** agent; denial throws and no
     *    session is created.
     * 2. Resolve the co-agent id via the metadata-driven resolution chain (runtime `coAgentId` →
     *    agent's `DefaultCoAgentID` → type-level `AIAgentCoAgent` default row → global Realtime Co-Agent) —
     *    see {@link RealtimeClientSessionResolver.resolveCoAgentID} for the full contract.
     * 3. Create the durable `AIAgentSession` (run by the co-agent), storing `targetAgentID` in its
     *    config server-side — this is the authoritative target for all later relays.
     * 4. Mint the {@link import('@memberjunction/ai').ClientRealtimeSessionConfig} via the service.
     *    On failure the just-created session is closed so no half-open session leaks.
     *
     * **SECURITY NOTE — `clientToolsJson`:** these are CLIENT-EXECUTED UI tools (e.g. the live
     * whiteboard's `Whiteboard.*` surface). The server only *declares* them to the realtime model
     * so it can call them — the server NEVER executes them, and a relayed call for one of these
     * names falls into the standard "not available" path on the server side. They grant no
     * server-side capability whatsoever; server-executed tools remain exclusively server-declared
     * (`invoke-target-agent` + future action wiring). The declarations are still validated
     * (count cap, size cap, per-tool shape) so a hostile client can't bloat the session config.
     *
     * @param targetAgentId The agent the co-agent voices. OPTIONAL when the resolved co-agent
     *   has pairing rows with an `IsDefault` target (`MJ: AI Agent Co Agents`) — the default
     *   pairing stands in. Required for a universal co-agent (zero pairing rows). When the
     *   co-agent HAS pairing rows, a supplied target must be in that list (clear error otherwise).
     * @param coAgentId Optional EXPLICIT co-agent choice (`MJ: AI Agents.ID` of an Active,
     *   Realtime-type agent). When set, the server uses exactly that co-agent and FAILS with a
     *   clear reason if it can't (no silent fallback — mirroring `preferredModelId`'s contract).
     *   Omit to let metadata drive the choice: the target agent's `DefaultCoAgentID`, then the
     *   type-level `AIAgentCoAgent` default row for its agent type, then the global Realtime Co-Agent.
     * @param configOverridesJson Optional RUNTIME configuration-override layer (the most-specific
     *   layer of the effective-config merge: type `DefaultConfiguration` ← agent
     *   `TypeConfiguration` ← this). **Authorization-gated**: requires the
     *   `Realtime: Advanced Session Controls` authorization — unauthorized callers receive a
     *   structured rejection (never a silent ignore). Must be a JSON object.
     *
     * @returns The ephemeral config + session linkage the browser needs to open its socket.
     */
    @Mutation(() => StartRealtimeClientSessionResult)
    async StartRealtimeClientSession(
        @Arg('targetAgentId', () => String, { nullable: true }) targetAgentId: string | undefined,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('conversationId', () => String, { nullable: true }) conversationId?: string,
        @Arg('lastSessionId', () => String, { nullable: true }) lastSessionId?: string,
        @Arg('preferredModelId', () => String, { nullable: true }) preferredModelId?: string,
        @Arg('clientToolsJson', () => String, { nullable: true }) clientToolsJson?: string,
        @Arg('coAgentId', () => String, { nullable: true }) coAgentId?: string,
        @Arg('configOverridesJson', () => String, { nullable: true }) configOverridesJson?: string,
        @Arg('recordingStartedAt', () => String, { nullable: true }) recordingStartedAt?: string,
        @Arg('recordingConsent', () => Boolean, { nullable: true }) recordingConsent?: boolean,
    ): Promise<StartRealtimeClientSessionResult> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);

        const coAgentID = await this.resolveCoAgentID(targetAgentId, coAgentId, contextUser, provider);
        // PAIRING CONSTRAINTS: a co-agent with pairing rows is restricted to that target list
        // (with the IsDefault row standing in when no runtime target was supplied); zero rows =
        // universal, today's behavior untouched. Resolves the AUTHORITATIVE target id.
        const effectiveTargetId = await this.resolveConstrainedTargetAgentID(coAgentID, targetAgentId, contextUser, provider);
        await this.assertCanRunTarget(effectiveTargetId, contextUser, provider);
        // RUNTIME-OVERRIDE GATE: configOverridesJson and a DEVIATING explicit model both require
        // the 'Realtime: Advanced Session Controls' authorization (structured rejection, never a
        // silent ignore). Plain starts and within-pairing target selection are never gated here.
        await this.assertRuntimeOverridesAuthorized(coAgentID, configOverridesJson, preferredModelId, contextUser, provider);

        const config: RealtimeSessionConfig = { targetAgentID: effectiveTargetId };
        const session = await this.sessionManager.CreateSession(
            {
                agentID: coAgentID,
                userID: contextUser.ID,
                conversationID: conversationId,
                lastSessionID: lastSessionId,
                config: JSON.stringify(config),
            },
            contextUser,
            provider,
        );

        // Best-effort: stamp recording-start metadata when the browser captured (with consent) at start.
        await this.stampRecordingStart(session, recordingConsent, recordingStartedAt);

        const clientTools = this.parseClientTools(clientToolsJson);
        // Best-effort model-context hydration: the PRIOR session chain's transcript (ownership-
        // checked, capped) is framed into the system prompt so the model REMEMBERS the last leg.
        // Strictly tolerant — any problem yields no hydration, never a failed start.
        const priorTranscript = await this.loadPriorTranscript(lastSessionId, contextUser, provider);
        const result = await this.prepareClientSessionOrClose(
            session, coAgentID, effectiveTargetId, contextUser, provider, preferredModelId, clientTools, priorTranscript,
            configOverridesJson,
        );
        // Best-effort restore of the PRIOR session's persisted channel states (e.g. the whiteboard
        // board). Strictly tolerant — any problem yields a null field, never a failed start.
        result.PriorChannelStatesJson = (await this.loadPriorChannelStatesJson(lastSessionId, contextUser, provider)) ?? undefined;
        return result;
    }

    /**
     * Execute a single tool call the browser relayed from its provider socket and return the
     * serialized result for the browser to relay back to the model.
     *
     * Ownership-gated; the target agent id is read from the **session config** (authoritative), never
     * from the client. Heartbeats the session on success.
     *
     * @returns The serialized tool result JSON.
     */
    @Mutation(() => String)
    async ExecuteRealtimeSessionTool(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('callId', () => String) callId: string,
        @Arg('toolName', () => String) toolName: string,
        @Arg('argsJson', () => String) argsJson: string,
        @Ctx() { userPayload, providers }: AppContext,
        @PubSub() pubSub: PubSubEngine,
    ): Promise<string> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedActiveSession(agentSessionId, contextUser, provider);
        const config = this.readSessionConfig(session);

        const { ResultJson, PausedRunID, Artifacts } = await this.clientSessionService.ExecuteRelayedTool(
            {
                AgentSessionID: agentSessionId,
                TargetAgentID: config.targetAgentID,
                // Nest the delegated target-agent run under the co-agent observability run (when present).
                ParentRunID: config.coAgentRunID,
                Call: { CallID: callId, ToolName: toolName, Arguments: argsJson },
                OnProgress: this.buildDelegationProgressCallback(pubSub, userPayload, agentSessionId, callId),
                // Resume a previously-paused delegated run (if any) with the user's answer.
                ResumeRunID: config.pendingFeedbackRunID,
            },
            contextUser,
            provider,
        );

        // Roll the paused-run id forward in the session config: clear the one we just consumed, and
        // store a new one only if the (resumed or fresh) run paused again awaiting feedback.
        await this.updatePendingFeedbackRunID(session, config, PausedRunID);

        // Junction-link any artifacts the delegated run produced into the session's conversation
        // history (best-effort) — so chat, session review, and resume carryover can all see them.
        await this.linkDelegatedArtifactsToConversation(session, Artifacts, contextUser, provider);

        await this.sessionManager.Heartbeat(agentSessionId, contextUser, provider);
        return ResultJson;
    }

    /**
     * Builds the `OnProgress` callback threaded into the delegated target-agent run. Each significant
     * progress event (see {@link SIGNIFICANT_PROGRESS_STEPS}) is published to
     * {@link PUSH_STATUS_UPDATES_TOPIC} on this user's `sessionId` so the browser can correlate it to
     * THIS voice session (via `agentSessionID` + `callID`) and feed it to the realtime model to
     * narrate — distinct from a normal `RunAIAgentResolver` agent-run stream by `resolver`/`type`.
     */
    private buildDelegationProgressCallback(
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        agentSessionID: string,
        callID: string,
    ): AgentExecutionProgressCallback {
        return (progress) => {
            if (!SIGNIFICANT_PROGRESS_STEPS.includes(progress.step)) {
                return;
            }
            pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
                message: JSON.stringify({
                    resolver: 'RealtimeClientSessionResolver',
                    type: 'RealtimeDelegationProgress',
                    agentSessionID,
                    callID,
                    step: progress.step,
                    message: progress.message,
                    percentage: progress.percentage,
                }),
                sessionId: userPayload.sessionId,
            });
        };
    }

    /**
     * Rolls the session's `pendingFeedbackRunID` forward after a relayed tool call. The id we just
     * consumed (resumed or none) is dropped; a new paused run id is stored only when the run paused
     * again awaiting feedback. When neither the old nor new value is set, this is a no-op (no save).
     * Best-effort: a save failure is logged, not thrown.
     */
    private async updatePendingFeedbackRunID(
        session: MJAIAgentSessionEntity,
        config: RealtimeSessionConfig,
        pausedRunID: string | undefined,
    ): Promise<void> {
        const previous = config.pendingFeedbackRunID;
        if (!previous && !pausedRunID) {
            return;
        }
        const next: RealtimeSessionConfig = {
            targetAgentID: config.targetAgentID,
            coAgentRunID: config.coAgentRunID,
            promptRunID: config.promptRunID,
            coAgentRunStepID: config.coAgentRunStepID,
            pendingFeedbackRunID: pausedRunID,
        };
        session.Config_ = JSON.stringify(next);
        if (!(await session.Save())) {
            LogError(
                `RealtimeClientSessionResolver.updatePendingFeedbackRunID save failed: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /**
     * Persist a transcript turn (user or assistant) as a `Conversation Detail` on the session's
     * conversation. Ownership-gated; heartbeats the session on success.
     *
     * The co-agent observability `AIAgentRun`/`AIPromptRun` are created at session start (see
     * {@link RealtimeClientSessionResolver.StartRealtimeClientSession}) and finalized on close;
     * incremental usage telemetry lands on the `AIPromptRun` via
     * {@link RealtimeClientSessionResolver.RelayRealtimeUsage}. Each persisted turn is ALSO appended
     * to the co-agent `AIPromptRun.Messages` (best-effort), so the run captures the full conversation
     * — observability parity with every other MJ agent run, not just token totals.
     *
     * @returns `true` when the transcript turn was persisted.
     */
    @Mutation(() => Boolean)
    async RelayRealtimeTranscript(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('role', () => String) role: string,
        @Arg('text', () => String) text: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('replacesPrevious', () => Boolean, { nullable: true }) replacesPrevious?: boolean,
        @Arg('utteranceStartMs', () => Int, { nullable: true }) utteranceStartMs?: number,
        @Arg('utteranceEndMs', () => Int, { nullable: true }) utteranceEndMs?: number,
    ): Promise<boolean> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedActiveSession(agentSessionId, contextUser, provider);

        const saved = replacesPrevious
            ? await this.replacePreviousTranscriptTurn(session, role, text, contextUser, provider, utteranceStartMs, utteranceEndMs)
            : await this.persistTranscriptTurn(session, role, text, contextUser, provider, utteranceStartMs, utteranceEndMs);
        if (!saved) {
            return false;
        }
        // Mirror the turn onto the co-agent's long-lived prompt run so its Messages capture the full
        // conversation (run-viewer observability parity). Best-effort — never fails the transcript relay.
        const promptRunID = this.readPromptRunID(session);
        if (promptRunID) {
            await this.clientSessionService.AppendPromptRunMessage(
                promptRunID,
                this.mapTranscriptRoleToChatRole(role),
                text,
                replacesPrevious ?? false,
                contextUser,
                provider,
            );
        }
        await this.sessionManager.Heartbeat(agentSessionId, contextUser, provider);
        return true;
    }

    /**
     * Maps the relayed transcript role (`'User'`/`'AI'`/`'Assistant'`, case-insensitive) to the
     * standard chat-message role stored in `AIPromptRun.Messages`. Anything that isn't an explicit
     * user turn is treated as the assistant (the co-agent's own speech).
     */
    private mapTranscriptRoleToChatRole(role: string): 'user' | 'assistant' {
        return role.trim().toLowerCase() === 'user' ? 'user' : 'assistant';
    }

    /**
     * Upload a CLIENT-DIRECT session audio recording, store it in MJStorage, link it to the owning
     * `AIAgentSession`, and stamp the session's recording fields. The browser records locally during
     * the call and uploads the assembled blob (base64) once the session ends.
     *
     * Hard gates (in order):
     * 1. Ownership — `loadOwnedSession` enforces `UserID === contextUser.ID` (throws on violation).
     * 2. Consent — `consent !== true` is a hard refusal: no audio is ever stored without it.
     * 3. Storage configuration — the session's agent must resolve a recording storage account (the
     *    agent's `RecordingStorageProviderID`, else `AttachmentStorageProviderID`).
     *
     * Storage failures (and any unexpected throw) come back as `Success: false` with a reason — they
     * NEVER throw to the browser, mirroring the shared {@link storeRealtimeRecording} contract.
     *
     * @param agentSessionId The session the recording belongs to (ownership-gated).
     * @param audioBase64 The base64-encoded recording bytes (webm/ogg/mp4/wav).
     * @param mimeType The audio MIME type (`audio/webm`, `audio/ogg`, `audio/mp4`, `audio/wav`).
     * @param durationMs Optional client-measured recording duration (ms) — informational.
     * @param consent Whether the user consented to recording. MUST be `true` or the upload is refused.
     * @returns A structured {@link UploadRealtimeRecordingResult} with the created `MJ: Files` id.
     */
    @Mutation(() => UploadRealtimeRecordingResult)
    async UploadRealtimeRecording(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('audioBase64', () => String) audioBase64: string,
        @Arg('mimeType', () => String) mimeType: string,
        @Ctx() ctx: AppContext,
        @Arg('durationMs', () => Int, { nullable: true }) durationMs?: number,
        @Arg('consent', () => Boolean, { nullable: true }) consent?: boolean,
    ): Promise<UploadRealtimeRecordingResult> {
        const { contextUser, provider } = this.requireUserAndProvider(ctx.userPayload, ctx.providers);
        const session = await this.loadOwnedSession(agentSessionId, contextUser, provider);

        // HARD consent gate — no audio is ever stored without an explicit grant.
        if (consent !== true) {
            return { Success: false, ErrorMessage: 'Recording consent was not granted.' };
        }

        try {
            const agent = await provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
            if (!(await agent.Load(session.AgentID))) {
                return { Success: false, ErrorMessage: `Co-agent ${session.AgentID} for the session could not be loaded.` };
            }

            const accountID = await resolveRecordingStorageAccountID(agent, contextUser, provider);
            if (!accountID) {
                return { Success: false, ErrorMessage: 'No recording storage account is configured for this agent.' };
            }

            const buffer = Buffer.from(audioBase64, 'base64');
            if (buffer.length === 0) {
                return { Success: false, ErrorMessage: 'The uploaded recording was empty.' };
            }

            const fileID = await storeRealtimeRecording({
                Audio: buffer,
                MimeType: mimeType,
                Media: 'Audio',
                StartedAt: session.RecordingStartedAt ?? new Date(),
                StorageAccountID: accountID,
                SessionID: agentSessionId,
                ContextUser: contextUser,
                Provider: provider,
            });

            return {
                Success: !!fileID,
                FileID: fileID ?? undefined,
                ErrorMessage: fileID ? undefined : 'Storage upload failed.',
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`RealtimeClientSessionResolver.UploadRealtimeRecording failed for session ${agentSessionId}: ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    /**
     * Relays a co-agent CHANNEL tool-call (browser_ / Whiteboard_ etc.) onto the session's co-agent
     * AIPromptRun.Messages — run-only observability so the run captures what the co-agent DID, not just
     * what it said. Deliberately NOT a ConversationDetail turn (the chat thread stays speech-only).
     * Ownership-gated; best-effort (a missing prompt run / save failure simply returns false).
     *
     * @returns `true` when the tool turn was recorded on the run.
     */
    @Mutation(() => Boolean)
    async RelayRealtimeToolTurn(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('toolName', () => String) toolName: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('argsJson', () => String, { nullable: true }) argsJson?: string,
        @Arg('resultJson', () => String, { nullable: true }) resultJson?: string,
    ): Promise<boolean> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedActiveSession(agentSessionId, contextUser, provider);
        const promptRunID = this.readPromptRunID(session);
        if (!promptRunID) {
            return false;
        }
        return this.clientSessionService.AppendPromptRunMessage(
            promptRunID,
            'assistant',
            this.formatToolTurn(toolName, argsJson, resultJson),
            false,
            contextUser,
            provider,
        );
    }

    /**
     * Formats a co-agent tool call into a compact, human-readable run line: `🔧 <tool> <args> → <result>`,
     * clipping args/result so a verbose payload never bloats the Messages blob.
     */
    private formatToolTurn(toolName: string, argsJson?: string, resultJson?: string): string {
        const clip = (raw: string | undefined, max: number): string => {
            const t = (raw ?? '').trim();
            return t.length > max ? `${t.slice(0, max)}…` : t;
        };
        const args = clip(argsJson, 200);
        const result = clip(resultJson, 300);
        return `🔧 ${toolName}${args ? ` ${args}` : ''}${result ? ` → ${result}` : ''}`;
    }

    /**
     * Cancel in-flight relayed tool delegations for a session — the CLIENT-DIRECT cancel channel.
     *
     * The browser calls this on an EXPLICIT user cancel (the call overlay's per-card ✕ — a
     * deliberate host policy: true barge-in alone never aborts delegations, since the narration
     * design expects the user to keep talking while delegated work runs). The service-side
     * in-flight registry aborts the matching `AbortController`(s), which fires the delegated
     * run's `cancellationToken`; the original `ExecuteRealtimeSessionTool` mutation then resolves
     * with the run's cancelled/failed result through its normal path.
     *
     * Ownership-gated like the sibling mutations. A **Closed** session is accepted — a cancel can
     * legitimately race teardown, and aborting stragglers is exactly what the caller wants then.
     *
     * @param callId When supplied, only the delegation for that provider call id is aborted;
     *   omit to abort ALL in-flight delegations for the session.
     * @returns A structured {@link CancelRealtimeSessionToolResult}. Tolerant: an unknown call id
     *   or a session with nothing in flight is `Success: true, AbortedCount: 0` (the work may
     *   simply have finished already); an unexpected registry error is a structured failure.
     */
    @Mutation(() => CancelRealtimeSessionToolResult)
    async CancelRealtimeSessionTool(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('callId', () => String, { nullable: true }) callId?: string,
    ): Promise<CancelRealtimeSessionToolResult> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        await this.loadOwnedSession(agentSessionId, contextUser, provider);
        try {
            const aborted = this.clientSessionService.CancelInFlightDelegations(agentSessionId, callId);
            return { AbortedCount: aborted, Success: true };
        } catch (error) {
            const message = `CancelRealtimeSessionTool failed for session ${agentSessionId}: ${(error as Error).message}`;
            LogError(message);
            return { AbortedCount: 0, Success: false, ErrorMessage: message };
        }
    }

    /**
     * Relay incremental usage telemetry from the browser's provider socket onto the co-agent's
     * observability `AIPromptRun` (the run created at session start).
     *
     * The browser accumulates the realtime client's `OnUsage` token DELTAS and flushes them here
     * debounced (~10s) plus once at teardown; this mutation ACCUMULATES the deltas onto the
     * prompt run's `TokensPrompt` / `TokensCompletion` (and recomputes `TokensUsed`). Status is
     * deliberately untouched — `FinalizeCoAgentRun` keeps stamping Success/Completed at close,
     * and a post-close flush still lands (accumulation has no Status gate).
     *
     * Ownership-gated like the sibling mutations; a **Closed** session is accepted (the final
     * teardown flush can land after `CloseAgentSession`). Everything PAST the ownership gate is
     * best-effort and tolerant: a missing/malformed session config, an absent `promptRunID`
     * (observability creation was skipped), a failed load, or a failed save all log and return
     * `false` — usage relay must never break a live call.
     *
     * @param inputTokens Input-token DELTA to add (negative/non-finite values are clamped to 0).
     * @param outputTokens Output-token DELTA to add (negative/non-finite values are clamped to 0).
     * @returns `true` when the accumulated usage was persisted; `false` on any tolerated failure.
     */
    @Mutation(() => Boolean)
    async RelayRealtimeUsage(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('inputTokens', () => Int) inputTokens: number,
        @Arg('outputTokens', () => Int) outputTokens: number,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<boolean> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedSession(agentSessionId, contextUser, provider);

        const inputDelta = this.clampTokenDelta(inputTokens);
        const outputDelta = this.clampTokenDelta(outputTokens);
        if (inputDelta === 0 && outputDelta === 0) {
            return true; // nothing to add — a no-op flush is a success, not a failure
        }

        const promptRunID = this.readPromptRunID(session);
        if (!promptRunID) {
            return false; // no observability prompt run for this session — logged in the helper
        }
        // Delegate to the service so usage writes share the per-run serialization with transcript-message
        // appends — otherwise the frequent usage save clobbers freshly-appended Messages (and vice-versa).
        return this.clientSessionService.AccumulatePromptRunUsage(promptRunID, inputDelta, outputDelta, contextUser, provider);
    }

    /** Clamps a relayed token delta: negative / non-finite values become 0. */
    private clampTokenDelta(value: number): number {
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    }

    /**
     * Reads the co-agent `AIPromptRun` id from the session config WITHOUT the relay path's
     * throw-on-missing-target semantics — usage relay is best-effort, so a missing/malformed
     * config or absent id just logs and returns `null`.
     */
    private readPromptRunID(session: MJAIAgentSessionEntity): string | null {
        try {
            const config = this.readSessionConfig(session);
            if (config.promptRunID) {
                return config.promptRunID;
            }
            LogStatus(
                `RelayRealtimeUsage: session ${session.ID} has no co-agent promptRunID (observability run ` +
                    'creation was skipped or failed) — usage delta dropped.',
            );
            return null;
        } catch {
            LogError(`RelayRealtimeUsage: session ${session.ID} has no parseable config — usage delta dropped.`);
            return null;
        }
    }

    /**
     * Persist an interactive channel's state of record (e.g. the live whiteboard's serialized
     * scene) onto the session's `MJ: AI Agent Session Channels` row.
     *
     * Flow:
     * 1. Ownership gate — like the sibling mutations, the session's `UserID` must equal the
     *    caller's. Unlike Execute/Relay, a **Closed** session is accepted: the client's final
     *    on-end flush legitimately lands after `CloseAgentSession` has run.
     * 2. Resolve the channel definition (`MJ: AI Agent Channels`) by `channelName`. When no
     *    active definition row exists (the deployment hasn't synced the channel seed yet),
     *    return `false` gracefully and log — never throw for a missing definition.
     * 3. Offer the payload to the session's SERVER-SIDE channel plugin (the registry row's
     *    `ServerPluginClass`, held per-session by {@link RealtimeChannelServerHost}) for
     *    validation/normalization — strictly best-effort: no plugin, a plugin failure, or an
     *    oversized replacement all fall back to persisting the original payload.
     * 4. Upsert the session-channel row: create it (Status `Connected`) when missing, store
     *    the (possibly normalized) state in its `Config` field, and stamp `LastActiveAt`.
     *
     * @returns `true` when the state was persisted; `false` on any tolerated failure (missing
     *   channel definition, oversized state, save failure) — all logged.
     */
    @Mutation(() => Boolean)
    async SaveSessionChannelState(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('channelName', () => String) channelName: string,
        @Arg('stateJson', () => String) stateJson: string,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<boolean> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedSession(agentSessionId, contextUser, provider);

        if (stateJson.length > MAX_CHANNEL_STATE_CHARS) {
            LogError(
                `SaveSessionChannelState: rejected oversized state for session ${agentSessionId} / channel '${channelName}' ` +
                    `(${stateJson.length} chars > ${MAX_CHANNEL_STATE_CHARS}).`,
            );
            return false;
        }

        const channelID = await this.resolveChannelID(channelName, contextUser, provider);
        if (!channelID) {
            return false; // missing/inactive channel definition — logged in resolveChannelID
        }

        const stateToPersist = await this.applyChannelServerPlugin(session.ID, channelName, stateJson);
        return this.upsertSessionChannelState(session.ID, channelID, stateToPersist, contextUser, provider);
    }

    /**
     * Routes a landed channel-state save through the session's server-side channel plugin (when
     * one resolved at session start) so it can validate/normalize the payload PRE-persistence.
     * Strictly best-effort: any host/plugin problem — including a replacement that exceeds the
     * channel-state size cap — falls back to the client's original payload, which already passed
     * the cap. A plugin can transform a save; it can never lose or block one.
     */
    private async applyChannelServerPlugin(agentSessionID: string, channelName: string, stateJson: string): Promise<string> {
        try {
            const processed = await RealtimeChannelServerHost.Instance.OnChannelStateSave(agentSessionID, channelName, stateJson);
            if (processed.length > MAX_CHANNEL_STATE_CHARS) {
                LogError(
                    `SaveSessionChannelState: server plugin for channel '${channelName}' returned an oversized replacement ` +
                        `(${processed.length} chars > ${MAX_CHANNEL_STATE_CHARS}) — persisting the original state.`,
                );
                return stateJson;
            }
            return processed;
        } catch (error) {
            LogError(
                `SaveSessionChannelState: channel server plugin hook failed for session ${agentSessionID} / ` +
                    `channel '${channelName}' — persisting the original state: ${(error as Error).message}`,
            );
            return stateJson;
        }
    }

    /**
     * Persist an interactive channel's current state (e.g. the live whiteboard's board JSON) as a
     * durable, user-owned **artifact** — distinct from {@link SaveSessionChannelState}, which only
     * stores the session-scoped state of record. The artifact survives the session and shows up in
     * the user's artifact library (and, when possible, in the conversation's history).
     *
     * Flow:
     * 1. Ownership gate — like the sibling mutations (`UserID === contextUser.ID`). A **Closed**
     *    session is accepted: "save my board" legitimately arrives as/after the call ends.
     * 2. Size cap — `contentJson` beyond {@link MAX_CHANNEL_STATE_CHARS} is a structured failure.
     * 3. Resolve the {@link WHITEBOARD_ARTIFACT_TYPE_NAME} artifact type by name; when the seed is
     *    absent/disabled in this deployment, return a structured failure (never throw).
     * 4. Create the `MJ: Artifacts` header (user-owned, Visibility `Always`) + its
     *    `MJ: Artifact Versions` v1 row carrying `contentJson`.
     * 5. Best-effort extras that never fail the save:
     *    - when the session has a conversation AND a `Conversation Detail` stamped with this
     *      session id exists (the transcript relay stamps `AgentSessionID`), link the version into
     *      history via a `MJ: Conversation Detail Artifacts` junction row (Direction `Output`);
     *    - stamp `LastActiveAt` on the session-channel row when one exists.
     *
     * @returns A structured {@link SaveSessionChannelArtifactResult} — graceful failures (missing
     *   type seed, oversized content, save failure) come back as `Success: false`, while
     *   authn/ownership violations throw like the sibling mutations.
     */
    @Mutation(() => SaveSessionChannelArtifactResult)
    async SaveSessionChannelArtifact(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('channelName', () => String) channelName: string,
        @Arg('name', () => String) name: string,
        @Arg('contentJson', () => String) contentJson: string,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<SaveSessionChannelArtifactResult> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedSession(agentSessionId, contextUser, provider);

        if (contentJson.length > MAX_CHANNEL_STATE_CHARS) {
            const message =
                `SaveSessionChannelArtifact: rejected oversized content for session ${agentSessionId} / channel '${channelName}' ` +
                `(${contentJson.length} chars > ${MAX_CHANNEL_STATE_CHARS}).`;
            LogError(message);
            return { Success: false, ErrorMessage: message, ConversationDetailLinked: false };
        }

        const typeID = await this.resolveWhiteboardArtifactTypeID(contextUser, provider);
        if (!typeID) {
            return {
                Success: false,
                ErrorMessage:
                    `The '${WHITEBOARD_ARTIFACT_TYPE_NAME}' artifact type is not configured in this deployment — ` +
                    'sync the artifact-type seed metadata to enable saving channel artifacts.',
                ConversationDetailLinked: false,
            };
        }

        return this.createChannelArtifact(session, channelName, name, contentJson, typeID, contextUser, provider);
    }

    // ----- internals -------------------------------------------------------------------------

    /** Resolve the request user + read-write provider, throwing a clear error if unauthenticated. */
    private requireUserAndProvider(
        userPayload: AppContext['userPayload'],
        providers: AppContext['providers'],
    ): { contextUser: UserInfo; provider: IMetadataProvider } {
        const contextUser = this.GetUserFromPayload(userPayload);
        if (!contextUser) {
            throw new Error('Not authenticated: no user context for realtime session operation');
        }
        return { contextUser, provider: GetReadWriteProvider(providers) };
    }

    /**
     * Authorization gate for {@link RealtimeClientSessionResolver.StartRealtimeClientSession}: the
     * caller must be able to run the **target** agent. Denial throws (no session is created).
     */
    private async assertCanRunTarget(
        targetAgentId: string,
        contextUser: UserInfo,
        _provider: IMetadataProvider,
    ): Promise<void> {
        const canRun = await AIAgentPermissionHelper.HasPermission(targetAgentId, contextUser, 'run');
        if (!canRun) {
            throw new Error(
                `Not authorized: you are not permitted to run the target agent ${targetAgentId}`,
            );
        }
    }

    /**
     * Resolves the AUTHORITATIVE target agent id under the co-agent's PAIRING CONSTRAINTS
     * (`MJ: AI Agent Co Agents`, ordered by `Sequence`):
     *
     * - **Zero pairing rows (universal co-agent)** — today's behavior untouched: the runtime
     *   `targetAgentId` is required (clear error when absent) and used as-is. Pairings are NEVER
     *   mandated; zero-config deployments keep working with zero metadata.
     * - **Rows + runtime target** — the supplied target must be IN the paired list; a target
     *   outside the list is a clear structured error (the UX builds its picker from the same rows).
     * - **Rows + no runtime target** — the `IsDefault` row stands in; when no default row exists,
     *   a clear error asks for an explicit target.
     *
     * Pairing rows are a TARGETING constraint layered on top of — never a replacement for — the
     * `CanRun` security gate, which the caller applies to the resolved target id immediately
     * after. A failed/erroring pairing query therefore degrades to the universal behavior
     * (logged), it never breaks session starts.
     *
     * @param coAgentID The resolved co-agent id.
     * @param requestedTargetId The runtime `targetAgentId` argument, when supplied.
     * @returns The effective target agent id (canonical casing from the pairing row when matched).
     */
    private async resolveConstrainedTargetAgentID(
        coAgentID: string,
        requestedTargetId: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string> {
        const rows = await this.loadPairingRows(coAgentID, contextUser, provider);

        if (rows.length === 0) {
            if (!requestedTargetId) {
                throw new Error(
                    'targetAgentId is required: this co-agent has no paired targets ' +
                        '(it is universal), so there is no default target to fall back to.',
                );
            }
            return requestedTargetId;
        }

        if (requestedTargetId) {
            const match = rows.find((r) => UUIDsEqual(r.TargetAgentID, requestedTargetId));
            if (!match) {
                throw new Error(
                    `Invalid targetAgentId '${requestedTargetId}': this co-agent is paired to a specific ` +
                        'target list and the requested agent is not in it. Pick one of the paired targets ' +
                        'or use a co-agent without pairings.',
                );
            }
            return match.TargetAgentID;
        }

        const defaultRow = rows.find((r) => r.IsDefault);
        if (!defaultRow) {
            throw new Error(
                'targetAgentId is required: this co-agent is paired to a target list but no pairing is ' +
                    'marked IsDefault, so there is no default target to fall back to.',
            );
        }
        return defaultRow.TargetAgentID;
    }

    /**
     * Loads the co-agent's pairing rows from {@link AIEngineBase}'s cached
     * `MJ: AI Agent Co Agents` metadata (provider-scoped engine instance, lazy `Config`),
     * ordered by `Sequence`. Only **Active** rows of relationship **Type `'CoAgent'`** with a
     * SPECIFIC agent target participate — type-level rows (`TargetAgentTypeID`) express the
     * type-default in the resolution chain, not a target restriction, and reserved relationship
     * types are ignored until their features ship. Tolerant — a failed cache load logs and
     * returns `[]` (degrading to the universal behavior; pairing is a targeting constraint,
     * `CanRun` remains the security gate), never throws.
     */
    private async loadPairingRows(
        coAgentID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<Array<{ TargetAgentID: string; IsDefault: boolean; Sequence: number }>> {
        try {
            const engine = await this.configuredAIEngineBase(contextUser, provider);
            return (engine.AgentCoAgents ?? [])
                .filter((r) =>
                    r.Type === 'CoAgent' &&
                    r.Status === 'Active' &&
                    r.TargetAgentID != null &&
                    UUIDsEqual(r.CoAgentID, coAgentID))
                .sort((a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0))
                .map((r) => ({ TargetAgentID: r.TargetAgentID!, IsDefault: r.IsDefault, Sequence: r.Sequence }));
        } catch (error) {
            LogError(
                `StartRealtimeClientSession: ${CO_AGENT_ENTITY} cache read failed for co-agent ${coAgentID} ` +
                    `(${(error as Error).message}) — treating the co-agent as universal.`,
            );
            return [];
        }
    }

    /**
     * The provider-scoped {@link AIEngineBase} instance for this request's connection, lazily
     * configured (`Config(false, ...)` is a no-op when the cache is already loaded). Pairing rows
     * and channel definitions are small metadata tables the engine caches — reading them here
     * replaces per-call RunViews.
     */
    private async configuredAIEngineBase(contextUser: UserInfo, provider: IMetadataProvider): Promise<AIEngineBase> {
        const engine = AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
        await engine.Config(false, contextUser, provider);
        return engine;
    }

    /**
     * The RUNTIME-OVERRIDE AUTHORIZATION GATE: `configOverridesJson` and a DEVIATING explicit
     * `preferredModelId` both require the `Realtime: Advanced Session Controls` authorization
     * (evaluated hierarchy-aware over the caller's roles); a deviating model is additionally
     * subject to the effective `realtime.allowUserModelOverride` policy (which blocks even
     * authorized callers when `false`). Denial THROWS a structured reason — never a silent
     * ignore. Plain starts (no overrides, no explicit model) pass through untouched; an explicit
     * model EQUAL to the co-agent's metadata-configured preference is not a deviation.
     *
     * Judgment calls baked in (per the approved product rules): co-agent selection (`coAgentId`)
     * and target selection within a pairing list / for a universal co-agent are NORMAL user flow
     * — they stay behind the existing `CanRun` gate only and are not touched here.
     */
    private async assertRuntimeOverridesAuthorized(
        coAgentID: string,
        configOverridesJson: string | undefined,
        preferredModelId: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        if (!configOverridesJson && !preferredModelId) {
            return;
        }
        if (configOverridesJson && !ParseRealtimeTypeConfiguration(configOverridesJson)) {
            throw new Error('Invalid configOverridesJson: expected a JSON object.');
        }

        const baseline = this.resolveBaselineEffectiveConfig(coAgentID);
        const decision = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: !!configOverridesJson,
            RequestedModelID: preferredModelId ?? null,
            MetadataPreferredModelID: this.resolveMetadataPreferredModelID(baseline),
            AllowUserModelOverride: baseline.realtime?.allowUserModelOverride,
            CallerHasAdvancedControls: this.userHasAdvancedSessionControls(contextUser, provider),
        });
        if (!decision.Allowed) {
            throw new Error(`Not authorized: ${decision.DenialReason}`);
        }
    }

    /**
     * The co-agent's BASELINE effective configuration — type `DefaultConfiguration` ← agent
     * `TypeConfiguration`, WITHOUT the runtime layer (this feeds the gate that decides whether
     * the runtime layer is even allowed). Tolerant of an unloaded metadata cache.
     */
    private resolveBaselineEffectiveConfig(coAgentID: string): RealtimeCoAgentConfig {
        try {
            const agent = (AIEngine.Instance.Agents ?? []).find((a) => UUIDsEqual(a.ID, coAgentID));
            let typeDefault: string | null = null;
            if (agent?.TypeID) {
                const type = (AIEngine.Instance.AgentTypes ?? []).find((t) => UUIDsEqual(t.ID, agent.TypeID!));
                typeDefault = type?.DefaultConfiguration ?? null;
            }
            return ResolveEffectiveRealtimeConfig(typeDefault, agent?.TypeConfiguration ?? null, null);
        } catch {
            return {};
        }
    }

    /**
     * Resolves the baseline config's `realtime.modelPreference` (Name or ID) to an
     * `MJ: AI Models.ID`, so a `preferredModelId` equal to it is recognized as a NON-deviation.
     * When the preference matches no cached model (or the cache is unavailable), the RAW
     * preference string is returned — an ID-style preference then still compares equal to the
     * matching `preferredModelId` (case-insensitive), while a name-style preference simply won't
     * match an id (and the gate treats the request as a deviation — the fail-safe direction).
     * `null` only when no preference is configured at all.
     */
    private resolveMetadataPreferredModelID(baseline: RealtimeCoAgentConfig): string | null {
        const preference = baseline.realtime?.modelPreference;
        if (!preference) {
            return null;
        }
        try {
            const models = AIEngine.Instance.Models ?? [];
            const wanted = preference.trim().toLowerCase();
            const matched =
                models.find((m) => UUIDsEqual(m.ID, preference)) ??
                models.find((m) => m.Name?.trim().toLowerCase() === wanted);
            return matched?.ID ?? preference;
        } catch {
            return preference;
        }
    }

    /**
     * Hierarchy-aware check for the `Realtime: Advanced Session Controls` authorization against
     * the request provider's cached Authorizations + the caller's roles. FAIL-CLOSED: an absent
     * authorization row (un-synced seed) or an evaluation error denies — runtime overrides are a
     * privileged path, and unauthorized callers still get a fully working session without them.
     */
    private userHasAdvancedSessionControls(contextUser: UserInfo, provider: IMetadataProvider): boolean {
        try {
            const auths = provider.Authorizations ?? [];
            const wanted = REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION.trim().toLowerCase();
            const auth = auths.find((a) => a.Name?.trim().toLowerCase() === wanted);
            if (!auth) {
                LogError(
                    `StartRealtimeClientSession: the '${REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION}' ` +
                        'authorization is not present in metadata — runtime overrides are denied (fail closed). ' +
                        'Sync the authorization seed metadata to enable them.',
                );
                return false;
            }
            return new AuthorizationEvaluator().UserCanExecuteWithAncestors(auth, contextUser, auths);
        } catch (error) {
            LogError(
                `StartRealtimeClientSession: authorization evaluation failed (${(error as Error).message}) — ` +
                    'runtime overrides are denied (fail closed).',
            );
            return false;
        }
    }

    /**
     * Resolves the co-agent (the Realtime-type agent that voices the target agent) for a new
     * client-direct session via the metadata-driven **CO-AGENT RESOLUTION CHAIN** — first match
     * wins, evaluated in precedence order:
     *
     * 1. **Runtime parameter** — the mutation's explicit `coAgentId`. A per-call override; an
     *    invalid candidate (unknown, not Active, or not of the Realtime agent type) **throws**
     *    (fail loud — the caller asked for something specific, mirroring `preferredModelId`).
     * 2. **Per-agent persona** — the target agent's `AIAgent.DefaultCoAgentID`. An invalid
     *    reference logs a warning and **falls through** to the next step (stale metadata should
     *    degrade gracefully, never break calls).
     * 3. **Per-type default** — an Active `AIAgentCoAgent` row of Type `'CoAgent'` whose
     *    `TargetAgentTypeID` is the target agent's type and `IsDefault = 1` (lowest `Sequence`
     *    wins a tie). Same tolerant warn-and-fall-through semantics as step 2.
     * 4. **Global default** — the seeded {@link REALTIME_CO_AGENT_NAME} agent, looked up by name
     *    (with a deprecated fallback to {@link LEGACY_REALTIME_CO_AGENT_NAME}). Throws when absent
     *    entirely (the realtime feature is unconfigured in this deployment).
     *
     * Every candidate from steps 1–3 is validated by {@link findValidCoAgent}: it must exist in
     * {@link AIEngine}'s cached agents, have Status `Active`, and be of the
     * {@link REALTIME_AGENT_TYPE_NAME} agent type. Step 4 keeps its original name-lookup contract.
     *
     * @param targetAgentId The agent the co-agent will voice on behalf of (drives steps 2–3).
     * @param explicitCoAgentId The runtime `coAgentId` mutation argument, when supplied (step 1).
     * @returns The resolved co-agent's id (canonical casing from the metadata cache).
     */
    private async resolveCoAgentID(
        targetAgentId: string | undefined,
        explicitCoAgentId: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string> {
        await AIEngine.Instance.Config(false, contextUser, provider);

        // Step 1 — explicit runtime parameter: fail LOUD on any problem.
        if (explicitCoAgentId) {
            const { agent, problem } = this.findValidCoAgent(explicitCoAgentId);
            if (!agent) {
                throw new Error(`Invalid coAgentId '${explicitCoAgentId}': ${problem}`);
            }
            return agent.ID;
        }

        const targetAgent = targetAgentId
            ? (AIEngine.Instance.Agents ?? []).find(a => UUIDsEqual(a.ID, targetAgentId))
            : undefined;

        // Step 2 — the target agent's own DefaultCoAgentID (per-agent persona): warn + fall through.
        const fromAgent = this.resolveMetadataDefault(
            targetAgent?.DefaultCoAgentID,
            `agent '${targetAgent?.Name}' (DefaultCoAgentID)`,
        );
        if (fromAgent) {
            return fromAgent;
        }

        // Step 3 — the type-level AIAgentCoAgent default row (per-type default): warn + fall through.
        const agentType = targetAgent?.TypeID
            ? (AIEngine.Instance.AgentTypes ?? []).find(t => UUIDsEqual(t.ID, targetAgent.TypeID))
            : undefined;
        const typeDefaultCoAgentID = agentType
            ? this.findTypeDefaultCoAgentID(agentType.ID, contextUser, provider)
            : undefined;
        const fromType = this.resolveMetadataDefault(
            await typeDefaultCoAgentID,
            `agent type '${agentType?.Name}' (AIAgentCoAgent type-default row)`,
        );
        if (fromType) {
            return fromType;
        }

        // Step 4 — global default: the seeded Realtime Co-Agent, by name (original behavior).
        return this.resolveGlobalCoAgentID();
    }

    /**
     * Chain step 3 lookup: the TYPE-LEVEL default co-agent for an agent type — the Active
     * `AIAgentCoAgent` row of Type `'CoAgent'` whose `TargetAgentTypeID` matches, with
     * `IsDefault = 1` preferred and the lowest `Sequence` breaking ties (so a deployment can
     * stage multiple type-level candidates deterministically). Reads {@link AIEngineBase}'s
     * cached rows — no RunView. Tolerant: a failed cache read logs and returns `undefined`
     * (the chain falls through to the global default).
     */
    private async findTypeDefaultCoAgentID(
        agentTypeID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | undefined> {
        try {
            const engine = await this.configuredAIEngineBase(contextUser, provider);
            const candidates = (engine.AgentCoAgents ?? [])
                .filter((r) =>
                    r.Type === 'CoAgent' &&
                    r.Status === 'Active' &&
                    r.TargetAgentTypeID != null &&
                    UUIDsEqual(r.TargetAgentTypeID, agentTypeID))
                .sort((a, b) =>
                    (a.IsDefault === b.IsDefault ? 0 : a.IsDefault ? -1 : 1) ||
                    (a.Sequence ?? 0) - (b.Sequence ?? 0));
            return candidates[0]?.CoAgentID;
        } catch (error) {
            LogError(
                `StartRealtimeClientSession: ${CO_AGENT_ENTITY} cache read failed while resolving the type-level ` +
                    `default co-agent for agent type ${agentTypeID} (${(error as Error).message}) — falling through.`,
            );
            return undefined;
        }
    }

    /**
     * Validates one metadata-level co-agent default (chain steps 2/3). Returns the resolved
     * co-agent id when the reference is valid; logs a warning and returns `null` (caller falls
     * through to the next chain step) when the reference is set but invalid — metadata drift must
     * degrade, not break live calls. A `null`/absent reference returns `null` silently.
     */
    private resolveMetadataDefault(candidateId: string | null | undefined, source: string): string | null {
        if (!candidateId) {
            return null;
        }
        const { agent, problem } = this.findValidCoAgent(candidateId);
        if (agent) {
            return agent.ID;
        }
        LogError(
            `StartRealtimeClientSession: ignoring co-agent default '${candidateId}' from ${source} — ${problem} ` +
                'Falling through to the next step of the co-agent resolution chain.',
        );
        return null;
    }

    /**
     * Validates a co-agent candidate against {@link AIEngine}'s cached metadata. A valid co-agent
     * must (a) exist, (b) have Status `Active`, and (c) be of the {@link REALTIME_AGENT_TYPE_NAME}
     * agent type. Returns the cached agent on success, or a human-readable `problem` on failure —
     * the CALLER decides whether that's fatal (explicit runtime param) or tolerated (metadata default).
     */
    private findValidCoAgent(candidateId: string): { agent?: MJAIAgentEntityExtended; problem?: string } {
        const agent = (AIEngine.Instance.Agents ?? []).find(a => UUIDsEqual(a.ID, candidateId));
        if (!agent) {
            return { problem: 'no agent with that ID exists.' };
        }
        if (agent.Status !== 'Active') {
            return { problem: `agent '${agent.Name}' is not Active (Status: ${agent.Status}).` };
        }
        const realtimeType = (AIEngine.Instance.AgentTypes ?? []).find(
            t => t.Name?.trim().toLowerCase() === REALTIME_AGENT_TYPE_NAME.toLowerCase(),
        );
        if (!realtimeType) {
            return { problem: `the '${REALTIME_AGENT_TYPE_NAME}' agent type is not configured in this deployment.` };
        }
        if (!agent.TypeID || !UUIDsEqual(agent.TypeID, realtimeType.ID)) {
            return { problem: `agent '${agent.Name}' is not of the '${REALTIME_AGENT_TYPE_NAME}' agent type.` };
        }
        return { agent };
    }

    /**
     * Resolves the seeded Realtime Co-Agent's id from {@link AIEngine}'s cached agents — the GLOBAL
     * DEFAULT (step 4) of the co-agent resolution chain. The engine is already configured by
     * {@link resolveCoAgentID}. Looks up the current {@link REALTIME_CO_AGENT_NAME} first, then
     * falls back to the DEPRECATED {@link LEGACY_REALTIME_CO_AGENT_NAME} (pre-rename seed) with a
     * deprecation log so un-resynced deployments keep working. Throws a clear error when neither
     * name is present in metadata.
     */
    private resolveGlobalCoAgentID(): string {
        const coAgent = this.findAgentByName(REALTIME_CO_AGENT_NAME);
        if (coAgent) {
            return coAgent.ID;
        }
        const legacy = this.findAgentByName(LEGACY_REALTIME_CO_AGENT_NAME);
        if (legacy) {
            LogStatus(
                `StartRealtimeClientSession: resolved the global co-agent via its DEPRECATED legacy name ` +
                    `'${LEGACY_REALTIME_CO_AGENT_NAME}'. Re-sync the agent seed metadata to rename it to ` +
                    `'${REALTIME_CO_AGENT_NAME}'.`,
            );
            return legacy.ID;
        }
        throw new Error(
            `The '${REALTIME_CO_AGENT_NAME}' agent is not configured; cannot start a realtime voice session.`,
        );
    }

    /** Case/whitespace-insensitive agent lookup by Name in {@link AIEngine}'s cached agents. */
    private findAgentByName(name: string): MJAIAgentEntityExtended | undefined {
        const wanted = name.toLowerCase();
        return (AIEngine.Instance.Agents ?? []).find(a => a.Name?.trim().toLowerCase() === wanted);
    }

    /**
     * Mints the client session config for a just-created session. On failure, closes the session so
     * no half-open record leaks, then throws the service's error message.
     *
     * @param preferredModelId Optional explicit realtime model choice — threaded to the service,
     *   which FAILS (no silent fallback) when the chosen model cannot be satisfied.
     * @param priorTranscript Optional capped, role-tagged transcript of the PRIOR session chain
     *   (from {@link loadPriorTranscript}) — the service frames it into the system prompt so a
     *   resumed session remembers the previous leg(s).
     */
    private async prepareClientSessionOrClose(
        session: MJAIAgentSessionEntity,
        coAgentID: string,
        targetAgentId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        preferredModelId?: string,
        clientTools?: RealtimeToolDefinition[],
        priorTranscript?: string,
        configOverridesJson?: string,
    ): Promise<StartRealtimeClientSessionResult> {
        const prep = await this.clientSessionService.PrepareClientSession(
            {
                CoAgentID: coAgentID,
                TargetAgentID: targetAgentId,
                AgentSessionID: session.ID,
                ConversationID: session.ConversationID ?? undefined,
                // MVP: conversation history is not yet hydrated into ChatMessage[]; the co-agent
                // companion prompt runs without prior turns. A later phase loads the session's
                // Conversation into ChatMessage[] for richer context.
                ConversationMessages: [],
                UserID: contextUser.ID,
                PreferredModelID: preferredModelId,
                // Client-declared, CLIENT-EXECUTED UI tools (see the mutation's SECURITY NOTE) —
                // merged after invoke-target-agent into the declared tool set.
                ExtraTools: clientTools,
                // Resume continuity: the prior leg(s)' transcript, framed into the system prompt.
                PriorTranscript: priorTranscript,
                // Pre-authorized runtime override layer (assertRuntimeOverridesAuthorized gated it).
                ConfigOverridesJson: configOverridesJson,
            },
            contextUser,
            provider,
        );

        if (!prep.Success || !prep.ClientConfig) {
            // Prep failure is an ERROR close, not an explicit user hang-up — stamp it as such.
            await this.sessionManager.CloseSession(session.ID, contextUser, provider, 'Error');
            throw new Error(prep.ErrorMessage ?? 'Failed to prepare the client realtime session.');
        }

        await this.persistObservabilityRunIDs(session, targetAgentId, prep.CoAgentRunID, prep.PromptRunID, prep.CoAgentRunStepID);

        const cfg = prep.ClientConfig;
        return {
            AgentSessionId: session.ID,
            ConversationId: session.ConversationID ?? '',
            Provider: cfg.Provider,
            Model: cfg.Model,
            EphemeralToken: cfg.EphemeralToken,
            ExpiresAt: cfg.ExpiresAt,
            SessionConfigJson: JSON.stringify(cfg.SessionConfig),
            ModelName: prep.ModelName,
            NarrationInstructionsTemplate: prep.NarrationInstructionsTemplate,
            NarrationPaceMs: prep.NarrationPaceMs,
            EffectiveConfigJson: prep.EffectiveConfig ? JSON.stringify(prep.EffectiveConfig) : undefined,
        };
    }

    /**
     * Writes the co-agent observability run ids into the session's `Config_` alongside the
     * authoritative `targetAgentID`, then saves the session. These ids are read back on close to
     * finalize the runs (and on relay to nest delegated runs). Best-effort: a save failure is logged,
     * not thrown — the voice session still proceeds, it just won't carry the run ids.
     */
    private async persistObservabilityRunIDs(
        session: MJAIAgentSessionEntity,
        targetAgentID: string,
        coAgentRunID?: string,
        promptRunID?: string,
        coAgentRunStepID?: string,
    ): Promise<void> {
        const config: RealtimeSessionConfig = { targetAgentID, coAgentRunID, promptRunID, coAgentRunStepID };
        session.Config_ = JSON.stringify(config);
        const saved = await session.Save();
        if (!saved) {
            LogError(
                `RealtimeClientSessionResolver.persistObservabilityRunIDs save failed: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /**
     * Loads a session, enforcing inbound ownership (`UserID === contextUser.ID`) and that it is not
     * `Closed`. Throws on any violation. Returns the loaded session for the caller to read from.
     */
    private async loadOwnedActiveSession(
        agentSessionId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MJAIAgentSessionEntity> {
        const session = await this.loadOwnedSession(agentSessionId, contextUser, provider);
        if (session.Status === 'Closed') {
            throw new Error(`Realtime session ${agentSessionId} is closed`);
        }
        return session;
    }

    /**
     * Loads a session and enforces inbound ownership (`UserID === contextUser.ID`) WITHOUT
     * rejecting `Closed` sessions — {@link SaveSessionChannelState}'s final on-end flush
     * legitimately arrives after the session closed. Throws when not found / not owned.
     */
    private async loadOwnedSession(
        agentSessionId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MJAIAgentSessionEntity> {
        const session = await provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, contextUser);
        const loaded = await session.Load(agentSessionId);
        if (!loaded) {
            throw new Error(`Realtime session ${agentSessionId} not found`);
        }
        if (!UUIDsEqual(session.UserID, contextUser.ID)) {
            LogError(
                `RealtimeClientSessionResolver: ownership check failed — user ${contextUser.ID} attempted to operate on session ${agentSessionId} owned by ${session.UserID}`,
            );
            throw new Error('Not authorized: you do not own this realtime session');
        }
        return session;
    }

    /**
     * Resolves an ACTIVE channel definition (`MJ: AI Agent Channels`) by name from
     * {@link AIEngineBase}'s cached `AgentChannels` (provider-scoped engine instance, lazy
     * `Config` — no per-call RunView; name matching is trim + case-insensitive, parity with the
     * previous SQL-collation lookup). Returns its id, or `null` (logged) when no active
     * definition exists — the channel seed is deployed separately, so its absence is tolerated,
     * never thrown.
     */
    private async resolveChannelID(
        channelName: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        const wanted = channelName.trim().toLowerCase();
        let row: { ID: string; IsActive: boolean } | undefined;
        try {
            const engine = await this.configuredAIEngineBase(contextUser, provider);
            row = (engine.AgentChannels ?? []).find((c) => c.Name?.trim().toLowerCase() === wanted);
        } catch (error) {
            LogError(
                `RealtimeClientSessionResolver: ${CHANNEL_ENTITY} cache read failed while resolving channel ` +
                    `'${channelName}' (${(error as Error).message}) — channel operation skipped.`,
            );
            return null;
        }
        if (!row || !row.IsActive) {
            LogError(
                `RealtimeClientSessionResolver: no active '${channelName}' channel definition found in ${CHANNEL_ENTITY} — ` +
                    'channel operation skipped (sync the channel seed metadata to enable it).',
            );
            return null;
        }
        return row.ID;
    }

    /**
     * Upserts the session-channel row for `(agentSessionID, channelID)`: creates it with Status
     * `Connected` when missing, stores `stateJson` in `Config`, and stamps `LastActiveAt`.
     * Returns the boolean save result (logged on failure).
     */
    private async upsertSessionChannelState(
        agentSessionID: string,
        channelID: string,
        stateJson: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        const rv = RunView.FromMetadataProvider(provider);
        const existing = await rv.RunView<MJAIAgentSessionChannelEntity>(
            {
                EntityName: SESSION_CHANNEL_ENTITY,
                ExtraFilter: `AgentSessionID='${agentSessionID}' AND ChannelID='${channelID}'`,
                ResultType: 'entity_object',
                MaxRows: 1,
            },
            contextUser,
        );

        let row = existing.Success ? existing.Results?.[0] : undefined;
        if (!row) {
            row = await provider.GetEntityObject<MJAIAgentSessionChannelEntity>(SESSION_CHANNEL_ENTITY, contextUser);
            row.NewRecord();
            row.AgentSessionID = agentSessionID;
            row.ChannelID = channelID;
            row.Status = 'Connected';
        }
        row.Config_ = stateJson;
        row.LastActiveAt = new Date();

        const saved = await row.Save();
        if (!saved) {
            LogError(
                `SaveSessionChannelState: save failed for session ${agentSessionID} / channel ${channelID}: ` +
                    `${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return saved;
    }

    /**
     * Loads the PRIOR session's persisted channel states and serializes them as a JSON object
     * string keyed by channel NAME (the session-channel view denormalizes the channel name as the
     * `Channel` virtual field). Strictly best-effort — every failure path logs and returns `null`,
     * a session start NEVER fails because of restore:
     *  - no `lastSessionId` → `null` (silently — restore simply wasn't requested);
     *  - prior session missing OR owned by a different user → `null` (logged — never leak another
     *    user's channel state);
     *  - rows with an empty `Config` are skipped;
     *  - an individual state larger than {@link MAX_CHANNEL_STATE_CHARS} is dropped (logged), and
     *    states that would push the accumulated payload past that same cap are dropped too (logged)
     *    — the surviving states still restore;
     *  - no surviving states → `null`.
     */
    private async loadPriorChannelStatesJson(
        lastSessionId: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        if (!lastSessionId) {
            return null;
        }
        try {
            const prior = await provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, contextUser);
            if (!(await prior.Load(lastSessionId))) {
                LogError(`StartRealtimeClientSession: prior session ${lastSessionId} not found — skipping channel-state restore.`);
                return null;
            }
            if (!UUIDsEqual(prior.UserID, contextUser.ID)) {
                LogError(
                    `StartRealtimeClientSession: prior session ${lastSessionId} is not owned by user ${contextUser.ID} — ` +
                        'skipping channel-state restore.',
                );
                return null;
            }

            const safeID = lastSessionId.replace(/'/g, "''");
            const rv = RunView.FromMetadataProvider(provider);
            const result = await rv.RunView<{ Channel: string; Config: string | null }>(
                {
                    EntityName: SESSION_CHANNEL_ENTITY,
                    ExtraFilter: `AgentSessionID='${safeID}'`,
                    Fields: ['Channel', 'Config'],
                    ResultType: 'simple',
                },
                contextUser,
            );
            if (!result.Success) {
                LogError(`StartRealtimeClientSession: channel-state restore query failed for prior session ${lastSessionId}: ${result.ErrorMessage}`);
                return null;
            }

            const states = this.collectChannelStates(result.Results ?? [], lastSessionId);
            return Object.keys(states).length > 0 ? JSON.stringify(states) : null;
        } catch (error) {
            LogError(`StartRealtimeClientSession: channel-state restore failed for prior session ${lastSessionId}: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Loads the PRIOR session chain's transcript for model-context hydration: when a new session
     * carries `lastSessionId`, the chain's persisted, session-stamped `Conversation Details` are
     * folded into capped, role-tagged lines (`User: …` / `Assistant: …`) the prepare service
     * frames into the system prompt — so the model REMEMBERS the previous live leg(s).
     *
     * Chain walk + caps:
     *  - follows `LastSessionID` BACKWARDS from `lastSessionId`, at most
     *    {@link MAX_PRIOR_TRANSCRIPT_LEGS} legs, with a visited-set cycle guard (A→B→A stops);
     *  - EVERY leg is ownership-checked like the channel-state restore — the FIRST leg failing
     *    the check aborts hydration entirely (first leg) or ends the walk (deeper legs), so
     *    another user's transcript can never leak;
     *  - one details query covers all collected legs, chronological;
     *  - hidden/error/empty rows are skipped, then the NEWEST {@link MAX_PRIOR_TRANSCRIPT_TURNS}
     *    turns are kept and the total is capped at {@link MAX_PRIOR_TRANSCRIPT_CHARS} chars
     *    (oldest dropped first).
     *
     * Strictly best-effort: every failure path logs and returns `undefined` — hydration NEVER
     * blocks a session start.
     */
    private async loadPriorTranscript(
        lastSessionId: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | undefined> {
        if (!lastSessionId) {
            return undefined;
        }
        try {
            const legIDs = await this.collectOwnedPriorLegIDs(lastSessionId, contextUser, provider);
            if (legIDs.length === 0) {
                return undefined;
            }
            const turns = await this.loadChainTranscriptTurns(legIDs, contextUser, provider);
            const lines = this.capTranscriptLines(turns);
            return lines.length > 0 ? lines.join('\n') : undefined;
        } catch (error) {
            LogError(
                `StartRealtimeClientSession: prior-transcript hydration failed for session ${lastSessionId}: ${(error as Error).message}`,
            );
            return undefined;
        }
    }

    /**
     * Walks the prior-session chain backwards from `lastSessionId`, returning the OWNED leg ids
     * (newest first). The first leg must exist and be owned by the caller, else `[]` (logged);
     * deeper-leg problems (missing, unowned, cycle) just end the walk.
     */
    private async collectOwnedPriorLegIDs(
        lastSessionId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string[]> {
        const legIDs: string[] = [];
        const visited = new Set<string>();
        let cursor: string | null = lastSessionId;
        while (cursor && legIDs.length < MAX_PRIOR_TRANSCRIPT_LEGS) {
            const key = cursor.trim().toLowerCase();
            if (visited.has(key)) {
                LogError(`StartRealtimeClientSession: prior-session chain cycle detected at ${cursor} — stopping the transcript walk.`);
                break;
            }
            visited.add(key);
            const leg = await provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, contextUser);
            if (!(await leg.Load(cursor))) {
                if (legIDs.length === 0) {
                    LogError(`StartRealtimeClientSession: prior session ${cursor} not found — skipping transcript hydration.`);
                }
                break;
            }
            if (!UUIDsEqual(leg.UserID, contextUser.ID)) {
                if (legIDs.length === 0) {
                    LogError(
                        `StartRealtimeClientSession: prior session ${cursor} is not owned by user ${contextUser.ID} — ` +
                            'skipping transcript hydration.',
                    );
                }
                break;
            }
            legIDs.push(leg.ID);
            cursor = leg.LastSessionID ?? null;
        }
        return legIDs;
    }

    /**
     * Loads the chain legs' visible transcript turns (session-stamped `Conversation Details`,
     * `Role` User/AI, not hidden, non-empty) in ONE chronological query across all legs.
     */
    private async loadChainTranscriptTurns(
        legIDs: string[],
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<Array<{ Role: string; Message: string }>> {
        const inList = legIDs.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<{ Role: string; Message: string | null; HiddenToUser: boolean }>(
            {
                EntityName: CONVERSATION_DETAIL_ENTITY,
                ExtraFilter: `AgentSessionID IN (${inList})`,
                Fields: ['ID', 'Role', 'Message', 'HiddenToUser', '__mj_CreatedAt'],
                OrderBy: '__mj_CreatedAt ASC',
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!result.Success) {
            LogError(`StartRealtimeClientSession: prior-transcript query failed: ${result.ErrorMessage}`);
            return [];
        }
        return (result.Results ?? []).filter(
            (row) =>
                !row.HiddenToUser &&
                (row.Role === 'User' || row.Role === 'AI') &&
                typeof row.Message === 'string' &&
                row.Message.trim().length > 0,
        ) as Array<{ Role: string; Message: string }>;
    }

    /**
     * Maps visible turns to role-tagged lines and applies the hydration caps: the NEWEST
     * {@link MAX_PRIOR_TRANSCRIPT_TURNS} turns, then a total budget of
     * {@link MAX_PRIOR_TRANSCRIPT_CHARS} chars — oldest lines dropped first in both passes,
     * so the model always keeps the freshest context.
     */
    private capTranscriptLines(turns: Array<{ Role: string; Message: string }>): string[] {
        const newest = turns.slice(-MAX_PRIOR_TRANSCRIPT_TURNS);
        const lines = newest.map((t) => `${t.Role === 'User' ? 'User' : 'Assistant'}: ${t.Message.trim()}`);
        let total = lines.reduce((sum, line) => sum + line.length + 1, 0);
        while (lines.length > 0 && total > MAX_PRIOR_TRANSCRIPT_CHARS) {
            const dropped = lines.shift() as string;
            total -= dropped.length + 1;
        }
        return lines;
    }

    /**
     * Folds prior session-channel rows into a `{ channelName: stateJson }` map, skipping empty
     * states and enforcing the {@link MAX_CHANNEL_STATE_CHARS} cap both per-state and on the
     * accumulated total (oversized states are dropped with a log note; the rest survive).
     */
    private collectChannelStates(
        rows: Array<{ Channel: string; Config: string | null }>,
        lastSessionId: string,
    ): Record<string, string> {
        const states: Record<string, string> = {};
        let totalChars = 0;
        for (const row of rows) {
            if (!row.Channel || !row.Config) {
                continue;
            }
            if (row.Config.length > MAX_CHANNEL_STATE_CHARS || totalChars + row.Config.length > MAX_CHANNEL_STATE_CHARS) {
                LogError(
                    `StartRealtimeClientSession: dropped oversized '${row.Channel}' channel state from prior session ${lastSessionId} ` +
                        `(${row.Config.length} chars; restore payload is capped at ${MAX_CHANNEL_STATE_CHARS}).`,
                );
                continue;
            }
            states[row.Channel] = row.Config;
            totalChars += row.Config.length;
        }
        return states;
    }

    /**
     * Resolves the ENABLED {@link WHITEBOARD_ARTIFACT_TYPE_NAME} artifact type's id. Returns `null`
     * (logged) when the type seed is absent or disabled — the artifact-type seed is deployed
     * separately, so its absence is a graceful structured failure, never a throw.
     */
    private async resolveWhiteboardArtifactTypeID(
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<{ ID: string; IsEnabled: boolean }>(
            {
                EntityName: ARTIFACT_TYPE_ENTITY,
                ExtraFilter: `Name='${WHITEBOARD_ARTIFACT_TYPE_NAME}'`,
                Fields: ['ID', 'IsEnabled'],
                ResultType: 'simple',
                MaxRows: 1,
            },
            contextUser,
        );
        const row = result.Success ? result.Results?.[0] : undefined;
        if (!row || !row.IsEnabled) {
            LogError(
                `SaveSessionChannelArtifact: no enabled '${WHITEBOARD_ARTIFACT_TYPE_NAME}' artifact type found in ${ARTIFACT_TYPE_ENTITY} — ` +
                    'artifact not created (sync the artifact-type seed metadata to enable this).',
            );
            return null;
        }
        return row.ID;
    }

    /**
     * Creates the user-owned artifact header + its v1 version for a channel-state save, then runs
     * the best-effort extras (conversation-history junction + session-channel `LastActiveAt`
     * stamp). Header/version save failures come back as structured failures; the extras NEVER
     * fail the save.
     */
    private async createChannelArtifact(
        session: MJAIAgentSessionEntity,
        channelName: string,
        name: string,
        contentJson: string,
        typeID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<SaveSessionChannelArtifactResult> {
        const artifact = await provider.GetEntityObject<MJArtifactEntity>(ARTIFACT_ENTITY, contextUser);
        artifact.NewRecord();
        artifact.Name = name;
        artifact.Description = `Saved from realtime agent session ${session.ID} ('${channelName}' channel).`;
        artifact.TypeID = typeID;
        artifact.UserID = contextUser.ID;
        artifact.Visibility = 'Always';
        if (!(await artifact.Save())) {
            const message = `SaveSessionChannelArtifact: artifact save failed: ${artifact.LatestResult?.CompleteMessage ?? 'unknown error'}`;
            LogError(message);
            return { Success: false, ErrorMessage: message, ConversationDetailLinked: false };
        }

        const version = await provider.GetEntityObject<MJArtifactVersionEntity>(ARTIFACT_VERSION_ENTITY, contextUser);
        version.NewRecord();
        version.ArtifactID = artifact.ID;
        version.VersionNumber = 1;
        version.Content = contentJson;
        version.UserID = contextUser.ID;
        if (!(await version.Save())) {
            const message = `SaveSessionChannelArtifact: artifact version save failed: ${version.LatestResult?.CompleteMessage ?? 'unknown error'}`;
            LogError(message);
            return { Success: false, ErrorMessage: message, ArtifactID: artifact.ID, ConversationDetailLinked: false };
        }

        const linked = await this.linkVersionToLatestSessionDetail(session, version.ID, contextUser, provider);
        await this.stampSessionChannelLastActive(session.ID, channelName, contextUser, provider);

        return { Success: true, ArtifactID: artifact.ID, ArtifactVersionID: version.ID, ConversationDetailLinked: linked };
    }

    /**
     * Best-effort: links an artifact version into conversation history the way chat does — via a
     * `MJ: Conversation Detail Artifacts` junction row (Direction `Output`) against the LATEST
     * `Conversation Detail` stamped with this session's id (the transcript relay stamps
     * `AgentSessionID` on every persisted turn). Skips silently (returns `false`) when the session
     * has no conversation or no stamped detail exists yet; logs (and returns `false`) when the
     * lookup or junction save fails. Never throws.
     */
    private async linkVersionToLatestSessionDetail(
        session: MJAIAgentSessionEntity,
        artifactVersionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        if (!session.ConversationID) {
            return false;
        }
        try {
            const detailID = await this.findLatestSessionDetailID(session, contextUser, provider);
            if (!detailID) {
                return false; // no transcript turn persisted yet — nothing to anchor the artifact to
            }
            return await this.saveDetailArtifactJunction(detailID, artifactVersionID, contextUser, provider);
        } catch (error) {
            LogError(`SaveSessionChannelArtifact: conversation-history link failed: ${(error as Error).message}`);
            return false;
        }
    }

    /**
     * Best-effort: junction-links the artifacts a DELEGATED target-agent run produced into the
     * session's conversation history — closing the gap where voice-path artifacts were created
     * (`RealtimeClientSessionService.createDelegatedRunArtifacts`) but never reached
     * `MJ: Conversation Detail Artifacts`, leaving chat, session review, and resume carryover
     * blind to them.
     *
     * ANCHOR CHOICE: the junction needs a `Conversation Detail`. We anchor to the MOST RECENT
     * detail stamped with this session's id (the transcript relay stamps `AgentSessionID` on every
     * persisted turn) — the turn closest to the tool call that produced the artifact. When NO
     * stamped detail exists yet (the delegated run finished before the browser relayed any
     * transcript — the relay is asynchronous), we create a minimal HIDDEN anchor detail
     * (`Role: 'AI'`, `HiddenToUser: true`, stamped with the session id + conversation + user)
     * rather than dropping the link: `HiddenToUser` keeps it out of the visible chat thread and
     * out of review-mode captions (both filter hidden rows), while conversation-level artifact
     * queries (which scan junctions across ALL details) still surface the artifact. This is the
     * least-invasive correct anchor — no fake visible message, no orphaned artifact.
     *
     * Strictly best-effort: every failure path logs and returns; a relayed tool call NEVER fails
     * because history linking did.
     */
    private async linkDelegatedArtifactsToConversation(
        session: MJAIAgentSessionEntity,
        artifacts: DelegatedRunArtifact[] | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        if (!artifacts || artifacts.length === 0 || !session.ConversationID) {
            return;
        }
        try {
            const detailID =
                (await this.findLatestSessionDetailID(session, contextUser, provider)) ??
                (await this.createHiddenSessionAnchorDetail(session, contextUser, provider));
            if (!detailID) {
                return; // anchor unavailable — logged in the helpers
            }
            for (const artifact of artifacts) {
                await this.saveDetailArtifactJunction(detailID, artifact.ArtifactVersionID, contextUser, provider);
            }
        } catch (error) {
            LogError(`ExecuteRealtimeSessionTool: delegated-artifact history link failed: ${(error as Error).message}`);
        }
    }

    /**
     * Finds the LATEST `Conversation Detail` stamped with this session's id (the transcript relay
     * stamps `AgentSessionID` on every persisted turn). Returns its id, or `null` when none exists.
     */
    private async findLatestSessionDetailID(
        session: MJAIAgentSessionEntity,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        const safeID = session.ID.replace(/'/g, "''");
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: CONVERSATION_DETAIL_ENTITY,
                ExtraFilter: `AgentSessionID='${safeID}'`,
                Fields: ['ID'],
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'simple',
                MaxRows: 1,
            },
            contextUser,
        );
        const detail = result.Success ? result.Results?.[0] : undefined;
        return detail?.ID ?? null;
    }

    /**
     * Creates the minimal HIDDEN anchor `Conversation Detail` for artifact junction rows when no
     * session-stamped transcript turn exists yet (see the anchor-choice rationale on
     * {@link linkDelegatedArtifactsToConversation}). Returns the new detail's id, or `null`
     * (logged) when the save fails.
     */
    private async createHiddenSessionAnchorDetail(
        session: MJAIAgentSessionEntity,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>(CONVERSATION_DETAIL_ENTITY, contextUser);
        detail.NewRecord();
        detail.ConversationID = session.ConversationID;
        detail.Role = 'AI';
        detail.HiddenToUser = true;
        detail.Message = 'Artifacts produced during a realtime session (system anchor).';
        detail.AgentSessionID = session.ID;
        detail.UserID = contextUser.ID;
        if (await detail.Save()) {
            return detail.ID;
        }
        LogError(
            `ExecuteRealtimeSessionTool: hidden anchor detail save failed for session ${session.ID}: ` +
                `${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
        return null;
    }

    /**
     * Saves one `MJ: Conversation Detail Artifacts` junction row (Direction `Output`) linking an
     * artifact version to a conversation detail. Returns the boolean save result (logged on failure).
     */
    private async saveDetailArtifactJunction(
        conversationDetailID: string,
        artifactVersionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        const junction = await provider.GetEntityObject<MJConversationDetailArtifactEntity>(
            CONVERSATION_DETAIL_ARTIFACT_ENTITY,
            contextUser,
        );
        junction.NewRecord();
        junction.ConversationDetailID = conversationDetailID;
        junction.ArtifactVersionID = artifactVersionID;
        junction.Direction = 'Output';
        const saved = await junction.Save();
        if (!saved) {
            LogError(
                `RealtimeClientSessionResolver: artifact junction save failed for detail ${conversationDetailID} / version ${artifactVersionID}: ` +
                    `${junction.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return saved;
    }

    /**
     * Best-effort: stamps `LastActiveAt` on the session-channel row for `(session, channelName)`
     * when one exists — saving an artifact IS channel activity. Missing channel definition or
     * session-channel row is a silent no-op; failures log and never throw.
     */
    private async stampSessionChannelLastActive(
        agentSessionID: string,
        channelName: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        try {
            const channelID = await this.resolveChannelID(channelName, contextUser, provider);
            if (!channelID) {
                return;
            }
            const rv = RunView.FromMetadataProvider(provider);
            const existing = await rv.RunView<MJAIAgentSessionChannelEntity>(
                {
                    EntityName: SESSION_CHANNEL_ENTITY,
                    ExtraFilter: `AgentSessionID='${agentSessionID}' AND ChannelID='${channelID}'`,
                    ResultType: 'entity_object',
                    MaxRows: 1,
                },
                contextUser,
            );
            const row = existing.Success ? existing.Results?.[0] : undefined;
            if (!row) {
                return;
            }
            row.LastActiveAt = new Date();
            if (!(await row.Save())) {
                LogError(
                    `SaveSessionChannelArtifact: LastActiveAt stamp failed for session ${agentSessionID} / channel ${channelID}: ` +
                        `${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        } catch (error) {
            LogError(`SaveSessionChannelArtifact: LastActiveAt stamp failed: ${(error as Error).message}`);
        }
    }

    /**
     * Tolerantly parses + validates client-declared UI tool definitions (see the SECURITY NOTE on
     * {@link StartRealtimeClientSession}). Never throws — any rejection logs and returns
     * `undefined` (the session simply minted without client tools):
     *  - non-JSON / non-array payloads are rejected wholesale;
     *  - payloads larger than {@link MAX_CLIENT_TOOLS_JSON_CHARS} are rejected wholesale;
     *  - more than {@link MAX_CLIENT_TOOLS} declarations are rejected wholesale (a legitimate
     *    client never sends that many — a flood is a misbehaving caller, not a trim candidate);
     *  - individual entries failing the shape check (`Name`/`Description` non-empty strings,
     *    `ParametersSchema` a plain object) are skipped, the rest survive.
     */
    private parseClientTools(clientToolsJson?: string): RealtimeToolDefinition[] | undefined {
        if (!clientToolsJson) {
            return undefined;
        }
        if (clientToolsJson.length > MAX_CLIENT_TOOLS_JSON_CHARS) {
            LogError(`StartRealtimeClientSession: clientToolsJson rejected — ${clientToolsJson.length} chars exceeds the ${MAX_CLIENT_TOOLS_JSON_CHARS} cap.`);
            return undefined;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(clientToolsJson);
        } catch {
            LogError('StartRealtimeClientSession: clientToolsJson rejected — not valid JSON.');
            return undefined;
        }
        if (!Array.isArray(parsed)) {
            LogError('StartRealtimeClientSession: clientToolsJson rejected — expected a JSON array of tool definitions.');
            return undefined;
        }
        if (parsed.length > MAX_CLIENT_TOOLS) {
            LogError(`StartRealtimeClientSession: clientToolsJson rejected — ${parsed.length} tools exceeds the ${MAX_CLIENT_TOOLS} cap.`);
            return undefined;
        }
        const valid = parsed.filter((t): t is RealtimeToolDefinition => this.isValidClientTool(t));
        if (valid.length < parsed.length) {
            LogError(`StartRealtimeClientSession: skipped ${parsed.length - valid.length} malformed client tool definition(s).`);
        }
        return valid.length > 0 ? valid : undefined;
    }

    /** Shape check for one client tool declaration: Name/Description non-empty strings, ParametersSchema a plain object. */
    private isValidClientTool(candidate: unknown): boolean {
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return false;
        }
        const tool = candidate as Partial<RealtimeToolDefinition>;
        return (
            typeof tool.Name === 'string' && tool.Name.trim().length > 0 && tool.Name.length <= 128 &&
            typeof tool.Description === 'string' && tool.Description.trim().length > 0 &&
            tool.ParametersSchema !== null && typeof tool.ParametersSchema === 'object' && !Array.isArray(tool.ParametersSchema)
        );
    }

    /**
     * Parses the session's persisted config, returning the authoritative `targetAgentID` plus any
     * observability run ids (`coAgentRunID`/`promptRunID`). Throws when the config is missing/malformed
     * or carries no target — a relay cannot proceed without a target.
     */
    private readSessionConfig(session: MJAIAgentSessionEntity): RealtimeSessionConfig {
        const raw = session.Config_;
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as Partial<RealtimeSessionConfig>;
                if (typeof parsed.targetAgentID === 'string' && parsed.targetAgentID.length > 0) {
                    return {
                        targetAgentID: parsed.targetAgentID,
                        coAgentRunID: typeof parsed.coAgentRunID === 'string' ? parsed.coAgentRunID : undefined,
                        promptRunID: typeof parsed.promptRunID === 'string' ? parsed.promptRunID : undefined,
                        coAgentRunStepID: typeof parsed.coAgentRunStepID === 'string' ? parsed.coAgentRunStepID : undefined,
                        pendingFeedbackRunID:
                            typeof parsed.pendingFeedbackRunID === 'string' ? parsed.pendingFeedbackRunID : undefined,
                    };
                }
            } catch {
                /* fall through to the error below */
            }
        }
        throw new Error(`Realtime session ${session.ID} has no target agent configured`);
    }

    /**
     * Persists a single transcript turn as a `Conversation Detail` stamped with the session's
     * conversation, the mapped role, the turn text, the session id, and the owning user.
     *
     * @returns The boolean save result (logs `CompleteMessage` on failure).
     */
    /**
     * Stamps `RecordingStartedAt` (the recording `t0` alignment origin) + `RecordingMedia` on a
     * just-started session when the browser captured WITH consent. Best-effort: a parse/save failure
     * is logged and swallowed — a recording-metadata problem must never fail the session start.
     *
     * @param session The freshly created/loaded session.
     * @param recordingConsent Whether the user consented to recording — only `true` stamps anything.
     * @param recordingStartedAt ISO-8601 recording start timestamp from the browser.
     */
    private async stampRecordingStart(
        session: MJAIAgentSessionEntity,
        recordingConsent: boolean | undefined,
        recordingStartedAt: string | undefined,
    ): Promise<void> {
        if (recordingConsent !== true || !recordingStartedAt) {
            return;
        }
        const startedAt = new Date(recordingStartedAt);
        if (Number.isNaN(startedAt.getTime())) {
            LogError(`RealtimeClientSessionResolver.stampRecordingStart: invalid recordingStartedAt '${recordingStartedAt}' for session ${session.ID}`);
            return;
        }
        session.RecordingStartedAt = startedAt;
        session.RecordingMedia = 'Audio';
        if (!(await session.Save())) {
            LogError(
                `RealtimeClientSessionResolver.stampRecordingStart save failed: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    private async persistTranscriptTurn(
        session: MJAIAgentSessionEntity,
        role: string,
        text: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        utteranceStartMs?: number,
        utteranceEndMs?: number,
    ): Promise<boolean> {
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>(
            CONVERSATION_DETAIL_ENTITY,
            contextUser,
        );
        detail.NewRecord();
        detail.ConversationID = session.ConversationID;
        detail.Role = this.mapTranscriptRole(role);
        detail.Message = text;
        detail.AgentSessionID = session.ID;
        detail.UserID = contextUser.ID;
        if (typeof utteranceStartMs === 'number' && utteranceStartMs >= 0) {
            detail.UtteranceStartMs = utteranceStartMs;
        }
        if (typeof utteranceEndMs === 'number' && utteranceEndMs >= 0) {
            detail.UtteranceEndMs = utteranceEndMs;
        }

        const saved = await detail.Save();
        if (!saved) {
            LogError(
                `RealtimeClientSessionResolver.persistTranscriptTurn save failed: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return saved;
    }

    /**
     * CORRECTION persistence (the client transcript's `ReplacesPrevious` marker — e.g.
     * ElevenLabs' post-barge-in `agent_response_correction`): UPDATES the session's most
     * recently persisted turn of the same role IN PLACE with the corrected text, instead of
     * appending a near-duplicate. Falls back to a plain insert when no prior turn exists
     * (the superseded turn may have failed to persist) — a correction is never dropped.
     */
    private async replacePreviousTranscriptTurn(
        session: MJAIAgentSessionEntity,
        role: string,
        text: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        utteranceStartMs?: number,
        utteranceEndMs?: number,
    ): Promise<boolean> {
        const mappedRole = this.mapTranscriptRole(role);
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJConversationDetailEntity>(
            {
                EntityName: CONVERSATION_DETAIL_ENTITY,
                ExtraFilter: `AgentSessionID='${session.ID}' AND Role='${mappedRole}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        const previous = result.Success ? (result.Results?.[0] ?? null) : null;
        if (!previous) {
            return this.persistTranscriptTurn(session, role, text, contextUser, provider, utteranceStartMs, utteranceEndMs);
        }
        previous.Message = text;
        // The correction extends the existing turn: always refresh the end boundary when provided,
        // but only set the start when it wasn't already captured on the superseded turn.
        if (typeof utteranceEndMs === 'number' && utteranceEndMs >= 0) {
            previous.UtteranceEndMs = utteranceEndMs;
        }
        if (typeof utteranceStartMs === 'number' && utteranceStartMs >= 0 && previous.UtteranceStartMs == null) {
            previous.UtteranceStartMs = utteranceStartMs;
        }
        const saved = await previous.Save();
        if (!saved) {
            LogError(
                `RealtimeClientSessionResolver.replacePreviousTranscriptTurn save failed: ${previous.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return saved;
    }

    /**
     * Maps a transport-level transcript role (`'user'` / `'assistant'`) onto the
     * `Conversation Detail` entity's `Role` union (`'User'` / `'AI'`). Anything not the user is
     * treated as the assistant/AI side.
     */
    private mapTranscriptRole(role: string): 'AI' | 'Error' | 'User' {
        return role.trim().toLowerCase() === 'user' ? 'User' : 'AI';
    }
}

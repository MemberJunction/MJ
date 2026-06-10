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
 * - **Start**: the caller must have `CanRun` on the *target* agent (the Voice Co-Agent is an internal
 *   orchestration agent, so the meaningful gate is the agent doing the real work).
 * - **Execute / Relay**: inbound ownership — the session's `UserID` must equal `contextUser.ID`.
 *
 * @module @memberjunction/server
 */
import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { UserInfo, IMetadataProvider, LogError, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentSessionEntity, MJAIAgentSessionChannelEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { RealtimeClientSessionService } from '@memberjunction/ai-agents';
import { AgentExecutionProgressCallback } from '@memberjunction/ai-core-plus';
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

/** The seeded name of the internal orchestration agent that voices on behalf of a target agent. */
const VOICE_CO_AGENT_NAME = 'Voice Co-Agent';

/** Entity name — centralised so the `MJ:`-prefix convention is applied in exactly one place. */
const SESSION_ENTITY = 'MJ: AI Agent Sessions';
const CONVERSATION_DETAIL_ENTITY = 'MJ: Conversation Details';
const CHANNEL_ENTITY = 'MJ: AI Agent Channels';
const SESSION_CHANNEL_ENTITY = 'MJ: AI Agent Session Channels';

/** Maximum number of client-declared UI tools accepted at session mint. */
const MAX_CLIENT_TOOLS = 16;
/** Maximum accepted size (chars) of the serialized client tool declarations. */
const MAX_CLIENT_TOOLS_JSON_CHARS = 64_000;
/** Maximum accepted size (chars) of a persisted channel state blob. */
const MAX_CHANNEL_STATE_CHARS = 2_000_000;

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
     * 2. Resolve the Voice Co-Agent id from cached metadata.
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
     * @returns The ephemeral config + session linkage the browser needs to open its socket.
     */
    @Mutation(() => StartRealtimeClientSessionResult)
    async StartRealtimeClientSession(
        @Arg('targetAgentId', () => String) targetAgentId: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('conversationId', () => String, { nullable: true }) conversationId?: string,
        @Arg('lastSessionId', () => String, { nullable: true }) lastSessionId?: string,
        @Arg('preferredModelId', () => String, { nullable: true }) preferredModelId?: string,
        @Arg('clientToolsJson', () => String, { nullable: true }) clientToolsJson?: string,
    ): Promise<StartRealtimeClientSessionResult> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);

        await this.assertCanRunTarget(targetAgentId, contextUser, provider);
        const coAgentID = await this.resolveVoiceCoAgentID(contextUser, provider);

        const config: RealtimeSessionConfig = { targetAgentID: targetAgentId };
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

        const clientTools = this.parseClientTools(clientToolsJson);
        return this.prepareClientSessionOrClose(session, coAgentID, targetAgentId, contextUser, provider, preferredModelId, clientTools);
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

        const { ResultJson, PausedRunID } = await this.clientSessionService.ExecuteRelayedTool(
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
     * The co-agent observability `AIAgentRun`/`AIPromptRun` are now created at session start (see
     * {@link RealtimeClientSessionResolver.StartRealtimeClientSession}) and finalized on close.
     * Still deferred: relaying incremental usage telemetry onto the `AIPromptRun` (RelayRealtimeUsage)
     * and linking persisted transcript turns to those runs.
     *
     * @returns `true` when the transcript turn was persisted.
     */
    @Mutation(() => Boolean)
    async RelayRealtimeTranscript(
        @Arg('agentSessionId', () => String) agentSessionId: string,
        @Arg('role', () => String) role: string,
        @Arg('text', () => String) text: string,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<boolean> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedActiveSession(agentSessionId, contextUser, provider);

        const saved = await this.persistTranscriptTurn(session, role, text, contextUser, provider);
        if (!saved) {
            return false;
        }
        await this.sessionManager.Heartbeat(agentSessionId, contextUser, provider);
        return true;
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
     * 3. Upsert the session-channel row: create it (Status `Connected`) when missing, store
     *    `stateJson` in its `Config` field, and stamp `LastActiveAt`.
     *
     * v1 NOTE: state is write-only from the session's perspective — a new session starts with a
     * fresh board (no restore of a prior session's channel state). Restore is a later phase.
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

        return this.upsertSessionChannelState(session.ID, channelID, stateJson, contextUser, provider);
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
     * Resolves the seeded Voice Co-Agent's id from {@link AIEngine}'s cached agents, configuring the
     * engine first if needed. Throws a clear error when the co-agent is not present in metadata.
     */
    private async resolveVoiceCoAgentID(
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string> {
        await AIEngine.Instance.Config(false, contextUser, provider);
        const coAgent = (AIEngine.Instance.Agents ?? []).find(
            a => a.Name?.trim().toLowerCase() === VOICE_CO_AGENT_NAME.toLowerCase(),
        );
        if (!coAgent) {
            throw new Error(
                `The '${VOICE_CO_AGENT_NAME}' agent is not configured; cannot start a realtime voice session.`,
            );
        }
        return coAgent.ID;
    }

    /**
     * Mints the client session config for a just-created session. On failure, closes the session so
     * no half-open record leaks, then throws the service's error message.
     *
     * @param preferredModelId Optional explicit realtime model choice — threaded to the service,
     *   which FAILS (no silent fallback) when the chosen model cannot be satisfied.
     */
    private async prepareClientSessionOrClose(
        session: MJAIAgentSessionEntity,
        coAgentID: string,
        targetAgentId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        preferredModelId?: string,
        clientTools?: RealtimeToolDefinition[],
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
            },
            contextUser,
            provider,
        );

        if (!prep.Success || !prep.ClientConfig) {
            await this.sessionManager.CloseSession(session.ID, contextUser, provider);
            throw new Error(prep.ErrorMessage ?? 'Failed to prepare the client realtime session.');
        }

        await this.persistObservabilityRunIDs(session, targetAgentId, prep.CoAgentRunID, prep.PromptRunID);

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
    ): Promise<void> {
        const config: RealtimeSessionConfig = { targetAgentID, coAgentRunID, promptRunID };
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
     * Resolves an ACTIVE channel definition (`MJ: AI Agent Channels`) by name. Returns its id, or
     * `null` (logged) when no active definition exists — the channel seed is deployed separately,
     * so its absence is tolerated, never thrown.
     */
    private async resolveChannelID(
        channelName: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        const safeName = channelName.replace(/'/g, "''");
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<{ ID: string; IsActive: boolean }>(
            {
                EntityName: CHANNEL_ENTITY,
                ExtraFilter: `Name='${safeName}'`,
                Fields: ['ID', 'IsActive'],
                ResultType: 'simple',
                MaxRows: 1,
            },
            contextUser,
        );
        const row = result.Success ? result.Results?.[0] : undefined;
        if (!row || !row.IsActive) {
            LogError(
                `SaveSessionChannelState: no active '${channelName}' channel definition found in ${CHANNEL_ENTITY} — ` +
                    'state not persisted (sync the channel seed metadata to enable persistence).',
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
    private async persistTranscriptTurn(
        session: MJAIAgentSessionEntity,
        role: string,
        text: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
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

        const saved = await detail.Save();
        if (!saved) {
            LogError(
                `RealtimeClientSessionResolver.persistTranscriptTurn save failed: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`,
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

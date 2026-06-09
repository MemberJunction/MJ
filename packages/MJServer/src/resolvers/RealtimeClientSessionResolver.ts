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
import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { AppContext } from '../types.js';
import { UserInfo, IMetadataProvider, LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentSessionEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { RealtimeClientSessionService } from '@memberjunction/ai-agents';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { SessionManager } from '../agentSessions/index.js';

/** The seeded name of the internal orchestration agent that voices on behalf of a target agent. */
const VOICE_CO_AGENT_NAME = 'Voice Co-Agent';

/** Entity name — centralised so the `MJ:`-prefix convention is applied in exactly one place. */
const SESSION_ENTITY = 'MJ: AI Agent Sessions';
const CONVERSATION_DETAIL_ENTITY = 'MJ: Conversation Details';

/**
 * Authoritative shape persisted in `AIAgentSession.Config_` for a client-direct voice session.
 * The target agent id is stored here at start and read back on every relay — the browser never
 * re-supplies it, so it cannot swap targets mid-session.
 */
interface RealtimeSessionConfig {
    /** The top-level target agent the co-agent voices on behalf of. */
    targetAgentID: string;
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
     * @returns The ephemeral config + session linkage the browser needs to open its socket.
     */
    @Mutation(() => StartRealtimeClientSessionResult)
    async StartRealtimeClientSession(
        @Arg('targetAgentId', () => String) targetAgentId: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('conversationId', () => String, { nullable: true }) conversationId?: string,
        @Arg('lastSessionId', () => String, { nullable: true }) lastSessionId?: string,
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

        return this.prepareClientSessionOrClose(session, coAgentID, targetAgentId, contextUser, provider);
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
    ): Promise<string> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedActiveSession(agentSessionId, contextUser, provider);
        const targetAgentID = this.readTargetAgentID(session);

        const { ResultJson } = await this.clientSessionService.ExecuteRelayedTool(
            {
                AgentSessionID: agentSessionId,
                TargetAgentID: targetAgentID,
                Call: { CallID: callId, ToolName: toolName, Arguments: argsJson },
            },
            contextUser,
            provider,
        );

        await this.sessionManager.Heartbeat(agentSessionId, contextUser, provider);
        return ResultJson;
    }

    /**
     * Persist a transcript turn (user or assistant) as a `Conversation Detail` on the session's
     * conversation. Ownership-gated; heartbeats the session on success.
     *
     * TODO (deferred — out of MVP scope): relay incremental usage telemetry onto an `AIPromptRun`
     * (RelayRealtimeUsage) and open a co-agent observability `AIAgentRun` so the voice session is
     * visible in the agent-run timeline. Neither is wired here yet.
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
     */
    private async prepareClientSessionOrClose(
        session: MJAIAgentSessionEntity,
        coAgentID: string,
        targetAgentId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<StartRealtimeClientSessionResult> {
        const prep = await this.clientSessionService.PrepareClientSession(
            {
                CoAgentID: coAgentID,
                TargetAgentID: targetAgentId,
                AgentSessionID: session.ID,
                // MVP: conversation history is not yet hydrated into ChatMessage[]; the co-agent
                // companion prompt runs without prior turns. A later phase loads the session's
                // Conversation into ChatMessage[] for richer context.
                ConversationMessages: [],
                UserID: contextUser.ID,
            },
            contextUser,
            provider,
        );

        if (!prep.Success || !prep.ClientConfig) {
            await this.sessionManager.CloseSession(session.ID, contextUser, provider);
            throw new Error(prep.ErrorMessage ?? 'Failed to prepare the client realtime session.');
        }

        const cfg = prep.ClientConfig;
        return {
            AgentSessionId: session.ID,
            ConversationId: session.ConversationID ?? '',
            Provider: cfg.Provider,
            Model: cfg.Model,
            EphemeralToken: cfg.EphemeralToken,
            ExpiresAt: cfg.ExpiresAt,
            SessionConfigJson: JSON.stringify(cfg.SessionConfig),
        };
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
        if (session.Status === 'Closed') {
            throw new Error(`Realtime session ${agentSessionId} is closed`);
        }
        return session;
    }

    /**
     * Reads the authoritative target agent id from the session's persisted config. Throws when the
     * config is missing/malformed — a relay cannot proceed without a target.
     */
    private readTargetAgentID(session: MJAIAgentSessionEntity): string {
        const raw = session.Config_;
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as Partial<RealtimeSessionConfig>;
                if (typeof parsed.targetAgentID === 'string' && parsed.targetAgentID.length > 0) {
                    return parsed.targetAgentID;
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

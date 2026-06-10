import { IMetadataProvider, UserInfo, LogError, RunView } from '@memberjunction/core';
import {
    MJAIAgentSessionEntity,
    MJAIAgentSessionChannelEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { RealtimeClientSessionService } from '@memberjunction/ai-agents';
import { GetHostInstanceID } from './HostInstance.js';

/** Entity names — centralised so the `MJ:`-prefix convention is applied in exactly one place. */
const SESSION_ENTITY = 'MJ: AI Agent Sessions';
const SESSION_CHANNEL_ENTITY = 'MJ: AI Agent Session Channels';
const CONVERSATION_ENTITY = 'MJ: Conversations';

/**
 * Shape of the observability run ids a realtime voice session persists in `AIAgentSession.Config_`.
 * Read on {@link SessionManager.CloseSession} to finalize the co-agent runs. All fields optional —
 * a non-voice session (or one whose run creation was skipped) carries none of them.
 */
interface SessionRunConfig {
    coAgentRunID?: string;
    promptRunID?: string;
}

/**
 * Inputs for {@link SessionManager.CreateSession}. `conversationID`/`lastSessionID`/`config`
 * are optional — when no `conversationID` is supplied a fresh Conversation is created and linked.
 */
export interface CreateSessionInput {
    /** The agent the session will run. Authorized via `CanRun` before any row is written. */
    agentID: string;
    /** The owning user. Persisted as `AIAgentSession.UserID`; enforced on every inbound envelope. */
    userID: string;
    /** Existing conversation to attach to. If omitted, a new one is created and linked. */
    conversationID?: string;
    /** Prior (closed) session being resumed — chained via `LastSessionID`. */
    lastSessionID?: string;
    /** Free-form, low-traffic session state. Serialized verbatim into `AIAgentSession.Config`. */
    config?: string;
}

/**
 * Why a session was closed — persisted to `AIAgentSession.CloseReason` alongside the
 * `Status = 'Closed'` transition so the admin dashboards can distinguish a user hanging up
 * (`Explicit`) from janitor reconciliation (`Janitor`), a graceful host drain (`Shutdown`),
 * or a failure-path teardown (`Error`). `NULL` in the column means "legacy/unknown" — rows
 * closed before this column existed.
 */
export type SessionCloseReason = 'Explicit' | 'Janitor' | 'Shutdown' | 'Error';

/**
 * Thrown by {@link SessionManager.CreateSession} when the caller lacks `CanRun` on the target
 * agent. No session row is created — denial happens before any write. Distinct error type so the
 * resolver layer can map it to an authorization-shaped GraphQL error rather than a generic failure.
 */
export class SessionAuthorizationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SessionAuthorizationError';
    }
}

/**
 * Minimum interval between persisted `LastActiveAt` writes for a single session. A chatty channel
 * (e.g. an audio heartbeat every ~200ms) must not turn into a DB write storm — heartbeats inside
 * this window are coalesced in-memory and dropped. Mirrors the `SetSettingDebounced` philosophy.
 */
const HEARTBEAT_MIN_WRITE_INTERVAL_MS = 3_000;

/**
 * Server-side lifecycle manager for `AIAgentSession` **records** (not the media/socket transport —
 * that arrives in P5). Stateless with respect to the caller: every method takes the request's
 * `contextUser` and request-scoped `IMetadataProvider` so all entity operations run under the
 * correct identity/provider and never pin the process-global provider.
 *
 * The only in-memory state it holds is a small per-session last-heartbeat-write timestamp map used
 * purely to coalesce {@link Heartbeat} writes; it carries no user or provider state across calls.
 *
 * Responsibilities:
 * - **Create** — authorize (`CanRun`), optionally mint a Conversation, persist an `Active` session.
 * - **Close** — terminal transition; disconnect channels; idempotent.
 * - **Heartbeat** — coalesced `LastActiveAt` bump; reactivates `Idle → Active`.
 * - **MarkIdle** — `Active → Idle` transition when the last channel goes quiet.
 *
 * @remarks
 * P5 will extend {@link CloseSession} to also abort any in-flight `AIAgentRun` (via its cancellation
 * token) and call `ClientToolRequestManager.ClearSession(...)`; those resources don't exist yet at
 * this layer, so close here only reconciles the durable record + channel rows.
 */
export class SessionManager {
    /** session ID (lowercased) → epoch ms of its last persisted `LastActiveAt` write. */
    private heartbeatLastWrite = new Map<string, number>();

    /**
     * Authorize and create a new session. Flow:
     * 1. `CanRun` check on the agent — denied → {@link SessionAuthorizationError}, no row written.
     * 2. Resolve the conversation (use the supplied one, or create+link a fresh Conversation).
     * 3. Persist the `AIAgentSession` as `Active`, stamped with this host and `LastActiveAt = now`.
     *
     * @returns the saved {@link MJAIAgentSessionEntity}.
     * @throws {SessionAuthorizationError} when the user may not run the agent.
     * @throws {Error} when conversation creation or session save fails.
     */
    public async CreateSession(
        input: CreateSessionInput,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MJAIAgentSessionEntity> {
        await this.assertCanRun(input.agentID, contextUser);

        const conversationID = input.conversationID
            ?? await this.createConversation(input, contextUser, provider);

        return this.persistNewSession(input, conversationID, contextUser, provider);
    }

    /**
     * Close a session (terminal). Sets `Status = 'Closed'` + `ClosedAt = now` + `CloseReason`, then
     * disconnects all of its channel rows. Idempotent: closing an already-`Closed` session is a
     * no-op that returns `true` (and never overwrites the original `CloseReason`). A
     * missing/unloadable session returns `false`.
     *
     * @param closeReason Why the session is being closed. **Defaults to `'Explicit'`** so existing
     *   call sites (the user-initiated close mutations) stamp the common case without modification;
     *   background callers (janitor sweeps, shutdown drain, error teardowns) must pass their reason
     *   explicitly. `NULL` rows remain only for legacy data closed before the column existed.
     *
     * @remarks P5 adds in-flight-run abort + `ClientToolRequestManager.ClearSession` here.
     */
    public async CloseSession(
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        closeReason: SessionCloseReason = 'Explicit',
    ): Promise<boolean> {
        const session = await this.loadSession(agentSessionID, contextUser, provider);
        if (!session) {
            return false;
        }
        this.heartbeatLastWrite.delete(agentSessionID.toLowerCase());

        if (session.Status === 'Closed') {
            return true; // idempotent — already terminal
        }

        const closed = await this.markSessionClosed(session, closeReason);
        if (!closed) {
            return false;
        }
        await this.disconnectChannels(agentSessionID, contextUser, provider);
        await this.finalizeObservabilityRuns(session, contextUser, provider);
        return true;
    }

    /**
     * Finalizes the co-agent observability runs a realtime voice session stored in its `Config_`
     * (see `RealtimeClientSessionResolver`). No-op when the config carries no run ids. Tolerant: a
     * malformed config or a finalize failure is swallowed so it can never break session close.
     */
    private async finalizeObservabilityRuns(
        session: MJAIAgentSessionEntity,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        const config = this.parseSessionRunConfig(session.Config_);
        if (!config.coAgentRunID && !config.promptRunID) {
            return;
        }
        try {
            await new RealtimeClientSessionService().FinalizeCoAgentRun(
                config.coAgentRunID ?? null,
                config.promptRunID ?? null,
                contextUser,
                provider,
                true,
            );
        } catch (e) {
            LogError(`SessionManager.finalizeObservabilityRuns failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Parses the session's `Config_` for observability run ids; returns an empty config on any error. */
    private parseSessionRunConfig(raw: string | null): SessionRunConfig {
        if (!raw) {
            return {};
        }
        try {
            const parsed = JSON.parse(raw) as Partial<SessionRunConfig>;
            return {
                coAgentRunID: typeof parsed.coAgentRunID === 'string' ? parsed.coAgentRunID : undefined,
                promptRunID: typeof parsed.promptRunID === 'string' ? parsed.promptRunID : undefined,
            };
        } catch {
            return {};
        }
    }

    /**
     * Record activity on a session. Coalesces persisted writes so at most one `LastActiveAt` update
     * lands per session per {@link HEARTBEAT_MIN_WRITE_INTERVAL_MS}; intervening calls return `true`
     * without touching the DB. Reactivates an `Idle` session to `Active`. A `Closed` session is not
     * reactivated (returns `false`).
     */
    public async Heartbeat(
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        const key = agentSessionID.toLowerCase();
        const reactivating = this.shouldForceWrite(key, provider);
        if (!reactivating && !this.heartbeatWriteDue(key)) {
            return true; // coalesced — skip the DB round-trip
        }
        return this.persistHeartbeat(agentSessionID, contextUser, provider);
    }

    /**
     * Transition an `Active` session to `Idle` (e.g. when its last channel disconnects). No-op when
     * the session is already `Idle` or `Closed`. Returns `true` on success / no-op-needed.
     */
    public async MarkIdle(
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        const session = await this.loadSession(agentSessionID, contextUser, provider);
        if (!session) {
            return false;
        }
        if (session.Status !== 'Active') {
            return true; // only Active → Idle is meaningful
        }
        session.Status = 'Idle';
        return this.saveOrLog(session, 'MarkIdle');
    }

    // ----- internals -------------------------------------------------------------------------

    /** Throws {@link SessionAuthorizationError} unless the user has `CanRun` on the agent. */
    private async assertCanRun(agentID: string, contextUser: UserInfo): Promise<void> {
        const canRun = await AIAgentPermissionHelper.HasPermission(agentID, contextUser, 'run');
        if (!canRun) {
            throw new SessionAuthorizationError(
                `User ${contextUser.Email} is not permitted to open a session for agent ${agentID}`,
            );
        }
    }

    /** Creates and links a new Conversation for the session, returning its ID. */
    private async createConversation(
        input: CreateSessionInput,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string> {
        const conversation = await provider.GetEntityObject<MJConversationEntity>(CONVERSATION_ENTITY, contextUser);
        conversation.NewRecord();
        conversation.UserID = input.userID;
        conversation.Name = 'Agent Session';

        const saved = await conversation.Save();
        if (!saved) {
            throw new Error(
                `Failed to create Conversation for agent session: ${conversation.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return conversation.ID;
    }

    /** Persists the new session row as `Active` and returns the saved entity. */
    private async persistNewSession(
        input: CreateSessionInput,
        conversationID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MJAIAgentSessionEntity> {
        const session = await provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, contextUser);
        session.NewRecord();
        session.AgentID = input.agentID;
        session.UserID = input.userID;
        session.Status = 'Active';
        session.ConversationID = conversationID;
        session.LastSessionID = input.lastSessionID ?? null;
        session.HostInstanceID = GetHostInstanceID();
        session.Config_ = input.config ?? null;
        session.LastActiveAt = new Date();

        const saved = await session.Save();
        if (!saved) {
            throw new Error(
                `Failed to create agent session: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return session;
    }

    /** Loads a session entity by ID, returning null when it cannot be loaded. */
    private async loadSession(
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MJAIAgentSessionEntity | null> {
        const session = await provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, contextUser);
        const loaded = await session.Load(agentSessionID);
        return loaded ? session : null;
    }

    /** Sets `Closed` + `ClosedAt` + `CloseReason` and saves. Returns the save result. */
    private async markSessionClosed(
        session: MJAIAgentSessionEntity,
        closeReason: SessionCloseReason,
    ): Promise<boolean> {
        session.Status = 'Closed';
        session.ClosedAt = new Date();
        session.CloseReason = closeReason;
        return this.saveOrLog(session, 'CloseSession');
    }

    /** Marks every channel row of the session `Disconnected` (with `DisconnectedAt`), if not already. */
    private async disconnectChannels(
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJAIAgentSessionChannelEntity>({
            EntityName: SESSION_CHANNEL_ENTITY,
            ExtraFilter: `AgentSessionID='${agentSessionID}' AND Status <> 'Disconnected'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success) {
            LogError(`SessionManager.disconnectChannels failed to load channels: ${result.ErrorMessage}`);
            return;
        }
        const now = new Date();
        for (const channel of result.Results) {
            channel.Status = 'Disconnected';
            channel.DisconnectedAt = now;
            await this.saveOrLog(channel, 'disconnectChannels');
        }
    }

    /** True once the per-session coalescing window has elapsed since the last persisted write. */
    private heartbeatWriteDue(key: string): boolean {
        const last = this.heartbeatLastWrite.get(key);
        return last == null || (Date.now() - last) >= HEARTBEAT_MIN_WRITE_INTERVAL_MS;
    }

    /**
     * Whether this heartbeat must write regardless of the coalescing window. We force a write the
     * first time we see a session (no cached timestamp) so an `Idle → Active` reactivation is never
     * swallowed by coalescing.
     */
    private shouldForceWrite(key: string, _provider: IMetadataProvider): boolean {
        return !this.heartbeatLastWrite.has(key);
    }

    /** Loads, bumps `LastActiveAt`, reactivates `Idle → Active`, saves, and records the write time. */
    private async persistHeartbeat(
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        const session = await this.loadSession(agentSessionID, contextUser, provider);
        if (!session || session.Status === 'Closed') {
            return false;
        }
        session.LastActiveAt = new Date();
        if (session.Status === 'Idle') {
            session.Status = 'Active';
        }
        const saved = await this.saveOrLog(session, 'Heartbeat');
        if (saved) {
            this.heartbeatLastWrite.set(agentSessionID.toLowerCase(), Date.now());
        }
        return saved;
    }

    /** Saves an entity, logging `CompleteMessage` on failure. Returns the boolean save result. */
    private async saveOrLog(
        entity: MJAIAgentSessionEntity | MJAIAgentSessionChannelEntity,
        op: string,
    ): Promise<boolean> {
        const saved = await entity.Save();
        if (!saved) {
            LogError(`SessionManager.${op} save failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return saved;
    }
}

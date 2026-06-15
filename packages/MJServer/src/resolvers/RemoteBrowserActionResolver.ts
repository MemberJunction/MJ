/**
 * @fileoverview GraphQL resolvers for the **Remote Browser** native realtime channel, CLIENT-DIRECT
 * topology.
 *
 * Realtime sessions are client-direct: the model talks to the browser, and the agent's browser-driving
 * tools execute CLIENT-side (like the live Whiteboard). Each client-executed browser tool relays its
 * intent to the server through {@link RemoteBrowserActionResolver.ExecuteRemoteBrowserAction}, which drives
 * the server-side {@link RemoteBrowserEngine}'s live browser. A second query,
 * {@link RemoteBrowserActionResolver.RemoteBrowserSnapshot}, returns the current screenshot + URL for the
 * client's live view.
 *
 * Both operations are **ownership-gated** exactly like {@link import('./RealtimeClientSessionResolver').RealtimeClientSessionResolver}:
 * the `AIAgentSession.UserID` must equal the calling user. The mutation lazily starts the browser on first
 * use — so a realtime session that never touches the browser never launches Chrome — resolving the backend
 * from the agent's `TypeConfiguration` (`{ remoteBrowser: { provider } }`), else the single Active provider.
 *
 * @module @memberjunction/server
 */
import { Resolver, Mutation, Query, Arg, Ctx, Float, ObjectType, Field, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { UserInfo, IMetadataProvider, LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentSessionEntity, MJAIAgentEntity } from '@memberjunction/core-entities';
import { RemoteBrowserEngine } from '@memberjunction/remote-browser-server';
import {
    IRemoteBrowserSession,
    RemoteBrowserAction,
    RemoteBrowserCapabilityNotSupportedError,
} from '@memberjunction/remote-browser-base';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';

/** Entity name — centralised so the `MJ:`-prefix convention is applied in exactly one place. */
const SESSION_ENTITY = 'MJ: AI Agent Sessions';
/** Entity name for the agent whose `TypeConfiguration` carries the remote-browser provider preference. */
const AGENT_ENTITY = 'MJ: AI Agents';

/**
 * The strongly-typed shape of the slice of an agent's `TypeConfiguration` JSON this resolver reads — the
 * optional `remoteBrowser.provider` backend-name preference. Everything else in the blob is ignored here.
 */
interface RemoteBrowserTypeConfiguration {
    remoteBrowser?: {
        /** The display name of the remote-browser backend to use (e.g. `'Self-Hosted Chrome'`). */
        provider?: string;
    };
}

/**
 * Result of {@link RemoteBrowserActionResolver.ExecuteRemoteBrowserAction} — the outcome of one browser
 * action plus the resulting URL the client narrates / displays.
 */
@ObjectType()
export class RemoteBrowserActionResult {
    /** Whether the browser action completed successfully. */
    @Field(() => Boolean)
    Success: boolean;

    /** The page URL after the action, when known. Null when the action produced no URL. */
    @Field(() => String, { nullable: true })
    CurrentUrl?: string;

    /** Human-readable detail — an error message on failure, a note on success. Null when none. */
    @Field(() => String, { nullable: true })
    Detail?: string;
}

/**
 * Result of {@link RemoteBrowserActionResolver.RemoteBrowserSnapshot} — the current viewport screenshot +
 * URL for the client's live view. Both fields are null when the session holds no live browser.
 */
@ObjectType()
export class RemoteBrowserSnapshot {
    /** The current viewport screenshot, Base64-encoded. Null when no live browser exists for the session. */
    @Field(() => String, { nullable: true })
    ScreenshotBase64?: string;

    /** The browser's current URL. Null when no live browser exists for the session. */
    @Field(() => String, { nullable: true })
    CurrentUrl?: string;
}

/**
 * Result of {@link RemoteBrowserActionResolver.StartRemoteBrowserScreencast} — whether the live CDP
 * screencast started. When `false` the backend lacks the `ScreenStreaming` capability (or the start
 * failed); the client keeps its 700ms snapshot poll as the fallback live view. When `true` the server
 * is now PUSHING encoded frames on the user's push-status topic and the client paints them on a canvas.
 */
@ObjectType()
export class RemoteBrowserScreencastResult {
    /** Whether the server-pushed screencast is now running for this session. */
    @Field(() => Boolean)
    Streaming: boolean;
}

/**
 * Resolver for the Remote Browser native realtime channel. A single {@link RemoteBrowserEngine} instance
 * (the process-wide singleton) backs every request; ownership is enforced per call against the session's
 * `UserID`.
 */
@Resolver()
export class RemoteBrowserActionResolver extends ResolverBase {
    /**
     * Agent-session ids whose live CDP screencast this resolver has already started. Keyed by
     * `agentSessionID` so a re-issued {@link RemoteBrowserActionResolver.StartRemoteBrowserScreencast}
     * (e.g. the surface re-binding after a tab collapse) is idempotent and never stacks two screencasts
     * on the one session. Entries are removed by {@link RemoteBrowserActionResolver.StopRemoteBrowserScreencast}.
     */
    private startedScreencasts = new Set<string>();

    /**
     * Execute ONE browser action relayed from the client-direct realtime session, returning the outcome +
     * resulting URL.
     *
     * Flow:
     * 1. Ownership gate — the session's `UserID` must equal the caller's (throws otherwise).
     * 2. Lazily start (or reuse) the session's browser via {@link RemoteBrowserEngine.StartSessionForAgentSession},
     *    resolving the backend from the agent's `TypeConfiguration` (`{ remoteBrowser: { provider } }`), else
     *    the single Active provider.
     * 3. Build a strongly-typed {@link RemoteBrowserAction} from `kind` + the supplied fields.
     * 4. Execute it against the live session and return the result.
     *
     * @param agentSessionID The `AIAgentSession` id the browser is bound to.
     * @param kind The action kind (`'navigate' | 'click' | 'type' | 'key' | 'scroll' | 'back' | 'forward' | 'wait'`).
     * @returns The action result (success + resulting URL + detail).
     */
    @Mutation(() => RemoteBrowserActionResult)
    async ExecuteRemoteBrowserAction(
        @Arg('agentSessionID', () => String) agentSessionID: string,
        @Arg('kind', () => String) kind: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('url', () => String, { nullable: true }) url?: string,
        @Arg('selector', () => String, { nullable: true }) selector?: string,
        @Arg('x', () => Float, { nullable: true }) x?: number,
        @Arg('y', () => Float, { nullable: true }) y?: number,
        @Arg('text', () => String, { nullable: true }) text?: string,
        @Arg('key', () => String, { nullable: true }) key?: string,
        @Arg('deltaX', () => Float, { nullable: true }) deltaX?: number,
        @Arg('deltaY', () => Float, { nullable: true }) deltaY?: number,
        @Arg('ms', () => Float, { nullable: true }) ms?: number,
    ): Promise<RemoteBrowserActionResult> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedSession(agentSessionID, contextUser, provider);

        const action = this.buildAction({ kind, url, selector, x, y, text, key, deltaX, deltaY, ms });
        if (!action) {
            return { Success: false, Detail: `Unknown or incomplete remote-browser action '${kind}'.` };
        }

        const providerName = await this.resolveProviderName(session, contextUser, provider);
        try {
            const liveSession = await RemoteBrowserEngine.Instance.StartSessionForAgentSession(
                agentSessionID,
                contextUser,
                providerName,
            );
            const result = await liveSession.ExecuteAction(action);
            return { Success: result.Success, CurrentUrl: result.CurrentUrl, Detail: result.Detail };
        } catch (err) {
            // Surface the real failure to BOTH the MJAPI terminal (for diagnosis) and the model (so it
            // narrates the actual cause instead of the opaque client-side "no response from the server").
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ExecuteRemoteBrowserAction failed (provider='${providerName}', kind='${kind}'): ${message}`);
            return { Success: false, Detail: `Remote browser error (${providerName}): ${message}` };
        }
    }

    /**
     * Return the current viewport screenshot + URL for the session's live browser — the client's live view.
     * Ownership-gated. When the session holds no live browser (never started, or already torn down), the
     * result's fields are null rather than an error.
     *
     * @param agentSessionID The `AIAgentSession` id.
     * @returns The current screenshot + URL, or an empty snapshot when no live browser exists.
     */
    @Query(() => RemoteBrowserSnapshot)
    async RemoteBrowserSnapshot(
        @Arg('agentSessionID', () => String) agentSessionID: string,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<RemoteBrowserSnapshot> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        await this.loadOwnedSession(agentSessionID, contextUser, provider);

        const liveSession = RemoteBrowserEngine.Instance.GetSessionForAgentSession(agentSessionID);
        if (!liveSession) {
            return {};
        }
        const screenshot = await liveSession.CaptureScreenshot();
        return { ScreenshotBase64: screenshot, CurrentUrl: liveSession.GetCurrentUrl() };
    }

    /**
     * Starts a live CDP screencast on the session's browser and PUSHES each encoded frame to the calling
     * user's push-status topic — replacing the client's 700ms snapshot poll with low-latency pushed frames.
     * Ownership-gated. Idempotent: a re-call for an already-streaming session is a no-op that reports
     * `Streaming: true`.
     *
     * Capability gating: {@link IRemoteBrowserSession.StartScreencast} throws
     * {@link RemoteBrowserCapabilityNotSupportedError} on a backend without `ScreenStreaming` — caught here
     * and reported as `Streaming: false`, leaving the client on its polling fallback. Any other failure is
     * logged and likewise reported as `Streaming: false` (the poll keeps the view alive).
     *
     * @param agentSessionID The `AIAgentSession` id the browser is bound to.
     * @returns `{ Streaming: true }` when frames are now being pushed, else `{ Streaming: false }`.
     */
    @Mutation(() => RemoteBrowserScreencastResult)
    async StartRemoteBrowserScreencast(
        @Arg('agentSessionID', () => String) agentSessionID: string,
        @Ctx() { userPayload, providers }: AppContext,
        @PubSub() pubSub: PubSubEngine,
    ): Promise<RemoteBrowserScreencastResult> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        const session = await this.loadOwnedSession(agentSessionID, contextUser, provider);

        // Idempotent: a re-bind must not stack a second screencast on the one live browser.
        if (this.startedScreencasts.has(agentSessionID)) {
            return { Streaming: true };
        }

        const providerName = await this.resolveProviderName(session, contextUser, provider);
        try {
            const liveSession = await RemoteBrowserEngine.Instance.StartSessionForAgentSession(
                agentSessionID,
                contextUser,
                providerName,
            );
            await liveSession.StartScreencast((frame) => this.publishFrame(pubSub, userPayload, agentSessionID, frame));
            this.startedScreencasts.add(agentSessionID);
            return { Streaming: true };
        } catch (err) {
            if (err instanceof RemoteBrowserCapabilityNotSupportedError) {
                // Backend can't stream — the client keeps polling. Not an error condition.
                return { Streaming: false };
            }
            const message = err instanceof Error ? err.message : String(err);
            LogError(`StartRemoteBrowserScreencast failed (provider='${providerName}'): ${message}`);
            return { Streaming: false };
        }
    }

    /**
     * Stops a screencast previously started by {@link RemoteBrowserActionResolver.StartRemoteBrowserScreencast}.
     * Ownership-gated and best-effort: when no live browser exists, or `StopScreencast` rejects, the call
     * still resolves `true` (the client's teardown should never depend on this succeeding).
     *
     * @param agentSessionID The `AIAgentSession` id.
     * @returns `true` (always) once the stop has been attempted.
     */
    @Mutation(() => Boolean)
    async StopRemoteBrowserScreencast(
        @Arg('agentSessionID', () => String) agentSessionID: string,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<boolean> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        await this.loadOwnedSession(agentSessionID, contextUser, provider);

        this.startedScreencasts.delete(agentSessionID);
        const liveSession = RemoteBrowserEngine.Instance.GetSessionForAgentSession(agentSessionID);
        if (liveSession) {
            try {
                await liveSession.StopScreencast();
            } catch (err) {
                // Best-effort: a backend without ScreenStreaming throws here too; teardown ignores it.
                const message = err instanceof Error ? err.message : String(err);
                LogError(`StopRemoteBrowserScreencast (best-effort) for session ${agentSessionID}: ${message}`);
            }
        }
        return true;
    }

    // ----- internals -------------------------------------------------------------------------

    /**
     * Publishes one encoded screencast frame to the calling user's push-status topic, in the same envelope
     * shape the conversations client already routes (mirrors `RealtimeClientSessionResolver`'s delegation
     * progress publish). The client matches on `resolver` + `type`, then on `agentSessionID`, and paints
     * `dataBase64` onto its canvas.
     *
     * @param pubSub The resolver-injected pub/sub engine.
     * @param userPayload The calling user's payload (its `sessionId` scopes the topic to this browser).
     * @param agentSessionID The `AIAgentSession` id the frame belongs to.
     * @param frame The encoded viewport frame.
     */
    private publishFrame(
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        agentSessionID: string,
        frame: { DataBase64: string; Width: number; Height: number; SequenceNumber: number },
    ): void {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'RemoteBrowserActionResolver',
                type: 'RemoteBrowserScreencastFrame',
                agentSessionID,
                dataBase64: frame.DataBase64,
                width: frame.Width,
                height: frame.Height,
                seq: frame.SequenceNumber,
            }),
            sessionId: userPayload.sessionId,
        });
    }

    /** Resolve the request user + read-write provider, throwing a clear error if unauthenticated. */
    private requireUserAndProvider(
        userPayload: AppContext['userPayload'],
        providers: AppContext['providers'],
    ): { contextUser: UserInfo; provider: IMetadataProvider } {
        const contextUser = this.GetUserFromPayload(userPayload);
        if (!contextUser) {
            throw new Error('Not authenticated: no user context for remote-browser operation');
        }
        return { contextUser, provider: GetReadWriteProvider(providers) };
    }

    /**
     * Loads the agent session and enforces inbound ownership: the session's `UserID` must equal the
     * caller's. Throws when the session is missing or owned by another user.
     *
     * @param agentSessionID The `AIAgentSession` id.
     * @returns The loaded, owned session entity.
     */
    private async loadOwnedSession(
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MJAIAgentSessionEntity> {
        const session = await provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, contextUser);
        if (!(await session.Load(agentSessionID))) {
            throw new Error(`Remote-browser session ${agentSessionID} not found.`);
        }
        if (!UUIDsEqual(session.UserID, contextUser.ID)) {
            throw new Error(`Not authorized: remote-browser session ${agentSessionID} is not owned by you.`);
        }
        return session;
    }

    /**
     * Resolves the remote-browser backend name for the session from the session's agent's
     * `TypeConfiguration` JSON (`{ remoteBrowser: { provider } }`). Best-effort: a missing agent, absent
     * config, or unparseable JSON all yield `undefined`, letting the engine fall back to the single Active
     * provider.
     *
     * @param session The owned session entity (supplies the agent id).
     * @returns The configured backend name, or `undefined` to let the engine auto-select.
     */
    private async resolveProviderName(
        session: MJAIAgentSessionEntity,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | undefined> {
        // The session's agent IS the co-agent (the realtime voice agent), and the interactive channels
        // (Remote Browser, Whiteboard) are the CO-AGENT's abilities — so the remoteBrowser backend config
        // lives on the co-agent's TypeConfiguration, not on the target agent it voices.
        try {
            const agent = await provider.GetEntityObject<MJAIAgentEntity>(AGENT_ENTITY, contextUser);
            if (!(await agent.Load(session.AgentID))) {
                return undefined;
            }
            const config = this.parseTypeConfiguration(agent.TypeConfiguration);
            const name = config?.remoteBrowser?.provider?.trim();
            return name && name.length > 0 ? name : undefined;
        } catch (error) {
            LogError(
                `ExecuteRemoteBrowserAction: failed to read agent TypeConfiguration for session ${session.ID} — ` +
                    `falling back to the single Active provider: ${error instanceof Error ? error.message : String(error)}`,
            );
            return undefined;
        }
    }

    /**
     * Parses an agent's `TypeConfiguration` JSON into the {@link RemoteBrowserTypeConfiguration} slice this
     * resolver reads. Returns `null` for null/blank/non-object/unparseable input.
     *
     * @param json The raw `TypeConfiguration` JSON, or null.
     * @returns The parsed config slice, or `null`.
     */
    private parseTypeConfiguration(json: string | null): RemoteBrowserTypeConfiguration | null {
        if (!json || json.trim().length === 0) {
            return null;
        }
        try {
            const parsed: unknown = JSON.parse(json);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? (parsed as RemoteBrowserTypeConfiguration)
                : null;
        } catch {
            return null;
        }
    }

    /**
     * Builds a strongly-typed {@link RemoteBrowserAction} from the relayed `kind` + fields, validating the
     * fields each kind requires. Returns `null` for an unknown kind or a kind missing its required field(s).
     *
     * @param input The relayed action kind + all optional fields.
     * @returns The built action, or `null` when the kind is unknown / incomplete.
     */
    private buildAction(input: {
        kind: string;
        url?: string;
        selector?: string;
        x?: number;
        y?: number;
        text?: string;
        key?: string;
        deltaX?: number;
        deltaY?: number;
        ms?: number;
    }): RemoteBrowserAction | null {
        switch (input.kind) {
            case 'navigate':
                return input.url ? { Kind: 'navigate', Url: input.url } : null;
            case 'click':
                if (input.selector || (typeof input.x === 'number' && typeof input.y === 'number')) {
                    return { Kind: 'click', Selector: input.selector, X: input.x, Y: input.y };
                }
                return null;
            case 'type':
                return typeof input.text === 'string'
                    ? { Kind: 'type', Text: input.text, Selector: input.selector }
                    : null;
            case 'key':
                return input.key ? { Kind: 'key', Key: input.key } : null;
            case 'scroll':
                if (input.selector || typeof input.deltaX === 'number' || typeof input.deltaY === 'number') {
                    return { Kind: 'scroll', DeltaX: input.deltaX, DeltaY: input.deltaY, Selector: input.selector };
                }
                return null;
            case 'back':
                return { Kind: 'back' };
            case 'forward':
                return { Kind: 'forward' };
            case 'wait':
                if (typeof input.ms === 'number' || input.selector) {
                    return { Kind: 'wait', Ms: input.ms, Selector: input.selector };
                }
                return null;
            default:
                return null;
        }
    }
}

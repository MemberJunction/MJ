/**
 * @fileoverview GraphQL resolver for the AI Agent Session record lifecycle.
 *
 * Exposes start / close / heartbeat mutations over {@link SessionManager}, each running under the
 * request's `contextUser` + request-scoped `IMetadataProvider`. Enforces two authorization gates:
 * - **Open**: `CanRun` on the target agent (delegated to {@link SessionManager.CreateSession}).
 * - **Close / Heartbeat**: inbound ownership — the session's `UserID` must equal `contextUser.ID`.
 *
 * The audio/media transport and the long-lived realtime run are out of scope here (P5); this
 * resolver only manipulates the durable session record.
 *
 * @module @memberjunction/server
 */
import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { AppContext } from '../types.js';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { SessionManager, SessionAuthorizationError, type SessionCloseReason } from '../agentSessions/index.js';
import {
    LoadOwnedRealtimeSession,
    RealtimeSessionNotFoundError,
    RealtimeSessionOwnershipError,
} from '../realtimeSessions/ownedRealtimeSession.js';

/** The `CloseReason` values a client may stamp on its own session; `Janitor` and `Shutdown` are the server's. */
const CLIENT_CLOSE_REASONS: readonly SessionCloseReason[] = ['Explicit', 'Error'];

/** Reads the mutation's optional `closeReason`: absent means `Explicit`; a server-only or unknown value is refused. */
function ParseClientCloseReason(closeReason: string | null | undefined): SessionCloseReason {
    if (closeReason == null || closeReason === '') {
        return 'Explicit';
    }
    const match = CLIENT_CLOSE_REASONS.find((r) => r === closeReason);
    if (!match) {
        throw new Error(`Unsupported close reason '${closeReason}': a client may close its session as ${CLIENT_CLOSE_REASONS.join(' or ')}`);
    }
    return match;
}

/** Result of {@link AgentSessionResolver.StartAgentSession}. */
@ObjectType()
export class StartAgentSessionResult {
    /** ID of the newly created session. */
    @Field()
    agentSessionId: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    /** Lifecycle status of the session (always `Active` on a successful start). */
    @Field()
    status: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    /** ID of the conversation the session is attached to (supplied or freshly created). */
    @Field()
    conversationId: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

/**
 * Resolver for the AI Agent Session record lifecycle. A single {@link SessionManager} instance is
 * shared across requests — it holds no per-user/provider state (only heartbeat-coalescing
 * timestamps), and every method is passed the request `contextUser` + provider explicitly.
 */
@Resolver()
export class AgentSessionResolver extends ResolverBase {
    private readonly sessionManager = new SessionManager();

    /**
     * Open a new session for an agent. Authorization (`CanRun`) is enforced inside
     * {@link SessionManager.CreateSession}; a denial surfaces as a thrown error and no row is written.
     */
    @Mutation(() => StartAgentSessionResult)
    async StartAgentSession(
        @Arg('agentId') agentId: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('conversationId', { nullable: true }) conversationId?: string,
        @Arg('lastSessionId', { nullable: true }) lastSessionId?: string,
        @Arg('configJson', { nullable: true }) configJson?: string,
    ): Promise<StartAgentSessionResult> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);

        try {
            const session = await this.sessionManager.CreateSession(
                { agentID: agentId, userID: contextUser.ID, conversationID: conversationId, lastSessionID: lastSessionId, config: configJson },
                contextUser,
                provider,
            );
            return { agentSessionId: session.ID, status: session.Status, conversationId: session.ConversationID ?? '' };
        } catch (err) {
            if (err instanceof SessionAuthorizationError) {
                throw new Error(err.message); // authorization denial — no session created
            }
            throw err;
        }
    }

    /**
     * Close a session. Rejects unless the caller owns it. Returns `true` on a successful (or
     * idempotent) close, `false` if the session can't be loaded.
     *
     * `closeReason` is what the row records as its `CloseReason`: `Explicit` (the default, and what
     * every client sent before the argument existed) when the user or host ended the call, `Error`
     * when the client ended it because the start or the call failed (MJ#6013). The other reasons are
     * the server's own (janitor, shutdown) and are refused from a client.
     */
    @Mutation(() => Boolean)
    async CloseAgentSession(
        @Arg('agentSessionId') agentSessionId: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('closeReason', () => String, { nullable: true }) closeReason?: string | null,
    ): Promise<boolean> {
        const reason = ParseClientCloseReason(closeReason);
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        await this.loadOwnedSession(agentSessionId, contextUser, provider);
        return this.sessionManager.CloseSession(agentSessionId, contextUser, provider, reason);
    }

    /**
     * Record activity on a session (coalesced). Rejects unless the caller owns it. Returns `true`
     * when the heartbeat was accepted (written or coalesced), `false` if the session is gone/closed.
     */
    @Mutation(() => Boolean)
    async AgentSessionHeartbeat(
        @Arg('agentSessionId') agentSessionId: string,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<boolean> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        await this.loadOwnedSession(agentSessionId, contextUser, provider);
        return this.sessionManager.Heartbeat(agentSessionId, contextUser, provider);
    }

    // ----- internals -------------------------------------------------------------------------

    /** Resolve the request user + read-write provider, throwing a clear error if unauthenticated. */
    private requireUserAndProvider(
        userPayload: AppContext['userPayload'],
        providers: AppContext['providers'],
    ): { contextUser: UserInfo; provider: IMetadataProvider } {
        const contextUser = this.GetUserFromPayload(userPayload);
        if (!contextUser) {
            throw new Error('Not authenticated: no user context for agent session operation');
        }
        return { contextUser, provider: GetReadWriteProvider(providers) };
    }

    /**
     * Inbound ownership gate: delegates to {@link LoadOwnedRealtimeSession} (which enforces both
     * `UserID === contextUser.ID` and `AuthorizeSessionAccess` scope/visitor binding) and maps its
     * typed errors to this resolver's message format.
     */
    private async loadOwnedSession(
        agentSessionId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        try {
            await LoadOwnedRealtimeSession(agentSessionId, contextUser, provider);
        } catch (err) {
            if (err instanceof RealtimeSessionNotFoundError) {
                throw new Error(`Agent session ${agentSessionId} not found`);
            }
            if (err instanceof RealtimeSessionOwnershipError) {
                throw new Error('Not authorized: you do not own this agent session');
            }
            throw err;
        }
    }
}

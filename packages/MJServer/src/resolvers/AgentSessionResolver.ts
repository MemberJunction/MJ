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
import { UserInfo, IMetadataProvider, LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { SessionManager, SessionAuthorizationError } from '../agentSessions/index.js';

/** Result of {@link AgentSessionResolver.StartAgentSession}. */
@ObjectType()
export class StartAgentSessionResult {
    /** ID of the newly created session. */
    @Field()
    agentSessionId: string;

    /** Lifecycle status of the session (always `Active` on a successful start). */
    @Field()
    status: string;

    /** ID of the conversation the session is attached to (supplied or freshly created). */
    @Field()
    conversationId: string;
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
     */
    @Mutation(() => Boolean)
    async CloseAgentSession(
        @Arg('agentSessionId') agentSessionId: string,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<boolean> {
        const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
        await this.assertOwnership(agentSessionId, contextUser, provider);
        return this.sessionManager.CloseSession(agentSessionId, contextUser, provider);
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
        await this.assertOwnership(agentSessionId, contextUser, provider);
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
     * Inbound ownership gate (the one genuinely new session-authz primitive): the session's `UserID`
     * must equal the caller's. Throws on mismatch or when the session can't be loaded.
     */
    private async assertOwnership(
        agentSessionId: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        const session = await provider.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', contextUser);
        const loaded = await session.Load(agentSessionId);
        if (!loaded) {
            throw new Error(`Agent session ${agentSessionId} not found`);
        }
        if (!UUIDsEqual(session.UserID, contextUser.ID)) {
            LogError(`AgentSessionResolver: ownership check failed — user ${contextUser.ID} attempted to operate on session ${agentSessionId} owned by ${session.UserID}`);
            throw new Error('Not authorized: you do not own this agent session');
        }
    }
}

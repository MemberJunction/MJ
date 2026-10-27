/**
 * @fileoverview The ownership gate for client-direct realtime session writes: the GraphQL mutations of
 * `RealtimeClientSessionResolver` and the recording REST routes both load the session through
 * {@link LoadOwnedRealtimeSession}, so "may this caller write to this session?" is decided in one place.
 *
 * @module @memberjunction/server/realtimeSessions
 */
import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { AuthorizeSessionAccess, LoadSessionConversationScope, ResolveSessionScopeIdentity } from './sessionAccess.js';

const SESSION_ENTITY = 'MJ: AI Agent Sessions';

/** The session does not exist, or the caller cannot read it. */
export class RealtimeSessionNotFoundError extends Error {
    constructor(public readonly AgentSessionID: string) {
        super(`Realtime session ${AgentSessionID} not found`);
        this.name = 'RealtimeSessionNotFoundError';
    }
}

/** The session exists but the caller may not use it: another user owns it, or (for a scoped or anonymous caller) its conversation carries another scope identity. */
export class RealtimeSessionOwnershipError extends Error {
    constructor(public readonly AgentSessionID: string) {
        super('Not authorized: you do not own this realtime session');
        this.name = 'RealtimeSessionOwnershipError';
    }
}

/**
 * Loads a session under the caller's identity and enforces ownership: `UserID === contextUser.ID`, then the
 * scope rule of {@link AuthorizeSessionAccess} (every anonymous visitor shares one Anonymous user, so the
 * session's conversation `ExternalID` must equal the caller's scope identity). It deliberately does NOT
 * reject `Closed` sessions: the final channel-state flush and the recording terminal signal legitimately
 * arrive after the session closed. Loading as the caller also applies the entity's row-level security.
 *
 * @throws RealtimeSessionNotFoundError when the row does not load
 * @throws RealtimeSessionOwnershipError when another user owns the session (logged with both user ids) or
 *   the scope rule refuses the caller (logged with the refusal reason)
 */
export async function LoadOwnedRealtimeSession(
    agentSessionId: string,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<MJAIAgentSessionEntity> {
    const session = await provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, contextUser);
    if (!(await session.Load(agentSessionId))) {
        throw new RealtimeSessionNotFoundError(agentSessionId);
    }
    if (!UUIDsEqual(session.UserID, contextUser.ID)) {
        LogError(
            `LoadOwnedRealtimeSession: ownership check failed — user ${contextUser.ID} attempted to operate on session ${agentSessionId} owned by ${session.UserID}`,
        );
        throw new RealtimeSessionOwnershipError(agentSessionId);
    }
    const conversation = ResolveSessionScopeIdentity(contextUser)
        ? await LoadSessionConversationScope(session, contextUser, provider)
        : { ExternalID: null, Readable: false };
    const access = AuthorizeSessionAccess(
        { SessionUserID: session.UserID, ConversationExternalID: conversation.ExternalID, ConversationReadable: conversation.Readable },
        contextUser,
    );
    if (!access.Allowed) {
        LogError(
            `LoadOwnedRealtimeSession: session access refused (${access.Reason}) — user ${contextUser.ID} attempted to operate on session ${agentSessionId}`,
        );
        throw new RealtimeSessionOwnershipError(agentSessionId);
    }
    return session;
}

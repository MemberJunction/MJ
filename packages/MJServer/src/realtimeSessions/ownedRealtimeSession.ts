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
import { AuthorizeSessionAccess, LoadSessionConversationExternalID } from './sessionAccess.js';

const SESSION_ENTITY = 'MJ: AI Agent Sessions';

/** The session does not exist, or the caller cannot read it. */
export class RealtimeSessionNotFoundError extends Error {
    constructor(public readonly AgentSessionID: string) {
        super(`Realtime session ${AgentSessionID} not found`);
        this.name = 'RealtimeSessionNotFoundError';
    }
}

/** The session exists but belongs to another user. */
export class RealtimeSessionOwnershipError extends Error {
    constructor(public readonly AgentSessionID: string) {
        super('Not authorized: you do not own this realtime session');
        this.name = 'RealtimeSessionOwnershipError';
    }
}

/**
 * Loads a session under the caller's identity and enforces ownership (`UserID === contextUser.ID`). It
 * deliberately does NOT reject `Closed` sessions: the final channel-state flush and the recording terminal
 * signal legitimately arrive after the session closed. A scoped-anonymous widget guest owns the session it
 * minted, so the same check covers it; loading as the caller also applies the entity's row-level security.
 *
 * @throws RealtimeSessionNotFoundError when the row does not load
 * @throws RealtimeSessionOwnershipError when the caller is not the owner (logged with both user ids)
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
    const conversationExternalId = await LoadSessionConversationExternalID(session, contextUser, provider);
    const decision = AuthorizeSessionAccess(
        { SessionUserID: session.UserID, ConversationExternalID: conversationExternalId },
        contextUser,
    );
    if (decision.Allowed === false) {
        LogError(
            `LoadOwnedRealtimeSession: ownership check failed (${decision.Reason}) — user ${contextUser.ID} attempted to operate on session ${agentSessionId}`,
        );
        throw new RealtimeSessionOwnershipError(agentSessionId);
    }
    return session;
}

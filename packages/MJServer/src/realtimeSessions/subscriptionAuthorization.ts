/**
 * @fileoverview The authorization of the `RealtimeSessionEvents` subscription, free of GraphQL schema
 * decorators and server configuration so it can be exercised — and reused — without loading either.
 *
 * It is applied twice on purpose (see `RealtimeSessionEventsResolver`): once when the subscription is
 * opened ({@link AuthorizeRealtimeSessionSubscription}) and once for every event
 * ({@link RealtimeSessionEventsFilter}). In neither check does a client-supplied value decide who
 * receives anything: `agentSessionId` only selects WHICH of the caller's own sessions to listen to; the
 * identity it is checked against comes from the server-authenticated connection context.
 *
 * @module @memberjunction/server/realtimeSessions
 */

import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import type { UserPayload } from '../types.js';
import { AuthorizeSessionAccess, LoadSessionForAccess, type LoadedSessionForAccess } from './sessionAccess.js';
import type { RealtimeSessionEventTopicPayload } from './RealtimeSessionEventService.js';

/**
 * Arguments of the subscription. `agentSessionId` is camelCase because it is the GraphQL argument name
 * graphql-js hands to `subscribe` and to the filter — it is the wire contract, not an API of ours.
 */
export interface RealtimeSessionEventsArgs {
    agentSessionId?: string;
}

/**
 * The slice of the WebSocket connection context the authorization reads. `userPayload` is camelCase to
 * match `AppContext.userPayload`, the member graphql-ws populates and every resolver already destructures.
 */
export interface RealtimeSessionEventsContext {
    userPayload?: UserPayload;
}

/** Why a subscription request was refused (logged; the client always gets the same message). */
const REFUSAL_MESSAGE = 'Realtime session not found.';

/** The principal the connection authenticated as, or undefined. */
function connectionPrincipal(context: RealtimeSessionEventsContext | undefined): UserInfo | undefined {
    return context?.userPayload?.userRecord as UserInfo | undefined;
}

/**
 * Per-event filter. Exported because it is the security-critical gate and must be testable in isolation.
 *
 * An event reaches a subscriber only when BOTH hold:
 * 1. it is addressed to the session the subscriber asked for, and
 * 2. the event's owner/scope snapshot passes {@link AuthorizeSessionAccess} for the connection's
 *    authenticated principal.
 *
 * Fails closed: a missing connection identity, a missing owner on the event, or a missing argument never matches.
 */
export function RealtimeSessionEventsFilter(data: {
    payload: RealtimeSessionEventTopicPayload;
    args: RealtimeSessionEventsArgs;
    context: RealtimeSessionEventsContext | undefined;
}): boolean {
    const { payload, args, context } = data;
    if (typeof args?.agentSessionId !== 'string' || !payload?.AgentSessionID || !UUIDsEqual(payload.AgentSessionID, args.agentSessionId)) {
        return false;
    }
    const decision = AuthorizeSessionAccess(
        { SessionUserID: payload.OwnerUserID, ConversationExternalID: payload.ScopeKey },
        connectionPrincipal(context),
    );
    return decision.Allowed;
}

/** Dependencies of {@link AuthorizeRealtimeSessionSubscription}, injectable for tests. */
export interface SubscriptionAuthorizationDeps {
    /** Loads a session under the caller's identity. */
    LoadSession: (agentSessionId: string, user: UserInfo, provider: IMetadataProvider) => Promise<LoadedSessionForAccess | null>;
    /** The provider to read with (a WebSocket context carries no request-scoped providers). */
    GetProvider: () => IMetadataProvider;
}

/** Production dependencies. */
export const DEFAULT_SUBSCRIPTION_AUTHORIZATION_DEPS: SubscriptionAuthorizationDeps = {
    LoadSession: LoadSessionForAccess,
    GetProvider: () => Metadata.Provider, // global-provider-ok: a WebSocket subscription context has no per-request providers
};

/**
 * Subscribe-time authorization: loads the session as the connection's principal and requires
 * {@link AuthorizeSessionAccess} to allow it. Throws {@link REFUSAL_MESSAGE} (uniformly) otherwise.
 *
 * @param args - the subscription arguments
 * @param context - the connection context (server-authenticated)
 * @param deps - injectable dependencies (tests)
 * @returns the validated session id
 */
export async function AuthorizeRealtimeSessionSubscription(
    args: RealtimeSessionEventsArgs,
    context: RealtimeSessionEventsContext | undefined,
    deps: SubscriptionAuthorizationDeps = DEFAULT_SUBSCRIPTION_AUTHORIZATION_DEPS,
): Promise<string> {
    const principal = connectionPrincipal(context);
    const agentSessionId = args?.agentSessionId;
    if (!principal || typeof agentSessionId !== 'string' || !IsValidUUID(agentSessionId)) {
        throw new Error(REFUSAL_MESSAGE);
    }
    const loaded = await deps.LoadSession(agentSessionId, principal, deps.GetProvider());
    if (!loaded) {
        throw new Error(REFUSAL_MESSAGE);
    }
    const decision = AuthorizeSessionAccess(
        { SessionUserID: loaded.Session.UserID, ConversationExternalID: loaded.ConversationExternalID },
        principal,
    );
    if (decision.Allowed === false) {
        LogError(`RealtimeSessionEvents: refused subscription by user ${principal.ID} to session ${agentSessionId} (${decision.Reason}).`);
        throw new Error(REFUSAL_MESSAGE);
    }
    return agentSessionId;
}

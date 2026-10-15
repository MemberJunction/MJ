/**
 * @fileoverview Who may see and act on ONE realtime session.
 *
 * One pure decision ({@link AuthorizeSessionAccess}) shared by everything that addresses a live
 * session on behalf of a caller: the `RealtimeSessionEvents` subscription (at subscribe time AND for
 * every delivered event), the verification mutations, and the status query. Keeping it in one place
 * is what stops "who owns this session?" from being re-derived — slightly differently — in each.
 *
 * ## The two ownership rules
 *
 * 1. **Owner.** The session's `UserID` must be the caller's user.
 * 2. **Scope.** A *named* user is fully identified by (1). An **anonymous widget guest** is not:
 *    every guest authenticates as the one shared Anonymous user, so (1) alone would let any guest
 *    address any other guest's session. What separates guests is the signed per-session scope in
 *    their token (`MagicLinkScope.ResourceID`), which `SessionManager` stamps onto the session's
 *    Conversation as `ExternalID`. So a principal that carries a scope must match it, and an
 *    anonymous principal that carries NO scope is refused outright — it cannot be told apart from
 *    every other anonymous principal.
 *
 * The decision is deliberately pure (no I/O) so it can be applied identically to a freshly loaded
 * row at subscribe time and to the owner/scope snapshot carried inside each published event.
 *
 * @module @memberjunction/server/realtimeSessions
 */

import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import type { MJAIAgentSessionEntity, MJConversationEntity } from '@memberjunction/core-entities';

/** Entity names, centralised so the `MJ: ` prefix convention lives in one place. */
const SESSION_ENTITY = 'MJ: AI Agent Sessions';
const CONVERSATION_ENTITY = 'MJ: Conversations';

/** What the decision needs to know about the session. */
export interface SessionAccessSubject {
    /** `AIAgentSession.UserID`. */
    SessionUserID: string;
    /**
     * `Conversation.ExternalID` of the session's conversation — the signed per-session scope id for an
     * anonymous guest. `null`/`undefined` when the conversation has none (a named user's session) or
     * could not be loaded.
     */
    ConversationExternalID: string | null | undefined;
}

/** What the decision needs to know about the caller (a subset of `UserInfo`). */
export interface SessionAccessPrincipal {
    /** The caller's user id. */
    ID: string;
    /** True for the shared-Anonymous-user principal of a public-widget guest. */
    IsMagicLinkAnonymous?: boolean;
    /** The signed per-session scope carried by the caller's token, when any. */
    MagicLinkScope?: { ResourceID?: string } | undefined;
}

/** Why access was refused. Callers log the reason; clients get a uniform refusal. */
export type SessionAccessRefusal = 'not_owner' | 'scope_missing' | 'scope_mismatch';

/** Outcome of {@link AuthorizeSessionAccess}. */
export type SessionAccessDecision = { Allowed: true } | { Allowed: false; Reason: SessionAccessRefusal };

/**
 * Decides whether `principal` may address the session described by `subject`.
 *
 * Fails closed: anything that cannot be positively matched is refused.
 *
 * @param subject - owner + scope of the session
 * @param principal - the authenticated caller (from the server-built `UserInfo`, never from client args)
 */
export function AuthorizeSessionAccess(
    subject: SessionAccessSubject,
    principal: SessionAccessPrincipal | null | undefined,
): SessionAccessDecision {
    if (!principal?.ID || !subject.SessionUserID || !UUIDsEqual(subject.SessionUserID, principal.ID)) {
        return { Allowed: false, Reason: 'not_owner' };
    }
    const scopeId = principal.MagicLinkScope?.ResourceID;
    if (!scopeId) {
        // An anonymous principal without a per-session scope is indistinguishable from every other
        // anonymous principal: owning "the Anonymous user's" session proves nothing.
        return principal.IsMagicLinkAnonymous ? { Allowed: false, Reason: 'scope_missing' } : { Allowed: true };
    }
    // Scope ids are opaque base64url strings (case-significant), so compare exactly — not UUIDsEqual.
    return subject.ConversationExternalID === scopeId ? { Allowed: true } : { Allowed: false, Reason: 'scope_mismatch' };
}

/** A session row together with the one fact about its conversation the decision needs. */
export interface LoadedSessionForAccess {
    /** The session entity, loaded under the caller's own identity (so RLS applied to the read). */
    Session: MJAIAgentSessionEntity;
    /** The session's conversation `ExternalID` (anonymous scope id), or null. */
    ConversationExternalID: string | null;
}

/**
 * Loads a session (and its conversation's scope id) under `contextUser`'s identity.
 *
 * Loading as the caller — rather than as a privileged user — means the entity layer's row-level
 * security (`Widget Guest: Own Agent Sessions`, `UI: Own Agent Sessions`) is the FIRST gate; the
 * explicit {@link AuthorizeSessionAccess} check that follows is defence in depth.
 *
 * @returns the loaded session, or `null` when the id is malformed, the row does not exist, or the
 *   caller cannot read it. Failure to read the conversation yields `ConversationExternalID: null`,
 *   which {@link AuthorizeSessionAccess} then treats as "no scope to match" (refused for a scoped caller).
 */
export async function LoadSessionForAccess(
    agentSessionId: string,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<LoadedSessionForAccess | null> {
    if (!IsValidUUID(agentSessionId)) {
        return null;
    }
    const session = await provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, contextUser);
    if (!(await session.Load(agentSessionId))) {
        return null;
    }
    return { Session: session, ConversationExternalID: await loadConversationExternalID(session, contextUser, provider) };
}

/** Reads the session conversation's `ExternalID`; null when there is no conversation or it cannot be read. */
async function loadConversationExternalID(
    session: MJAIAgentSessionEntity,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<string | null> {
    if (!session.ConversationID) {
        return null;
    }
    try {
        const conversation = await provider.GetEntityObject<MJConversationEntity>(CONVERSATION_ENTITY, contextUser);
        if (!(await conversation.Load(session.ConversationID))) {
            return null;
        }
        return conversation.ExternalID ?? null;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`LoadSessionForAccess: could not read conversation ${session.ConversationID} of session ${session.ID}: ${message}`);
        return null;
    }
}

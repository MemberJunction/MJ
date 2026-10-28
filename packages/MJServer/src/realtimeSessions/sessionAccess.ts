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
 * 2. **Scope.** A *named* user is fully identified by (1). An **anonymous visitor** (widget guest or
 *    anonymous magic-link invitee) is not: every one authenticates as the one shared Anonymous user, so
 *    (1) alone would let any visitor address any other visitor's session. What separates them is the
 *    scope identity {@link ResolveSessionScopeIdentity} reads off the signed token — the resource scope
 *    (`MagicLinkScope.ResourceID`) when the token carries one, else the per-token `mj_sid`
 *    (`AnonymousVisitorID`). `SessionManager` stamps that same value onto the session's Conversation as
 *    `ExternalID`, so a principal with a scope identity must match it, and an anonymous principal with
 *    none is refused outright — it cannot be told apart from every other anonymous principal.
 *    One allowance: a NAMED principal with a resource scope may also use its own session whose
 *    conversation carries no stamp at all, when it could read that conversation (see the comment in
 *    {@link AuthorizeSessionAccess}).
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
    /**
     * True when the conversation was loaded under the CALLER's identity (so its row-level security allowed
     * the read). Only consulted for a named principal with a resource scope on a conversation that carries
     * no `ExternalID`; omitted means unknown and is treated as unreadable (fail closed).
     */
    ConversationReadable?: boolean;
}

/** What the decision needs to know about the caller (a subset of `UserInfo`). */
export interface SessionAccessPrincipal {
    /** The caller's user id. */
    ID: string;
    /** True for the shared-Anonymous-user principal of a public-widget guest or anonymous magic-link invitee. */
    IsMagicLinkAnonymous?: boolean;
    /** Per-visitor session identity (`mj_sid`) for an anonymous principal. */
    AnonymousVisitorID?: string;
    /** The signed per-session scope carried by the caller's token, when any. */
    MagicLinkScope?: { ResourceID?: string } | undefined;
}

/** Why access was refused. Callers log the reason; clients get a uniform refusal. */
export type SessionAccessRefusal = 'not_owner' | 'scope_missing' | 'scope_mismatch';

/** Outcome of {@link AuthorizeSessionAccess}. */
export type SessionAccessDecision =
    | { Allowed: true; Reason?: undefined }
    | { Allowed: false; Reason: SessionAccessRefusal };

/**
 * The scope identity a session is keyed on for `principal` — the one value `SessionManager` stamps as
 * the session conversation's `ExternalID` and {@link AuthorizeSessionAccess} compares against it.
 *
 * - The token's resource scope (`MagicLinkScope.ResourceID`) when it carries one. A widget guest's
 *   resource scope IS its `mj_sid`; an anonymous magic-link invite with a `ResourceID` (e.g. a Caliber
 *   Invite Scope, one per subject) shares that scope across its redemptions by design, and the
 *   `{{ScopeResourceID}}` RLS filters key on the same value, so the visitor can read its own rows.
 * - Otherwise, for an anonymous principal, the per-token `mj_sid` (`AnonymousVisitorID`), which tells two
 *   redemptions of an unscoped multi-use invite apart.
 * - Otherwise `undefined` (a named user without a resource scope).
 */
export function ResolveSessionScopeIdentity(principal: SessionAccessPrincipal): string | undefined {
    const resourceId = principal.MagicLinkScope?.ResourceID;
    if (resourceId) {
        return resourceId;
    }
    return principal.IsMagicLinkAnonymous ? principal.AnonymousVisitorID || undefined : undefined;
}

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
    const scopeId = ResolveSessionScopeIdentity(principal);
    if (!scopeId) {
        // A named user without a scope is identified by the owner check alone; an anonymous principal
        // without one cannot be told apart from any other anonymous principal.
        return principal.IsMagicLinkAnonymous ? { Allowed: false, Reason: 'scope_missing' } : { Allowed: true };
    }
    // Scope ids are opaque base64url strings (case-significant), so compare exactly — not UUIDsEqual.
    if (subject.ConversationExternalID === scopeId) {
        return { Allowed: true };
    }
    // A named user is identified by the owner check; its scope only keeps one link's sessions apart from
    // the same person's other links (magic links resolve the user by email, so one person can hold several).
    // A conversation with no stamp belongs to no link (one started from the Conversations app), so the owner
    // may use it when its own row-level security let it read the conversation. `ExternalID` is not stamped
    // here because other features own that column on their conversations (meeting room names, for example).
    // An anonymous visitor gets no such allowance: the stamp is the only thing that identifies it.
    if (!principal.IsMagicLinkAnonymous && subject.ConversationExternalID === null && subject.ConversationReadable === true) {
        return { Allowed: true };
    }
    return { Allowed: false, Reason: 'scope_mismatch' };
}

/** A session row together with the one fact about its conversation the decision needs. */
export interface LoadedSessionForAccess {
    /** The session entity, loaded under the caller's own identity (so RLS applied to the read). */
    Session: MJAIAgentSessionEntity;
    /** The session's conversation `ExternalID` (anonymous scope id), or null. */
    ConversationExternalID: string | null;
    /** Whether the caller could read the session's conversation (false when there is none). */
    ConversationReadable: boolean;
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
    const conversation = await LoadSessionConversationScope(session, contextUser, provider);
    return { Session: session, ConversationExternalID: conversation.ExternalID, ConversationReadable: conversation.Readable };
}

/** What the caller could learn about a session's conversation: the scope half of {@link SessionAccessSubject}. */
export interface SessionConversationScope {
    /** The conversation's `ExternalID` (the anonymous scope id), or null when it has none or was not read. */
    ExternalID: string | null;
    /** Whether the caller could read the conversation (false when the session has none). */
    Readable: boolean;
}

/** {@link SessionConversationScope} plus the conversation's owner, for a conversation addressed without a session. */
export interface ConversationScope extends SessionConversationScope {
    /** `Conversation.UserID`, or null when the conversation was not read. */
    UserID: string | null;
}

/**
 * Reads an already-loaded session's conversation under `contextUser` (so its row-level security applies).
 * A missing conversation, a refused read and a failed read (logged) all report `Readable: false`. For
 * callers that loaded the session through another gate and only need the scope half of
 * {@link AuthorizeSessionAccess}'s subject.
 */
export async function LoadSessionConversationScope(
    session: MJAIAgentSessionEntity,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<SessionConversationScope> {
    if (!session.ConversationID) {
        return { ExternalID: null, Readable: false };
    }
    const { ExternalID, Readable } = await LoadConversationScope(session.ConversationID, contextUser, provider);
    return { ExternalID, Readable };
}

/**
 * Reads a conversation's owner and scope id under `contextUser` (so its row-level security applies), for a
 * caller that addresses the conversation directly rather than through a session — a text agent turn, for
 * example, whose only handle is a message in it. Together with the caller's principal this is exactly the
 * subject {@link AuthorizeSessionAccess} decides on: `SessionUserID` is the conversation's owner, since the
 * session a conversation belongs to is owned by the same user.
 *
 * An empty id, a missing conversation, a refused read and a failed read (logged) all report
 * `Readable: false` with no owner, which {@link AuthorizeSessionAccess} then refuses for any scoped caller.
 */
export async function LoadConversationScope(
    conversationId: string | null | undefined,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<ConversationScope> {
    const unreadable: ConversationScope = { UserID: null, ExternalID: null, Readable: false };
    if (!conversationId) {
        return unreadable;
    }
    try {
        const conversation = await provider.GetEntityObject<MJConversationEntity>(CONVERSATION_ENTITY, contextUser);
        if (!(await conversation.Load(conversationId))) {
            return unreadable;
        }
        return { UserID: conversation.UserID ?? null, ExternalID: conversation.ExternalID ?? null, Readable: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`LoadConversationScope: could not read conversation ${conversationId} for user ${contextUser?.ID}: ${message}`);
        return unreadable;
    }
}

/**
 * Who may run a conversation turn (a text agent turn, addressed by a message in the conversation) in
 * `conversationId`, decided the same way as session access.
 *
 * A NAMED principal is allowed without a read: its entity permissions and row filters already decided
 * whether it could load the message, and a named user is fully identified by its `UserID`. An ANONYMOUS
 * principal is not (see the module doc), so the conversation is read as the caller and
 * {@link AuthorizeSessionAccess} compares its scope id with the conversation's stamp — the same
 * decision #5997 applies to the realtime gates, so the text and voice paths agree on ownership.
 * An unreadable conversation refuses (`not_owner`, there is no owner to match).
 */
export async function AuthorizeConversationTurn(
    conversationId: string,
    principal: UserInfo,
    provider: IMetadataProvider,
): Promise<SessionAccessDecision> {
    if (!principal?.IsMagicLinkAnonymous) {
        return { Allowed: true };
    }
    const scope = await LoadConversationScope(conversationId, principal, provider);
    return AuthorizeSessionAccess(
        { SessionUserID: scope.UserID ?? '', ConversationExternalID: scope.ExternalID, ConversationReadable: scope.Readable },
        principal,
    );
}

/**
 * Whether an anonymous caller owns any of a LiveKit room's agent sessions — the check MJServer registers with
 * `RoomAuthorizationService.SetAnonymousSessionOwnerCheck` (`@memberjunction/livekit-room-server` cannot import
 * this package). Each session is loaded as the caller (its row-level security applies) and decided by
 * {@link AuthorizeSessionAccess}, the same decision every realtime gate makes, so a room admits exactly the visitor
 * whose scope id its session's conversation carries (MJ#6044). Nothing to read, or no provider: refused.
 */
export async function AuthorizeAnonymousRoomSessions(
    agentSessionIds: string[],
    user: UserInfo,
    provider: IMetadataProvider | undefined,
): Promise<boolean> {
    if (agentSessionIds.length === 0 || !provider) {
        return false;
    }
    for (const agentSessionId of agentSessionIds) {
        const loaded = await LoadSessionForAccess(agentSessionId, user, provider);
        if (!loaded) {
            continue;
        }
        const decision = AuthorizeSessionAccess(
            { SessionUserID: loaded.Session.UserID, ConversationExternalID: loaded.ConversationExternalID, ConversationReadable: loaded.ConversationReadable },
            user,
        );
        if (decision.Allowed) {
            return true;
        }
    }
    return false;
}

/**
 * The session conversation's `ExternalID` alone; null when there is none or it cannot be read.
 * Prefer {@link LoadSessionConversationScope}, which also says whether the read succeeded.
 */
export async function LoadSessionConversationExternalID(
    session: MJAIAgentSessionEntity,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<string | null> {
    return (await LoadSessionConversationScope(session, contextUser, provider)).ExternalID;
}

/**
 * Cross-conversation event-routing guards.
 *
 * The chat-area keeps one (hidden) message-input alive per visited conversation, and ALL of
 * them — including a background conversation's still-streaming input after the user swaps —
 * emit their agent-lifecycle events to the SINGLE parent chat-area. These helpers are the
 * predicates the chat-area's handlers actually use to decide what belongs to the displayed
 * conversation, extracted so they can be unit-tested as the real production code (not a
 * mirrored copy) and reused identically across every handler + the pending-message getter.
 */

import { UUIDsEqual } from '@memberjunction/global';

/**
 * True when an agent-lifecycle event belongs to the currently-active conversation and may
 * mutate its in-memory maps / engine cache. Events from a background conversation's input
 * (after a conversation swap) return false and must be dropped.
 *
 * Uses {@link UUIDsEqual} (NOT `===`): SQL Server returns UUIDs uppercase and PostgreSQL
 * lowercase, so the same conversation can arrive in different casing.
 */
export function eventBelongsToConversation(
    eventConversationId: string | null | undefined,
    activeConversationId: string | null | undefined,
): boolean {
    return UUIDsEqual(eventConversationId, activeConversationId);
}

/**
 * Resolves the conversation a pending message must be auto-sent to. Prefers the explicit
 * host-provided target, then the internally-captured new-conversation target, finally the
 * active conversation (legacy fallback for single-conversation hosts that never swap).
 *
 * Pinning to the captured target — not the live-active conversation — is what stops a fast
 * conversation-swap during the async auto-send window from redirecting the message into the
 * swapped-to conversation.
 */
export function resolvePendingMessageTarget(
    hostProvidedTargetId: string | null,
    capturedTargetId: string | null,
    activeConversationId: string | null,
): string | null {
    return hostProvidedTargetId ?? capturedTargetId ?? activeConversationId;
}

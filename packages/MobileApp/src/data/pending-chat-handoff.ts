import type { CapturedAttachment } from '@/data/services/attachments';

/**
 * In-memory one-time handoff payload from `NewConversationScreen` into `ChatThreadScreen`.
 *
 * Why this lives in process memory rather than Expo Router URL query params:
 * passing `autosend` and `autosendAttachment` over URL parameters allowed any external
 * deep link (`<scheme>:///chat/<id>?autosend=...&autosendAttachment={"uri":"file:///..."}`)
 * to trigger an unconfirmed agent turn and upload arbitrary sandbox files. Keeping the
 * handoff strictly in memory ensures only an in-app navigation from the composer can
 * auto-dispatch a prompt or local file attachment.
 */
export interface PendingChatHandoff {
    ConversationId: string;
    Prompt: string;
    Attachment: CapturedAttachment | null;
}

let pendingHandoff: PendingChatHandoff | null = null;

/**
 * Stage a one-time initial message handoff for a newly created conversation.
 */
export function SetPendingChatHandoff(
    conversationId: string,
    prompt: string,
    attachment: CapturedAttachment | null = null,
): void {
    pendingHandoff = {
        ConversationId: conversationId,
        Prompt: prompt,
        Attachment: attachment,
    };
}

/**
 * Consume the staged handoff for `conversationId`, if one matches.
 * Clears the staged value on read so a remount or back-navigation never re-sends it.
 */
export function ConsumePendingChatHandoff(conversationId: string | undefined): PendingChatHandoff | null {
    if (!conversationId || !pendingHandoff || pendingHandoff.ConversationId !== conversationId) {
        return null;
    }
    const handoff = pendingHandoff;
    pendingHandoff = null;
    return handoff;
}

/**
 * Clear any staged handoff (called on sign-out and in unit tests).
 */
export function ClearPendingChatHandoff(): void {
    pendingHandoff = null;
}


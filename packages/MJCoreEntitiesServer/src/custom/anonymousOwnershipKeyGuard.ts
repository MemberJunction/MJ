import { ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';

/**
 * The slice of a BaseEntity the guard reads: whether the row exists yet, who is saving it, and its fields.
 */
export interface OwnershipKeyGuardTarget {
    IsSaved: boolean;
    ContextCurrentUser?: { IsMagicLinkAnonymous?: boolean } | null;
    GetFieldByName(name: string): { Dirty: boolean } | null | undefined;
}

/**
 * Refuses an anonymous visitor changing an anonymous-session ownership key on an EXISTING row (#4931).
 *
 * An anonymous visitor's realtime session is owned through `AIAgentSession.ConversationID` →
 * `Conversation.ExternalID` (see `AuthorizeSessionAccess` in `@memberjunction/server`). Every anonymous
 * visitor shares one Anonymous user, so under a role whose row-level security filters by `UserID` (the
 * stock `UI` role) one visitor can load another visitor's row and would otherwise rewrite either key to
 * its own identity and pass the ownership gate. The key is set once, when the row is created — by
 * `SessionManager` for a server-created session and its conversation, and by the web widget for the
 * conversation it creates — so an insert is allowed and only a change to a saved row is refused.
 * Named callers are unaffected.
 *
 * @returns a refusal to push into the entity's validation result, or null when the save may proceed.
 */
export function CheckAnonymousOwnershipKeyChange(target: OwnershipKeyGuardTarget, fieldName: string): ValidationErrorInfo | null {
    if (!target.IsSaved || !target.ContextCurrentUser?.IsMagicLinkAnonymous) {
        return null;
    }
    if (!target.GetFieldByName(fieldName)?.Dirty) {
        return null;
    }
    return new ValidationErrorInfo(
        fieldName,
        `${fieldName} identifies who owns an anonymous realtime session and cannot be changed by an anonymous visitor.`,
        null,
        ValidationErrorType.Failure,
    );
}

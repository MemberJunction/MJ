import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { MJConversationEntity, MJUserEntity } from '../../generated/entity_subclasses';
import {
    IsConversationHiddenByFieldSecurity,
    ParseConversationAnchorMetadata,
    UserCanReadLinkedRecord
} from '../AnchoredConversationSecurity';
import { CreateShareNotification } from './shareNotification';

/**
 * A parsed `@mention` referencing a user inside `MJ: Conversation Details.Message`.
 */
export interface MentionedUserReference {
    /** User ID (`MJ: Users.ID`). */
    ID: string;
    /** Display name embedded in the mention token. */
    Name: string;
}

/**
 * Input to {@link DispatchConversationMentionNotifications}.
 */
export interface ConversationMentionNotificationInput {
    /** Metadata provider (must be a server-side Database provider to persist notifications). */
    Provider: IMetadataProvider;
    /** Context user authorizing the save. */
    ContextUser: UserInfo;
    /** ID of the `MJ: Conversations` record containing the message. */
    ConversationID: string;
    /** ID of the `MJ: Conversation Details` record that was created or updated. */
    ConversationDetailID: string;
    /** User ID of the person who authored the message. */
    AuthorUserID: string;
    /** Current `Message` text on the saved `MJ: Conversation Details` row. */
    Message: string | null | undefined;
    /** Previous `Message` text before this save (`null` or `undefined` when creating a new row). */
    PreviousMessage?: string | null | undefined;
    /** Optional pre-loaded `MJConversationEntity` to avoid an extra load when the caller already has it. */
    Conversation?: MJConversationEntity | null;
    /** Optional resolver for target `UserInfo` (used in unit tests or custom server caches). */
    ResolveRecipientUserInfo?: (userId: string) => Promise<UserInfo | null> | UserInfo | null;
}

/** Linear-time regex matching `@{"type":"user",...}` mention tokens (CodeQL-safe `[^{}]+`). */
const JSON_MENTION_TOKEN_REGEX = /@\{[^{}]+\}/g;

/**
 * Extracts all unique `@{"type":"user","id":"...","name":"..."}` user mentions from `message`.
 * Preserves order of first appearance and deduplicates by normalized UUID.
 */
export function ExtractUserMentionsFromMessage(
    message: string | null | undefined
): MentionedUserReference[] {
    if (!message || typeof message !== 'string') {
        return [];
    }
    const matches = Array.from(message.matchAll(JSON_MENTION_TOKEN_REGEX));
    if (matches.length === 0) {
        return [];
    }

    const seen = new Set<string>();
    const results: MentionedUserReference[] = [];
    for (const match of matches) {
        const jsonPart = match[0].slice(1);
        try {
            const parsed: unknown = JSON.parse(jsonPart);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                continue;
            }
            const record = parsed as Record<string, unknown>;
            const typeVal = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';
            const idVal = typeof record.id === 'string' ? record.id.trim() : '';
            const nameVal = typeof record.name === 'string' ? record.name.trim() : '';
            if (typeVal !== 'user' || !idVal) {
                continue;
            }
            const normalized = NormalizeUUID(idVal);
            if (seen.has(normalized)) {
                continue;
            }
            seen.add(normalized);
            results.push({
                ID: idVal,
                Name: nameVal || 'User'
            });
        } catch {
            // Ignore malformed JSON fragments following '@'
        }
    }

    return results;
}

/**
 * Returns only the user mentions present in `nextMessage` that were NOT already present
 * in `previousMessage`. On a new message (`previousMessage == null`), returns all user mentions.
 */
export function ExtractNewlyAddedUserMentions(
    previousMessage: string | null | undefined,
    nextMessage: string | null | undefined
): MentionedUserReference[] {
    const nextMentions = ExtractUserMentionsFromMessage(nextMessage);
    if (nextMentions.length === 0) {
        return [];
    }
    if (!previousMessage) {
        return nextMentions;
    }
    const previousMentions = ExtractUserMentionsFromMessage(previousMessage);
    if (previousMentions.length === 0) {
        return nextMentions;
    }
    const previousIds = new Set(previousMentions.map((m) => NormalizeUUID(m.ID)));
    return nextMentions.filter((m) => !previousIds.has(NormalizeUUID(m.ID)));
}

/**
 * Converts a message containing `@{"type":"...","name":"Alice"}` tokens into a clean plain-text
 * snippet suitable for notification bodies.
 */
export function FormatMentionPlainTextPreview(
    message: string | null | undefined,
    maxLength = 180
): string {
    const raw = (message ?? '').trim();
    if (!raw) {
        return '';
    }
    const replaced = raw.replace(JSON_MENTION_TOKEN_REGEX, (token) => {
        try {
            const parsed: unknown = JSON.parse(token.slice(1));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const name = (parsed as Record<string, unknown>).name;
                if (typeof name === 'string' && name.trim().length > 0) {
                    return `@${name.trim()}`;
                }
            }
        } catch {
            // Keep original token if malformed
        }
        return token;
    });

    const singleLine = replaced.replace(/\s+/g, ' ').trim();
    if (singleLine.length <= maxLength) {
        return singleLine;
    }
    return `${singleLine.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

/**
 * Dispatches in-app / multi-channel notifications for any newly `@mentioned` users in a saved
 * `MJ: Conversation Details` message.
 *
 * Security guarantees:
 * - Never notifies the author when they `@mention` themselves.
 * - For conversations linked to an entity record (`LinkedEntityID` + `LinkedRecordID`), verifies
 *   that each mentioned user holds entity read permission, passes Row-Level Security (RLS), and is
 *   NOT denied read access on the anchored field or `AnchorMetadata.restrictedFields` (FLS).
 *   A user who cannot read a restricted field (e.g., `Salary`) never receives a notification
 *   leaking a comment about that field.
 * - Never throws — notification errors are logged so message saves never fail due to notification delivery.
 */
export async function DispatchConversationMentionNotifications(
    input: ConversationMentionNotificationInput
): Promise<number> {
    if (input.Provider?.ProviderType !== 'Database') {
        return 0;
    }

    const newlyMentioned = ExtractNewlyAddedUserMentions(input.PreviousMessage, input.Message).filter(
        (m) => !UUIDsEqual(m.ID, input.AuthorUserID)
    );
    if (newlyMentioned.length === 0) {
        return 0;
    }

    try {
        let conversation = input.Conversation ?? null;
        if (!conversation) {
            const loaded = await input.Provider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                input.ContextUser
            );
            if (await loaded.Load(input.ConversationID)) {
                conversation = loaded;
            }
        }
        if (!conversation) {
            return 0;
        }

        const authorName = await resolveAuthorDisplayName(
            input.Provider,
            input.ContextUser,
            input.AuthorUserID
        );
        const metadata = ParseConversationAnchorMetadata(
            conversation.AnchorMetadataObject ?? conversation.AnchorMetadata
        );
        const preview = FormatMentionPlainTextPreview(input.Message);
        const title = buildMentionNotificationTitle(conversation, metadata?.anchorDisplayName ?? null, authorName);

        let deliveredCount = 0;
        for (const mention of newlyMentioned) {
            const allowed = await canRecipientAccessConversation(
                input.Provider,
                input.ContextUser,
                conversation,
                mention.ID,
                input.ResolveRecipientUserInfo
            );
            if (!allowed) {
                continue;
            }

            const isAnchored = Boolean(conversation.AnchorType && conversation.LinkedRecordID);
            const sent = await CreateShareNotification({
                Provider: input.Provider,
                ContextUser: input.ContextUser,
                GrantorUserID: input.AuthorUserID,
                GranteeUserID: mention.ID,
                ResourceTypeLabel: isAnchored ? 'Record Comment' : 'Conversation',
                ResourceTypeName: isAnchored ? 'Records' : 'Conversations',
                ResourceName:
                    metadata?.anchorDisplayName ||
                    conversation.AnchorKey ||
                    conversation.Name ||
                    'Comment thread',
                ResourceRecordID:
                    isAnchored && conversation.LinkedRecordID
                        ? conversation.LinkedRecordID
                        : conversation.ID,
                Title: title,
                Message: preview || `${authorName} mentioned you in a comment.`,
                ExtraConfiguration: {
                    Kind: 'Mention',
                    ConversationID: conversation.ID,
                    ConversationDetailID: input.ConversationDetailID,
                    LinkedEntityID: conversation.LinkedEntityID ?? null,
                    LinkedRecordID: conversation.LinkedRecordID ?? null,
                    AnchorType: conversation.AnchorType ?? null,
                    AnchorKey: conversation.AnchorKey ?? null
                }
            });
            if (sent) {
                deliveredCount++;
            }
        }

        return deliveredCount;
    } catch (error) {
        LogError(
            `DispatchConversationMentionNotifications failed for detail ${input.ConversationDetailID}: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return 0;
    }
}

function buildMentionNotificationTitle(
    conversation: MJConversationEntity,
    anchorDisplayName: string | null,
    authorName: string
): string {
    if (conversation.AnchorType) {
        const targetLabel =
            anchorDisplayName ||
            conversation.AnchorKey ||
            conversation.LinkedEntity ||
            conversation.Name ||
            'a record';
        return `${authorName} mentioned you on ${targetLabel}`;
    }
    const convName = (conversation.Name ?? '').trim();
    return convName
        ? `${authorName} mentioned you in "${convName}"`
        : `${authorName} mentioned you in a conversation`;
}

async function resolveAuthorDisplayName(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    authorUserId: string
): Promise<string> {
    if (UUIDsEqual(contextUser.ID, authorUserId) && (contextUser.Name || contextUser.Email)) {
        return contextUser.Name || contextUser.Email;
    }
    try {
        const userEntity = await provider.GetEntityObject<MJUserEntity>('MJ: Users', contextUser);
        if (await userEntity.Load(authorUserId)) {
            return userEntity.Name || userEntity.Email || 'Someone';
        }
    } catch {
        // Fallback below
    }
    return 'Someone';
}

async function canRecipientAccessConversation(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    conversation: MJConversationEntity,
    recipientUserId: string,
    customResolver?: (userId: string) => Promise<UserInfo | null> | UserInfo | null
): Promise<boolean> {
    if (!conversation.LinkedEntityID || !conversation.LinkedRecordID) {
        return true;
    }

    const recipientUser = customResolver
        ? await customResolver(recipientUserId)
        : await loadRecipientUserInfo(provider, contextUser, recipientUserId);
    if (!recipientUser || recipientUser.IsActive === false) {
        return false;
    }

    const entityInfo =
        provider?.Entities?.find((e) => UUIDsEqual(e.ID, conversation.LinkedEntityID)) ?? null;
    if (!entityInfo) {
        return false;
    }

    // 1. Check FLS first (0ms in-memory check) so restricted fields never leak via @mention notification
    if (
        IsConversationHiddenByFieldSecurity(
            entityInfo,
            recipientUser,
            conversation.AnchorType,
            conversation.AnchorKey,
            conversation.AnchorMetadataObject ?? conversation.AnchorMetadata
        )
    ) {
        return false;
    }

    // 2. Check entity read permission + RLS
    const recordAccess = await UserCanReadLinkedRecord(
        provider,
        recipientUser,
        conversation.LinkedEntityID,
        conversation.LinkedRecordID
    );
    return recordAccess.Allowed;
}

async function loadRecipientUserInfo(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    recipientUserId: string
): Promise<UserInfo | null> {
    try {
        const rv = RunView.FromMetadataProvider(provider);
        const escapedId = EscapeSQLString(recipientUserId);
        const [userRes, rolesRes] = await rv.RunViews([
            {
                EntityName: 'MJ: Users',
                ExtraFilter: `ID='${escapedId}'`,
                Fields: ['ID', 'Name', 'Email', 'Type', 'IsActive'],
                MaxRows: 1,
                ResultType: 'simple'
            },
            {
                EntityName: 'MJ: User Roles',
                ExtraFilter: `UserID='${escapedId}'`,
                Fields: ['UserID', 'RoleID', 'Role'],
                ResultType: 'simple'
            }
        ], contextUser);

        if (!userRes?.Success || (userRes.Results?.length ?? 0) === 0) {
            return null;
        }
        const rawUser = userRes.Results[0] as Record<string, unknown>;
        const rawRoles = (rolesRes?.Success ? rolesRes.Results : []) as Array<Record<string, unknown>>;
        return new UserInfo(provider, {
            ID: String(rawUser.ID ?? recipientUserId),
            Name: String(rawUser.Name ?? ''),
            Email: String(rawUser.Email ?? ''),
            Type: String(rawUser.Type ?? 'User'),
            IsActive: rawUser.IsActive !== false && rawUser.IsActive !== 0,
            UserRoles: rawRoles.map((r) => ({
                UserID: String(r.UserID ?? recipientUserId),
                RoleID: String(r.RoleID ?? ''),
                Role: String(r.Role ?? '')
            }))
        });
    } catch (error) {
        LogError(
            `loadRecipientUserInfo failed for ${recipientUserId}: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return null;
    }
}

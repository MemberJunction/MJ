import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntityFieldInfo,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJConversationDetailEntity, MJConversationEntity } from '../generated/entity_subclasses';
import { ConversationWriteDecision, UserMayWriteConversation } from './ConversationWriteAccess';

/**
 * Fields that represent the conversation owner's evaluation of an AI message.
 * Storage is a single value per message (no per-user rating column), so only
 * the owner may set or change them — even users with `Edit`-level grants on
 * the parent conversation cannot retroactively rewrite the owner's rating.
 */
const OWNER_ONLY_RATING_FIELDS = ['UserRating', 'UserFeedback'];

/**
 * The fields of a person's (`Role='User'`) message that say who wrote it and what it says: its author, its role, its
 * text, its attachment, its media type and where it sits in a thread. Only its author may change them, except
 * `Role`, which no one may change. Other fields (pinning, hiding, bookkeeping the server writes) keep the
 * conversation-level rules.
 */
const AUTHORED_FIELDS = ['UserID', 'Role', 'Message', 'ArtifactID', 'ArtifactVersionID', 'MediaType', 'ParentID'];

/**
 * Where a message sits: its conversation and its fork (`BranchID`, null is Main). No one moves a person's message,
 * its author included: moving it takes it out of the thread it was written in.
 */
const PLACEMENT_FIELDS = ['ConversationID', 'BranchID'];

/**
 * The fields the access and reply-authorship rules, which hold for everyone (including the system user unless
 * explicitly marked), decide on: which row is written (`ID`; an update's SQL is rebuilt with the variable's value at
 * submit, so it would write another row), its conversation, its role (`Role` — a transaction variable setting `AI` or
 * `Error` at submit would bypass the unmarked reply check), and the owner's rating. A transaction variable sets its
 * field at submit, after the gate has run, so none of these may take its value from one.
 */
const ACCESS_GATED_FIELDS = ['ID', 'ConversationID', 'Role', ...OWNER_ONLY_RATING_FIELDS];

/** {@link ACCESS_GATED_FIELDS} plus the fields the authorship rules decide on, which the system user skips. */
const GATED_FIELDS = [
    ...ACCESS_GATED_FIELDS,
    'BranchID',
    ...AUTHORED_FIELDS.filter(field => field !== 'Role')
];

/**
 * The fields of an agent's reply (`Role` `AI` or `Error`) that say what the agent said, who said it, and where it sits:
 * the authored fields ({@link AUTHORED_FIELDS}: `UserID`, `Role`, `Message`, `ArtifactID`, `ArtifactVersionID`,
 * `MediaType`, `ParentID`), plus its conversation (`ConversationID`) and fork (`BranchID`), its agent (`AgentID`),
 * its status (`Status`) and error (`Error`), the form (`ResponseForm`), commands (`ActionableCommands`,
 * `AutomaticCommands`), suggested replies (`SuggestedResponses`) and reflection (`ReflectionInsights`) it offers, and
 * the turn timing and external reference (`CompletionTime`, `ExternalID`). Only a server write marked with
 * {@link MJConversationDetailEntityExtended.MarkServerAuthoredReply} changes them. Pinning, hiding, the owner's rating
 * and the other bookkeeping keep the conversation-level rules.
 */
const REPLY_FIELDS = [
    ...AUTHORED_FIELDS,
    'ConversationID',
    'BranchID',
    'AgentID',
    'Status',
    'Error',
    'ResponseForm',
    'ActionableCommands',
    'AutomaticCommands',
    'SuggestedResponses',
    'ReflectionInsights',
    'CompletionTime',
    'ExternalID'
];

/** The refusal for a write that would put words in an agent's mouth. */
const REPLY_REFUSAL = "Only the server writes an agent's reply.";

/**
 * Whether a `Role` value is a person's message. Compared the way validation and the database's CHECK constraint
 * compare it (trimmed, any case), so `'user'` or `'User '`, which both store, cannot slip past these rules.
 */
function isPersonRole(role: string | null | undefined): boolean {
    return role != null && EntityFieldInfo.NormalizeValueListValue(role) === 'user';
}

/** Whether a `Role` value is an agent's reply (`AI` or `Error`), compared as {@link isPersonRole} compares. */
function isReplyRole(role: string | null | undefined): boolean {
    const normalized = role == null ? null : EntityFieldInfo.NormalizeValueListValue(role);
    return normalized === 'ai' || normalized === 'error';
}

/**
 * Server-side defense-in-depth for conversation sharing. The Angular chat UI
 * disables the message input when the current user only holds `View` access,
 * but that's a cosmetic gate — a determined caller could still hit the API
 * directly. This override blocks Create/Update/Delete of conversation
 * messages unless the context user is either:
 *
 *  1. The conversation's owner (`MJ: Conversations.UserID`), or
 *  2. A grantee on `MJ: Resource Permissions` with `PermissionLevel` of
 *     `Edit` or `Owner` (directly or via role) and `Status='Approved'`.
 *
 * Additionally, the **rating fields** (`UserRating` and `UserFeedback`) are
 * owner-only — even users with `Edit`-level grants on the conversation are
 * blocked from changing them, because the storage is a single value per
 * message (it represents the owner's evaluation, not per-grantee opinions).
 *
 * **Who a message is from** (A19, the rules for people's messages). For a `Role='User'` message, the owner and
 * grantees alike:
 *  - post only as themselves: a new message naming another person's `UserID` is refused, and a grantee's message
 *    with no `UserID` gets the grantee's (an empty one reads as the conversation's owner). The owner's stays empty,
 *    since it already means them;
 *  - change who wrote it and what it says ({@link AUTHORED_FIELDS}) only when they wrote it, and never its role;
 *  - never move it to another conversation or fork ({@link PLACEMENT_FIELDS});
 *  - delete it only when they wrote it, or own the conversation.
 *
 * The system user is exempt from these authorship rules, since server code writes on people's behalf, but it still
 * needs to own the conversation or hold a grant on it, as before: some server paths elevate an anonymous visitor to
 * the system user (MJ#4791), and this gate keeps those paths out of other people's conversations, so no transaction
 * variable may set the row or conversation it writes ({@link ACCESS_GATED_FIELDS}) for it either.
 *
 * **Only the server writes an agent's reply** (A19, second half). A reply (`Role` `AI` or `Error`) is created, and
 * what it says ({@link REPLY_FIELDS}) changed, only on an instance server code marked with
 * {@link MarkServerAuthoredReply}. The marker is not a field: no GraphQL input, `OldValues___` or transaction
 * variable reaches it, so a person's save of a reply is refused whatever its user, and so is an unmarked save as the
 * system user. A marked write still needs its context user (the person the reply is for, or whoever runs a
 * host-driven turn) to own the conversation or hold a grant on it, so being the system user grants nothing new.
 * Pinning, hiding, the owner's rating and other bookkeeping keep the conversation-level rules.
 * MJ's permissions engine has no native primitive for per-field row-conditional
 * write rules, so this gate lives here rather than in `MJ: Entity Permissions`.
 *
 * Runs on the server only (`ProviderType === 'Database'`) — client-side
 * executions pass straight through to `super` so offline/optimistic paths
 * still work. `ResourcePermissionEngine`'s cache is used to avoid per-save
 * round trips for permission lookups.
 */
@RegisterClass(BaseEntity, 'MJ: Conversation Details')
export class MJConversationDetailEntityExtended extends MJConversationDetailEntity {
    private serverAuthoredReply = false;

    /**
     * Marks this instance as server code writing an agent's reply, so it may create a reply (`Role` `AI` or `Error`)
     * and change what one says. Call it before `Save()`; it stays on the instance for every later save, like
     * `SetCloneContext()`. The context user still needs to own the conversation or hold a grant on it.
     *
     * It is not a field: no GraphQL input, `OldValues___` or transaction variable can set it, and the browser's copy of
     * this class never sends it. It has no effect on a person's message.
     */
    public MarkServerAuthoredReply(): void {
        this.serverAuthoredReply = true;
    }

    /** Whether {@link MarkServerAuthoredReply} was called on this instance. */
    public get IsServerAuthoredReply(): boolean {
        return this.serverAuthoredReply;
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const callerUserID = this.UserID; // the gate may fill in a grantee's; a save that fails keeps the caller's
        if (!(await this.currentUserMayWrite('save'))) {
            return false;
        }
        const saved = await super.Save(options);
        if (!saved) {
            this.UserID = callerUserID;
        }
        return saved;
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!(await this.currentUserMayWrite('delete'))) {
            return false;
        }
        return super.Delete(options);
    }

    private async currentUserMayWrite(operation: 'save' | 'delete'): Promise<boolean> {
        const resultType: 'create' | 'update' | 'delete' =
            operation === 'delete' ? 'delete' : this.IsSaved ? 'update' : 'create';
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        if (provider?.ProviderType !== 'Database') {
            // Client-side path — trust the enforcement that already ran upstream.
            return true;
        }

        const user = this.ContextCurrentUser;
        if (!user) {
            // No user context on a server save = system operation; allow.
            return true;
        }
        // The system user skips the authorship rules (server code writes on people's behalf) but, like anyone, must own
        // the conversation or hold a grant on it: some server paths elevate an anonymous visitor to the system user
        // (MJ#4791), and this gate is what keeps those paths out of other people's conversations.
        const isSystemUser = WellKnownUserSource.Instance.IsSystemUser(user);
        const variableGated = isSystemUser ? ACCESS_GATED_FIELDS : GATED_FIELDS;
        const touchesReply = isReplyRole(this.Role) || isReplyRole(this.originalFieldText('Role'));
        if (operation === 'save' && this.fieldSetByTransactionVariable(touchesReply && !this.serverAuthoredReply ? [...variableGated, ...REPLY_FIELDS] : variableGated)) {
            // A transaction variable sets its field after this check has passed, at submit, to any value an earlier
            // item in the group produced: a message would be checked as one row, author or conversation and saved as
            // another, and an unmarked save could rewrite what an agent's reply says.
            this.recordDenied('A conversation message cannot take its values from a transaction variable.', resultType);
            return false;
        }

        // A message created by the record-cloning engine, as part of copying a conversation into a
        // new user's account. The engine has already authorized that copy (Owner-only, the clone
        // authorization, and conversations are copyable only from a template user), and the
        // conversation it lands in belongs to the new user, not to whoever runs the clone. Only
        // creates qualify: updating or deleting an existing message keeps the checks below.
        if (resultType === 'create' && this.CloneContext) {
            return true;
        }

        try {
            const access = await UserMayWriteConversation(provider, user, this.ConversationID);
            const refusal = (await this.accessRefusal(provider, access))
                ?? (isSystemUser ? null : this.authorshipRefusal(operation, user, access.IsOwner))
                ?? this.replyRefusal(operation);
            if (refusal) {
                this.recordDenied(refusal, resultType);
                return false;
            }
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(
                `MJConversationDetailEntityExtended.currentUserMayWrite failed ` +
                    `(${operation} on conversation ${this.ConversationID}, user ${user.ID}): ${message}`
            );
            // Fail closed — safer to deny than silently allow a compromised write.
            this.recordDenied('Unable to verify conversation permissions.', resultType);
            return false;
        }
    }

    /**
     * Why the user may not write to this message's conversation at all, or `null` when they may. The owner may. Anyone
     * else may not change the rating fields, which are the owner's alone, and needs an `Edit` or `Owner` grant. A
     * conversation that does not load for the user is hidden from them when it exists (a row filter), and they may not
     * write to it; when no one can find it, it is missing or being created in this same transaction, and the foreign
     * key and the base save decide, as before.
     */
    private async accessRefusal(provider: IMetadataProvider, access: ConversationWriteDecision): Promise<string | null> {
        if (access.IsOwner) {
            return null;
        }
        // Non-owners are *never* allowed to touch the rating fields, even
        // when they hold Edit/Owner grants on the conversation. UserRating
        // and UserFeedback represent the owner's evaluation of an AI
        // message and there is no per-user storage to overwrite.
        if (OWNER_ONLY_RATING_FIELDS.some((name) => this.isFieldDirty(name))) {
            return 'Only the conversation owner can set or change the rating and feedback on this message.';
        }
        if (!access.Allowed) {
            return access.Reason ?? 'Permission denied.';
        }
        if (!access.Loaded && (await this.conversationExists(provider))) {
            return 'You do not have access to this conversation.';
        }
        return null;
    }

    /**
     * Why this write would put words in an agent's mouth, or `null` when it does not: an unmarked save that creates a
     * reply, turns a message into one, or changes what one says ({@link REPLY_FIELDS}). Applies to every user, the
     * system user included. Deleting a reply keeps the conversation-level rules.
     */
    private replyRefusal(operation: 'save' | 'delete'): string | null {
        if (operation === 'delete' || this.serverAuthoredReply) {
            return null;
        }
        if (!this.IsSaved) {
            return isReplyRole(this.Role) ? REPLY_REFUSAL : null;
        }
        const touchesReply = isReplyRole(this.originalFieldText('Role')) || isReplyRole(this.Role);
        return touchesReply && REPLY_FIELDS.some((name) => this.isFieldDirty(name)) ? REPLY_REFUSAL : null;
    }

    /**
     * Why this write breaks the rules for people's messages (see the class doc), or `null` when it does not. On a new
     * message from a grantee with no `UserID`, fills in the grantee's.
     */
    private authorshipRefusal(operation: 'save' | 'delete', user: UserInfo, isOwner: boolean): string | null {
        if (operation === 'delete') {
            return this.deleteRefusal(user, isOwner);
        }
        return this.IsSaved ? this.changeRefusal(user, isOwner) : this.postRefusal(user, isOwner);
    }

    /** A new person's message names its author as the poster, or names no one (filled in for a grantee). */
    private postRefusal(user: UserInfo, isOwner: boolean): string | null {
        if (!isPersonRole(this.Role)) {
            return null;
        }
        if (!this.UserID) {
            // An empty UserID reads as the conversation's owner. A grantee's message gets the grantee's ID; the
            // owner's stays empty, so server code writing as the owner (a room transcript of what other people said)
            // is not stamped with the owner's ID.
            if (!isOwner) {
                this.UserID = user.ID;
            }
            return null;
        }
        return UUIDsEqual(this.UserID, user.ID) ? null : 'You can post a message only as yourself.';
    }

    /**
     * An existing person's message: only its author changes who wrote it and what it says, no one its role (to or
     * from `User`), and no one moves it to another conversation or fork. A message with no `UserID` is the owner's.
     */
    private changeRefusal(user: UserInfo, isOwner: boolean): string | null {
        const wasPerson = isPersonRole(this.originalFieldText('Role'));
        if (this.isFieldDirty('Role') && (wasPerson || isPersonRole(this.Role))) {
            return "A message's role cannot be changed.";
        }
        if (!wasPerson) {
            return null;
        }
        if (PLACEMENT_FIELDS.some((name) => this.isFieldDirty(name))) {
            // Moving it would take it out of the thread it was written in (a delete) and put it in one its author never
            // wrote in, and, with no UserID, make it read as another conversation's owner's.
            return 'A message cannot be moved to another conversation or fork.';
        }
        const changed = AUTHORED_FIELDS.filter((name) => this.isFieldDirty(name));
        if (changed.length === 0) {
            return null;
        }
        const author = this.originalFieldText('UserID') ?? (isOwner ? user.ID : null);
        if (!author || !UUIDsEqual(author, user.ID)) {
            return 'Only the person who wrote this message can change it.';
        }
        if (changed.includes('UserID') && !(this.UserID && UUIDsEqual(this.UserID, user.ID))) {
            return 'You can post a message only as yourself.';
        }
        return null;
    }

    /** A person's message is deleted by its author or by the conversation's owner (whose it is with no `UserID`). */
    private deleteRefusal(user: UserInfo, isOwner: boolean): string | null {
        if (!isPersonRole(this.Role) || isOwner) {
            return null;
        }
        return this.UserID && UUIDsEqual(this.UserID, user.ID)
            ? null
            : "Only the message's author or the conversation's owner can delete it.";
    }

    /** Whether the conversation exists, read as the system user; false when there is no system user to ask. */
    private async conversationExists(provider: IMetadataProvider): Promise<boolean> {
        const systemUser = await WellKnownUserSource.Instance.GetSystemUser(provider);
        if (!systemUser) {
            LogError(
                `MJConversationDetailEntityExtended: no system user to check whether conversation ${this.ConversationID} ` +
                    'exists; treating it as missing.'
            );
            return false;
        }
        const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', systemUser);
        return conversation.Load(this.ConversationID);
    }

    /**
     * Whether a transaction variable of this message's group sets one of `fields` on it. The field is resolved the way
     * `Set` resolves it at submit (trimmed, any case).
     */
    private fieldSetByTransactionVariable(fields: string[]): boolean {
        return !!this.TransactionGroup?.Variables.some((v) => {
            const name = v.EntityObject === this && v.Type === 'Use' ? this.GetFieldByName(v.FieldName)?.Name : null;
            return !!name && fields.includes(name);
        });
    }

    private isFieldDirty(name: string): boolean {
        return !!this.GetFieldByName(name)?.Dirty;
    }

    /** A field's value as loaded, before this save's changes; `null` when it was empty or is not text. */
    private originalFieldText(name: string): string | null {
        const original: unknown = this.GetFieldByName(name)?.OldValue;
        return typeof original === 'string' && original.length > 0 ? original : null;
    }

    /**
     * Records WHY the write was refused as a NEW `ResultHistory` entry, so callers that read
     * `LatestResult.CompleteMessage` see the reason (issue #4791).
     *
     * It must be a new entry, not an edit of `LatestResult`: on a brand-new record there IS no
     * `LatestResult` yet (nothing has been saved), so editing it silently dropped the denial and
     * every caller logged "unknown error". Appending also leaves an earlier successful save's
     * entry untouched. Mirrors `ReadOnlyExternalBaseEntity.rejectMutation`.
     */
    private recordDenied(message: string, type: 'create' | 'update' | 'delete'): void {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
    }
}

/** Tree-shaking guard — referenced from the MJCoreEntities barrel so the decorator fires. */
export function LoadMJConversationDetailEntityExtended(): void {
    // intentionally empty
}

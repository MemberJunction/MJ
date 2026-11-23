import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntityFieldInfo,
    EntitySaveOptions,
    IEntityDataProvider,
    IMetadataProvider,
    LogError,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    WellKnownUserSource
} from "@memberjunction/core";
import { EscapeSQLString, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import {
    DispatchConversationMentionNotifications,
    MJConversationDetailEntity,
    MJConversationDetailEntityExtended,
    MJConversationEntity
} from "@memberjunction/core-entities";
import { InspectAndStampRestrictedFieldsForComment } from "./RestrictedFieldCommentClassifier";
import { AgentChannelConversationDriver } from "./AgentChannelConversationDriver.server";
import {
    ConversationDetailWritePermissionRegistry,
    ResolveConversationSummaryForWritePermission,
    type ConversationDetailWriteOperation,
    type ConversationDetailWritePermissionVerdict,
    type ConversationSummaryForWritePermission
} from "./ConversationDetailWritePermissionProvider";

const OWNER_ONLY_RATING_FIELDS = ['UserRating', 'UserFeedback'];
const AUTHORED_FIELDS = ['UserID', 'Role', 'Message', 'ArtifactID', 'ArtifactVersionID', 'MediaType', 'ParentID'];
const PLACEMENT_FIELDS = ['ConversationID', 'BranchID'];
const ACCESS_GATED_FIELDS = ['ID', 'ConversationID', 'Role', ...OWNER_ONLY_RATING_FIELDS];
const GATED_FIELDS = [
    ...ACCESS_GATED_FIELDS,
    'BranchID',
    ...AUTHORED_FIELDS.filter((field) => field !== 'Role'),
];
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
    'ExternalID',
];
const REPLY_REFUSAL = "Only the server writes an agent's reply.";

function isPersonRole(role: string | null | undefined): boolean {
    return role != null && EntityFieldInfo.NormalizeValueListValue(role) === 'user';
}

function isReplyRole(role: string | null | undefined): boolean {
    const normalized = role == null ? null : EntityFieldInfo.NormalizeValueListValue(role);
    return normalized === 'ai' || normalized === 'error';
}

function asMetadataProvider(
    provider: IEntityDataProvider | IMetadataProvider | null | undefined
): IMetadataProvider | null {
    if (!provider || !('ProviderType' in provider)) {
        return null;
    }
    return provider;
}

/**
 * Server-side subclass of MJConversationDetailEntity that:
 * 1. Automatically tracks when the original message content has been modified (`OriginalMessageChanged`).
 * 2. Checks the fork (`BranchID`) of each new message on create.
 * 3. Inspects comments posted on anchored conversations (`LinkedEntityID` + `LinkedRecordID`)
 *    when the target entity has `FieldLevelSecurityApplies === true`:
 *    - Runs two-stage restricted-field detection (deterministic field/label/value matching + semantic LLM classifier).
 *    - Refuses the save if the authoring user is denied Read access on a restricted field referenced by their comment.
 *    - Stamps any detected restricted field names into the parent conversation's
 *      `AnchorMetadataObject.restrictedFields` so all subsequent reads filter deterministically in 0ms.
 * 4. Delegates to {@link MJConversationDetailEntityExtended} for write-access, authorship,
 *    server-authored reply validation, and `@mention` notification dispatch.
 */
@RegisterClass(BaseEntity, "MJ: Conversation Details")
export class MJConversationDetailEntityServer extends MJConversationDetailEntityExtended {
    private preloadedConversationSummary: ConversationSummaryForWritePermission | null = null;
    private insideSaveValidation = false;

    /**
     * Attaches preloaded conversation metadata so pluggable write permission providers
     * can evaluate host rules in memory without issuing an extra conversation query.
     */
    public SetConversationWriteContext(summary: ConversationSummaryForWritePermission | null): void {
        this.preloadedConversationSummary = summary;
    }

    /**
     * Evaluates registered {@link ConversationDetailWritePermissionProvider} hooks for `operation`.
     * Returns `{ Decision: 'Abstain' }` immediately when no custom provider is registered,
     * preserving 100% backward-compatible default behavior with zero extra queries.
     */
    public async EvaluatePluggableWritePermission(
        operation: ConversationDetailWriteOperation
    ): Promise<ConversationDetailWritePermissionVerdict> {
        const provider = asMetadataProvider(this.ProviderToUse);
        if (provider?.ProviderType !== 'Database') {
            return { Decision: 'Abstain' };
        }
        const user = this.ContextCurrentUser;
        if (!user || !this.ConversationID) {
            return { Decision: 'Abstain' };
        }
        if (!ConversationDetailWritePermissionRegistry.Instance.HasRegisteredProviders()) {
            return { Decision: 'Abstain' };
        }
        const summary = await ResolveConversationSummaryForWritePermission(
            provider,
            user,
            this.ConversationID,
            this.preloadedConversationSummary
        );
        return ConversationDetailWritePermissionRegistry.Instance.Evaluate({
            Provider: provider,
            ContextUser: user,
            Operation: operation,
            ConversationID: this.ConversationID,
            Conversation: summary,
            ConversationDetail: this,
            IsServerAuthoredReply: this.IsServerAuthoredReply,
        });
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success || this.insideSaveValidation) {
            return result;
        }
        const evalWrite =
            this.EvaluatePluggableWritePermission ??
            MJConversationDetailEntityServer.prototype.EvaluatePluggableWritePermission;
        const verdict = await evalWrite.call(this, this.IsSaved ? 'update' : 'create');
        if (verdict.Decision === 'Deny') {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'ConversationID',
                    verdict.Reason || 'You do not have permission to write to this conversation.',
                    this.ConversationID,
                    ValidationErrorType.Failure
                )
            );
        }
        return result;
    }

    /**
     * Sets the OriginalMessageChanged flag on a genuine message edit, checks a new row's fork,
     * checks pluggable conversation-detail write permission providers, runs FLS restricted-field
     * inspection for anchored conversations, then saves.
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNewRecord = !this.IsSaved;
        const callerUserID = this.UserID;
        const previousMessage = isNewRecord ? null : this.readOriginalFieldText('Message');
        if (this.ShouldFlagOriginalMessageChanged()) {
            this.OriginalMessageChanged = true;
        }
        const problem = await this.CheckBranchOnCreate();
        if (problem) {
            this.recordCreateFailure(problem);
            return false;
        }
        if (isNewRecord && this.ConversationID && this.ContextCurrentUser) {
            const channelRefusal = await AgentChannelConversationDriver.CheckParticipantCanPost(
                this.ProviderToUse as unknown as IMetadataProvider,
                this.ConversationID,
                this.ContextCurrentUser
            );
            if (channelRefusal) {
                this.recordCreateFailure(channelRefusal, 'create');
                return false;
            }
        }
        const checkFls =
            this.CheckAndStampAnchoredRestrictedFields ??
            MJConversationDetailEntityServer.prototype.CheckAndStampAnchoredRestrictedFields;
        const flsRefusal = await checkFls.call(this);
        if (flsRefusal) {
            this.recordCreateFailure(flsRefusal, this.IsSaved ? 'update' : 'create');
            return false;
        }

        const evalWrite =
            this.EvaluatePluggableWritePermission ??
            MJConversationDetailEntityServer.prototype.EvaluatePluggableWritePermission;
        const writeVerdict = await evalWrite.call(this, isNewRecord ? 'create' : 'update');
        if (writeVerdict.Decision === 'Deny') {
            this.recordCreateFailure(
                writeVerdict.Reason || 'You do not have permission to write to this conversation.',
                isNewRecord ? 'create' : 'update'
            );
            return false;
        }

        let saved: boolean;
        this.insideSaveValidation = true;
        try {
            if (writeVerdict.Decision === 'Allow') {
                saved = await this.saveWithProviderAuthorization(
                    options,
                    isNewRecord,
                    callerUserID,
                    previousMessage,
                    Boolean(writeVerdict.IsOwnerOverride)
                );
            } else {
                saved = await super.Save(options);
            }
        } finally {
            this.insideSaveValidation = false;
        }

        if (saved && isNewRecord && this.ConversationID && !this.AgentID && this.Role === 'User') {
            await AgentChannelConversationDriver.HandleHumanMessagePosted(
                this.ProviderToUse as unknown as IMetadataProvider,
                this.ConversationID,
                this.ContextCurrentUser,
                new Date(),
                {
                    conversationDetailID: this.ID ?? null,
                    senderUserID: this.UserID ?? this.ContextCurrentUser?.ID ?? null,
                    messagePreview: this.Message ?? '',
                }
            );
        }
        return saved;
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const evalWrite =
            this.EvaluatePluggableWritePermission ??
            MJConversationDetailEntityServer.prototype.EvaluatePluggableWritePermission;
        const writeVerdict = await evalWrite.call(this, 'delete');
        if (writeVerdict.Decision === 'Deny') {
            this.recordMutationFailure(
                writeVerdict.Reason || 'You do not have permission to delete from this conversation.',
                'delete'
            );
            return false;
        }
        if (writeVerdict.Decision === 'Allow') {
            const refusal = this.authorAndRatingGuardRefusal('delete', Boolean(writeVerdict.IsOwnerOverride));
            if (refusal) {
                this.recordMutationFailure(refusal, 'delete');
                return false;
            }
            return MJConversationDetailEntity.prototype.Delete.call(this, options);
        }
        return super.Delete(options);
    }

    private async saveWithProviderAuthorization(
        options: EntitySaveOptions | undefined,
        isNewRecord: boolean,
        callerUserID: string | null,
        previousMessage: string | null,
        isOwnerOverride: boolean
    ): Promise<boolean> {
        const resultType: 'create' | 'update' = isNewRecord ? 'create' : 'update';
        const refusal = this.authorAndRatingGuardRefusal('save', isOwnerOverride);
        if (refusal) {
            this.UserID = callerUserID;
            this.recordMutationFailure(refusal, resultType);
            return false;
        }
        const saved = await MJConversationDetailEntity.prototype.Save.call(this, options);
        if (!saved) {
            this.UserID = callerUserID;
            return false;
        }
        const provider = asMetadataProvider(this.ProviderToUse);
        const user = this.ContextCurrentUser;
        if (
            provider?.ProviderType === 'Database' &&
            user &&
            isPersonRole(this.Role) &&
            this.Message &&
            typeof DispatchConversationMentionNotifications === 'function'
        ) {
            await DispatchConversationMentionNotifications({
                Provider: provider,
                ContextUser: user,
                ConversationID: this.ConversationID,
                ConversationDetailID: this.ID,
                AuthorUserID: this.UserID || user.ID,
                Message: this.Message,
                PreviousMessage: !isNewRecord ? previousMessage : null,
            });
        }
        return true;
    }

    private authorAndRatingGuardRefusal(
        operation: 'save' | 'delete',
        isOwnerOverride: boolean
    ): string | null {
        const user = this.ContextCurrentUser;
        if (!user) {
            return null;
        }
        const isSystemUser = WellKnownUserSource.Instance.IsSystemUser(user);
        const variableGated = isSystemUser ? ACCESS_GATED_FIELDS : GATED_FIELDS;
        const touchesReply = isReplyRole(this.Role) || isReplyRole(this.readOriginalFieldText('Role'));
        if (
            operation === 'save' &&
            this.hasTransactionVariableFor(
                touchesReply && !this.IsServerAuthoredReply ? [...variableGated, ...REPLY_FIELDS] : variableGated
            )
        ) {
            return 'A conversation message cannot take its values from a transaction variable.';
        }
        if (!this.IsSaved && operation === 'save' && this.CloneContext) {
            return null;
        }
        if (!isOwnerOverride && OWNER_ONLY_RATING_FIELDS.some((name) => this.isFieldDirtyFlag(name))) {
            return 'Only the conversation owner can set or change the rating and feedback on this message.';
        }
        const authorRefusal = isSystemUser ? null : this.authorshipGuardRefusal(operation, user, isOwnerOverride);
        if (authorRefusal) {
            return authorRefusal;
        }
        return this.replyGuardRefusal(operation);
    }

    private authorshipGuardRefusal(
        operation: 'save' | 'delete',
        user: NonNullable<MJConversationDetailEntityServer['ContextCurrentUser']>,
        isOwner: boolean
    ): string | null {
        if (operation === 'delete') {
            if (!isPersonRole(this.Role) || isOwner) {
                return null;
            }
            return this.UserID && UUIDsEqual(this.UserID, user.ID)
                ? null
                : "Only the message's author or the conversation's owner can delete it.";
        }
        if (!this.IsSaved) {
            if (!isPersonRole(this.Role)) {
                return null;
            }
            if (!this.UserID) {
                if (!isOwner) {
                    this.UserID = user.ID;
                }
                return null;
            }
            return UUIDsEqual(this.UserID, user.ID) ? null : 'You can post a message only as yourself.';
        }
        const wasPerson = isPersonRole(this.readOriginalFieldText('Role'));
        if (this.isFieldDirtyFlag('Role') && (wasPerson || isPersonRole(this.Role))) {
            return "A message's role cannot be changed.";
        }
        if (!wasPerson) {
            return null;
        }
        if (PLACEMENT_FIELDS.some((name) => this.isFieldDirtyFlag(name))) {
            return 'A message cannot be moved to another conversation or fork.';
        }
        const changed = AUTHORED_FIELDS.filter((name) => this.isFieldDirtyFlag(name));
        if (changed.length === 0) {
            return null;
        }
        const author = this.readOriginalFieldText('UserID') ?? (isOwner ? user.ID : null);
        if (!author || !UUIDsEqual(author, user.ID)) {
            return 'Only the person who wrote this message can change it.';
        }
        if (changed.includes('UserID') && !(this.UserID && UUIDsEqual(this.UserID, user.ID))) {
            return 'You can post a message only as yourself.';
        }
        return null;
    }

    private replyGuardRefusal(operation: 'save' | 'delete'): string | null {
        if (operation === 'delete' || this.IsServerAuthoredReply) {
            return null;
        }
        if (!this.IsSaved) {
            return isReplyRole(this.Role) ? REPLY_REFUSAL : null;
        }
        const touchesReply = isReplyRole(this.readOriginalFieldText('Role')) || isReplyRole(this.Role);
        return touchesReply && REPLY_FIELDS.some((name) => this.isFieldDirtyFlag(name)) ? REPLY_REFUSAL : null;
    }

    private hasTransactionVariableFor(fields: string[]): boolean {
        return Boolean(
            this.TransactionGroup?.Variables.some((v) => {
                const name = v.EntityObject === this && v.Type === 'Use' ? this.GetFieldByName(v.FieldName)?.Name : null;
                return Boolean(name && fields.includes(name));
            })
        );
    }

    private isFieldDirtyFlag(name: string): boolean {
        return Boolean(typeof this.GetFieldByName === 'function' && this.GetFieldByName(name)?.Dirty);
    }

    private readOriginalFieldText(name: string): string | null {
        if (typeof this.GetFieldByName !== 'function') {
            return null;
        }
        const original = this.GetFieldByName(name)?.OldValue;
        return typeof original === 'string' && original.length > 0 ? original : null;
    }

    private recordMutationFailure(message: string, type: 'create' | 'update' | 'delete'): void {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
    }

    /**
     * When saving a message in an anchored conversation (`LinkedEntityID` + `LinkedRecordID`) whose
     * target entity has `FieldLevelSecurityApplies === true`, runs {@link InspectAndStampRestrictedFieldsForComment}
     * to block restricted-field probing by unauthorized authors and stamp `restrictedFields` onto the
     * parent conversation's `AnchorMetadataObject`.
     */
    public async CheckAndStampAnchoredRestrictedFields(): Promise<string | null> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        if (provider?.ProviderType !== 'Database') {
            return null;
        }
        const user = this.ContextCurrentUser;
        if (!user || !this.ConversationID) {
            return null;
        }

        // Only inspect on new messages or when Message text is being modified
        if (this.IsSaved && !this.GetFieldByName('Message')?.Dirty) {
            return null;
        }

        try {
            const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? user;
            const conversation = await provider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                systemUser
            );
            const loaded = await conversation.Load(this.ConversationID);
            if (!loaded || !conversation.AnchorType || !conversation.LinkedEntityID || !conversation.LinkedRecordID) {
                return null;
            }

            const entityInfo =
                (typeof provider.EntityByID === 'function'
                    ? provider.EntityByID(conversation.LinkedEntityID)
                    : undefined) ??
                provider.Entities?.find((e) => UUIDsEqual(e.ID, conversation.LinkedEntityID)) ??
                null;
            if (!entityInfo) {
                return null;
            }

            if (!WellKnownUserSource.Instance.IsSystemUser(user)) {
                if (entityInfo.AllowRecordComments === false) {
                    return `Record commenting is disabled for ${entityInfo.DisplayNameOrName}.`;
                }
                if (typeof entityInfo.CanUserComment === 'function' && !entityInfo.CanUserComment(user)) {
                    return `You do not have permission to post comments on ${entityInfo.DisplayNameOrName} records.`;
                }
            }

            if (!entityInfo.FieldLevelSecurityApplies) {
                return null;
            }

            const inspection = await InspectAndStampRestrictedFieldsForComment({
                Provider: provider,
                ContextUser: user,
                Conversation: conversation,
                EntityInfo: entityInfo,
                MessageText: this.Message
            });
            if (!inspection.Allowed) {
                return inspection.Reason ?? 'You do not have permission to comment on this restricted field.';
            }
            return null;
        } catch (error) {
            LogError(
                `MJConversationDetailEntityServer.CheckAndStampAnchoredRestrictedFields failed on conversation ${this.ConversationID}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            return null;
        }
    }

    /**
     * On create, a non-null BranchID must name a fork of the same conversation. Returns why the save
     * must fail, or null when it may go on. An existing row, a Main row (null BranchID), a row with no
     * ConversationID and a save with no context user are not checked.
     */
    public async CheckBranchOnCreate(): Promise<string | null> {
        if (this.IsSaved || this.BranchID == null || !this.ConversationID) {
            return null;
        }
        const user = this.ContextCurrentUser;
        if (!user) {
            return null;
        }
        const branchId = this.BranchID;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse as unknown as IMetadataProvider);
            const result = await rv.RunView<{ ID: string; ConversationID: string }>({
                EntityName: 'MJ: Conversation Branches',
                ExtraFilter: `ID='${EscapeSQLString(branchId)}'`,
                Fields: ['ID', 'ConversationID'],
                ResultType: 'simple',
            }, user);
            if (!result.Success) {
                LogError(`MJConversationDetailEntityServer: could not read fork ${branchId}: ${result.ErrorMessage}`);
                return 'Unable to check the fork of this message.';
            }
            const fork = result.Results?.[0];
            if (!fork || !UUIDsEqual(fork.ConversationID, this.ConversationID)) {
                return `Fork ${branchId} does not belong to conversation ${this.ConversationID}.`;
            }
            return null;
        } catch (error) {
            LogError(`MJConversationDetailEntityServer: could not read fork ${branchId}: ${error instanceof Error ? error.message : String(error)}`);
            return 'Unable to check the fork of this message.';
        }
    }

    /** Records a failed create/save in the result history, so callers see why nothing was written. */
    private recordCreateFailure(message: string, type: 'create' | 'update' = 'create'): void {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
    }

    /**
     * True when this save is a genuine Message EDIT on an existing record — not one of
     * the framework's own Message rewrites:
     * - New records never qualify (also covers the agent-response placeholder INSERT).
     * - Agent progress updates rewrite Message while the row's Status is 'In-Progress' — skipped.
     * - The run's finalization save rewrites Message together with a Status transition — a
     *   dirty Status marks the save as lifecycle, not an edit — skipped.
     *
     * Note: the original implementation inverted the IsSaved check (`!this.IsSaved`
     * selects NEW records), which combined with the OldValue guard meant the flag could
     * never be set — fixed as part of the compaction edit-handling work.
     */
    public ShouldFlagOriginalMessageChanged(): boolean {
        if (!this.IsSaved) {
            return false;
        }
        const messageField = this.GetFieldByName('Message');
        if (!messageField || !messageField.Dirty || messageField.OldValue === undefined) {
            return false;
        }
        if (this.Status === 'In-Progress') {
            return false;
        }
        const statusField = this.GetFieldByName('Status');
        if (statusField?.Dirty) {
            return false;
        }
        return true;
    }
}

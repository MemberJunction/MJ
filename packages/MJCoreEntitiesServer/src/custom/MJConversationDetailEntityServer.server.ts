import {
    BaseEntity,
    BaseEntityResult,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    RunView,
    WellKnownUserSource
} from "@memberjunction/core";
import { EscapeSQLString, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { MJConversationDetailEntityExtended, MJConversationEntity } from "@memberjunction/core-entities";
import { InspectAndStampRestrictedFieldsForComment } from "./RestrictedFieldCommentClassifier";

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
    /**
     * Sets the OriginalMessageChanged flag on a genuine message edit, checks a new row's fork,
     * runs FLS restricted-field inspection for anchored conversations, then calls super.Save().
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.ShouldFlagOriginalMessageChanged()) {
            this.OriginalMessageChanged = true;
        }
        const problem = await this.CheckBranchOnCreate();
        if (problem) {
            this.recordCreateFailure(problem);
            return false;
        }
        const checkFls =
            this.CheckAndStampAnchoredRestrictedFields ??
            MJConversationDetailEntityServer.prototype.CheckAndStampAnchoredRestrictedFields;
        const flsRefusal = await checkFls.call(this);
        if (flsRefusal) {
            this.recordCreateFailure(flsRefusal, this.IsSaved ? 'update' : 'create');
            return false;
        }
        return super.Save(options);
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
            if (!loaded || !conversation.LinkedEntityID || !conversation.LinkedRecordID) {
                return null;
            }

            const entityInfo =
                provider.Entities?.find((e) => UUIDsEqual(e.ID, conversation.LinkedEntityID)) ?? null;
            if (!entityInfo || !entityInfo.FieldLevelSecurityApplies) {
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

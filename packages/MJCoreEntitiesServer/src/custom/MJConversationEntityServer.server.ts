import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    WellKnownUserSource
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    CanonicalizeConversationAdditionalData,
    IsConversationHiddenByFieldSecurity,
    IsInheritingFolderAccess,
    IsInheritingFolderAccessInSQL,
    MJConversationEntity,
    MergeRestrictedFieldsIntoAnchorMetadata,
    ParseConversationAnchorMetadata,
    UserCanReadLinkedRecord,
    UserMayDeleteConversation
} from '@memberjunction/core-entities';
import { CheckAnonymousOwnershipKeyChange, IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Conversations` entity.
 *
 * 1. Keeps `ExternalID` — the scope identity an anonymous visitor's realtime session is owned through — out
 *    of an anonymous visitor's reach once the conversation exists. See {@link CheckAnonymousOwnershipKeyChange}.
 * 2. Keeps who a conversation belongs to and who it is shared with in its owner's hands: see
 *    {@link checkOwnerOnlyChange}. Uses the synchronous `Validate()` so the rules run on every save, like
 *    `MJAIAgentSessionEntityServer`.
 * 3. Saves `AdditionalData` as compact JSON when it holds an object, so the stored text always uses the spelling
 *    the conversation list's SQL filter matches (`INHERIT_FOLDER_ACCESS_SQL_CLAUSE`), and refuses a value the filter
 *    and the parser would still read differently: see {@link checkInheritanceReadingsAgree}.
 * 4. Enforces Row-Level Security (RLS) and Field-Level Security (FLS) on anchored conversations
 *    (`LinkedEntityID` + `LinkedRecordID` / `AnchorType`):
 *    - Verifies the saving user can read the linked record (`UserCanReadLinkedRecord`).
 *    - Verifies the saving user is not denied Read access on the anchored field or `restrictedFields`
 *      (`IsConversationHiddenByFieldSecurity`).
 *    - When `AnchorType === 'Field'` targets an FLS-governed field (`HasFieldPermissions === true`),
 *      automatically stamps that canonical field name into `AnchorMetadataObject.restrictedFields`.
 * 5. Enforces who may delete a conversation for everyone: the owner, an Owner-level grantee, or a user in the
 *    Developer or Integration role ({@link UserMayDeleteConversation}). The entity permission lets any UI user
 *    delete conversations, and a row-level rule like this cannot be expressed there, so this override is the
 *    boundary; the client checks only shape the UI. Refusals return `false` and record a `BaseEntityResult`, as
 *    `MJListEntityServer.Delete` does.
 */
@RegisterClass(BaseEntity, 'MJ: Conversations')
export class MJConversationEntityServer extends MJConversationEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        for (const violation of [
            CheckAnonymousOwnershipKeyChange(this, 'ExternalID'),
            checkOwnerOnlyChange(this),
            checkInheritanceReadingsAgree(this),
        ]) {
            if (violation) {
                result.Errors.push(violation);
                result.Success = false;
            }
        }
        return result;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        let refusal: string | null;
        try {
            const decision = await UserMayDeleteConversation(
                this.ProviderToUse as unknown as IMetadataProvider,
                this.ContextCurrentUser,
                { ID: this.ID, UserID: this.UserID }
            );
            refusal = decision.Allowed ? null : decision.Reason ?? 'You do not have permission to delete this conversation.';
        } catch (error) {
            LogError(`MJConversationEntityServer: delete permission check failed for conversation ${this.ID}: ${error instanceof Error ? error.message : String(error)}`);
            refusal = 'Unable to verify permission to delete this conversation.';
        }
        if (refusal) {
            const result = new BaseEntityResult();
            result.StartedAt = new Date();
            result.Success = false;
            result.Type = 'delete';
            result.Message = refusal;
            result.EndedAt = new Date();
            this.RegisterResultHistoryEntry(result);
            return false;
        }
        return super.Delete(options);
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const additionalData = typeof this.GetFieldByName === 'function' ? this.GetFieldByName('AdditionalData') : undefined;
        if (additionalData?.Dirty) {
            const canonical = CanonicalizeConversationAdditionalData(additionalData.Value as string | null);
            if (canonical !== additionalData.Value) {
                additionalData.Value = canonical;
            }
        }
        const refusal = await this.checkAnchoredConversationAccessAndStampMetadata();
        if (refusal) {
            this.recordSaveDenied(refusal);
            return false;
        }
        return super.Save(options);
    }

    private async checkAnchoredConversationAccessAndStampMetadata(): Promise<string | null> {
        if (!this.LinkedEntityID || !this.LinkedRecordID) {
            return null;
        }

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const entityInfo =
            (typeof provider?.EntityByID === 'function'
                ? provider.EntityByID(this.LinkedEntityID)
                : undefined) ??
            provider?.Entities?.find((e) => UUIDsEqual(e.ID, this.LinkedEntityID)) ??
            null;

        if (this.AnchorType && entityInfo && entityInfo.AllowRecordComments === false) {
            return `Record commenting is disabled for ${entityInfo.DisplayNameOrName}.`;
        }

        // Security invariant: never persist quotedValue snapshots for restricted (FLS) or encrypted fields,
        // so protected field values cannot escape into plain AnchorMetadata JSON, Record Changes, or indexes.
        if (entityInfo && this.AnchorType === 'Field' && this.AnchorKey) {
            const targetLower = this.AnchorKey.trim().toLowerCase();
            const targetField = entityInfo.Fields.find(
                (f) => f.Name.toLowerCase() === targetLower
            );
            if (targetField && (targetField.HasFieldPermissions || targetField.Encrypt)) {
                const existingMeta = ParseConversationAnchorMetadata(
                    this.AnchorMetadataObject ?? this.AnchorMetadata
                );
                if (existingMeta && existingMeta.quotedValue !== undefined) {
                    const sanitized = { ...existingMeta };
                    delete sanitized.quotedValue;
                    this.AnchorMetadataObject = sanitized;
                }
            }
        }

        // Auto-stamp restrictedFields when anchored directly to an FLS-governed field
        if (entityInfo?.FieldLevelSecurityApplies && this.AnchorType === 'Field' && this.AnchorKey) {
            const targetLower = this.AnchorKey.trim().toLowerCase();
            const flsField = entityInfo.Fields.find(
                (f) => f.HasFieldPermissions && f.Name.toLowerCase() === targetLower
            );
            if (flsField) {
                const existingMeta = ParseConversationAnchorMetadata(
                    this.AnchorMetadataObject ?? this.AnchorMetadata
                );
                const { Metadata, Changed } = MergeRestrictedFieldsIntoAnchorMetadata(existingMeta, [
                    flsField.Name
                ]);
                if (Changed) {
                    this.AnchorMetadataObject = Metadata;
                }
            }
        }

        if (provider?.ProviderType !== 'Database') {
            return null;
        }

        const user = this.ContextCurrentUser;
        if (!user || WellKnownUserSource.Instance.IsSystemUser(user)) {
            return null;
        }

        const recordAccess = await UserCanReadLinkedRecord(
            provider,
            user,
            this.LinkedEntityID,
            this.LinkedRecordID
        );
        if (!recordAccess.Allowed) {
            return recordAccess.Reason ?? 'You do not have access to the linked record.';
        }

        if (
            this.AnchorType &&
            recordAccess.EntityInfo &&
            typeof recordAccess.EntityInfo.CanUserComment === 'function' &&
            !recordAccess.EntityInfo.CanUserComment(user)
        ) {
            return `You do not have permission to post or modify comments on ${recordAccess.EntityInfo.DisplayNameOrName} records.`;
        }

        // fls-guard: block creating or updating a conversation anchored to a restricted field the user cannot read
        if (
            IsConversationHiddenByFieldSecurity(
                recordAccess.EntityInfo,
                user,
                this.AnchorType,
                this.AnchorKey,
                this.AnchorMetadataObject ?? this.AnchorMetadata
            )
        ) {
            return 'You do not have permission to access or comment on this restricted field.';
        }

        return null;
    }

    private recordSaveDenied(message: string): void {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
    }
}

/**
 * Refuses `AdditionalData` that the conversation list's SQL filter and the parser would read differently, from
 * anyone, the owner and the server included. The `LIKE` filter also matches the key nested in another object,
 * or in another letter case, where the parser sees no opt-in: search, which filters with the SQL alone, would
 * then show the conversation to its folder's audience while the list and the owner's menu say it is not shared.
 * Checks the compact form the save stores.
 */
function checkInheritanceReadingsAgree(entity: MJConversationEntity): ValidationErrorInfo | null {
    const additionalData = entity.GetFieldByName('AdditionalData');
    if (!additionalData?.Dirty) {
        return null;
    }
    const stored = CanonicalizeConversationAdditionalData(additionalData.Value as string | null);
    if (IsInheritingFolderAccess({ AdditionalData: stored }) === IsInheritingFolderAccessInSQL(stored)) {
        return null;
    }
    return new ValidationErrorInfo(
        'AdditionalData',
        'Set folder inheritance only as a top-level "inheritFolderAccess": true, so every reader agrees on whether this conversation is shared.',
        null,
        ValidationErrorType.Failure,
    );
}

/**
 * Refuses a change to an existing conversation's folder (`ProjectID`), owner (`UserID`) or folder
 * inheritance (`AdditionalData.inheritFolderAccess`) by anyone but its owner.
 *
 * Those three decide who else can see the conversation: turning inheritance on shows it to everyone its folder
 * is shared with, and moving an inheriting conversation into a Shared or Public folder shows it to that folder's
 * audience. An Edit grant lets someone work in a conversation, not publish it. The server itself (no context user, or the system user) is exempt, as is a conversation with
 * no owner on record. A transaction variable that sets one of these fields, or `ID`, counts as a change:
 * it is applied at submit, after this check has run.
 */
function checkOwnerOnlyChange(entity: MJConversationEntity): ValidationErrorInfo | null {
    const user = entity.ContextCurrentUser;
    if (!entity.IsSaved || !user || WellKnownUserSource.Instance.IsSystemUser(user)) {
        return null;
    }
    const owner = entity.GetFieldByName('UserID')?.OldValue as string | null | undefined;
    if (!owner || UUIDsEqual(owner, user.ID)) {
        return null;
    }
    const additionalData = entity.GetFieldByName('AdditionalData');
    const before = additionalData?.OldValue as string | null;
    const after = additionalData?.Value as string | null;
    // Both readings: the parser's, and the SQL filter's. A rewrite one of them reads differently (an odd
    // spelling the LIKE misses) would otherwise re-share the conversation past a parser-only check.
    const inheritanceChanged =
        !!additionalData?.Dirty &&
        (IsInheritingFolderAccess({ AdditionalData: before }) !== IsInheritingFolderAccess({ AdditionalData: after }) ||
            IsInheritingFolderAccessInSQL(before) !== IsInheritingFolderAccessInSQL(after));
    const changed = ['ProjectID', 'UserID'].find((name) => entity.GetFieldByName(name)?.Dirty)
        ?? (inheritanceChanged ? 'AdditionalData' : undefined)
        ?? (IsSetByTransactionVariable(entity, ['ProjectID', 'UserID', 'AdditionalData', 'ID']) ? 'ProjectID' : undefined);
    if (!changed) {
        return null;
    }
    return new ValidationErrorInfo(
        changed,
        "Only the conversation's owner can move it to another folder, change its owner, or change whether it inherits its folder's access.",
        null,
        ValidationErrorType.Failure,
    );
}

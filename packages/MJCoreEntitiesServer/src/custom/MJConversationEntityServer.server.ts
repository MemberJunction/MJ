import {
    BaseEntity,
    BaseEntityResult,
    EntitySaveOptions,
    IMetadataProvider,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    WellKnownUserSource
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    BUILT_IN_CONVERSATION_TYPE_IDS,
    CONVERSATION_TYPE_CODES,
    CanonicalizeConversationAdditionalData,
    ConversationEngine,
    IsConversationHiddenByFieldSecurity,
    IsInheritingFolderAccess,
    IsInheritingFolderAccessInSQL,
    MJConversationEntity,
    MergeRestrictedFieldsIntoAnchorMetadata,
    ParseConversationAnchorMetadata,
    UserCanReadLinkedRecord
} from '@memberjunction/core-entities';
import { CheckAnonymousOwnershipKeyChange, IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Conversations` entity.
 *
 * 1. Keeps `ExternalID` — the scope identity an anonymous visitor's realtime session is owned through — out
 *    of an anonymous visitor's reach once the conversation exists. See {@link CheckAnonymousOwnershipKeyChange}.
 * 2. Keeps who a conversation belongs to in the server's hands, and who it is shared with in its owner's: see
 *    {@link checkOwnerChange} and {@link checkOwnerOnlyChange}. A message with no `UserID` counts as the
 *    owner's, so an owner change would re-attribute every such message. Uses the synchronous `Validate()` so
 *    the rules run on every save, like `MJAIAgentSessionEntityServer`.
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
 */
@RegisterClass(BaseEntity, 'MJ: Conversations')
export class MJConversationEntityServer extends MJConversationEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        for (const violation of [
            CheckAnonymousOwnershipKeyChange(this, 'ExternalID'),
            checkOwnerChange(this),
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

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const typeIdField = typeof this.GetFieldByName === 'function' ? this.GetFieldByName('TypeID') : undefined;
        const shouldDefaultAnchoredToComment =
            !this.IsSaved &&
            Boolean(this.AnchorType) &&
            !typeIdField?.Dirty &&
            Boolean(this.TypeID && UUIDsEqual(this.TypeID, BUILT_IN_CONVERSATION_TYPE_IDS.CHAT));
        if (!this.TypeID || shouldDefaultAnchoredToComment) {
            const defaultCode = this.AnchorType
                ? CONVERSATION_TYPE_CODES.COMMENT
                : CONVERSATION_TYPE_CODES.CHAT;
            this.TypeID =
                ConversationEngine.Instance.ResolveConversationTypeID(defaultCode) ??
                (this.AnchorType
                    ? BUILT_IN_CONVERSATION_TYPE_IDS.COMMENT
                    : BUILT_IN_CONVERSATION_TYPE_IDS.CHAT);
        }
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
 * Refuses a change to an existing conversation's owner (`UserID`) by every user, the owner included. Only the
 * server itself (no context user, or the system user) changes it.
 *
 * A message with no `UserID` counts as the conversation owner's: the owner's own messages, and the messages the
 * server writes on their behalf, carry none. Changing the owner would hand every such message to the new owner,
 * who could then rewrite or delete it as theirs. A transaction variable that sets `UserID` or `ID` counts as a
 * change: it is applied at submit, after this check has run.
 */
function checkOwnerChange(entity: MJConversationEntity): ValidationErrorInfo | null {
    const user = entity.ContextCurrentUser;
    if (!entity.IsSaved || !user || WellKnownUserSource.Instance.IsSystemUser(user)) {
        return null;
    }
    if (!entity.GetFieldByName('UserID')?.Dirty && !IsSetByTransactionVariable(entity, ['UserID', 'ID'])) {
        return null;
    }
    return new ValidationErrorInfo(
        'UserID',
        "A conversation's owner cannot be changed.",
        null,
        ValidationErrorType.Failure,
    );
}

/**
 * Refuses a change to an existing conversation's folder (`ProjectID`) or folder inheritance
 * (`AdditionalData.inheritFolderAccess`) by anyone but its owner. (A change of owner is refused for everyone
 * but the server: {@link checkOwnerChange}.)
 *
 * Those two decide who else can see the conversation: turning inheritance on shows it to everyone its folder
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
    const changed = (entity.GetFieldByName('ProjectID')?.Dirty ? 'ProjectID' : undefined)
        ?? (inheritanceChanged ? 'AdditionalData' : undefined)
        ?? (IsSetByTransactionVariable(entity, ['ProjectID', 'AdditionalData']) ? 'ProjectID' : undefined);
    if (!changed) {
        return null;
    }
    return new ValidationErrorInfo(
        changed,
        "Only the conversation's owner can move it to another folder or change whether it inherits its folder's access.",
        null,
        ValidationErrorType.Failure,
    );
}

import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    EntityDeleteOptions,
    EntitySaveOptions,
    IEntityDataProvider,
    IMetadataProvider,
    LogError,
    RunView,
    RunViewParams,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    WellKnownUserSource
} from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    BUILT_IN_CONVERSATION_TYPE_IDS,
    CONVERSATIONS_RESOURCE_TYPE_ID,
    CONVERSATION_TYPE_CODES,
    CanonicalizeConversationAdditionalData,
    ConversationEngine,
    IsConversationHiddenByFieldSecurity,
    IsInheritingFolderAccess,
    IsInheritingFolderAccessInSQL,
    MAX_BRANCH_DEPTH,
    MJConversationEntity,
    MergeRestrictedFieldsIntoAnchorMetadata,
    ParseConversationAnchorMetadata,
    ResourcePermissionEngine,
    UserCanReadLinkedRecord,
    UserMayDeleteConversation
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { CheckAnonymousOwnershipKeyChange, IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';
import {
    MarkInternalConversationSecurityQuery,
    UserCanReadConversation,
    type ConversationSecurityRow
} from './ConversationReadSecurityHook';

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
 * 5. Enforces who may delete a conversation for everyone: the owner, an Owner-level grantee, or a user in the
 *    Developer or Integration role ({@link UserMayDeleteConversation}). The entity permission lets any UI user
 *    delete conversations, and a row-level rule like this cannot be expressed there, so this override is the
 *    boundary; the client checks only shape the UI. Refusals return `false` and record a `BaseEntityResult`, as
 *    `MJListEntityServer.Delete` does.
 */
/** Converts a `BaseEntity.ProviderToUse` handle to `IMetadataProvider` when available. */
function toMetadataProvider(provider: IEntityDataProvider | null | undefined): IMetadataProvider | undefined {
    return provider ? (provider as Partial<IMetadataProvider> as IMetadataProvider) : undefined;
}

@RegisterClass(BaseEntity, 'MJ: Conversations')
export class MJConversationEntityServer extends MJConversationEntity {
    public override async Load(
        ID: string,
        EntityRelationshipsToLoad?: string[]
    ): Promise<boolean> {
        const key = CompositeKey.FromID(ID);
        return this.InnerLoad(key, EntityRelationshipsToLoad);
    }

    public override async InnerLoad(
        compositeKey: CompositeKey,
        EntityRelationshipsToLoad?: string[]
    ): Promise<boolean> {
        const loaded = await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        if (!loaded) {
            return false;
        }
        const provider = toMetadataProvider(this.ProviderToUse);
        if (provider?.ProviderType !== 'Database') {
            return true;
        }
        const actor = this.ContextCurrentUser;
        if (actor && WellKnownUserSource.Instance.IsSystemUser(actor)) {
            return true;
        }
        if (!actor || !this.ID) {
            this.NewRecord();
            return false;
        }
        const candidate: ConversationSecurityRow = {
            ID: this.ID,
            UserID: this.UserID,
            ParentID: this.ParentID,
            ProjectID: this.ProjectID,
            AdditionalData: this.AdditionalData,
            AnchorType: this.AnchorType,
            LinkedEntityID: this.LinkedEntityID,
            LinkedRecordID: this.LinkedRecordID,
            AnchorKey: this.AnchorKey,
            AnchorMetadata: this.AnchorMetadata,
            AnchorMetadataObject: this.AnchorMetadataObject,
            TypeID: this.TypeID,
            ExternalID: this.ExternalID,
        };
        const allowed = await UserCanReadConversation(provider, actor, candidate);
        if (!allowed) {
            this.NewRecord();
            return false;
        }
        return true;
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        for (const violation of [
            CheckAnonymousOwnershipKeyChange(this, 'ExternalID'),
            checkOwnerChange(this),
            checkOwnerOnlyChange(this),
            checkParentSelfReference(this),
            checkParentOwnerOnlyChange(this),
            checkInheritanceReadingsAgree(this),
        ]) {
            if (violation) {
                result.Errors.push(violation);
                result.Success = false;
            }
        }
        return result;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const parentOwnerMessage = await checkParentTargetOwnership(this);
        if (parentOwnerMessage) {
            result.Errors.push(
                new ValidationErrorInfo('ParentID', parentOwnerMessage, this.ParentID ?? null, ValidationErrorType.Failure)
            );
            result.Success = false;
        }
        const cycleViolation = await this.checkParentCycle();
        if (cycleViolation) {
            result.Errors.push(cycleViolation);
            result.Success = false;
        }
        return result;
    }

    private async checkParentCycle(): Promise<ValidationErrorInfo | null> {
        const parentField = typeof this.GetFieldByName === 'function' ? this.GetFieldByName('ParentID') : undefined;
        if (!this.ParentID || !parentField?.Dirty) {
            return null;
        }
        const refuse = (message: string): ValidationErrorInfo =>
            new ValidationErrorInfo('ParentID', message, this.ParentID, ValidationErrorType.Failure);
        if (this.ID && UUIDsEqual(this.ParentID, this.ID)) {
            return refuse('A conversation cannot be its own parent.');
        }
        if (!this.IsSaved) {
            return null;
        }
        const provider = toMetadataProvider(this.ProviderToUse);
        if (provider?.ProviderType !== 'Database') {
            return null;
        }
        const readUser =
            (await WellKnownUserSource.Instance.GetSystemUser(provider)) ??
            UserCache.Instance.GetSystemUser() ??
            this.ContextCurrentUser;
        const rv = new RunView(this.RunViewProviderToUse);
        let cursor: string | null = this.ParentID;
        for (let depth = 0; cursor && depth < MAX_BRANCH_DEPTH; depth++) {
            const queryParams: RunViewParams = {
                EntityName: 'MJ: Conversations',
                ExtraFilter: `ID='${EscapeSQLString(cursor)}'`,
                Fields: ['ParentID'],
                ResultType: 'simple',
            };
            MarkInternalConversationSecurityQuery(queryParams);
            const read = await rv.RunView<{ ParentID: string | null }>(queryParams, readUser);
            if (!read.Success) {
                return refuse(`Could not verify conversation hierarchy: ${read.ErrorMessage}`);
            }
            cursor = read.Results[0]?.ParentID ?? null;
            if (cursor && this.ID && UUIDsEqual(cursor, this.ID)) {
                return refuse('A conversation cannot be reparented under one of its descendants.');
            }
        }
        return cursor ? refuse(`Conversation hierarchy cannot exceed ${MAX_BRANCH_DEPTH} levels deep.`) : null;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        let refusal: string | null;
        try {
            const decision = await UserMayDeleteConversation(
                toMetadataProvider(this.ProviderToUse)!,
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
        const anchoredRefusal = await this.checkAnchoredConversationAccessAndStampMetadata();
        if (anchoredRefusal) {
            this.recordSaveDenied(anchoredRefusal);
            return false;
        }
        const parentOwnerRefusal = await checkParentTargetOwnership(this);
        if (parentOwnerRefusal) {
            this.recordSaveDenied(parentOwnerRefusal);
            return false;
        }
        const writeRefusal = await checkConversationWriteAuthorization(this);
        if (writeRefusal) {
            this.recordSaveDenied(writeRefusal);
            return false;
        }
        return super.Save(options);
    }

    private async checkAnchoredConversationAccessAndStampMetadata(): Promise<string | null> {
        if (!this.LinkedEntityID || !this.LinkedRecordID) {
            return null;
        }

        const provider = toMetadataProvider(this.ProviderToUse)!;
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

/** Rejects setting `ParentID` to the conversation's own `ID`. */
function checkParentSelfReference(entity: MJConversationEntity): ValidationErrorInfo | null {
    const parentId = entity.ParentID;
    const id = entity.ID;
    if (parentId && id && UUIDsEqual(parentId, id)) {
        return new ValidationErrorInfo(
            'ParentID',
            'A conversation cannot be its own parent.',
            parentId,
            ValidationErrorType.Failure,
        );
    }
    return null;
}

/** Rejects reparenting an existing conversation by anyone other than its owner (`UserID`). */
function checkParentOwnerOnlyChange(entity: MJConversationEntity): ValidationErrorInfo | null {
    const user = entity.ContextCurrentUser;
    if (!entity.IsSaved || !user || WellKnownUserSource.Instance.IsSystemUser(user)) {
        return null;
    }
    const parentField = typeof entity.GetFieldByName === 'function' ? entity.GetFieldByName('ParentID') : undefined;
    if (!parentField?.Dirty && !IsSetByTransactionVariable(entity, ['ParentID', 'ID'])) {
        return null;
    }
    const owner = entity.GetFieldByName('UserID')?.OldValue as string | null | undefined;
    if (owner && UUIDsEqual(owner, user.ID)) {
        return null;
    }
    return new ValidationErrorInfo(
        'ParentID',
        "Only the conversation's owner can change its parent conversation.",
        entity.ParentID ?? null,
        ValidationErrorType.Failure,
    );
}

/**
 * Enforces that whenever `ParentID` is set on create or changed on update by a non-system user,
 * the target parent conversation exists AND belongs to `ContextCurrentUser` (`parent.UserID`).
 */
async function checkParentTargetOwnership(entity: MJConversationEntityServer): Promise<string | null> {
    const provider = toMetadataProvider(entity.ProviderToUse);
    if (provider?.ProviderType !== 'Database') {
        return null;
    }
    const user = entity.ContextCurrentUser;
    if (!user || WellKnownUserSource.Instance.IsSystemUser(user)) {
        return null;
    }
    const parentField = typeof entity.GetFieldByName === 'function' ? entity.GetFieldByName('ParentID') : undefined;
    const parentChanged = !entity.IsSaved || Boolean(parentField?.Dirty) || IsSetByTransactionVariable(entity, ['ParentID', 'ID']);
    if (!entity.ParentID || !parentChanged) {
        return null;
    }
    if (entity.ID && UUIDsEqual(entity.ParentID, entity.ID)) {
        return 'A conversation cannot be its own parent.';
    }
    const readUser =
        (await WellKnownUserSource.Instance.GetSystemUser(provider)) ??
        UserCache.Instance.GetSystemUser() ??
        user;
    const rv = new RunView(entity.RunViewProviderToUse);
    const queryParams: RunViewParams = {
        EntityName: 'MJ: Conversations',
        ExtraFilter: `ID='${EscapeSQLString(entity.ParentID)}'`,
        Fields: ['ID', 'UserID'],
        ResultType: 'simple',
    };
    MarkInternalConversationSecurityQuery(queryParams);
    const read = await rv.RunView<{ ID: string; UserID: string | null }>(queryParams, readUser);
    if (!read.Success) {
        return `Could not verify parent conversation ownership: ${read.ErrorMessage}`;
    }
    const parentRow = read.Results[0];
    if (!parentRow) {
        return 'The target parent conversation does not exist.';
    }
    if (!parentRow.UserID || !UUIDsEqual(parentRow.UserID, user.ID)) {
        return 'You can only nest a conversation under a parent conversation that you own.';
    }
    return null;
}

/**
 * Enforces View vs Edit/Owner write authorization on updates to saved conversations:
 * View-only share recipients and Shared/Public folder viewers cannot mutate conversation
 * metadata (`Name`, `Description`, `Status`, `IsArchived`, `DefaultAgentID`, `DataContextID`).
 */
async function checkConversationWriteAuthorization(entity: MJConversationEntityServer): Promise<string | null> {
    if (!entity.IsSaved) {
        return null;
    }
    const provider = toMetadataProvider(entity.ProviderToUse);
    if (provider?.ProviderType !== 'Database') {
        return null;
    }
    const user = entity.ContextCurrentUser;
    if (!user || WellKnownUserSource.Instance.IsSystemUser(user)) {
        return null;
    }
    if (entity.AnchorType && entity.LinkedEntityID && entity.LinkedRecordID) {
        return null;
    }
    const ownerUserId =
        (typeof entity.GetFieldByName === 'function'
            ? (entity.GetFieldByName('UserID')?.OldValue as string | null | undefined)
            : undefined) ?? entity.UserID;
    if (ownerUserId && UUIDsEqual(ownerUserId, user.ID)) {
        return null;
    }
    const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(
        provider,
        ResourcePermissionEngine
    ) as ResourcePermissionEngine;
    await engine.Config(false, user);
    const now = new Date();
    const userRoleIds = new UUIDSet((user.UserRoles ?? []).map((ur) => ur.RoleID));
    const hasEditOrOwnerGrant = engine.Permissions.some(
        (p) =>
            UUIDsEqual(p.ResourceTypeID, CONVERSATIONS_RESOURCE_TYPE_ID) &&
            Boolean(p.ResourceRecordID && UUIDsEqual(p.ResourceRecordID, entity.ID)) &&
            p.Status === 'Approved' &&
            (p.PermissionLevel === 'Edit' || p.PermissionLevel === 'Owner') &&
            (!p.StartSharingAt || new Date(p.StartSharingAt) <= now) &&
            (!p.EndSharingAt || new Date(p.EndSharingAt) > now) &&
            ((p.Type === 'User' && Boolean(p.UserID && UUIDsEqual(p.UserID, user.ID))) ||
                (p.Type === 'Role' && Boolean(p.RoleID && userRoleIds.Has(p.RoleID))))
    );
    if (!hasEditOrOwnerGrant) {
        return 'You do not have permission to edit this conversation. Only the owner or recipients with Edit or Owner access may save changes.';
    }
    return null;
}

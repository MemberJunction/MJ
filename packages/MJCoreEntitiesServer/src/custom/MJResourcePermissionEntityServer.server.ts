import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntityPermissionType,
    EntitySaveOptions,
    IEntityDataProvider,
    IMetadataProvider,
    LogError,
    RunView,
    RunViewParams,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    CONVERSATIONS_RESOURCE_TYPE_ID,
    ConversationEngine,
    MJResourcePermissionEntityExtended
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MarkInternalConversationSecurityQuery } from './ConversationReadSecurityHook';

interface ConversationOwnershipRow {
    ID: string;
    UserID: string | null;
}

function isMetadataProvider(provider: IEntityDataProvider | undefined): provider is IEntityDataProvider & IMetadataProvider {
    return Boolean(provider && 'Entities' in provider && 'EntityByName' in provider);
}

/**
 * Server-side subclass for `MJ: Resource Permissions`.
 *
 * Enforces strict owner-only sharing rules for `Conversations`
 * (`ResourceTypeID === CONVERSATIONS_RESOURCE_TYPE_ID`):
 * 1. Only the conversation owner (`Conversation.UserID === contextUser.ID`) may
 *    share a conversation (including a `ParentID` side conversation), modify
 *    `PermissionLevel` (`View` or `Edit`), or revoke/delete access.
 * 2. Recipients (even with `Edit` permission or an `Owner`-level grant row)
 *    CANNOT reshare a conversation to others, escalate permissions, or revoke grants.
 * 3. Non-conversation resource types delegate unchanged to {@link MJResourcePermissionEntityExtended}.
 */
@RegisterClass(BaseEntity, 'MJ: Resource Permissions')
export class MJResourcePermissionEntityServer extends MJResourcePermissionEntityExtended {
    private _conversationOwnerAuthorized = false;

    public override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        const provider = this.ProviderToUse;
        if (!isMetadataProvider(provider) || provider.ProviderType !== 'Database') {
            return super.CheckPermissions(type, throwError);
        }
        if (this.involvesConversationResourceType()) {
            if (this._conversationOwnerAuthorized) {
                return true;
            }
            const user = this.ActiveUser;
            if (user && WellKnownUserSource.Instance.IsSystemUser(user)) {
                return true;
            }
            if (type === EntityPermissionType.Read) {
                return BaseEntity.prototype.CheckPermissions.call(this, type, throwError);
            }
            if (
                (type === EntityPermissionType.Update || type === EntityPermissionType.Delete) &&
                user &&
                this.currentUserOwnsCachedConversation(user.ID)
            ) {
                return true;
            }
            const msg = 'Only the conversation owner can share, modify permissions, or revoke access for this conversation.';
            if (throwError) {
                throw new Error(msg);
            }
            return false;
        }
        return super.CheckPermissions(type, throwError);
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.involvesConversationResourceType()) {
            return super.Save(options);
        }
        const provider = this.ProviderToUse;
        if (!isMetadataProvider(provider) || provider.ProviderType !== 'Database') {
            return super.Save(options);
        }
        const user = this.ContextCurrentUser;
        if (user && WellKnownUserSource.Instance.IsSystemUser(user)) {
            return super.Save(options);
        }
        const opType: 'create' | 'update' = this.IsSaved ? 'update' : 'create';
        if (!user) {
            return this.recordRefusal(opType, 'Authenticated user context is required to manage conversation shares.');
        }
        if (this.IsSaved && this.hasImmutableTargetChanged()) {
            return this.recordRefusal('update', 'ResourceTypeID and ResourceRecordID cannot be changed on an existing conversation share.');
        }

        const refusal = await this.verifyCallerOwnsTargetConversation(provider, user);
        if (refusal) {
            return this.recordRefusal(opType, refusal);
        }

        this._conversationOwnerAuthorized = true;
        try {
            return await super.Save(options);
        } finally {
            this._conversationOwnerAuthorized = false;
        }
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!this.involvesConversationResourceType()) {
            return super.Delete(options);
        }
        const provider = this.ProviderToUse;
        if (!isMetadataProvider(provider) || provider.ProviderType !== 'Database') {
            return super.Delete(options);
        }
        const user = this.ContextCurrentUser;
        if (user && WellKnownUserSource.Instance.IsSystemUser(user)) {
            return super.Delete(options);
        }
        if (!user) {
            return this.recordRefusal('delete', 'Authenticated user context is required to revoke conversation shares.');
        }

        const refusal = await this.verifyCallerOwnsTargetConversation(provider, user);
        if (refusal) {
            return this.recordRefusal('delete', refusal);
        }

        this._conversationOwnerAuthorized = true;
        try {
            return await super.Delete(options);
        } finally {
            this._conversationOwnerAuthorized = false;
        }
    }

    private involvesConversationResourceType(): boolean {
        if (this.ResourceTypeID && UUIDsEqual(this.ResourceTypeID, CONVERSATIONS_RESOURCE_TYPE_ID)) {
            return true;
        }
        const field = typeof this.GetFieldByName === 'function' ? this.GetFieldByName('ResourceTypeID') : undefined;
        const oldTypeId = typeof field?.OldValue === 'string' ? field.OldValue : null;
        return Boolean(oldTypeId && UUIDsEqual(oldTypeId, CONVERSATIONS_RESOURCE_TYPE_ID));
    }

    private hasImmutableTargetChanged(): boolean {
        const typeField = typeof this.GetFieldByName === 'function' ? this.GetFieldByName('ResourceTypeID') : undefined;
        const recordField = typeof this.GetFieldByName === 'function' ? this.GetFieldByName('ResourceRecordID') : undefined;
        return Boolean(typeField?.Dirty || recordField?.Dirty);
    }

    private currentUserOwnsCachedConversation(userId: string): boolean {
        if (!this.ResourceRecordID) {
            return false;
        }
        const conv = ConversationEngine.Instance.Conversations.find((c) => UUIDsEqual(c.ID, this.ResourceRecordID));
        return Boolean(conv?.UserID && UUIDsEqual(conv.UserID, userId));
    }

    private async verifyCallerOwnsTargetConversation(
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<string | null> {
        const targetId = this.resolveTargetConversationId();
        if (!targetId) {
            return 'Target conversation ID is required.';
        }
        try {
            const conversation = await this.loadConversationOwnershipRow(provider, user, targetId);
            if (!conversation) {
                return 'Target conversation was not found.';
            }
            if (!conversation.UserID || !UUIDsEqual(conversation.UserID, user.ID)) {
                LogError(
                    `MJResourcePermissionEntityServer: user ${user.ID} attempted unauthorized share mutation ` +
                    `on conversation ${targetId} owned by ${conversation.UserID ?? '(none)'}.`
                );
                return 'Only the conversation owner can share, modify permissions, or revoke access for this conversation.';
            }
            return null;
        } catch (error) {
            LogError(
                `MJResourcePermissionEntityServer: failed verifying ownership for conversation ${targetId}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            return 'Unable to verify conversation ownership.';
        }
    }

    private resolveTargetConversationId(): string | null {
        if (this.IsSaved && typeof this.GetFieldByName === 'function') {
            const recordField = this.GetFieldByName('ResourceRecordID');
            if (typeof recordField?.OldValue === 'string' && recordField.OldValue.trim().length > 0) {
                return recordField.OldValue.trim();
            }
        }
        return this.ResourceRecordID && this.ResourceRecordID.trim().length > 0
            ? this.ResourceRecordID.trim()
            : null;
    }

    private async loadConversationOwnershipRow(
        provider: IMetadataProvider,
        actor: UserInfo,
        conversationId: string
    ): Promise<ConversationOwnershipRow | null> {
        const systemUser =
            (await WellKnownUserSource.Instance.GetSystemUser(provider)) ??
            UserCache.Instance.GetSystemUser() ??
            actor;
        const rv = RunView.FromMetadataProvider(provider);
        const queryParams: RunViewParams = {
            EntityName: 'MJ: Conversations',
            ExtraFilter: `ID='${EscapeSQLString(conversationId)}'`,
            Fields: ['ID', 'UserID'],
            MaxRows: 1,
            ResultType: 'simple',
        };
        MarkInternalConversationSecurityQuery(queryParams);
        const res = await rv.RunView<ConversationOwnershipRow>(queryParams, systemUser);
        if (!res.Success || !Array.isArray(res.Results) || res.Results.length === 0) {
            return null;
        }
        return res.Results[0];
    }

    private recordRefusal(type: 'create' | 'update' | 'delete', message: string): false {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }
}

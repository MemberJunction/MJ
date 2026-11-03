import {
    BaseEntity,
    BaseEntityResult,
    EntitySaveOptions,
    IMetadataProvider,
    ValidationResult,
    WellKnownUserSource
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    IsConversationHiddenByFieldSecurity,
    MJConversationEntity,
    MergeRestrictedFieldsIntoAnchorMetadata,
    ParseConversationAnchorMetadata,
    UserCanReadLinkedRecord
} from '@memberjunction/core-entities';
import { CheckAnonymousOwnershipKeyChange } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Conversations` entity.
 *
 * 1. Keeps `ExternalID` — the scope identity an anonymous visitor's realtime session is owned through — out
 *    of an anonymous visitor's reach once the conversation exists. See {@link CheckAnonymousOwnershipKeyChange}.
 * 2. Enforces Row-Level Security (RLS) and Field-Level Security (FLS) on anchored conversations
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
        const violation = CheckAnonymousOwnershipKeyChange(this, 'ExternalID');
        if (violation) {
            result.Errors.push(violation);
            result.Success = false;
        }
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
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
            provider?.Entities?.find((e) => UUIDsEqual(e.ID, this.LinkedEntityID)) ?? null;

        if (this.AnchorType && entityInfo && entityInfo.AllowRecordComments === false) {
            return `Record commenting is disabled for ${entityInfo.DisplayNameOrName}.`;
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

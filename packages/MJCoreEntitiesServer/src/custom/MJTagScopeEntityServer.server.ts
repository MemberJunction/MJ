import { BaseEntity, IMetadataProvider, Metadata, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJTagEntity, MJTagScopeEntity } from '@memberjunction/core-entities';

/**
 * Server-side TagScope entity that enforces the IsGlobal ⊕ TagScope invariant
 * from the scope side. The other half is enforced in MJTagEntityServer.
 *
 * A TagScope row may not be inserted (or updated to point at) a Tag whose
 * IsGlobal flag is 1. The invariant is checked in ValidateAsync so the
 * framework reports the failure through the standard LatestResult path.
 */
@RegisterClass(BaseEntity, 'MJ: Tag Scopes')
export class MJTagScopeEntityServer extends MJTagScopeEntity {

    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // Only need to check on insert or when TagID is being changed.
        const tagIDField = this.GetFieldByName('TagID');
        const checkRequired = !this.IsSaved || (tagIDField?.Dirty ?? false);
        if (!checkRequired) return result;

        if (!this.TagID) {
            // Required-field violation handled by sync Validate() — nothing to add here.
            return result;
        }

        // Server-side BaseEntity subclass: ContextCurrentUser is bound to the same
        // request-scoped provider that loaded `this`. Pulling the parent tag through
        const md = this.ProviderToUse as unknown as IMetadataProvider 
        const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', this.ContextCurrentUser);
        const loaded = await tag.Load(this.TagID);
        if (!loaded) {
            const err = new ValidationErrorInfo(
                'TagID',
                `TagScope references TagID '${this.TagID}' but no such Tag exists.`,
                this.TagID,
                ValidationErrorType.Failure
            );
            result.Errors.push(err);
            result.Success = false;
            return result;
        }

        if (tag.IsGlobal) {
            const err = new ValidationErrorInfo(
                'TagID',
                `Cannot add TagScope row for tag "${tag.Name}" because it is marked IsGlobal=1. Either set IsGlobal=0 first or scope a different tag.`,
                this.TagID,
                ValidationErrorType.Failure
            );
            result.Errors.push(err);
            result.Success = false;
        }

        return result;
    }
}

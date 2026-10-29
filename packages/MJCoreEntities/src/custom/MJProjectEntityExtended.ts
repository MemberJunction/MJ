import { RegisterClass } from '@memberjunction/global';
import { BaseEntity, IMetadataProvider } from '@memberjunction/core';
import { MJProjectEntity } from '../generated/entity_subclasses';

/**
 * Extended subclass for `MJ: Projects` (conversation folders).
 *
 * Defaults new folders to private (`OwnerUserID = currentUser.ID`) so every
 * newly created folder is personal unless the caller explicitly clears
 * `OwnerUserID = null` to create a shared folder.
 */
@RegisterClass(BaseEntity, 'MJ: Projects')
export class MJProjectEntityExtended extends MJProjectEntity {
    public override NewRecord(): boolean {
        const result = super.NewRecord();
        if (result) {
            const currentUserId =
                this.ContextCurrentUser?.ID ??
                (this.ProviderToUse as unknown as IMetadataProvider | undefined)?.CurrentUser?.ID;
            if (currentUserId) {
                this.OwnerUserID = currentUserId;
                this.GetFieldByName('OwnerUserID')?.ResetNeverSetFlag();
            }
        }
        return result;
    }
}

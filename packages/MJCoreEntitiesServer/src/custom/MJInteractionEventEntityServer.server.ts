import { BaseEntity, EntityPermissionType, EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJInteractionEventEntity } from '@memberjunction/core-entities';

/**
 * Server subclass for `MJ: Interaction Events`.
 *
 * Implements the append-only lifecycle log invariant:
 * Interaction events are strictly append-only. Once an event is inserted,
 * any update or deletion attempt is prohibited to ensure audit trail integrity.
 */
@RegisterClass(BaseEntity, 'MJ: Interaction Events')
export class MJInteractionEventEntityServer extends MJInteractionEventEntity {
    public override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        if (type === EntityPermissionType.Update || type === EntityPermissionType.Delete) {
            const msg = `Interaction Events are append-only: updates and deletes are prohibited.`;
            if (throwError) {
                throw new Error(msg);
            }
            return false;
        }
        return super.CheckPermissions(type, throwError);
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.IsSaved) {
            throw new Error(`Interaction Events are append-only: updates are prohibited.`);
        }
        return super.Save(options);
    }

    public override async Delete(): Promise<boolean> {
        throw new Error(`Interaction Events are append-only: deletes are prohibited.`);
    }
}

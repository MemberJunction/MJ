import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntityPermissionType,
    EntitySaveOptions,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
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
    public static readonly APPEND_ONLY_UPDATE_MESSAGE = 'Interaction Events are append-only: updates are prohibited.';
    public static readonly APPEND_ONLY_DELETE_MESSAGE = 'Interaction Events are append-only: deletes are prohibited.';

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

    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (this.IsSaved) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'ID',
                    MJInteractionEventEntityServer.APPEND_ONLY_UPDATE_MESSAGE,
                    this.ID,
                    ValidationErrorType.Failure
                )
            );
        }
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.IsSaved) {
            return this.refuse('update', MJInteractionEventEntityServer.APPEND_ONLY_UPDATE_MESSAGE);
        }
        return super.Save(options);
    }

    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return this.refuse('delete', MJInteractionEventEntityServer.APPEND_ONLY_DELETE_MESSAGE);
    }

    private refuse(type: 'create' | 'update' | 'delete', message: string): boolean {
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

/**
 * Loader stub — prevents the class from being tree-shaken out of the bundle.
 */
export function LoadMJInteractionEventEntityServer(): void {
    void MJInteractionEventEntityServer;
}

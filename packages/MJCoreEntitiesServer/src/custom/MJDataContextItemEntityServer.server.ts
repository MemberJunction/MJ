import { BaseEntity, BaseEntityResult, EntitySaveOptions, UserInfo, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJDataContextItemEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: Data Context Items` entity. The SQL of a `sql` item runs when its data context is
 * loaded, so only an administrator (Owner-type user) may save an item that is a SQL item or holds SQL
 * text: creating it, changing any of its fields, or moving it to another data context. Other items
 * stay writable as before.
 *
 * The rule reads the record as it will be written, not which fields changed. This entity does not
 * track record changes, so `UpdateMJDataContextItem` with `OldValues___` takes its starting state from
 * the client, and dirty flags then compare against values the client chose.
 */
@RegisterClass(BaseEntity, 'MJ: Data Context Items')
export class MJDataContextItemEntityServer extends MJDataContextItemEntity {
    private static readonly SQL_WRITE_REFUSED =
        'Only an administrator (Owner-type user) may save a data context item that holds SQL, because that SQL runs against the database.';

    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (this.holdsSQL() && !this.callerIsOwner()) {
            result.Errors.push(new ValidationErrorInfo(
                'SQL',
                MJDataContextItemEntityServer.SQL_WRITE_REFUSED,
                this.SQL,
                ValidationErrorType.Failure
            ));
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /** Refuses a non-Owner's `ReplayOnly` save of an item that holds SQL, because `ReplayOnly` skips `Validate()`. */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (options?.ReplayOnly && this.holdsSQL() && !this.callerIsOwner()) {
            return this.refuseSave();
        }
        return super.Save(options);
    }

    /** True when the record, as it will be written, is a SQL item or holds SQL text. */
    private holdsSQL(): boolean {
        return this.Type === 'sql' || !!this.SQL?.trim();
    }

    /** True when the acting user is an Owner-type user. */
    private callerIsOwner(): boolean {
        const caller: UserInfo | null = this.ActiveUser;
        return caller?.Type?.trim().toLowerCase() === 'owner';
    }

    /** Records the refusal so `LatestResult.CompleteMessage` carries it, and returns false. */
    private refuseSave(): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = MJDataContextItemEntityServer.SQL_WRITE_REFUSED;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }
}

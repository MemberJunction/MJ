import { BaseEntity, BaseEntityResult, EntitySaveOptions, UserInfo, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJDataContextItemEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: Data Context Items` entity. The SQL of a `sql` item runs when its data context is
 * loaded, so only an administrator (Owner-type user) may save an item that is a SQL item or holds SQL
 * text: creating it, changing any of its fields, or moving it to another data context. Other items
 * stay writable as before.
 *
 * The rule reads the item's values, not which fields changed, because this entity does not track
 * record changes and a client's `OldValues___` can decide what looks changed. `ResolverBase.UpdateRecord`
 * always loads the stored row for this entity, so `Type` and `SQL` hold their stored values.
 */
@RegisterClass(BaseEntity, 'MJ: Data Context Items')
export class MJDataContextItemEntityServer extends MJDataContextItemEntity {
    private static readonly SQL_WRITE_REFUSED =
        'Only an administrator (Owner-type user) may save a data context item that holds SQL, because that SQL runs against the database.';

    public override Validate(): ValidationResult {
        const result = super.Validate();
        const refusal = this.saveRefusal();
        if (refusal) {
            result.Errors.push(new ValidationErrorInfo('SQL', refusal, this.SQL, ValidationErrorType.Failure));
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /** Applies the same rule to a `ReplayOnly` save, which skips `Validate()`. */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const refusal = options?.ReplayOnly ? this.saveRefusal() : null;
        if (refusal) {
            return this.refuseSave(refusal);
        }
        return super.Save(options);
    }

    /** Returns why the acting user may not save this item, or null when they may. */
    private saveRefusal(): string | null {
        if (this.callerIsOwner()) {
            return null;
        }
        return this.holdsSQL() ? MJDataContextItemEntityServer.SQL_WRITE_REFUSED : null;
    }

    /** True when the item, as loaded and changed, is a SQL item or holds SQL text. */
    private holdsSQL(): boolean {
        return this.Type === 'sql' || !!this.SQL?.trim();
    }

    /** True when the acting user is an Owner-type user. */
    private callerIsOwner(): boolean {
        const caller: UserInfo | null = this.ActiveUser;
        return caller?.Type?.trim().toLowerCase() === 'owner';
    }

    /** Records the refusal so `LatestResult.CompleteMessage` carries it, and returns false. */
    private refuseSave(message: string): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }
}

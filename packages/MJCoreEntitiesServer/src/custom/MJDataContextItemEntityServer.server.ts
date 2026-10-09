import { BaseEntity, BaseEntityResult, EntitySaveOptions, UserInfo, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJDataContextItemEntity, MJDataContextItemEntityType } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: Data Context Items` entity. The SQL of a `sql` item runs when its data context is
 * loaded, so only an administrator (Owner-type user) may save an item that is a SQL item or holds SQL
 * text: creating it, changing any of its fields, or moving it to another data context. Other items
 * stay writable as before.
 *
 * The rule reads the item's values, not which fields changed, because this entity does not track
 * record changes and a client's `OldValues___` can decide what looks changed. A non-Owner's save of an
 * existing item whose `Type` or `SQL` was not loaded is refused as well: those columns keep their
 * stored values on save, and the stored item may be a SQL item.
 */
@RegisterClass(BaseEntity, 'MJ: Data Context Items')
export class MJDataContextItemEntityServer extends MJDataContextItemEntity {
    private static readonly SQL_WRITE_REFUSED =
        'Only an administrator (Owner-type user) may save a data context item that holds SQL, because that SQL runs against the database.';

    private static readonly SQL_NOT_LOADED_REFUSED =
        'Only an administrator (Owner-type user) may save a data context item whose Type and SQL were not loaded, because the stored item may hold SQL.';

    /** The columns that decide whether an item holds SQL. */
    private static readonly SQL_COLUMNS: ReadonlyArray<keyof MJDataContextItemEntityType> = ['Type', 'SQL'];

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
        if (this.sqlColumnsNotLoaded()) {
            return MJDataContextItemEntityServer.SQL_NOT_LOADED_REFUSED;
        }
        return this.holdsSQL() ? MJDataContextItemEntityServer.SQL_WRITE_REFUSED : null;
    }

    /** True when this is an existing item whose `Type` or `SQL` was not loaded. */
    private sqlColumnsNotLoaded(): boolean {
        return this.IsSaved && MJDataContextItemEntityServer.SQL_COLUMNS.some((name) => this.GetFieldByName(name)?.NotLoaded === true);
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

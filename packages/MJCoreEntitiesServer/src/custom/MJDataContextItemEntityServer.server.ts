import { BaseEntity, UserInfo, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJDataContextItemEntity, MJDataContextItemEntityType } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: Data Context Items` entity. The SQL of a `sql` item runs when its data context is
 * loaded, so only an administrator (Owner-type user) may create a SQL item, change its SQL or type, or
 * move it to another data context. Other item types and other fields stay writable as before.
 */
@RegisterClass(BaseEntity, 'MJ: Data Context Items')
export class MJDataContextItemEntityServer extends MJDataContextItemEntity {
    private static readonly SQL_WRITE_REFUSED =
        'Only an administrator (Owner-type user) may create or change a SQL data context item, because its SQL runs against the database.';

    /** Fields whose change alters which SQL runs, or for whom. */
    private static readonly SQL_BEARING_FIELDS: ReadonlyArray<keyof MJDataContextItemEntityType> = ['Type', 'SQL', 'DataContextID'];

    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (this.writesSQL() && !this.callerIsOwner()) {
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

    /**
     * True when this save creates or changes SQL that a data context load would run. A value set on an
     * unsaved record never reads as dirty, so a new record counts as writing every field.
     */
    private writesSQL(): boolean {
        const carriesSQL = this.Type === 'sql' || !!this.SQL?.trim();
        if (!carriesSQL) {
            return false;
        }
        if (!this.IsSaved) {
            return true;
        }
        return MJDataContextItemEntityServer.SQL_BEARING_FIELDS.some((name) => this.GetFieldByName(name)?.Dirty === true);
    }

    /** True when the acting user is an Owner-type user. */
    private callerIsOwner(): boolean {
        const caller: UserInfo | null = this.ActiveUser;
        return caller?.Type?.trim().toLowerCase() === 'owner';
    }
}

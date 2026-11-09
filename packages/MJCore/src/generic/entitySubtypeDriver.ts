import { RequiresSubclass } from '@memberjunction/global';
import type { BaseEntity } from './baseEntity';
import type { ValidationResult } from './entityInfo';
import type { UserInfo } from './securityInfo';

/**
 * Base class for per-type behavior drivers resolved declaratively via `Entity.SubtypeSelector.Driver`.
 *
 * Type-family base classes (for example, `ConversationTypeDriver` or `CommentTypeDriver`) extend
 * `EntitySubtypeDriverBase` to add domain-specific hooks (such as `OnAccept` or `OnRecordChanged`),
 * while concrete drivers register with `ClassFactory` against either their family base class
 * (matching `Driver.BaseClass`) or `EntitySubtypeDriverBase` directly, using the `DriverClass`
 * value stored on the type row as the registration key.
 *
 * Driver instances are stateless singletons per `(BaseClass, DriverClass)` key and are cached by
 * `BaseEntity`, so subclasses must not store per-record state on `this`.
 */
@RequiresSubclass()
export abstract class EntitySubtypeDriverBase {
    /**
     * Optional validation hook invoked on `Validate()` (when the type row is already cached in memory)
     * and always awaited on `Save()` (loading the type row if needed).
     *
     * Add `ValidationErrorInfo` entries to `result.Errors` and set `result.Success = false` to reject
     * the record.
     */
    public Validate?(
        entity: BaseEntity,
        result: ValidationResult,
        contextUser: UserInfo | null
    ): void | Promise<void>;

    /**
     * Optional pre-save hook invoked inside the active save transaction after validation succeeds and
     * before `ProviderToUse.Save()` writes the row.
     *
     * Return `false` or a non-empty error message string (or throw an `Error`) to abort and roll back
     * the save. Field mutations applied to `entity` here are included in the persisted write.
     */
    public BeforeSave?(
        entity: BaseEntity,
        isNew: boolean,
        contextUser: UserInfo | null
    ): void | boolean | string | Promise<void | boolean | string>;

    /**
     * Optional post-save hook invoked inside the active transaction (both direct `Save()`'s
     * `EntityTransactionScope` and `TransactionGroup.Submit()`'s group transaction) before commit,
     * so side-effect writes performed by the driver participate in the same atomic transaction and
     * throwing aborts and rolls back the transaction.
     */
    public AfterSave?(
        entity: BaseEntity,
        isNew: boolean,
        contextUser: UserInfo | null
    ): void | Promise<void>;

    /**
     * Optional synchronous hook invoked when a caller modifies a field value via `Set()` (or a
     * generated property setter) and the new value differs from the previous value. Not called during
     * record hydration (`InnerLoad`, `LoadFromData`, `SetMany`).
     */
    public OnFieldChanged?(
        entity: BaseEntity,
        fieldName: string,
        newValue: unknown,
        oldValue: unknown
    ): void;
}

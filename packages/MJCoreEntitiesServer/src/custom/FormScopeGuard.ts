import {
    BaseEntityResult,
    ValidationErrorInfo,
    ValidationErrorType,
    type EntitySaveOptions,
    type IMetadataProvider,
    type UserInfo,
    type ValidationResult,
} from '@memberjunction/core';
import {
    FormScopeWriteRefusal,
    UserCanManageFormDefaults,
    type FormScope,
    type FormScopeOperation,
    type FormScopeWrite,
} from '@memberjunction/core-entities';

/**
 * What the scope guard reads from a `MJ: Entity Form Overrides` or `MJ: Entity Form
 * Contributions` row. Both entities carry the same scope columns, and neither shares a base class
 * with the other, so the two server subclasses hand themselves to these helpers through this shape.
 */
export interface GuardedFormScopeRow {
    readonly IsSaved: boolean;
    readonly ActiveUser: UserInfo | null;
    readonly Scope: FormScope;
    readonly UserID: string | null;
    GetFieldByName(name: string): { OldValue: unknown } | null | undefined;
}

/**
 * The write this row is about to make, as the scope rule needs to see it — or null when there is
 * no caller.
 *
 * No caller means a trusted, server-internal context, the same reading `MJUserRoleEntityServer`
 * gives it: there is nobody to check the write against.
 *
 * On an update the prior values come from each field's `OldValue`, the value as last loaded.
 * On a delete the row is unchanged, so its current values are both sides.
 */
export function DescribeFormScopeWrite(
    row: GuardedFormScopeRow,
    operation: FormScopeOperation,
    callerHoldsGrant: boolean,
): FormScopeWrite | null {
    const caller = row.ActiveUser;
    if (!caller) return null;
    const isCreate = operation === 'create';
    const isDelete = operation === 'delete';
    return {
        Operation: operation,
        PriorScope: isCreate ? null : isDelete ? row.Scope : priorValue<FormScope>(row, 'Scope'),
        PriorUserID: isCreate ? null : isDelete ? row.UserID : priorValue<string | null>(row, 'UserID'),
        NextScope: row.Scope,
        NextUserID: row.UserID,
        CallerID: caller.ID,
        CallerHoldsGrant: callerHoldsGrant,
    };
}

/** The value a field held when the row was loaded. */
function priorValue<T>(row: GuardedFormScopeRow, field: string): T {
    return row.GetFieldByName(field)?.OldValue as T;
}

/** Why this row's write is refused, or null when it may proceed. */
export function FormScopeGuardRefusal(
    row: GuardedFormScopeRow,
    operation: FormScopeOperation,
    callerHoldsGrant: boolean,
): string | null {
    const write = DescribeFormScopeWrite(row, operation, callerHoldsGrant);
    return write ? FormScopeWriteRefusal(write) : null;
}

/** Whether the caller holds the grant, read through the row's own provider. */
export function CallerHoldsFormDefaultsGrant(row: GuardedFormScopeRow, provider: IMetadataProvider): boolean {
    return UserCanManageFormDefaults(row.ActiveUser, provider);
}

/** Adds the scope rule's refusal, if any, to a `Validate()` result. Runs on create and update. */
export function ApplyFormScopeValidation(
    row: GuardedFormScopeRow,
    provider: IMetadataProvider,
    result: ValidationResult,
): void {
    const operation: FormScopeOperation = row.IsSaved ? 'update' : 'create';
    const refusal = FormScopeGuardRefusal(row, operation, CallerHoldsFormDefaultsGrant(row, provider));
    if (!refusal) return;
    result.Errors.push(new ValidationErrorInfo('Scope', refusal, row.Scope, ValidationErrorType.Failure));
    result.Success = false;
}

/**
 * Why a `ReplayOnly` save is refused, or null.
 *
 * `ReplayOnly` performs the write without calling `Validate()`, so it would skip the scope rule
 * entirely. It is a replication facility for trusted sync paths; only a caller who could make any
 * scope write anyway may use it.
 */
export function FormScopeReplayRefusal(
    row: GuardedFormScopeRow,
    provider: IMetadataProvider,
    options: EntitySaveOptions | undefined,
): string | null {
    if (!options?.ReplayOnly || !row.ActiveUser) return null;
    if (CallerHoldsFormDefaultsGrant(row, provider)) return null;
    return 'A ReplayOnly save skips validation, which is where form scope is checked, so it needs the ' +
        'Manage Form Defaults authorization.';
}

/** Why a delete is refused, or null. `Delete()` never calls `Validate()`, so it is checked here. */
export function FormScopeDeleteRefusal(row: GuardedFormScopeRow, provider: IMetadataProvider): string | null {
    return FormScopeGuardRefusal(row, 'delete', CallerHoldsFormDefaultsGrant(row, provider));
}

/** A refusal recorded as a result, so `LatestResult.CompleteMessage` carries the reason. */
export function FormScopeRefusalResult(type: 'create' | 'update' | 'delete', message: string): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = type;
    result.Message = message;
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    return result;
}

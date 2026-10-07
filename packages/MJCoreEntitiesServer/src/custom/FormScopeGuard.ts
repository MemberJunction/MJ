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
    IsCanonicalFormScope,
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
 * A delete removes the row as stored, so both sides are the loaded values and an unsaved edit
 * to the scope or owner cannot change the check.
 */
export function DescribeFormScopeWrite(
    row: GuardedFormScopeRow,
    operation: FormScopeOperation,
    callerHoldsGrant: boolean,
): FormScopeWrite | null {
    const caller = row.ActiveUser;
    if (!caller) return null;
    const who = { CallerID: caller.ID, CallerHoldsGrant: callerHoldsGrant };
    if (operation === 'create') {
        return {
            Operation: operation, PriorScope: null, PriorUserID: null,
            NextScope: row.Scope, NextUserID: row.UserID, ...who,
        };
    }
    const priorScope = priorValue<FormScope>(row, 'Scope');
    const priorUserID = priorValue<string | null>(row, 'UserID');
    const isDelete = operation === 'delete';
    return {
        Operation: operation,
        PriorScope: priorScope,
        PriorUserID: priorUserID,
        NextScope: isDelete ? priorScope : row.Scope,
        NextUserID: isDelete ? priorUserID : row.UserID,
        ...who,
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

/**
 * Why the row's Scope may not be stored, or null when it is exactly `User`, `Role` or `Global`.
 *
 * Refused for every caller, a trusted one included: the value-list check trims and case-folds,
 * and SQL Server ignores trailing spaces in the CHECK, so a padded or re-cased value would
 * otherwise be stored.
 */
function nonCanonicalScopeRefusal(row: GuardedFormScopeRow): string | null {
    return IsCanonicalFormScope(row.Scope)
        ? null
        : `Scope must be exactly 'User', 'Role' or 'Global'; '${row.Scope ?? ''}' is not.`;
}

/**
 * Adds a scope problem, if any, to a `Validate()` result. Runs on create and update: first the
 * canonical-Scope check, then the scope rule.
 */
export function ApplyFormScopeValidation(
    row: GuardedFormScopeRow,
    provider: IMetadataProvider,
    result: ValidationResult,
): void {
    const problem = nonCanonicalScopeRefusal(row)
        ?? FormScopeGuardRefusal(row, row.IsSaved ? 'update' : 'create', CallerHoldsFormDefaultsGrant(row, provider));
    if (!problem) return;
    result.Errors.push(new ValidationErrorInfo('Scope', problem, row.Scope, ValidationErrorType.Failure));
    result.Success = false;
}

/**
 * Why a `ReplayOnly` save is refused, or null.
 *
 * `ReplayOnly` performs the write without calling `Validate()`, so it would skip every check
 * there. The canonical-Scope check runs for every caller. Beyond that, it is a replication
 * facility for trusted sync paths: only a caller who holds the grant may use it, and the
 * ownership half of the rule still applies, so a holder cannot replay a write to someone else's
 * personal item.
 */
export function FormScopeReplayRefusal(
    row: GuardedFormScopeRow,
    provider: IMetadataProvider,
    options: EntitySaveOptions | undefined,
): string | null {
    if (!options?.ReplayOnly) return null;
    const nonCanonical = nonCanonicalScopeRefusal(row);
    if (nonCanonical) return nonCanonical;
    if (!row.ActiveUser) return null;
    if (!CallerHoldsFormDefaultsGrant(row, provider)) {
        return 'A ReplayOnly save skips validation, which is where form scope is checked, so it needs the ' +
            'Manage Form Defaults authorization.';
    }
    return FormScopeGuardRefusal(row, row.IsSaved ? 'update' : 'create', true);
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

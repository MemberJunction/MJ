import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJScopedNotificationConfigEntity } from '@memberjunction/core-entities';

/**
 * Server-side Scoped Notification Config: refuses a `SecondaryScopes` value that is not a JSON object (#5492).
 *
 * The notification resolver reads a row's secondary scopes as conditions every notice must match. A value it cannot
 * read as an object used to parse to "no conditions", so the row applied to every caller; the resolver now skips such
 * rows, and this check keeps new ones from being saved.
 */
@RegisterClass(BaseEntity, 'MJ: Scoped Notification Configs')
export class MJScopedNotificationConfigEntityServer extends MJScopedNotificationConfigEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const violation = CheckSecondaryScopesIsObject(this.SecondaryScopes);
        if (violation) {
            result.Errors.push(new ValidationErrorInfo('SecondaryScopes', violation, this.SecondaryScopes, ValidationErrorType.Failure));
            result.Success = false;
        }
        return result;
    }
}

/** A refusal message when `SecondaryScopes` is set but is not a JSON object, else null. Empty means "no secondary scopes". */
export function CheckSecondaryScopesIsObject(value: string | null | undefined): string | null {
    if (!value || !value.trim()) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return 'SecondaryScopes must be a JSON object, e.g. {"origin":"System"}; the value is not valid JSON.';
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return 'SecondaryScopes must be a JSON object, e.g. {"origin":"System"}.';
    }
    return null;
}

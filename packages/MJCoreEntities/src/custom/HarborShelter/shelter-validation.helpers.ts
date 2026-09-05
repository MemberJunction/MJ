import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';

/**
 * MJ Academy — helpers shared by every Harbor Street entity's record-only validation.
 *
 * Free functions rather than a shared base class: each entity must extend its OWN CodeGen-generated
 * class (`MJAnimalEntity`, `MJCareLogEntity`, …), so there is no common ancestor to hang protected
 * methods on. Functions compose where inheritance cannot.
 */

/**
 * Reduce a value to a UTC day number, or null if it is absent/unparseable.
 *
 * Every date on these entities is a SQL DATE, which arrives as an instant at midnight UTC.
 * Comparing one against a local `new Date()` would make a rule depend on the browser's time of day
 * as well as its day, and flip for anyone west of UTC — the same defect MJ #4210 tracks in the
 * read-mode formatter. Reducing both sides to a UTC day first removes the question entirely.
 */
export function ShelterDayValue(d: Date | string | null | undefined): number | null {
    if (d === null || d === undefined) return null;
    const parsed = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(parsed.getTime())) return null;
    return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

/** Today as a UTC day number, for comparison against ShelterDayValue results. */
export function ShelterTodayUTC(): number {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/**
 * Record a validation failure against a specific FIELD.
 *
 * `Source` MUST be the field name. `mj-form-field` filters the result of `Record.Validate()` by it
 * to decide which control shows the message, so an error with the wrong Source still blocks the
 * save but appears nowhere on the form — which reads to the user as a save that failed silently.
 */
export function ShelterFail(
    result: ValidationResult,
    field: string,
    message: string,
    value: unknown,
): void {
    result.Errors.push(new ValidationErrorInfo(field, message, value, ValidationErrorType.Failure));
    result.Success = false;
}

/**
 * Recompute `Success` from the errors actually present.
 *
 * Call at the end of an override. A caller that only ever sets `Success = false` leaves it wrong if
 * a base class recorded a warning rather than a failure.
 */
export function ShelterFinalize(result: ValidationResult): ValidationResult {
    result.Success = result.Errors.filter((e) => e.Type === ValidationErrorType.Failure).length === 0;
    return result;
}

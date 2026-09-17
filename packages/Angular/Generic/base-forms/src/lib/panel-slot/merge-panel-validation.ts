// packages/Angular/Generic/base-forms/src/lib/panel-slot/merge-panel-validation.ts
import { ValidationResult } from '@memberjunction/global';

/**
 * Fold slot-mounted panels' `validate()` results into the record's own validation.
 * Base errors stay first so field-level messages keep their position.
 */
export function MergePanelValidation(base: ValidationResult, panels: readonly ValidationResult[]): ValidationResult {
    // Callers pass already-resolved results; awaiting happens in ValidateAsync().
    if (panels.length === 0) return base;
    const merged = new ValidationResult();
    merged.Success = base.Success && panels.every((p) => p.Success);
    merged.Errors = [...base.Errors, ...panels.flatMap((p) => p.Errors)];
    return merged;
}

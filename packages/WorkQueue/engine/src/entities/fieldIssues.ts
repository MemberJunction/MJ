import { ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import type { ValidationResult } from '@memberjunction/core';
import type { FieldIssue } from '@memberjunction/work-queue-base';

/** Folds base-tier field issues into an entity's ValidationResult as failures. */
export function AddFieldIssues(result: ValidationResult, issues: FieldIssue[]): ValidationResult {
    for (const issue of issues) {
        result.Errors.push(new ValidationErrorInfo(issue.Field, issue.Message, issue.Value, ValidationErrorType.Failure));
    }
    result.Success = result.Success && issues.length === 0;
    return result;
}

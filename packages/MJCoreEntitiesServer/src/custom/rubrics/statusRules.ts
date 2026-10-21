import { ValidationErrorInfo, ValidationErrorType, type ValidationResult } from '@memberjunction/core';

const VERSION_IMMUTABLE = 'A published rubric version is immutable. Create a new draft version to change it; only its Status may move between Published and Retired.';
const CRITERION_FROZEN = 'Criteria of a published rubric version cannot be added, changed or removed. Create a new draft version.';
const LEVEL_FROZEN = 'Level descriptors of a published rubric version cannot be added, changed or removed. Create a new draft version.';
const BAND_FROZEN = 'Bands of a published rubric version cannot be added, changed or removed. Create a new draft version.';
const EVALUATION_IMMUTABLE = 'A submitted rubric evaluation is immutable. To correct it, create a new evaluation that supersedes it.';

/** Columns the version trigger freezes once a version has left Draft. Status and RetiredAt may still change. */
export const FROZEN_VERSION_FIELDS = [
    'RubricID', 'MajorVersion', 'MinorVersion', 'PatchVersion', 'BasedOnVersionID',
    'Instructions', 'PassThreshold', 'MinimumCompleteness', 'NotApplicablePolicy',
    'ScoreDisplayMin', 'ScoreDisplayMax', 'RequestedBump', 'ComputedBump', 'AppliedBump',
    'ChangeSummary', 'ChangeDetails', 'ContentHash', 'ScoringHash',
    'PublishedAt', 'PublishedByUserID',
] as const;

/**
 * A new version is Draft. After that, Draft becomes Published only through publish,
 * and a frozen version moves only between Published and Retired.
 */
export function VersionStatusError(isNew: boolean, previous: string | null, next: string): string | null {
    if (isNew) return next === 'Draft' ? null : 'A new rubric version must be Draft.';
    const from = previous ?? next;
    if (from === next) return null;
    if (from === 'Draft' && next === 'Published') return null;
    if ((from === 'Published' && next === 'Retired') || (from === 'Retired' && next === 'Published')) return null;
    return VERSION_IMMUTABLE;
}

/** Draft may be submitted or fail. Submitted may be superseded or withdrawn. The other states are terminal. */
export function EvaluationStatusError(isNew: boolean, previous: string | null, next: string): string | null {
    if (isNew) return next === 'Draft' ? null : 'A new evaluation must be Draft.';
    const from = previous ?? next;
    if (from === next) return null;
    if (from === 'Draft' && (next === 'Submitted' || next === 'Failed')) return null;
    if (from === 'Submitted' && (next === 'Superseded' || next === 'Withdrawn')) return null;
    return EVALUATION_IMMUTABLE;
}

export function DraftChildError(kind: 'criterion' | 'level' | 'band', versionStatus: string | null | undefined): string | null {
    if (!versionStatus || versionStatus === 'Draft') return null;
    if (kind === 'level') return LEVEL_FROZEN;
    if (kind === 'band') return BAND_FROZEN;
    return CRITERION_FROZEN;
}

export function PushFailure(result: ValidationResult, source: string, message: string, value: unknown): void {
    result.Success = false;
    result.Errors.push(new ValidationErrorInfo(source, message, value, ValidationErrorType.Failure));
}

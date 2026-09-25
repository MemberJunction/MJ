/**
 * @file RowExclusion.ts
 * Matches child rows against a relationship's `ExcludeRows` rules. Used to leave out rows that
 * belong to one person or device (push tokens, drafts, consent) even when the edge is Deep.
 */

import type { ICloneRowExclusion } from '@memberjunction/core';

/** True when `row` matches any rule: its field equals one of `Equals`, or starts with one of `StartsWith`. */
export function RowMatchesExclusion(row: Record<string, unknown>, rules: ICloneRowExclusion[] | undefined): boolean {
    if (!rules?.length) return false;
    return rules.some((rule) => {
        const value = row[rule.Field];
        if (value === null || value === undefined) return false;
        if (rule.Equals?.some((v) => v === value)) return true;
        return typeof value === 'string' && (rule.StartsWith ?? []).some((prefix) => value.startsWith(prefix));
    });
}

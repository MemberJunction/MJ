import { FieldPermissionAccess, FieldPermissionRuleVerbs, IsRestrictingFieldRule } from '@memberjunction/core';

/**
 * Case-insensitive handling of `MJ: Entity Field Permissions` Access values for the server-side
 * guards.
 *
 * The Access columns' CHECK constraint runs under the database's case-insensitive collation, so
 * `'deny'`, `'ALLOW'` and `' No Access '` all store. The runtime aggregation
 * (`EntityFieldInfo.AggregateFieldRulesForUser`) folds case and trims, so a stored `'deny'` is
 * ENFORCED as a Deny. A guard that compares with `===` therefore reads that same row as harmless —
 * which is how a restriction slips past a check written to refuse it. Every guard must answer the
 * question the way enforcement does, and these helpers are how it does.
 */

/** The three Access columns of a rule, in a fixed order. */
export const FieldPermissionAccessVerbs = ['ReadAccess', 'UpdateAccess', 'CreateAccess'] as const;

const canonicalByFoldedSpelling: ReadonlyMap<string, FieldPermissionAccess> = new Map(
    Object.values(FieldPermissionAccess).map((value) => [value.toLowerCase(), value])
);

/**
 * The canonical value-list spelling of an Access value, or null when it is not one of the three
 * values under any casing or surrounding whitespace.
 */
export function NormalizeFieldPermissionAccess(value: string | null | undefined): FieldPermissionAccess | null {
    return canonicalByFoldedSpelling.get((value ?? '').trim().toLowerCase()) ?? null;
}

/** True when `value` means `expected`, compared the way enforcement compares. */
export function FieldPermissionAccessIs(value: string | null | undefined, expected: FieldPermissionAccess): boolean {
    return NormalizeFieldPermissionAccess(value) === expected;
}

/**
 * True when a single rule takes access away — a `Deny` on any verb, under any spelling.
 *
 * Kept for the guards that already import it; it is `IsRestrictingFieldRule` from
 * `@memberjunction/core`, which compares case-insensitively so it agrees with the aggregation.
 * Like that function it judges ONE rule: whether a change restricts a user is a property of the
 * projected aggregate across their roles.
 */
export function IsRestrictingFieldRuleAnyCase(rule: FieldPermissionRuleVerbs | null | undefined): boolean {
    return IsRestrictingFieldRule(rule);
}

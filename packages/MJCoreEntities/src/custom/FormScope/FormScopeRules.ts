import { AuthorizationEvaluator, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJEntityFormContributionEntity } from '../../generated/entities/__mj';

/**
 * Who may write a full custom form or a panel, and at which scope.
 *
 * A form or panel belongs to one user, to a role, or to everyone. Anyone may manage their own.
 * Changing what OTHER people see — creating, editing, removing or re-aiming a role or everyone
 * item — takes the {@link MANAGE_FORM_DEFAULTS_AUTHORIZATION} grant.
 *
 * Lives here, in a package both the server and the browser depend on, so the two cannot disagree:
 * the server-side entity subclasses enforce this rule on every write path, and the form's drawer
 * calls the same function to decide which controls to draw.
 */

/** The authorization that lets a user publish a form or panel to a role or to everyone. */
export const MANAGE_FORM_DEFAULTS_AUTHORIZATION = 'Manage Form Defaults';

/** Who a form or panel is for. Derived from the entity so it tracks the column's value list. */
export type FormScope = MJEntityFormContributionEntity['Scope'];

/** The scopes as stored. Keyed by {@link FormScope}, so it stays in step with the value list. */
const CANONICAL_FORM_SCOPES: Readonly<Record<FormScope, true>> = { User: true, Role: true, Global: true };

/** True when `value` is exactly `User`, `Role` or `Global`: no padding, this casing. */
export function IsCanonicalFormScope(value: unknown): value is FormScope {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CANONICAL_FORM_SCOPES, value);
}

export type FormScopeOperation = 'create' | 'update' | 'delete';

/** One write to a form or panel, as the rule needs to see it. */
export interface FormScopeWrite {
    Operation: FormScopeOperation;
    /** Scope before the write. Null on create. */
    PriorScope: FormScope | null;
    /** Owner before the write. Null on create, or when the item was not personal. */
    PriorUserID: string | null;
    /** Scope after the write. On delete, the same as the prior scope. */
    NextScope: FormScope;
    /** Owner after the write. */
    NextUserID: string | null;
    CallerID: string;
    CallerHoldsGrant: boolean;
}

const GRANT_REFUSAL =
    `Publishing a form or panel to a role or to everyone, or changing one that is, requires the ` +
    `${MANAGE_FORM_DEFAULTS_AUTHORIZATION} authorization.`;

const OWNERSHIP_REFUSAL =
    'You can only change your own personal forms and panels. This one belongs to someone else, and ' +
    'holding the Manage Form Defaults authorization does not change that — it governs what other ' +
    'people are shown, not their own customisations.';

/**
 * Why this write is not allowed, or null when it is.
 *
 * Both sides of the write are checked. A personal side must belong to the caller; a shared side
 * needs the grant. Checking only the new side would let a user demote a shared item to their own
 * and take it over; checking only the old side would let them promote their own to everyone.
 *
 * A scope is read the way the database reads it: a side is personal when its scope is `User`
 * after trimming and case-folding. Any side whose scope is not exactly `User` (`Role`, `Global`,
 * a padded or re-cased value, a blank, an unknown value) counts as shared and needs the grant.
 */
export function FormScopeWriteRefusal(write: FormScopeWrite): string | null {
    const next = { Scope: write.NextScope, UserID: write.NextUserID };
    const sides = write.Operation === 'create'
        ? [next]
        : [{ Scope: write.PriorScope, UserID: write.PriorUserID }, next];
    // Ownership first: it is the stricter rule, and a holder is refused by it too.
    for (const side of sides) {
        if (readsAsPersonal(side.Scope) && !UUIDsEqual(side.UserID ?? '', write.CallerID)) {
            return OWNERSHIP_REFUSAL;
        }
    }
    if (!write.CallerHoldsGrant && sides.some((side) => side.Scope !== 'User')) {
        return GRANT_REFUSAL;
    }
    return null;
}

/** True when a scope is `User` once trimmed and case-folded, as the database compares it. */
function readsAsPersonal(scope: string | null): boolean {
    return (scope ?? '').trim().toLowerCase() === 'user';
}

/**
 * How narrow a scope's audience is, for breaking a tie between two rows at the same precedence.
 * Higher wins: `User` (3) over `Role` (2) over `Global` (1). A value that is not one of the three
 * ranks 0, below every scope.
 */
export function ContributionScopeRank(scope: FormScope | null | undefined): number {
    switch (scope) {
        case 'User': return 3;
        case 'Role': return 2;
        case 'Global': return 1;
        default: return 0;
    }
}

/**
 * Whether this user may publish forms and panels to a role or to everyone.
 *
 * An `Owner`-type user counts as holding it: they are the platform's top authority and must never
 * be locked out of this. It does not let them touch other people's personal items — that is
 * {@link FormScopeWriteRefusal}'s ownership rule, which no grant overrides.
 *
 * False without a user or when the authorization is not defined, so a deployment that has not
 * synced the authorization yet fails closed.
 */
export function UserCanManageFormDefaults(
    user: UserInfo | null | undefined,
    provider: IMetadataProvider | null | undefined,
): boolean {
    if (!user) return false;
    if (user.Type?.trim().toLowerCase() === 'owner') return true;
    const authorizations = provider?.Authorizations ?? [];
    const grant = authorizations.find((a) =>
        a.Name?.trim().toLowerCase() === MANAGE_FORM_DEFAULTS_AUTHORIZATION.toLowerCase());
    if (!grant) return false;
    return new AuthorizationEvaluator().UserCanExecuteWithAncestors(grant, user, authorizations);
}

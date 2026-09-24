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
 */
export function FormScopeWriteRefusal(write: FormScopeWrite): string | null {
    const sides: Array<{ Scope: FormScope | null; UserID: string | null }> = [
        { Scope: write.PriorScope, UserID: write.PriorUserID },
        { Scope: write.NextScope, UserID: write.NextUserID },
    ];
    // Ownership first: it is the stricter rule, and a holder is refused by it too.
    for (const side of sides) {
        if (side.Scope === 'User' && !UUIDsEqual(side.UserID ?? '', write.CallerID)) {
            return OWNERSHIP_REFUSAL;
        }
    }
    for (const side of sides) {
        if ((side.Scope === 'Role' || side.Scope === 'Global') && !write.CallerHoldsGrant) {
            return GRANT_REFUSAL;
        }
    }
    return null;
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

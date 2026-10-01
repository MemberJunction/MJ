import { AuthorizationEvaluator, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJEntityFormContributionEntity } from '../../generated/entities/__mj';

/**
 * Who may write a full custom form or a panel, and at which scope.
 *
 * A form or panel belongs to one user, to a role, or to everyone. Anyone may manage their own.
 * Changing what OTHER people see — creating, editing, removing or re-aiming a role or everyone
 * item — takes the {@link MANAGE_FORM_DEFAULTS_AUTHORIZATION} grant. Changing the component a
 * form or panel draws changes that form or panel, so {@link ComponentWriteRefusal} applies the
 * same rule to the `MJ: Components` row.
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
 * The `MJ: Components` columns that change what a form or panel using the component draws.
 * A change to any other column is not checked against the forms and panels that use it.
 */
export const GUARDED_COMPONENT_FIELDS: readonly string[] = ['Specification', 'Status', 'Name', 'Type'];

const GUARDED_COMPONENT_FIELD_KEYS: ReadonlySet<string> = new Set(GUARDED_COMPONENT_FIELDS.map((f) => f.toLowerCase()));

/** A full custom form or panel row that uses a component, as the component rule reads it. */
export interface FormComponentReference {
    Scope: FormScope;
    UserID: string | null;
}

/** One write to a `MJ: Components` row, as {@link ComponentWriteRefusal} needs to see it. */
export interface ComponentWrite {
    Operation: FormScopeOperation;
    /** The columns the write changes. Read on update only. */
    ChangedFields: readonly string[];
    /** Every `MJ: Entity Form Contributions` and `MJ: Entity Form Overrides` row that uses the component. */
    References: readonly FormComponentReference[];
    /** Null when there is no caller: a trusted server context. */
    CallerID: string | null;
    CallerHoldsGrant: boolean;
}

const COMPONENT_REFUSAL_LEAD =
    'This component is used by a form or panel, so changing its specification, status, name or ' +
    'type, or deleting it, changes that form or panel.';

/**
 * Whether this write must be checked against the forms and panels that use the component: a
 * delete, or an update that changes a {@link GUARDED_COMPONENT_FIELDS} column, by a caller.
 * A create is never checked, because no row can use a component that does not exist yet.
 */
export function ComponentWriteIsGuarded(write: Pick<ComponentWrite, 'Operation' | 'ChangedFields' | 'CallerID'>): boolean {
    if (write.CallerID == null || write.Operation === 'create') return false;
    if (write.Operation === 'delete') return true;
    return write.ChangedFields.some((field) => GUARDED_COMPONENT_FIELD_KEYS.has(field.trim().toLowerCase()));
}

/**
 * Why this write to a component is not allowed, or null when it is.
 *
 * A guarded write ({@link ComponentWriteIsGuarded}) changes every form and panel that uses the
 * component, so each row that uses it is checked with {@link FormScopeWriteRefusal} as if the
 * caller were updating that row in place: a `Role` or `Global` row needs the grant, another
 * user's personal row is refused for everyone, and the caller's own personal row passes.
 *
 * A component no row uses is not checked here: the entity permission alone decides who may
 * change it. Personal rows are checked first, so when the grant would not help, the refusal says so.
 */
export function ComponentWriteRefusal(write: ComponentWrite): string | null {
    if (!ComponentWriteIsGuarded(write)) return null;
    const callerID = write.CallerID ?? '';
    const personalFirst = [...write.References].sort(
        (a, b) => Number(readsAsPersonal(b.Scope)) - Number(readsAsPersonal(a.Scope)));
    for (const reference of personalFirst) {
        const refusal = FormScopeWriteRefusal({
            Operation: 'update',
            PriorScope: reference.Scope, PriorUserID: reference.UserID,
            NextScope: reference.Scope, NextUserID: reference.UserID,
            CallerID: callerID,
            CallerHoldsGrant: write.CallerHoldsGrant,
        });
        if (refusal) return `${COMPONENT_REFUSAL_LEAD} ${refusal}`;
    }
    return null;
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

/** The fields the same-key tie-break reads from a contribution. */
export interface RankedFormContribution {
    /** Last-wins rank; null or undefined reads as 0. */
    Precedence: number | null | undefined;
    /** The row's scope. Not read for a compiled panel. */
    Scope?: FormScope | null;
    /** True for a compiled `BaseFormPanel` registration, which wins every precedence tie against a row. */
    Compiled?: boolean;
}

/**
 * Whether `candidate` beats `incumbent` for one contribution key: higher precedence first; on a
 * tie a compiled panel beats any row, and between rows the narrower scope wins
 * ({@link ContributionScopeRank}). On a full tie the incumbent stays, so the result follows the
 * order the caller walks the contributions in.
 */
export function FormContributionOutranks(candidate: RankedFormContribution, incumbent: RankedFormContribution): boolean {
    const precedence = (candidate.Precedence ?? 0) - (incumbent.Precedence ?? 0);
    if (precedence !== 0) return precedence > 0;
    return tieRank(candidate) > tieRank(incumbent);
}

function tieRank(contribution: RankedFormContribution): number {
    return contribution.Compiled ? Number.POSITIVE_INFINITY : ContributionScopeRank(contribution.Scope);
}

/**
 * Whether a user may pick a full custom form and see it rendered.
 *
 * A live (`Active`) form always. A set-aside (`Inactive`) form only when it is the user's own
 * `User` row: applying a second form sets the first aside, and the user must be able to swap back.
 * A shared form set to `Inactive` was retracted by whoever manages it, so it is neither offered nor
 * rendered. A `Pending` row is a draft and is never either. The browser's form resolver and the
 * server's composition action both decide with this.
 *
 * It checks `Status` and `Scope` only, not whose row it is or which role it is for. Callers pass
 * rows that already apply to the user: their own `User` rows, their roles' rows and `Global` rows.
 */
export function IsSelectableFormOverride(row: { Status: string | null | undefined; Scope: string | null | undefined }): boolean {
    return row.Status === 'Active' || (row.Status === 'Inactive' && row.Scope === 'User');
}

/**
 * Entities whose forms show only the user's own full custom forms and panels, lowercased.
 *
 * A full custom form or a panel runs a React spec the runtime interprets. On an identity,
 * permission or form-metadata surface, one published to a role or to everyone would change what
 * other people see where it matters most, so only `User`-scope items render there.
 */
export const RESTRICTED_FORM_ENTITIES: ReadonlySet<string> = new Set([
    'mj: users',
    'mj: roles',
    'mj: user roles',
    'mj: authorizations',
    'mj: authorization roles',
    'mj: entity permissions',
    'mj: row level security filters',
    'mj: api keys',
    'mj: entity field permissions',
    'mj: entity form overrides',
    'mj: entity form contributions',
]);

/**
 * Whether a full custom form or panel at this scope may render on this entity's form.
 *
 * Always for `User`. Any other scope only off {@link RESTRICTED_FORM_ENTITIES}; the name is
 * matched trimmed and case-folded. Applied where rows are read, so it holds however a row was
 * written, `mj sync` and direct SQL included.
 */
export function FormScopeAllowedOnEntity(entityName: string | null | undefined, scope: string | null | undefined): boolean {
    if (scope === 'User') return true;
    return !RESTRICTED_FORM_ENTITIES.has((entityName ?? '').trim().toLowerCase());
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

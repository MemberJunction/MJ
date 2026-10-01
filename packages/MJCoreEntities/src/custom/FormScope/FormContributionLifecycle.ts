import { UUIDsEqual } from '@memberjunction/global';
import type { MJComponentEntity, MJEntityFormContributionEntity } from '../../generated/entities/__mj';

/**
 * How a form or panel goes live and is retired, as both write paths apply it: the server actions
 * an agent calls, and the form's Manage drawer a person uses. Lives in a package both depend on,
 * so the two cannot disagree about which row an activation retires.
 */

/** A form or panel's lifecycle, as the row stores it. */
export type FormLifecycleStatus = MJEntityFormContributionEntity['Status'];

/** The status of the Component a form or panel renders. */
export type FormComponentStatus = NonNullable<MJComponentEntity['Status']>;

/**
 * The Component status that mirrors a form or panel's lifecycle: a live version is `Published`,
 * a draft is `Draft`, a retired one is `Deprecated`. So a Component read on its own still says
 * whether it is live. An unknown status reads as retired.
 */
export function FormLifecycleComponentStatus(status: FormLifecycleStatus): FormComponentStatus {
    switch (status) {
        case 'Active': return 'Published';
        case 'Pending': return 'Draft';
        case 'Inactive': return 'Deprecated';
        default: return 'Deprecated';
    }
}

/** The columns that place a form or panel row: its entity, audience, status and key. */
export interface FormScopedRow {
    ID: string;
    EntityID: string;
    Status: string;
    Scope: string;
    UserID: string | null;
    RoleID: string | null;
    /** Panels only. A full custom form has no key. */
    ContributionKey?: string | null;
}

/**
 * Whether two rows are for the same audience: the same scope, the same owner for a `User` row and
 * the same role for a `Role` row. Every `Global` row is for the same audience.
 */
export function SameFormAudience(
    a: Pick<FormScopedRow, 'Scope' | 'UserID' | 'RoleID'>,
    b: Pick<FormScopedRow, 'Scope' | 'UserID' | 'RoleID'>,
): boolean {
    if (a.Scope !== b.Scope) return false;
    if (a.Scope === 'User') return UUIDsEqual(a.UserID ?? '', b.UserID ?? '');
    if (a.Scope === 'Role') return UUIDsEqual(a.RoleID ?? '', b.RoleID ?? '');
    return true;
}

/**
 * The Active panels that activating `target` must retire first: the same entity, the same
 * audience and the same key, other than the target itself. A panel with no key has none: two
 * keyless panels are two panels.
 *
 * `UQ_EntityFormContribution_Key` allows one Active row per entity, key and audience, so these are
 * demoted before the target is promoted, in the same transaction. Keys are trimmed and compared
 * without regard to case, which mirrors the index's case-insensitive collation.
 */
export function ActiveContributionSiblings<T extends FormScopedRow>(rows: readonly T[], target: FormScopedRow): T[] {
    const key = (target.ContributionKey ?? '').trim().toLowerCase();
    if (!key) return [];
    return rows.filter((row) =>
        row.Status === 'Active'
        && !UUIDsEqual(row.ID, target.ID)
        && UUIDsEqual(row.EntityID, target.EntityID)
        && (row.ContributionKey ?? '').trim().toLowerCase() === key
        && SameFormAudience(row, target));
}

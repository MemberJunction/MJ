import { UUIDsEqual } from '@memberjunction/global';
import type { FormScope } from '@memberjunction/core-entities';

/**
 * Who a full custom form or a panel is for, and which live item publishing one replaces.
 *
 * Publishing changes an item's own audience — there is one row, never a copy. Whatever was live
 * for that audience before has to be retired in the same transaction: otherwise the audience
 * briefly sees two, or the unique index on active contributions refuses the write.
 */

/** The audience an item is published to. `RoleID` is read only when the scope is `Role`. */
export interface FormAudience {
    Scope: FormScope;
    RoleID: string | null;
}

/** The scope columns of a form or a panel, which is all these rules read. */
export interface ScopedRow {
    ID: string;
    EntityID: string;
    Status: string;
    Scope: FormScope;
    RoleID: string | null;
    UserID: string | null;
    /** Panels only. A full custom form has no key: one form is live per entity and audience. */
    ContributionKey?: string | null;
}

/** The columns an audience writes. A personal item belongs to the caller; a shared one to nobody. */
export function AudienceColumns(
    audience: FormAudience,
    callerID: string,
): { Scope: FormScope; RoleID: string | null; UserID: string | null } {
    return {
        Scope: audience.Scope,
        RoleID: audience.Scope === 'Role' ? audience.RoleID : null,
        UserID: audience.Scope === 'User' ? callerID : null,
    };
}

/** Whether a row is aimed at exactly this audience. */
function isFor(row: ScopedRow, audience: FormAudience, callerID: string): boolean {
    if (row.Scope !== audience.Scope) return false;
    if (audience.Scope === 'Role') return UUIDsEqual(row.RoleID ?? '', audience.RoleID ?? '');
    if (audience.Scope === 'User') return UUIDsEqual(row.UserID ?? '', callerID);
    return true;
}

/** An active row on the same entity, for the audience, that is not the one being published. */
function liveAt(
    rows: readonly ScopedRow[],
    target: ScopedRow,
    audience: FormAudience,
    callerID: string,
    sameItem: (row: ScopedRow) => boolean,
): ScopedRow | null {
    return rows.find((row) =>
        !UUIDsEqual(row.ID, target.ID)
        && row.Status === 'Active'
        && UUIDsEqual(row.EntityID, target.EntityID)
        && isFor(row, audience, callerID)
        && sameItem(row),
    ) ?? null;
}

/**
 * The panel live for this audience under the same contribution key — the one publishing replaces.
 *
 * Only the same key: two different panels can both be live for everyone, and publishing one must
 * not switch off the other.
 */
export function LiveContributionAt(
    rows: readonly ScopedRow[],
    target: ScopedRow,
    audience: FormAudience,
    callerID: string,
): ScopedRow | null {
    const key = (target.ContributionKey ?? '').trim().toLowerCase();
    if (!key) return null;
    return liveAt(rows, target, audience, callerID,
        (row) => (row.ContributionKey ?? '').trim().toLowerCase() === key);
}

/**
 * The full custom form live for this audience on the same entity — the one publishing sets aside.
 *
 * Forms have no key because an audience sees one at a time: whichever is live is replaced, and it
 * stays in the picker to switch back to.
 */
export function LiveOverrideAt(
    rows: readonly ScopedRow[],
    target: ScopedRow,
    audience: FormAudience,
    callerID: string,
): ScopedRow | null {
    return liveAt(rows, target, audience, callerID, () => true);
}

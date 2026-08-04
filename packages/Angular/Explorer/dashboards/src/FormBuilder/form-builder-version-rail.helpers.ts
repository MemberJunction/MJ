/**
 * Pure helpers for the Form Builder cockpit's Version Rail.
 *
 * The rail's data load is a two-call dance:
 *   1. Components by Name lineage (returns all versions for the active form)
 *   2. Overrides by ComponentID-IN-list (for flagging Active / Pending per user)
 *
 * The join is small but easy to break in subtle ways. Extracting it as a
 * pure function lets us unit-test the IsActive / IsPending flagging
 * without booting Angular's DOM machinery. Retrospective fix #12.
 */

/** Shape of a `MJ: Components` simple-row result the rail consumes. */
export interface ComponentRailRow {
    ID: string;
    Name: string;
    Version: string;
    VersionSequence: number;
    Status: string;
    __mj_UpdatedAt: string | null;
}

/** Shape of a `MJ: Entity Form Overrides` simple-row result the rail consumes. */
export interface OverrideRailRow {
    ComponentID: string;
    Status: string;
}

/** Final shape rendered by the Version Rail. */
export interface ComponentVersionRow {
    ID: string;
    Name: string;
    Version: string;
    VersionSequence: number;
    Status: string;
    UpdatedAt: Date | null;
    /** True when the user's Active override currently points at this Component. */
    IsActive: boolean;
    /** True when the user has a Pending override pointing at this Component. */
    IsPending: boolean;
}

/**
 * Rank for collapsing multiple override rows targeting the same Component.
 * Higher wins. Comes up in the Restore-path: when an older version is
 * promoted back to Active, the existing Active override is repointed at
 * that older Component, leaving the original Inactive override row in
 * place ALSO pointing at the same Component. The rail must report
 * "Active" for that Component, not "Inactive" (last-write-wins on a
 * naive Map would corrupt the display).
 */
const OVERRIDE_STATUS_RANK: Record<string, number> = {
    Active: 3,
    Pending: 2,
    Inactive: 1,
};

/**
 * Join Components-by-Name results against per-user Overrides to produce
 * the final rail rows. The Overrides query is expected to be pre-filtered
 * to the calling user. When more than one override row points at the
 * same Component (e.g. after a Restore repoints the Active override at
 * a previously-Inactive Component's lineage), we collapse using the
 * Active > Pending > Inactive precedence — highest rank wins.
 */
export function joinVersionsWithOverrides(
    components: ComponentRailRow[],
    overrides: OverrideRailRow[],
): ComponentVersionRow[] {
    const overrideByComponent = new Map<string, string>();
    for (const o of overrides) {
        const prev = overrideByComponent.get(o.ComponentID);
        const prevRank = prev ? (OVERRIDE_STATUS_RANK[prev] ?? 0) : -1;
        const currRank = OVERRIDE_STATUS_RANK[o.Status] ?? 0;
        if (currRank > prevRank) {
            overrideByComponent.set(o.ComponentID, o.Status);
        }
    }
    return components.map(c => {
        const status = overrideByComponent.get(c.ID);
        return {
            ID: c.ID,
            Name: c.Name,
            Version: c.Version,
            VersionSequence: c.VersionSequence,
            Status: c.Status,
            UpdatedAt: c.__mj_UpdatedAt ? new Date(c.__mj_UpdatedAt) : null,
            IsActive: status === 'Active',
            IsPending: status === 'Pending',
        };
    });
}

/**
 * Pick the version ID the rail should highlight as "currently active". Falls
 * back to the highest-VersionSequence row when no override flags Active —
 * common case for a form that's still in draft Pending state without an
 * Active override yet.
 */
export function pickActiveVersionID(rows: ComponentVersionRow[]): string | null {
    const active = rows.find(r => r.IsActive);
    if (active) return active.ID;
    if (rows.length === 0) return null;
    // Highest VersionSequence — rows arrive ordered DESC; return the first.
    return rows[0].ID;
}

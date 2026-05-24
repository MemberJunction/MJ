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
 * Join Components-by-Name results against per-user Overrides to produce
 * the final rail rows. The Overrides query is expected to be pre-filtered
 * to the calling user — this helper just walks the join.
 */
export function joinVersionsWithOverrides(
    components: ComponentRailRow[],
    overrides: OverrideRailRow[],
): ComponentVersionRow[] {
    const overrideByComponent = new Map(
        overrides.map(o => [o.ComponentID, o.Status]),
    );
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

import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { MJApplicationEntity } from '@memberjunction/core-entities';
import type { MobileNavItem } from './BaseMobileResource';

/**
 * @fileoverview Reads the applications a user can open, from the same metadata MJ Explorer reads.
 *
 * There is no mobile-specific app list and deliberately so. `MJ: Applications` already describes
 * every application in a deployment — identity, ordering, and navigation — and `MJ: User
 * Applications` already says which of them a given user has. Duplicating that for mobile would
 * create a second source of truth that drifts the first time somebody adds an app.
 */

/** An application the current user can open, with its navigation. */
export type MobileApplication = {
    /** `MJ: Applications` row id. */
    ID: string;
    /** Application name, e.g. `"Data Explorer"`. */
    Name: string;
    /** One-line description from metadata, when authored. */
    Description: string | null;
    /** Font Awesome class, e.g. `"fa-solid fa-table-cells"`. */
    Icon: string | null;
    /** Brand colour from metadata, used for the launcher tile. */
    Color: string | null;
    /** Ordering hint; lower sorts first. The user's own sequence when they have one. */
    Sequence: number;
    /** The application's own ordering hint, used to break ties the way MJ Explorer does. */
    DefaultSequence: number;
    /** Parsed navigation items. Empty when the application authored none. */
    NavItems: MobileNavItem[];
};

/**
 * Loads the applications available to the current user, ordered for display.
 *
 * Falls back to every application flagged `DefaultForNewUser` when the user has no explicit
 * `MJ: User Applications` rows — which is exactly what a freshly-provisioned user looks like, and
 * showing them an empty launcher would be a worse answer than showing them the defaults.
 *
 * @param contextUser Optional context user; defaults to the signed-in user.
 */
export async function LoadUserApplications(contextUser?: UserInfo): Promise<MobileApplication[]> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;
    const rv = new RunView();

    const [userApps, allApps] = await rv.RunViews(
        [
            {
                EntityName: 'MJ: User Applications',
                ExtraFilter: currentUser?.ID ? `UserID='${currentUser.ID}' AND IsActive=1` : 'IsActive=1',
                Fields: ['ApplicationID', 'Sequence'],
                ResultType: 'simple',
            },
            {
                EntityName: 'MJ: Applications',
                // Same predicate MJ Explorer applies in `ApplicationManager` and `UserInfoEngine`:
                // an application an administrator has retired must not keep appearing, and a
                // deployment ships at least one (`Admin (Deprecated)`). Filtering in SQL rather
                // than after the fact also keeps the hydration off retired rows.
                ExtraFilter: "Status = 'Active'",
                OrderBy: 'DefaultSequence ASC, Name ASC',
                ResultType: 'entity_object',
            },
        ],
        currentUser,
    );

    if (!allApps?.Success) return [];

    const applications = (allApps.Results ?? []) as MJApplicationEntity[];
    const userRows = (userApps?.Success ? userApps.Results ?? [] : []) as Array<{
        ApplicationID: string;
        Sequence: number | null;
    }>;

    const userSequence = new Map(userRows.map((r) => [r.ApplicationID.toLowerCase(), r.Sequence ?? 0]));
    const scoped = userSequence.size
        ? applications.filter((a) => userSequence.has(a.ID.toLowerCase()))
        : applications.filter((a) => a.DefaultForNewUser);

    return scoped
        .map((a) => ({
            ID: a.ID,
            Name: a.Name,
            Description: a.Description ?? null,
            Icon: a.Icon ?? null,
            Color: a.Color ?? null,
            Sequence: userSequence.get(a.ID.toLowerCase()) ?? a.DefaultSequence ?? 0,
            DefaultSequence: a.DefaultSequence ?? 0,
            NavItems: ParseNavItems(a.DefaultNavItems),
        }))
        // Explorer's `compareUserApplications` order, so the launcher and the web app agree:
        // the user's own sequence, then the application's default sequence, then name.
        .sort(
            (a, b) =>
                a.Sequence - b.Sequence ||
                (a.DefaultSequence ?? 0) - (b.DefaultSequence ?? 0) ||
                a.Name.localeCompare(b.Name),
        );
}

/**
 * Parses an application's `DefaultNavItems` JSON into nav items.
 *
 * Tolerant by design: unparseable or non-array metadata yields an empty list rather than throwing.
 * A malformed nav definition should cost that one application its navigation, never take down the
 * launcher for every other app the user has. Items an administrator has deactivated are dropped
 * here, matching the web shell.
 *
 * @param raw The raw `DefaultNavItems` column value.
 */
export function ParseNavItems(raw: string | null | undefined): MobileNavItem[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .map((item) => ({
                Label: typeof item.Label === 'string' ? item.Label : 'Untitled',
                Icon: typeof item.Icon === 'string' ? item.Icon : undefined,
                ResourceType: typeof item.ResourceType === 'string' ? item.ResourceType : undefined,
                DriverClass: typeof item.DriverClass === 'string' ? item.DriverClass : undefined,
                // The record a non-Custom item opens — which dashboard, which view, which report.
                // Dropping it is what would force every generic type to say "opens on desktop".
                RecordID: typeof item.RecordID === 'string' ? item.RecordID : undefined,
                Status: typeof item.Status === 'string' ? item.Status : undefined,
                isDefault: item.isDefault === true,
            }))
            // Explorer's `app-nav` hides anything not Active, treating an absent Status as Active.
            .filter((item) => !item.Status || item.Status === 'Active');
    } catch {
        return [];
    }
}

/**
 * Picks the item an application should open on.
 *
 * The item flagged `isDefault` wins; otherwise the first one, because an application with
 * navigation but no declared default is far more likely to be under-authored than to want an
 * empty screen.
 *
 * @returns The landing item, or `null` when the application has no navigation at all.
 */
export function DefaultNavItem(app: MobileApplication): MobileNavItem | null {
    if (app.NavItems.length === 0) return null;
    return app.NavItems.find((n) => n.isDefault) ?? app.NavItems[0];
}

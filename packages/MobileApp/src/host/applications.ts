import { Metadata, type ApplicationInfo, type UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import type { MobileNavItem } from './BaseMobileResource';

/**
 * @fileoverview Reads the applications a user can open, from the same metadata MJ Explorer reads.
 *
 * There is no mobile-specific app list and deliberately so. `MJ: Applications` already describes
 * every application in a deployment — identity, ordering, and navigation — and `MJ: User
 * Applications` already says which of them a given user has. Duplicating that for mobile would
 * create a second source of truth that drifts the first time somebody adds an app.
 *
 * ## Why this queries nothing
 *
 * Both halves are already in memory by the time this runs. Applications ride in the metadata
 * payload as `ApplicationInfo` — carrying `Status`, `DefaultNavItems`, `Icon`, `Color` and
 * `DefaultSequence`, everything the launcher renders — and `UserInfoEngine` caches the user's
 * `MJ: User Applications` rows and hands them back in MJ's canonical order. Re-querying either is
 * two network round trips per navigation on a phone, one of them an unbounded `entity_object`
 * hydration of every application row in the deployment, for data the client already holds.
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
 * Loads the applications available to the current user, in MJ's canonical display order.
 *
 * Falls back to every application flagged `DefaultForNewUser` when the user has no explicit
 * `MJ: User Applications` rows — which is exactly what a freshly-provisioned user looks like.
 *
 * @param contextUser Optional context user; defaults to the signed-in user.
 */
export async function LoadUserApplications(contextUser?: UserInfo): Promise<MobileApplication[]> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;
    await UserInfoEngine.Instance.Config(false, currentUser);

    // Only Active applications are ever shown — the same predicate `ApplicationManager` and
    // `UserInfoEngine.GetDefaultApplicationsForNewUser` apply on the web. A deployment ships at
    // least one Deprecated application, so this is not hypothetical.
    const active = md.Applications.filter((a) => a.Status === 'Active');
    const byId = new Map(active.map((a) => [a.ID.toLowerCase(), a]));

    // Already ordered by MJ's canonical `compareUserApplications` (user sequence → the
    // application's DefaultSequence → name). The engine filters by user but not by IsActive, so
    // that predicate stays here.
    const userRows = UserInfoEngine.Instance.UserApplications.filter((ua) => ua.IsActive);

    const scoped: Array<{ app: ApplicationInfo; sequence: number }> = userRows.length
        ? userRows
              .map((ua) => ({ app: byId.get(ua.ApplicationID.toLowerCase()), sequence: ua.Sequence ?? 0 }))
              .filter((entry): entry is { app: ApplicationInfo; sequence: number } => entry.app !== undefined)
        : // A freshly-provisioned user has no rows at all, and an empty launcher is a worse answer
          // than the defaults they are about to be granted anyway.
          active
              .filter((a) => a.DefaultForNewUser)
              .map((a) => ({ app: a, sequence: a.DefaultSequence ?? 0 }))
              .sort(
                  (x, y) =>
                      x.sequence - y.sequence ||
                      x.app.Name.localeCompare(y.app.Name),
              );

    return scoped.map(({ app, sequence }) => ({
        ID: app.ID,
        Name: app.Name,
        Description: app.Description ?? null,
        Icon: app.Icon ?? null,
        Color: app.Color ?? null,
        Sequence: sequence,
        DefaultSequence: app.DefaultSequence ?? 0,
        NavItems: ParseNavItems(app.DefaultNavItems),
    }));
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

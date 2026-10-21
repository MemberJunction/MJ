/** A nav item that moved to another application. */
export interface MovedNavItem {
  FromApplication: string;
  FromNavItem: string;
  ToApplication: string;
  ToNavItem: string;
}

/** Nav items that moved. A request for the old place opens the new one, so old Home pins keep working. */
export const MOVED_NAV_ITEMS: readonly MovedNavItem[] = [
  { FromApplication: 'Data Explorer', FromNavItem: 'Dashboards', ToApplication: 'Dashboards', ToNavItem: 'Library' },
];

/** True when two names are the same without regard to case or outer spaces. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The move of a nav item, or null. Names compare without regard to case or outer spaces. */
export function FindMovedNavItem(applicationName: string, navItemName: string, moves: readonly MovedNavItem[] = MOVED_NAV_ITEMS): MovedNavItem | null {
  return moves.find(m => sameName(m.FromApplication, applicationName) && sameName(m.FromNavItem, navItemName)) ?? null;
}

/** The app in `apps` that the nav item moved to, or undefined when the list does not have it. Names compare as in {@link FindMovedNavItem}. */
export function FindMovedNavItemApp<T extends { Name: string }>(moved: MovedNavItem, apps: readonly T[]): T | undefined {
  return apps.find(app => sameName(app.Name, moved.ToApplication));
}

/** The parts of an application that {@link ResolveMovedNavItem} reads. */
export interface MovedNavItemApp {
  Name: string;
  GetNavItems(): Promise<{ Label: string }[]>;
}

/** A move that applies to a request, with the app the nav item moved to. */
export interface ResolvedMovedNavItem<T> {
  Move: MovedNavItem;
  App: T;
}

/**
 * Where a request for a nav item of the app named `applicationName` goes when the nav item moved: the move and the
 * app in `apps` that it moved to. Null when the nav item did not move, `apps` lacks the old app or the old app still
 * has the nav item (same label), or `apps` lacks the new app. It reads the old app's nav items only for a moved nav item.
 */
export async function ResolveMovedNavItem<T extends MovedNavItemApp>(
  applicationName: string,
  navItemName: string,
  apps: readonly T[]
): Promise<ResolvedMovedNavItem<T> | null> {
  const moved = FindMovedNavItem(applicationName, navItemName);
  if (!moved) {
    return null;
  }
  const oldApp = apps.find(app => sameName(app.Name, moved.FromApplication));
  if (!oldApp || (await oldApp.GetNavItems()).some(item => item.Label === navItemName)) {
    return null;
  }
  const newApp = FindMovedNavItemApp(moved, apps);
  return newApp ? { Move: moved, App: newApp } : null;
}

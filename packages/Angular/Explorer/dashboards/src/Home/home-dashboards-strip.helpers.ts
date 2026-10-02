/**
 * @fileoverview Pure logic for the Dashboards strip on Home: the Continue dashboard, the favorite
 * dashboards, and the counts on the Browse all row.
 */
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { IsBrowsableDashboard } from '../DashboardBrowser/dashboard-library-filter';
import { ContinueDashboards, FavoriteDashboards, SharedWithMe } from '../DashboardBrowser/dashboards-overview.helpers';

/** What the Dashboards strip shows. */
export interface HomeDashboardStrip {
  /** The dashboard the user opened most recently, or null. */
  Continue: MJDashboardEntity | null;
  /** The favorite dashboards, in favorites order. */
  Favorites: MJDashboardEntity[];
  /** How many dashboards the user can open. */
  TotalCount: number;
  /** How many of those dashboards other people own. */
  SharedCount: number;
}

/**
 * Builds the strip from the dashboards the user can open. Only Config dashboards count, as in the
 * Dashboards app. Continue is the first of `recentIds` (most recent first) that is one of those
 * dashboards, so a deleted, unshared or Code dashboard does not take its place.
 */
export function BuildHomeDashboardStrip(
  accessible: MJDashboardEntity[],
  recentIds: string[],
  favoriteIds: string[],
  currentUserId: string
): HomeDashboardStrip {
  const dashboards = accessible.filter(IsBrowsableDashboard);
  return {
    Continue: ContinueDashboards(dashboards, recentIds, 1)[0] ?? null,
    Favorites: FavoriteDashboards(dashboards, favoriteIds),
    TotalCount: dashboards.length,
    SharedCount: SharedWithMe(dashboards, currentUserId).length,
  };
}

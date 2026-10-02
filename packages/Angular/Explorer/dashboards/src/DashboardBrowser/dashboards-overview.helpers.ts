/**
 * @fileoverview Pure logic for the Dashboards app's Overview page: the Continue, Favorites and
 * Shared with you lists, and the category path shown under a dashboard's name.
 */
import type { MJDashboardCategoryEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/** Separator between category names in a category path. */
const CATEGORY_PATH_SEPARATOR = ' › ';

/** Recently opened dashboards, in recents order, limited to `max`. Ids not in `all` are skipped. */
export function ContinueDashboards(all: MJDashboardEntity[], recentIds: string[], max: number): MJDashboardEntity[] {
  return pickInOrder(all, recentIds, max);
}

/** Dashboards owned by someone else, in the order of `all`. */
export function SharedWithMe(all: MJDashboardEntity[], currentUserId: string): MJDashboardEntity[] {
  return all.filter(d => !UUIDsEqual(d.UserID, currentUserId));
}

/** The favorite dashboards, in the order of `favoriteIds`. Ids not in `all` are skipped. */
export function FavoriteDashboards(all: MJDashboardEntity[], favoriteIds: string[]): MJDashboardEntity[] {
  return pickInOrder(all, favoriteIds, Number.POSITIVE_INFINITY);
}

/** A copy of `dashboards`, the most recently updated first. */
export function NewestFirst(dashboards: MJDashboardEntity[]): MJDashboardEntity[] {
  return [...dashboards].sort((a, b) => new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime());
}

/**
 * The category names from the top category down to `categoryId`, joined with " › ". Returns null
 * when `categoryId` is empty or not in `categories`. Stops at a category it has already visited.
 */
export function CategoryPath(categoryId: string | null, categories: MJDashboardCategoryEntity[]): string | null {
  const names: string[] = [];
  const visited = new Set<MJDashboardCategoryEntity>();
  let current = categoryId ? categories.find(c => UUIDsEqual(c.ID, categoryId)) : undefined;
  while (current && !visited.has(current)) {
    visited.add(current);
    names.unshift(current.Name);
    const parentId = current.ParentID;
    current = parentId ? categories.find(c => UUIDsEqual(c.ID, parentId)) : undefined;
  }
  return names.length ? names.join(CATEGORY_PATH_SEPARATOR) : null;
}

/** The dashboards named by `ids`, in that order, each once, at most `max`. Unknown ids are skipped. */
function pickInOrder(all: MJDashboardEntity[], ids: string[], max: number): MJDashboardEntity[] {
  const picked: MJDashboardEntity[] = [];
  for (const id of ids) {
    if (picked.length >= max) {
      break;
    }
    const hit = all.find(d => UUIDsEqual(d.ID, id));
    if (hit && !picked.includes(hit)) {
      picked.push(hit);
    }
  }
  return picked;
}

/**
 * @fileoverview Pure logic for the Dashboards app's Categories page: the category tree as rows,
 * the dashboard count of each category, and which categories can be deleted.
 *
 * A row's dashboard count follows the rules of the Browse page, so it equals the number of
 * dashboards Browse shows when the category is opened there.
 */
import type { MJDashboardCategoryEntity, MJDashboardCategoryLinkEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { CountDashboardsByCategory, EffectiveCategoryId } from './dashboard-library-filter';

/** The longest name the MJ: Dashboard Categories entity stores. */
export const CATEGORY_NAME_MAX_LENGTH = 100;

/** One row of the Categories page. */
export interface CategoryRow {
  Category: MJDashboardCategoryEntity;
  /** 0 for a top-level category, 1 for its sub-categories, and so on. */
  Depth: number;
  /** The Config dashboards Browse shows in this category. */
  DashboardCount: number;
  /** The direct sub-categories. */
  SubCategoryCount: number;
  /** True when the user owns the category and it holds no sub-categories and no dashboards of any type. */
  CanDelete: boolean;
}

/**
 * The category each shared dashboard shows under for the user: the category the user filed it in
 * (an MJ: Dashboard Category Links row of the user), or null for the root. Dashboards the user owns
 * are not in the map; they show under their own category.
 */
export function BuildEffectiveCategoryMap(
  dashboards: MJDashboardEntity[],
  links: MJDashboardCategoryLinkEntity[],
  currentUserId: string
): Map<string, string | null> {
  const userLinks = links.filter(l => UUIDsEqual(l.UserID, currentUserId));
  const map = new Map<string, string | null>();
  for (const dashboard of dashboards) {
    if (UUIDsEqual(dashboard.UserID, currentUserId)) {
      continue;
    }
    const filed = userLinks.find(l => UUIDsEqual(l.DashboardID, dashboard.ID));
    map.set(dashboard.ID, filed ? filed.DashboardCategoryID : null);
  }
  return map;
}

/**
 * The category tree as rows, depth first, each level sorted by name. A category whose parent is not
 * in `categories` is shown at the top level. Categories that only reach each other through their
 * parents are not shown.
 */
export function BuildCategoryRows(
  categories: MJDashboardCategoryEntity[],
  dashboards: MJDashboardEntity[],
  effectiveCategoryMap: Map<string, string | null>,
  currentUserId: string
): CategoryRow[] {
  const counts = CountDashboardsByCategory(dashboards, categories, effectiveCategoryMap).ByCategory;
  const rows: CategoryRow[] = [];
  const visited = new Set<MJDashboardCategoryEntity>();
  const visit = (category: MJDashboardCategoryEntity, depth: number): void => {
    if (visited.has(category)) {
      return;
    }
    visited.add(category);
    const children = sortByName(categories.filter(c => c.ParentID != null && UUIDsEqual(c.ParentID, category.ID)));
    rows.push({
      Category: category,
      Depth: depth,
      DashboardCount: counts.get(category.ID) ?? 0,
      SubCategoryCount: children.length,
      CanDelete: UUIDsEqual(category.UserID, currentUserId) && children.length === 0 && !holdsDashboards(category, dashboards, effectiveCategoryMap),
    });
    children.forEach(child => visit(child, depth + 1));
  };
  sortByName(categories.filter(c => isTopLevel(c, categories))).forEach(c => visit(c, 0));
  return rows;
}

/** The row's summary line, for example "3 dashboards · 1 sub-category". */
export function CategoryRowSummary(row: CategoryRow): string {
  const dashboards = `${row.DashboardCount} ${row.DashboardCount === 1 ? 'dashboard' : 'dashboards'}`;
  if (!row.SubCategoryCount) {
    return dashboards;
  }
  return `${dashboards} · ${row.SubCategoryCount} ${row.SubCategoryCount === 1 ? 'sub-category' : 'sub-categories'}`;
}

/** True when a dashboard of any type is in the category, or is filed there by the user. */
function holdsDashboards(
  category: MJDashboardCategoryEntity,
  dashboards: MJDashboardEntity[],
  effectiveCategoryMap: Map<string, string | null>
): boolean {
  return dashboards.some(d => UUIDsEqual(d.CategoryID, category.ID) || UUIDsEqual(EffectiveCategoryId(d, effectiveCategoryMap), category.ID));
}

/** True when a category has no parent, or its parent is not in `categories`. */
function isTopLevel(category: MJDashboardCategoryEntity, categories: MJDashboardCategoryEntity[]): boolean {
  return category.ParentID == null || !categories.some(c => UUIDsEqual(c.ID, category.ParentID));
}

function sortByName(categories: MJDashboardCategoryEntity[]): MJDashboardCategoryEntity[] {
  return [...categories].sort((a, b) => a.Name.localeCompare(b.Name));
}

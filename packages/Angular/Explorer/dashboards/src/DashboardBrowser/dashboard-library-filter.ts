/**
 * @fileoverview Pure logic for the Library page of the Dashboards app: the order of its dashboards,
 * the list each rail item shows, the empty state of each list, the rail sections and their counts,
 * the rail item ids, and the `lib` / `category` query params.
 *
 * Every Library filter and Uncategorized is a flat list; only a category opens as a folder. Counts
 * follow the same rules as `mj-dashboard-browser`, so a rail badge equals the number of dashboard
 * cards the browser shows when that item is clicked: only Config dashboards count, and a category
 * or Uncategorized shows the dashboards whose effective category it is.
 */
import type { MJDashboardCategoryEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { MJLeftNavItem, MJLeftNavSection } from '@memberjunction/ng-ui-components';

/** The Library filters, in rail order. */
export const DASHBOARD_LIBRARY_FILTERS = ['all', 'mine', 'shared', 'favorites', 'recent'] as const;

/** A Library filter in the Library rail. */
export type DashboardLibraryFilter = (typeof DASHBOARD_LIBRARY_FILTERS)[number];

/** True when `value` is one of the Library filters (exact, case-sensitive). */
export function IsDashboardLibraryFilter(value: unknown): value is DashboardLibraryFilter {
  return typeof value === 'string' && (DASHBOARD_LIBRARY_FILTERS as readonly string[]).includes(value);
}

/** What the Library filters need to know about the current user. */
export interface LibraryFilterContext {
  CurrentUserId: string;
  FavoriteIds: string[];
  /** Recently opened dashboard ids, most recent first. */
  RecentIds: string[];
}

/** Where the Library is: a Library filter, or (with the All filter) a category or Uncategorized. */
export interface BrowseLocation {
  Filter: DashboardLibraryFilter;
  /** The selected category, UNCATEGORIZED_CATEGORY_ID for Uncategorized, or null for none. */
  CategoryId: string | null;
}

/** The `category` value of the Uncategorized list: the dashboards in no category. */
export const UNCATEGORIZED_CATEGORY_ID = 'uncategorized';

/** Category counts for the rail, keyed by the category's own id. */
export interface CategoryCounts {
  ByCategory: Map<string, number>;
  Uncategorized: number;
}

const LIBRARY_RAIL_PREFIX = 'lib:';
const CATEGORY_RAIL_PREFIX = 'cat:';
const UNCATEGORIZED_RAIL_ID = 'cat:unc';

const LIBRARY_ITEMS: Array<[DashboardLibraryFilter, string, string]> = [
  ['all', 'All dashboards', 'fa-solid fa-layer-group'],
  ['mine', 'My dashboards', 'fa-solid fa-user'],
  ['shared', 'Shared with me', 'fa-solid fa-inbox'],
  ['favorites', 'Favorites', 'fa-solid fa-star'],
  ['recent', 'Recently opened', 'fa-solid fa-clock-rotate-left'],
];

/** The dashboards a Library filter keeps, in the order given. `recent` follows the recents order. */
export function FilterDashboardsForLibrary(
  dashboards: MJDashboardEntity[],
  filter: DashboardLibraryFilter,
  ctx: LibraryFilterContext
): MJDashboardEntity[] {
  switch (filter) {
    case 'mine':
      return dashboards.filter(d => UUIDsEqual(d.UserID, ctx.CurrentUserId));
    case 'shared':
      return dashboards.filter(d => !UUIDsEqual(d.UserID, ctx.CurrentUserId));
    case 'favorites':
      return dashboards.filter(d => ctx.FavoriteIds.some(id => UUIDsEqual(id, d.ID)));
    case 'recent':
      return pickInOrder(dashboards, ctx.RecentIds);
    default:
      return dashboards;
  }
}

/** The dashboards named by `ids`, in that order, each once. Unknown ids are skipped. */
function pickInOrder(dashboards: MJDashboardEntity[], ids: string[]): MJDashboardEntity[] {
  const picked: MJDashboardEntity[] = [];
  for (const id of ids) {
    const hit = dashboards.find(d => UUIDsEqual(d.ID, id));
    if (hit && !picked.includes(hit)) {
      picked.push(hit);
    }
  }
  return picked;
}

/** True for the dashboards `mj-dashboard-browser` shows: Config dashboards. */
export function IsBrowsableDashboard(dashboard: MJDashboardEntity): boolean {
  return dashboard.Type === 'Config';
}

/** For each Library filter, the number of dashboards the browser shows for it. */
export function CountLibraryDashboards(
  dashboards: MJDashboardEntity[],
  ctx: LibraryFilterContext
): Record<DashboardLibraryFilter, number> {
  const browsable = dashboards.filter(IsBrowsableDashboard);
  const count = (filter: DashboardLibraryFilter): number => FilterDashboardsForLibrary(browsable, filter, ctx).length;
  return { all: count('all'), mine: count('mine'), shared: count('shared'), favorites: count('favorites'), recent: count('recent') };
}

/**
 * The category a dashboard shows under. A dashboard in `effectiveCategoryMap` (a shared one) uses
 * the mapped value, where null means the root; any other dashboard uses its own CategoryID.
 */
export function EffectiveCategoryId(dashboard: MJDashboardEntity, effectiveCategoryMap: Map<string, string | null>): string | null {
  if (effectiveCategoryMap.has(dashboard.ID)) {
    return effectiveCategoryMap.get(dashboard.ID) || null;
  }
  return dashboard.CategoryID || null;
}

/**
 * The Library's default order: favorites first, then the dashboards the user opened, the most recent
 * open first, then the rest. Within each group a dashboard opened more recently comes first;
 * dashboards never opened follow, the most recently updated first, then by name. Returns a new array.
 */
export function OrderLibraryDashboards(dashboards: readonly MJDashboardEntity[], ctx: LibraryFilterContext): MJDashboardEntity[] {
  const favorites = new Set(ctx.FavoriteIds.map(id => NormalizeUUID(id)));
  const ranks = recentRanks(ctx.RecentIds);
  return dashboards
    .map(dashboard => ({ dashboard, key: libraryOrderKey(dashboard, favorites, ranks) }))
    .sort((a, b) => compareLibraryOrderKeys(a.key, b.key))
    .map(entry => entry.dashboard);
}

/** What the Library sorts a dashboard by. */
interface LibraryOrderKey {
  Favorite: boolean;
  /** Position in the recents (0 = opened last); Infinity when never opened. */
  RecentRank: number;
  /** Last update in ms since the epoch; 0 when unknown. */
  UpdatedAt: number;
  Name: string;
}

function libraryOrderKey(dashboard: MJDashboardEntity, favorites: ReadonlySet<string>, ranks: ReadonlyMap<string, number>): LibraryOrderKey {
  const id = NormalizeUUID(dashboard.ID);
  return {
    Favorite: favorites.has(id),
    RecentRank: ranks.get(id) ?? Number.POSITIVE_INFINITY,
    UpdatedAt: timeOf(dashboard.__mj_UpdatedAt),
    Name: dashboard.Name ?? '',
  };
}

function compareLibraryOrderKeys(a: LibraryOrderKey, b: LibraryOrderKey): number {
  if (a.Favorite !== b.Favorite) return a.Favorite ? -1 : 1;
  if (a.RecentRank !== b.RecentRank) return a.RecentRank < b.RecentRank ? -1 : 1;
  if (a.UpdatedAt !== b.UpdatedAt) return b.UpdatedAt - a.UpdatedAt;
  return a.Name.localeCompare(b.Name);
}

/** Each recent id's first position, keyed by the normalized id. */
function recentRanks(recentIds: readonly string[]): Map<string, number> {
  const ranks = new Map<string, number>();
  recentIds.forEach((id, index) => {
    const key = NormalizeUUID(id);
    if (!ranks.has(key)) ranks.set(key, index);
  });
  return ranks;
}

/** Milliseconds since the epoch, or 0 for a missing or invalid date. */
function timeOf(value: Date | null | undefined): number {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

/** True when a location shows one category's folder; every other location is a flat list. */
export function IsCategoryFolderLocation(location: BrowseLocation): boolean {
  return !!location.CategoryId && location.CategoryId !== UNCATEGORIZED_CATEGORY_ID;
}

/**
 * The dashboards the Library gives the browser for a location, in display order (see
 * OrderLibraryDashboards; Recently opened keeps the order of the last opens). Uncategorized keeps the
 * dashboards in no category. A category folder gets every dashboard: the browser shows the folder's own.
 */
export function VisibleLibraryDashboards(
  dashboards: readonly MJDashboardEntity[],
  location: BrowseLocation,
  ctx: LibraryFilterContext,
  effectiveCategoryMap: Map<string, string | null>
): MJDashboardEntity[] {
  const ordered = OrderLibraryDashboards(dashboards, ctx);
  if (location.CategoryId === UNCATEGORIZED_CATEGORY_ID) {
    return ordered.filter(d => !EffectiveCategoryId(d, effectiveCategoryMap));
  }
  return FilterDashboardsForLibrary(ordered, location.Filter, ctx);
}

/** What an empty flat Library list shows. */
export interface LibraryEmptyStateText {
  Icon: string;
  Title: string;
  Message: string;
  /** True for the whole library: the browser shows its first-run welcome instead. */
  Welcome: boolean;
}

const LIBRARY_EMPTY_STATES: Record<DashboardLibraryFilter, LibraryEmptyStateText> = {
  all: { Icon: 'fa-solid fa-gauge-high', Title: 'Welcome to Dashboards', Message: '', Welcome: true },
  mine: { Icon: 'fa-solid fa-user', Title: 'You have no dashboards yet', Message: 'Create one with New.', Welcome: false },
  shared: { Icon: 'fa-solid fa-inbox', Title: 'Nothing shared with you yet', Message: 'Dashboards other people share with you appear here.', Welcome: false },
  favorites: { Icon: 'fa-solid fa-star', Title: 'No favorites yet', Message: 'Star a dashboard to keep it here.', Welcome: false },
  recent: { Icon: 'fa-solid fa-clock-rotate-left', Title: 'Nothing opened yet', Message: 'Open a dashboard and it appears here.', Welcome: false },
};

const UNCATEGORIZED_EMPTY_STATE: LibraryEmptyStateText = {
  Icon: 'fa-solid fa-folder-open',
  Title: 'No uncategorized dashboards',
  Message: 'Every dashboard is in a category.',
  Welcome: false,
};

/** The empty state of a flat Library list. */
export function LibraryEmptyState(location: BrowseLocation): LibraryEmptyStateText {
  return location.CategoryId === UNCATEGORIZED_CATEGORY_ID ? UNCATEGORIZED_EMPTY_STATE : LIBRARY_EMPTY_STATES[location.Filter];
}

/**
 * Counts the browsable dashboards directly in each category, and those at the root. A dashboard
 * whose category is not in `categories` is not counted, as the browser cannot reach it.
 */
export function CountDashboardsByCategory(
  dashboards: MJDashboardEntity[],
  categories: MJDashboardCategoryEntity[],
  effectiveCategoryMap: Map<string, string | null>
): CategoryCounts {
  const byCategory = new Map<string, number>();
  let uncategorized = 0;
  for (const dashboard of dashboards.filter(IsBrowsableDashboard)) {
    const categoryId = EffectiveCategoryId(dashboard, effectiveCategoryMap);
    if (!categoryId) {
      uncategorized++;
      continue;
    }
    const category = categories.find(c => UUIDsEqual(c.ID, categoryId));
    if (category) {
      byCategory.set(category.ID, (byCategory.get(category.ID) ?? 0) + 1);
    }
  }
  return { ByCategory: byCategory, Uncategorized: uncategorized };
}

/**
 * The rail's two sections: Dashboards (one item per Library filter) and Categories (the category
 * tree, then Uncategorized). A category whose parent is not in `categories` shows at the top level.
 */
export function BuildLibraryRailSections(
  counts: Record<DashboardLibraryFilter, number>,
  categories: MJDashboardCategoryEntity[],
  categoryCounts: Map<string, number>,
  uncategorizedCount: number
): MJLeftNavSection[] {
  const library: MJLeftNavItem[] = LIBRARY_ITEMS.map(([key, label, icon]) => ({ id: LibraryRailItemId(key), label, icon, badge: counts[key] }));
  const toItem = (c: MJDashboardCategoryEntity): MJLeftNavItem => {
    const children = categories.filter(k => k.ParentID != null && UUIDsEqual(k.ParentID, c.ID)).map(toItem);
    return { id: CategoryRailItemId(c.ID), label: c.Name, icon: 'fa-solid fa-folder', badge: categoryCounts.get(c.ID) ?? 0, ...(children.length ? { children } : {}) };
  };
  const roots = categories.filter(c => isTopLevel(c, categories)).map(toItem);
  roots.push({ id: UNCATEGORIZED_RAIL_ID, label: 'Uncategorized', icon: 'fa-solid fa-folder-open', badge: uncategorizedCount });
  return [
    { label: 'Dashboards', items: library },
    { label: 'Categories', items: roots },
  ];
}

/** True when a category has no parent, or its parent is not in `categories`. */
function isTopLevel(category: MJDashboardCategoryEntity, categories: MJDashboardCategoryEntity[]): boolean {
  return category.ParentID == null || !categories.some(c => UUIDsEqual(c.ID, category.ParentID));
}

/** The Library filter named by a `lib` query param; `all` for anything else. */
export function ParseLibraryFilter(value: string | null | undefined): DashboardLibraryFilter {
  return IsDashboardLibraryFilter(value) ? value : 'all';
}

/**
 * The location named by the `lib` and `category` query params, or null when they name none.
 * A category wins over a Library filter, since a category is only shown under All.
 */
export function ResolveBrowseLocation(params: Record<string, string>): BrowseLocation | null {
  if (params['category']) {
    return { Filter: 'all', CategoryId: params['category'] };
  }
  if (params['lib']) {
    return { Filter: ParseLibraryFilter(params['lib']), CategoryId: null };
  }
  return null;
}

/** True when two locations have the same Library filter and the same category (or both none). */
export function SameBrowseLocation(a: BrowseLocation, b: BrowseLocation): boolean {
  return a.Filter === b.Filter && UUIDsEqual(a.CategoryId, b.CategoryId);
}

/** The `lib` and `category` query params for a location. All and the root write null. */
export function LocationQueryParams(location: BrowseLocation): { lib: DashboardLibraryFilter | null; category: string | null } {
  return {
    lib: location.Filter === 'all' ? null : location.Filter,
    category: location.CategoryId || null,
  };
}

/** The rail item id for a Library filter. */
export function LibraryRailItemId(filter: DashboardLibraryFilter): string {
  return `${LIBRARY_RAIL_PREFIX}${filter}`;
}

/** The rail item id for a category. */
export function CategoryRailItemId(categoryId: string): string {
  return `${CATEGORY_RAIL_PREFIX}${categoryId}`;
}

/** The location a rail item opens, or null for an id the rail never builds. */
export function ParseRailItemId(id: string): BrowseLocation | null {
  if (id === UNCATEGORIZED_RAIL_ID) {
    return { Filter: 'all', CategoryId: UNCATEGORIZED_CATEGORY_ID };
  }
  if (id.startsWith(CATEGORY_RAIL_PREFIX)) {
    return { Filter: 'all', CategoryId: id.slice(CATEGORY_RAIL_PREFIX.length) };
  }
  if (id.startsWith(LIBRARY_RAIL_PREFIX)) {
    const filter = id.slice(LIBRARY_RAIL_PREFIX.length);
    return IsDashboardLibraryFilter(filter) ? { Filter: filter, CategoryId: null } : null;
  }
  return null;
}

/**
 * The rail item to mark active: Uncategorized, or the selected category, written with the
 * category's own id so the rail's exact id match finds it, else the Library filter.
 */
export function RailActiveItemId(location: BrowseLocation, categories: MJDashboardCategoryEntity[]): string {
  if (location.CategoryId === UNCATEGORIZED_CATEGORY_ID) {
    return UNCATEGORIZED_RAIL_ID;
  }
  if (!location.CategoryId) {
    return LibraryRailItemId(location.Filter);
  }
  const category = categories.find(c => UUIDsEqual(c.ID, location.CategoryId));
  return CategoryRailItemId(category?.ID ?? location.CategoryId);
}

/** `expandedIds` with `id` added when missing, or removed when present. */
export function ToggleExpandedId(expandedIds: string[], id: string): string[] {
  return expandedIds.includes(id) ? expandedIds.filter(x => x !== id) : [...expandedIds, id];
}

/**
 * `expandedIds` with every folder above `categoryId` expanded, so the rail shows that category.
 * Returns `expandedIds` itself when nothing changes.
 */
export function WithExpandedAncestors(
  expandedIds: string[],
  categoryId: string | null,
  categories: MJDashboardCategoryEntity[]
): string[] {
  const missing: string[] = [];
  const seen = new Set<MJDashboardCategoryEntity>();
  let current = categoryId ? categories.find(c => UUIDsEqual(c.ID, categoryId)) : undefined;
  while (current?.ParentID && !seen.has(current)) {
    seen.add(current);
    const parentId = current.ParentID;
    const parent = categories.find(c => UUIDsEqual(c.ID, parentId));
    if (parent && !expandedIds.includes(CategoryRailItemId(parent.ID))) {
      missing.unshift(CategoryRailItemId(parent.ID));
    }
    current = parent;
  }
  return missing.length ? [...expandedIds, ...missing] : expandedIds;
}

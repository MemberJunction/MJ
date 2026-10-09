/**
 * @fileoverview Pure helpers for dashboard cards and the dashboard browser: whether a dashboard has
 * no parts yet, how a last update reads, and a category's path.
 */
import type { MJDashboardCategoryEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BuildDashboardLayoutPreview } from '../layout-preview/dashboard-layout-preview';

/** Separator between category names in a category path. */
const CATEGORY_PATH_SEPARATOR = ' › ';

const DAY_MS = 24 * 60 * 60 * 1000;

/** True for a Config dashboard whose saved configuration has no panel layout: it has no parts yet. */
export function IsDashboardNotSetUp(dashboard: Pick<MJDashboardEntity, 'Type' | 'UIConfigDetails'>): boolean {
    return dashboard.Type === 'Config' && BuildDashboardLayoutPreview(dashboard.UIConfigDetails) === null;
}

/**
 * "Today", "Yesterday", "N days ago" (under a week), else the local date. A date later than `now`
 * reads "Today". Empty for no date.
 */
export function FormatDashboardDate(date: Date | null | undefined, now: Date = new Date()): string {
    if (!date) return '';
    const d = new Date(date);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / DAY_MS);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
}

/**
 * The category names from the top category down to `categoryId`, joined with " › ". Null when
 * `categoryId` is empty or not in `categories`. Stops at a category it has already visited.
 */
export function DashboardCategoryPath(categoryId: string | null, categories: readonly MJDashboardCategoryEntity[]): string | null {
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

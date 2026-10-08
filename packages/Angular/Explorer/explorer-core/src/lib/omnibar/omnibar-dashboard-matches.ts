import type { MJDashboardEntity } from '@memberjunction/core-entities';

/** The dashboard fields the palette matches on and shows. */
export interface DashboardMatchLike {
    ID: string;
    Name: string;
    Description: string | null;
    Category: string | null;
    User: string;
}

/**
 * True when the dashboard tab can render the dashboard: a Config dashboard, or a Code
 * dashboard that names its driver class. 'Dynamic Code' dashboards have no renderer.
 */
export function CanOpenInDashboardTab(dashboard: Pick<MJDashboardEntity, 'Type' | 'DriverClass'>): boolean {
    switch (dashboard.Type) {
        case 'Config':
            return true;
        case 'Code':
            return !!dashboard.DriverClass;
        default:
            return false;
    }
}

/** How well a dashboard matches the query. A higher rank lists first. */
const MatchRank = {
    ExactName: 4,
    NamePrefix: 3,
    NameContains: 2,
    DescriptionOrCategory: 1,
    None: 0,
} as const;

/**
 * Dashboards whose name, description or category contains the query, case-insensitively.
 * An exact name ranks first, then a name that starts with the query, then a name that
 * contains it, then a description or category hit. Ties keep the input order.
 * Returns at most `max` dashboards.
 */
export function MatchDashboards<T extends DashboardMatchLike>(dashboards: ReadonlyArray<T>, query: string, max: number): T[] {
    const q = query.trim().toLowerCase();
    if (!q) {
        return [];
    }
    return dashboards
        .map((d, i) => ({ d, rank: matchRank(d, q), i }))
        .filter((x) => x.rank > MatchRank.None)
        .sort((a, b) => b.rank - a.rank || a.i - b.i)
        .slice(0, max)
        .map((x) => x.d);
}

/** Dashboard matches split by what matched the query. */
export interface DashboardMatchSplit<T> {
    /** Exact, prefix and contains name matches, best first. */
    NameMatches: T[];
    /** Dashboards whose description or category matches but whose name does not, in input order. */
    DescriptionOrCategoryMatches: T[];
}

/**
 * The dashboards of {@link MatchDashboards}, split into name matches and matches on the
 * description or category only. The two lists share the `max` cap, and name matches fill it first.
 */
export function SplitDashboardMatches<T extends DashboardMatchLike>(dashboards: ReadonlyArray<T>, query: string, max: number): DashboardMatchSplit<T> {
    const q = query.trim().toLowerCase();
    const isNameMatch = (dashboard: T): boolean => matchRank(dashboard, q) > MatchRank.DescriptionOrCategory;
    const matches = MatchDashboards(dashboards, query, max);
    return {
        NameMatches: matches.filter(isNameMatch),
        DescriptionOrCategoryMatches: matches.filter((dashboard) => !isNameMatch(dashboard)),
    };
}

/** The rank of one dashboard for a trimmed, lower-case query. */
function matchRank(dashboard: DashboardMatchLike, q: string): number {
    const name = dashboard.Name.trim().toLowerCase();
    if (name === q) {
        return MatchRank.ExactName;
    }
    if (name.startsWith(q)) {
        return MatchRank.NamePrefix;
    }
    if (name.includes(q)) {
        return MatchRank.NameContains;
    }
    const description = (dashboard.Description || '').toLowerCase();
    const category = (dashboard.Category || '').toLowerCase();
    return description.includes(q) || category.includes(q) ? MatchRank.DescriptionOrCategory : MatchRank.None;
}

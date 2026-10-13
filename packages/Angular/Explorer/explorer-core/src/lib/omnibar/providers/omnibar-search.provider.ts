import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider } from '@memberjunction/core';
import { DashboardEngine } from '@memberjunction/core-entities';
import type { MentionSuggestion, ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import type { SearchResultItem } from '@memberjunction/ng-search';
import { OmnibarProvider, OMNIBAR_NAV_KEY, OmnibarNavPayload } from '../omnibar-provider';
import { CanOpenInDashboardTab, DashboardMatchLike, DashboardMatchSplit, SplitDashboardMatches } from '../omnibar-dashboard-matches';

/** Most dashboard rows in the results: name matches and description or category matches together. */
const MAX_DASHBOARD_ROWS = 3;

/** Icon per cross-source result type (matches the Search Results page vocabulary). */
function iconForResult(item: SearchResultItem): string {
    switch (item.ResultType) {
        case 'storage-file': return 'fa-solid fa-file-lines';
        case 'content-item': return 'fa-solid fa-newspaper';
        default: return 'fa-solid fa-id-card';
    }
}

/** Group label per result type — drives the palette's section headers. */
function groupForResult(item: SearchResultItem): string {
    switch (item.ResultType) {
        case 'storage-file': return 'Files';
        case 'content-item': return 'Content';
        default: return 'Records';
    }
}

/**
 * The omnibar's DEFAULT mode (empty TriggerChar): plain text = the same
 * cross-source search that backs the Search Results page (vectors + full-text +
 * entities + storage), served through `SearchService.PreviewSearch`. Matching
 * dashboards from the cached `DashboardEngine` form a "Dashboards" group: name matches
 * come before the search results, and dashboards that match only by description or
 * category come after them. Always appends a trailing "See all results" suggestion
 * that opens the full Search workspace.
 */
@RegisterClass(OmnibarProvider, 'omnibar-search')
export class OmnibarSearchProvider extends OmnibarProvider {
    public readonly TriggerChar = '';
    public readonly Key = 'omnibar-search';
    public override readonly Priority = 100;
    public readonly ModeLabel = 'Global Search';
    public override readonly Placeholder = 'Search everything — or type #, /, @ …';

    public async GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const search = this.context.Search;
        const query = request.Query.trim();
        if (!search || query.length === 0) {
            return [];
        }
        const dashboards = this.dashboardSuggestions(query, request);
        const dashboardCount = dashboards.NameMatches.length + dashboards.DescriptionOrCategoryMatches.length;
        try {
            // Search fills the rows left after the dashboards and the trailing "see all".
            const response = await search.PreviewSearch(query, Math.max(1, request.MaxResults - 1 - dashboardCount));
            const suggestions = (response.Success ? response.Results : []).map((item) => this.toSuggestion(item));
            return [...dashboards.NameMatches, ...suggestions, ...dashboards.DescriptionOrCategoryMatches, this.seeAllSuggestion(query)];
        } catch {
            // Fail soft — the palette still offers the dashboards and the full-search escape hatch.
            return [...dashboards.NameMatches, ...dashboards.DescriptionOrCategoryMatches, this.seeAllSuggestion(query)];
        }
    }

    /**
     * Dashboards the user can open in a dashboard tab whose name, description or category
     * matches the query, split into name matches and description-or-category-only matches.
     * Reads only the cached engine: returns empty lists when it is not loaded or no user
     * is known, and never loads it.
     */
    private dashboardSuggestions(query: string, request: ComposerSuggestionRequest): DashboardMatchSplit<MentionSuggestion> {
        const none: DashboardMatchSplit<MentionSuggestion> = { NameMatches: [], DescriptionOrCategoryMatches: [] };
        try {
            const engine = this.dashboardEngine(request.Provider);
            const userId = request.ContextUser?.ID ?? (request.Provider ?? this.context.Search?.Provider)?.CurrentUser?.ID;
            if (!userId || !engine.Loaded) {
                return none;
            }
            const openable = engine.GetAccessibleDashboards(userId).filter(CanOpenInDashboardTab);
            const matches = SplitDashboardMatches(openable, query, MAX_DASHBOARD_ROWS);
            return {
                NameMatches: matches.NameMatches.map((d) => this.toDashboardSuggestion(d)),
                DescriptionOrCategoryMatches: matches.DescriptionOrCategoryMatches.map((d) => this.toDashboardSuggestion(d)),
            };
        } catch {
            return none;
        }
    }

    /** The DashboardEngine for the request's provider, else the global instance. */
    private dashboardEngine(provider: IMetadataProvider | null): DashboardEngine {
        return provider
            ? DashboardEngine.GetProviderInstance<DashboardEngine>(provider, DashboardEngine) as DashboardEngine
            : DashboardEngine.Instance;
    }

    private toDashboardSuggestion(dashboard: DashboardMatchLike): MentionSuggestion {
        const nav: OmnibarNavPayload = { kind: 'dashboard', dashboardId: dashboard.ID, dashboardName: dashboard.Name };
        return {
            type: 'dashboard',
            id: `dashboard:${dashboard.ID}`,
            name: dashboard.Name,
            displayName: dashboard.Name,
            description: [dashboard.Category, dashboard.User].filter(Boolean).join(' · '),
            icon: 'fa-solid fa-gauge-high',
            data: { [OMNIBAR_NAV_KEY]: nav, group: 'Dashboards' },
        };
    }

    private toSuggestion(item: SearchResultItem): MentionSuggestion {
        const isFile = item.ResultType === 'storage-file';
        const nav: OmnibarNavPayload = isFile
            ? { kind: 'file', fileName: item.Title, rawMetadata: item.RawMetadata }
            : { kind: 'record', entityName: item.EntityName, recordId: item.RecordID };
        return {
            type: groupForResult(item).toLowerCase(),
            id: `${item.EntityName}:${item.RecordID}`,
            name: item.Title,
            displayName: item.Title,
            description: item.Snippet || item.EntityName,
            icon: iconForResult(item),
            data: {
                [OMNIBAR_NAV_KEY]: nav,
                group: groupForResult(item),
                score: item.Score,
            },
        };
    }

    private seeAllSuggestion(query: string): MentionSuggestion {
        const nav: OmnibarNavPayload = { kind: 'search', query };
        return {
            type: 'see-all',
            id: `see-all:${query}`,
            name: `See all results for “${query}”`,
            displayName: `See all results for “${query}”`,
            description: 'Opens the full Search Results workspace with scopes & relevance controls',
            icon: 'fa-solid fa-arrow-right',
            data: { [OMNIBAR_NAV_KEY]: nav, group: '' },
        };
    }
}

/** Tree-shaking guard — referenced by LoadOmnibarProviders(). */
export function LoadOmnibarSearchProvider(): void {
    // intentional no-op
}

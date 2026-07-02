import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ElementRef, NgZone, HostListener, ViewChild } from '@angular/core';
import { CodeEditorComponent } from '@memberjunction/ng-code-editor';
import { Subject } from 'rxjs';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { Metadata, CompositeKey, RunQuery, RunQueryResult } from '@memberjunction/core';
import { TreeBranchConfig } from '@memberjunction/ng-trees';
import { ResourceData, UserInfoEngine, MJQueryEntityExtended, MJQueryCategoryEntity, QueryEngine } from '@memberjunction/core-entities';
import {
    QueryEntityLinkClickEvent,
    QueryRowClickEvent
} from '@memberjunction/ng-query-viewer';
import { CompositionTokenClickEvent } from '@memberjunction/ng-code-editor';
import { validateStringParam, boundNameList } from '../shared/agent-tool-validation';
import {
    DEFAULT_QUERY_MAX_ROWS,
    QUERY_MAX_ROWS_HARD_CAP,
    DEFAULT_QUERY_PAGE_SIZE,
    normalizeMaxRows,
    computePaging,
    boundResultRows,
    normalizeQueryParameters,
    resolveTotalRowCount,
} from './query-execution-helpers';
/**
 * Tree node for the query category hierarchy
 */
interface CategoryNode {
    category: MJQueryCategoryEntity;
    children: CategoryNode[];
    queries: MJQueryEntityExtended[];
    expanded: boolean;
    level: number;
}

/**
 * Tolerant result returned by the stored-query execution tools (RunStoredQuery /
 * PageQueryResults). Results are ALWAYS bounded to the hard cap; SQL is never
 * included.
 */
interface QueryExecutionToolResult {
    Success: boolean;
    Results?: unknown[];
    /** Rows actually returned in this (bounded) response. */
    RowCount?: number;
    /**
     * The TRUE total number of rows the query would return, independent of the
     * MaxRows / page cap — read from RunQueryResult.TotalRowCount. This is what
     * answers "how many rows does this query return?".
     */
    TotalRowCount?: number;
    PageNumber?: number;
    PageSize?: number;
    ErrorMessage?: string;
}

/** A single query parameter definition surfaced by GetQueryMetadata (no SQL). */
interface QueryParameterMetadata {
    Name: string;
    Type: 'array' | 'boolean' | 'date' | 'number' | 'string';
    IsRequired: boolean;
    Description: string | null;
}

/** Result returned by GetQueryMetadata — definitions only, never SQL or data. */
interface QueryMetadataToolResult {
    Success: boolean;
    QueryName?: string;
    Description?: string | null;
    Parameters?: QueryParameterMetadata[];
    Fields?: string[];
    ErrorMessage?: string;
}

/**
 * A resource component for browsing and executing stored queries.
 * Features:
 * - Hierarchical category navigation
 * - Query search
 * - Query viewer with parameter input
 * - Entity linking for clickable record IDs
 */
@RegisterClass(BaseResourceComponent, 'QueryBrowserResource')
@Component({
  standalone: false,
    selector: 'mj-query-browser-resource',
    templateUrl: './query-browser-resource.component.html',
    styleUrls: ['./query-browser-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueryBrowserResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    private static readonly SETTINGS_KEY = 'QueryBrowser/panelWidth';
    private static readonly STATUS_FILTERS_KEY = 'QueryBrowser/statusFilters';
    private static readonly EXPANDED_STATE_KEY = 'QueryBrowser/expandedCategories';
    private static readonly DEFAULT_PANEL_WIDTH = 320;
    private static readonly MIN_PANEL_WIDTH = 200;
    private static readonly MAX_PANEL_WIDTH = 600;

    public isLoading = true;
    public categories: MJQueryCategoryEntity[] = [];
    public categoryTree: CategoryNode[] = [];
    /** All queries the user has permission to run */
    public queries: MJQueryEntityExtended[] = [];
    public filteredQueries: MJQueryEntityExtended[] = [];
    private filteredQueryIds = new Set<string>();
    public selectedQuery: MJQueryEntityExtended | null = null;
    public searchText = '';
    public PanelWidth = QueryBrowserResourceComponent.DEFAULT_PANEL_WIDTH;
    public IsResizing = false;

    /** Status filter toggles — which statuses to show in the tree */
    public StatusFilters: Record<string, boolean> = {
        'Approved': true,
        'Pending': false,
        'Rejected': false,
        'Expired': false
    };

    /** Ordered list of all possible statuses for the filter bar */
    public readonly AllStatuses: string[] = ['Approved', 'Pending', 'Rejected', 'Expired'];

    /** Tracks expanded state by category ID — persisted across sessions */
    private expandedState = new Map<string, boolean>();

    /**
     * The id/name of the most recent query executed via an agent execution tool
     * (RunStoredQuery / PageQueryResults). Published in the agent context so the
     * agent has continuity ("the query I just ran") WITHOUT ever putting result
     * data or SQL into the always-on snapshot. Null until the first execution.
     */
    private lastExecutedQueryId: string | null = null;
    private lastExecutedQueryName: string | null = null;

    /**
     * The embedded query VIEWER's executed state for the CURRENTLY SELECTED
     * query, captured from its QueryComplete output. The viewer auto-runs on
     * select (when params are satisfied) or on user-run, at which point it emits
     * its result and we record the TRUE total row count here. Reset to "not run"
     * whenever the selection changes so the published context never reports a
     * stale count for a freshly-selected query.
     *
     * 🚨 SAFETY: only the COUNT + a has-run flag are kept — never SQL, never the
     * result rows. These feed `SelectedQueryHasRun` / `SelectedQueryRowCount`
     * in the agent context so the agent can answer "how many rows" from context
     * WITHOUT re-running, while honoring the same no-SQL / no-rows boundary.
     */
    private selectedQueryHasRun = false;
    private selectedQueryRowCount: number | null = null;

    private metadata = this.ProviderToUse;
    protected override destroy$ = new Subject<void>();
    private dataLoaded = false;

    // Bound event handlers for resize (need references for removeEventListener)
    private boundOnResizeMove = this.onResizeMove.bind(this);
    private boundOnResizeEnd = this.onResizeEnd.bind(this);

    // ========================================
    // Drawer State (Create / Edit)
    // ========================================

    public ShowQueryDrawer = false;
    public DrawerMode: 'create' | 'edit' = 'create';
    public DrawerQueryId: string | null = null;
    public DrawerName = '';
    public DrawerSQL = '';
    @ViewChild('drawerSqlEditor') private drawerSqlEditor: CodeEditorComponent | null = null;
    public DrawerDescription = '';
    public DrawerCategoryID = '';
    public DrawerStatus: 'Pending' | 'Approved' | 'Rejected' | 'Expired' = 'Pending';
    public DrawerReusable = false;
    public IsSavingDrawer = false;
    public DrawerNameError = false;
    public DrawerSaveError: string | null = null;

    /** Ordered status options for the drawer dropdown — all valid Query statuses */
    public readonly DrawerStatuses: Array<'Pending' | 'Approved' | 'Rejected' | 'Expired'> =
        ['Pending', 'Approved', 'Rejected', 'Expired'];

    private initialDrawerSnapshot = '';

    /** The category ID of the most recently interacted-with folder in the tree */
    private activeCategoryID: string | null = null;

    /** Tree dropdown config for Query Categories (branches only, no leaves) */
    public CategoryBranchConfig: TreeBranchConfig = {
        EntityName: 'MJ: Query Categories',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    /** The DrawerCategoryID as a CompositeKey for the tree dropdown binding */
    public get DrawerCategoryIDAsKey(): CompositeKey | null {
        return this.DrawerCategoryID ? CompositeKey.FromID(this.DrawerCategoryID) : null;
    }

    constructor(
        private cdr: ChangeDetectorRef,
        private elementRef: ElementRef,
        private zone: NgZone
    ) {
        super();
    }

    ngOnInit(): void {
        super.ngOnInit();
        this.loadSavedPanelWidth();
        this.loadSavedStatusFilters();
        this.loadSavedExpandedState();
        this.registerAgentClientTools();
        this.loadData();
    }

    // ================================================================
    // AI Agent Context & Client Tools
    //
    // 🚨 SAFETY BOUNDARY — CATALOG NAVIGATION + BOUNDED STORED-QUERY EXECUTION 🚨
    // Query Browser is an ADMIN surface backed by a stored-query catalog. The
    // agent context + client tools fall into two safe tiers:
    //
    // TIER 1 — Navigational / read-only catalog tools (search, filter by
    //   status/category, select to view, open record, clear filters,
    //   expand/collapse, refresh). These never execute anything.
    //
    // TIER 2 — Bounded execution of *STORED* queries only:
    //   • RunStoredQuery — runs a pre-vetted, permission-checked stored query
    //     and returns AT MOST QUERY_MAX_ROWS_HARD_CAP rows.
    //   • GetQueryMetadata — returns a query's parameter + field definitions so
    //     the agent knows what to pass / what it returns. No SQL, no data.
    //   • PageQueryResults — same stored query, offset by page (StartRow).
    //   Why this is safe: stored queries are pre-authored SELECTs, permission-
    //   gated (we DEFENSIVELY re-check UserCanRun before every run), and the
    //   server rejects mutations via SQLExpressionValidator on a read-only
    //   connection. Results are HARD-CAPPED so the agent can't exfiltrate a
    //   whole table. We resolve queries ONLY from `this.queries` — the list
    //   already filtered to what the current user may run.
    //
    // DELIBERATELY STILL NOT exposed to the agent (do NOT wire any of these):
    //   • RAW / AD-HOC SQL execution — RunQueryParams.SQL is NEVER set from a
    //     tool. The agent cannot supply arbitrary SQL; it may only name a
    //     stored query. Arbitrary SQL against the DB is exactly what this
    //     boundary exists to prevent.
    //   • Creating / editing / deleting queries (the drawer + SaveDrawer path).
    //   • Exposing SQL TEXT in context or tool output (definitions/params only).
    //   • Putting query RESULT data or SQL into the PUBLISHED CONTEXT — results
    //     flow back only as a tool's return value (bounded), never streamed in
    //     the always-on context snapshot.
    //
    // Selecting/opening a query only DISPLAYS its definition; it never executes
    // it. Context exposes catalog metadata (query/category names, counts, filter
    // state) plus the LAST-EXECUTED query id/name — never SQL or result data.
    //
    // SELECTED-QUERY ROW COUNT: the embedded viewer auto-runs the selected query
    // (when params are satisfied) and emits its result via QueryComplete. We
    // capture ONLY the COUNT (TotalRowCount) + a has-run flag from that event and
    // publish them as SelectedQueryHasRun / SelectedQueryRowCount so the agent can
    // answer "how many rows?" from context without re-running. Still NO SQL and NO
    // result rows — the same boundary as everything else here.
    // ================================================================

    /**
     * Publish the current Query Browser state to the AI agent. Re-invoked on
     * every meaningful state change (selection, search, refresh, filter). Only
     * catalog METADATA is exposed — query NAMES, CATEGORY names, counts, and the
     * active filter state — NEVER SQL text or query RESULTS. Name lists are
     * bounded (see {@link AGENT_CONTEXT_NAME_LIST_CAP}); companion total/filtered
     * counts tell the agent the true sizes when the lists are truncated.
     */
    private publishAgentContext(): void {
        // Active status filters (the statuses currently toggled ON in the tree).
        const activeStatusFilters = this.AllStatuses.filter(s => this.StatusFilters[s] === true);

        // Bounded list of category names the user can navigate (excludes the
        // virtual Uncategorized bucket, which has no real category record).
        const categoryNames = boundNameList(
            this.categories.map(c => c.Name).filter((n): n is string => !!n)
        );

        // Bounded list of the query names currently visible (status + search
        // filters applied) — what the agent would see in the tree right now.
        const visibleQueryNames = boundNameList(this.filteredQueries.map(q => q.Name));

        // Whether the SELECTED query has actually executed in the embedded viewer
        // and, if so, its TRUE total row count. Only meaningful while a query is
        // selected; null/false otherwise. NO SQL, NO rows — just the count + flag.
        const hasSelection = this.selectedQuery != null;
        const selectedQueryHasRun = hasSelection && this.selectedQueryHasRun;
        const selectedQueryRowCount = selectedQueryHasRun ? this.selectedQueryRowCount : null;

        this.navigationService.SetAgentContext(this, {
            // — Selection —
            SelectedQueryId: this.selectedQuery?.ID ?? null,
            SelectedQueryName: this.selectedQuery?.Name ?? null,
            SelectedCategory: this.selectedQuery?.Category ?? null,
            // — Selected query's executed row count (when run in the viewer) —
            // The agent can answer "how many rows?" from these WITHOUT re-running.
            // SelectedQueryHasRun=false means "select-only; run it to get the count"
            // (the agent can then call RunStoredQuery and read TotalRowCount).
            SelectedQueryHasRun: selectedQueryHasRun,
            SelectedQueryRowCount: selectedQueryRowCount,
            // — Filter state —
            SearchText: this.searchText,
            ActiveStatusFilters: activeStatusFilters,
            // — Counts —
            TotalQueryCount: this.queries.length,
            FilteredQueryCount: this.filteredQueries.length,
            CategoryCount: this.categories.length,
            // — Bounded navigable name lists (NO SQL, NO results) —
            AvailableCategories: categoryNames,
            VisibleQueryNames: visibleQueryNames,
            // — Last execution continuity (identity ONLY — never SQL or rows) —
            LastExecutedQueryId: this.lastExecutedQueryId,
            LastExecutedQueryName: this.lastExecutedQueryName,
        });
    }

    /**
     * Register the read-only / navigational client tools the agent may invoke.
     * Every Handler is tolerant: validates input and returns
     * `{ Success: false, ErrorMessage }` rather than throwing. No tool here runs
     * a query.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SearchQueries',
                Description: 'Free-text search across the stored-query catalog (name, description, category). Read-only — does not run any query.',
                ParameterSchema: { type: 'object', properties: { searchText: { type: 'string' } }, required: ['searchText'] },
                Handler: async (params: Record<string, unknown>) => this.handleSearchTool(params),
            },
            {
                Name: 'FilterQueriesByStatus',
                Description: 'Show only queries with the given status in the catalog tree. Valid values: Approved, Pending, Rejected, Expired.',
                ParameterSchema: { type: 'object', properties: { status: { type: 'string', enum: ['Approved', 'Pending', 'Rejected', 'Expired'] } }, required: ['status'] },
                Handler: async (params: Record<string, unknown>) => this.handleFilterByStatusTool(params),
            },
            {
                Name: 'FilterQueriesByCategory',
                Description: 'Narrow the visible catalog to a single category by its NAME (case-insensitive). Use AvailableCategories from context for valid names. Read-only navigation.',
                ParameterSchema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
                Handler: async (params: Record<string, unknown>) => this.handleFilterByCategoryTool(params),
            },
            {
                Name: 'SelectQuery',
                Description: 'Open a stored query in the viewer by its NAME or ID. This only DISPLAYS the query definition; it does NOT run the query.',
                ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
                Handler: async (params: Record<string, unknown>) => this.handleSelectQueryTool(params),
            },
            {
                Name: 'OpenQuery',
                Description: 'Open the full query record (for viewing/editing in its own tab) by query NAME or ID. Opens the entity form; it does NOT run the query.',
                ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
                Handler: async (params: Record<string, unknown>) => this.handleOpenQueryTool(params),
            },
            {
                Name: 'ClearQueryFilters',
                Description: 'Clear the search text and reset status filters to the default (Approved only). Read-only navigation.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleClearFiltersTool(),
            },
            {
                Name: 'ExpandAllCategories',
                Description: 'Expand every category node in the catalog tree so all queries are visible. Read-only navigation.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleExpandAllTool(),
            },
            {
                Name: 'CollapseAllCategories',
                Description: 'Collapse every category node in the catalog tree. Read-only navigation.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleCollapseAllTool(),
            },
            {
                Name: 'RefreshQueries',
                Description: 'Reload the stored-query catalog from the server. Read-only.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleRefreshTool(),
            },
            // ---- TIER 2: bounded execution of STORED queries only (see SAFETY BOUNDARY) ----
            {
                Name: 'GetQueryMetadata',
                Description: 'Return a stored query\'s parameter definitions (Name/Type/IsRequired/Description) and result field names, plus its description — so you know what to pass to RunStoredQuery and what columns it returns. Identify the query by NAME or ID. Does NOT run the query and NEVER returns SQL text.',
                ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
                Handler: async (params: Record<string, unknown>) => this.handleGetQueryMetadataTool(params),
            },
            {
                Name: 'RunStoredQuery',
                Description: `Execute a PRE-VETTED, permission-checked STORED query (by NAME or ID) and return bounded results. Optional Parameters object is passed to the query's template parameters (see GetQueryMetadata). MaxRows defaults to ${DEFAULT_QUERY_MAX_ROWS} and is hard-capped at ${QUERY_MAX_ROWS_HARD_CAP}. You CANNOT supply raw SQL — only name an existing stored query. Returns { Success, Results, RowCount, TotalRowCount, ErrorMessage? }, where RowCount = rows returned (bounded by MaxRows) and TotalRowCount = the total rows the query would return overall. To answer "how many rows does this query return?", run it and read TotalRowCount.`,
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                        Parameters: { type: 'object' },
                        MaxRows: { type: 'number' },
                    },
                    required: ['query'],
                },
                Handler: async (params: Record<string, unknown>) => this.handleRunStoredQueryTool(params),
            },
            {
                Name: 'PageQueryResults',
                Description: `Run the same STORED query (by NAME or ID) for a given 1-based PageNumber, returning that page of bounded results. PageSize defaults to ${DEFAULT_QUERY_PAGE_SIZE} and is hard-capped at ${QUERY_MAX_ROWS_HARD_CAP}. Optional Parameters as in RunStoredQuery. Returns { Success, Results, RowCount, TotalRowCount, PageNumber, PageSize, ErrorMessage? }, where RowCount = rows on THIS page (bounded) and TotalRowCount = the total rows across ALL pages — use TotalRowCount to answer "how many rows in total?".`,
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                        PageNumber: { type: 'number' },
                        PageSize: { type: 'number' },
                        Parameters: { type: 'object' },
                    },
                    required: ['query', 'PageNumber'],
                },
                Handler: async (params: Record<string, unknown>) => this.handlePageQueryResultsTool(params),
            },
        ]);
    }

    private handleSearchTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const v = validateStringParam(params?.['searchText'], 'searchText');
        if (!v.ok) return v.result;
        this.onSearchChange(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    private handleFilterByStatusTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const status = String(params?.['status'] ?? '');
        if (!this.AllStatuses.includes(status)) {
            return { Success: false, ErrorMessage: `Invalid status "${status}". Expected one of: ${this.AllStatuses.join(', ')}.` };
        }
        // Show only the requested status — enable it, disable the others.
        for (const s of this.AllStatuses) {
            this.StatusFilters[s] = s === status;
        }
        this.applyFilters();
        this.buildCategoryTree();
        this.saveStatusFilters();
        this.cdr.markForCheck();
        this.publishAgentContext();
        return { Success: true };
    }

    /**
     * Resolve an agent-supplied identifier (query NAME or ID) to a query the
     * current user can view. Prefers an exact ID match, then a case-insensitive
     * NAME match — mirrors DataExplorer's SelectView resolution. Returns null
     * when nothing matches.
     */
    private resolveQuery(raw: string): MJQueryEntityExtended | null {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const lowered = trimmed.toLowerCase();
        return (
            this.queries.find(q => UUIDsEqual(q.ID, trimmed)) ??
            this.queries.find(q => q.Name.toLowerCase() === lowered) ??
            null
        );
    }

    private handleSelectQueryTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const raw = String(params?.['query'] ?? params?.['queryId'] ?? '');
        if (!raw.trim()) {
            return { Success: false, ErrorMessage: 'A query name or ID is required.' };
        }
        const query = this.resolveQuery(raw);
        if (!query) {
            return { Success: false, ErrorMessage: `No query named or identified by "${raw}" (or you lack permission to view it).` };
        }
        this.selectQuery(query);
        this.publishAgentContext();
        return { Success: true };
    }

    private handleOpenQueryTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const raw = String(params?.['query'] ?? params?.['queryId'] ?? '');
        if (!raw.trim()) {
            return { Success: false, ErrorMessage: 'A query name or ID is required.' };
        }
        const query = this.resolveQuery(raw);
        if (!query) {
            return { Success: false, ErrorMessage: `No query named or identified by "${raw}" (or you lack permission to view it).` };
        }
        // Opens the full Query entity record for viewing — does NOT execute it.
        this.onOpenQueryRecord({ queryId: query.ID, queryName: query.Name });
        return { Success: true };
    }

    private handleFilterByCategoryTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const v = validateStringParam(params?.['category'], 'category');
        if (!v.ok) return v.result;
        const raw = v.value.trim();
        if (!raw) {
            return { Success: false, ErrorMessage: 'A category name is required.' };
        }
        const lowered = raw.toLowerCase();
        const category = this.categories.find(c => (c.Name ?? '').toLowerCase() === lowered);
        if (!category) {
            const available = boundNameList(this.categories.map(c => c.Name).filter((n): n is string => !!n)).join(', ') || '(none)';
            return { Success: false, ErrorMessage: `No category named "${raw}". Available categories: ${available}.` };
        }
        // The search filter already matches on category name (applyFilters), so
        // scoping the visible tree to a category reuses that read-only path.
        this.onSearchChange(category.Name);
        return { Success: true };
    }

    private handleClearFiltersTool(): { Success: boolean; ErrorMessage?: string } {
        // Clear search text and reset status filters to the default (Approved only).
        this.searchText = '';
        for (const s of this.AllStatuses) {
            this.StatusFilters[s] = s === 'Approved';
        }
        this.applyFilters();
        this.buildCategoryTree();
        this.saveStatusFilters();
        this.cdr.markForCheck();
        this.publishAgentContext();
        return { Success: true };
    }

    private handleExpandAllTool(): { Success: boolean; ErrorMessage?: string } {
        this.expandAll();
        return { Success: true };
    }

    private handleCollapseAllTool(): { Success: boolean; ErrorMessage?: string } {
        this.collapseAll();
        return { Success: true };
    }

    private async handleRefreshTool(): Promise<{ Success: boolean; ErrorMessage?: string }> {
        try {
            await this.loadData(true);
            this.publishAgentContext();
            return { Success: true };
        } catch (e) {
            return { Success: false, ErrorMessage: e instanceof Error ? e.message : 'Refresh failed.' };
        }
    }

    // ================================================================
    // TIER 2 — Bounded STORED-QUERY execution tool handlers
    //
    // Every handler is tolerant (never throws), resolves the query ONLY from the
    // already-permission-filtered `this.queries` list, DEFENSIVELY re-checks
    // UserCanRun before running, threads the component's RunQuery provider via
    // `this.RunQueryToUse`, and HARD-CAPS the returned rows. SQL text is never
    // returned; result data is never written to the published context.
    // ================================================================

    /** Tolerant result shape for the stored-query execution tools. */
    private resolveRunnableQuery(raw: string):
        { ok: true; query: MJQueryEntityExtended } | { ok: false; result: QueryExecutionToolResult } {
        const trimmed = raw.trim();
        if (!trimmed) {
            return { ok: false, result: { Success: false, ErrorMessage: 'A query name or ID is required.' } };
        }
        const query = this.resolveQuery(trimmed);
        if (!query) {
            return { ok: false, result: { Success: false, ErrorMessage: `No query named or identified by "${raw}" (or you lack permission to run it).` } };
        }
        // DEFENSIVE permission re-check — `this.queries` was already filtered to
        // runnable queries at load time, but dependencies/permissions may have
        // changed since. Re-verify before every execution.
        const user = this.metadata.CurrentUser;
        const permission = query.UserCanRun(user);
        if (!permission.canRun) {
            const denied = permission.deniedEntities.length > 0
                ? ` Denied on: ${permission.deniedEntities.join(', ')}.`
                : '';
            return { ok: false, result: { Success: false, ErrorMessage: `You do not have permission to run "${query.Name}".${denied}` } };
        }
        return { ok: true, query };
    }

    /**
     * Execute a stored query with a bounded row count and optional StartRow
     * offset, returning a tolerant, hard-capped result. Centralizes the
     * RunQuery call + double row-bounding shared by RunStoredQuery and
     * PageQueryResults. Never throws; never sets RunQueryParams.SQL.
     */
    private async executeStoredQuery(
        query: MJQueryEntityExtended,
        maxRows: number,
        parameters: Record<string, unknown> | undefined,
        startRow?: number,
    ): Promise<{ Success: boolean; Results: unknown[]; RowCount: number; TotalRowCount: number; ErrorMessage?: string }> {
        try {
            // Thread the component's provider (multi-provider safe) — NEVER set SQL.
            const runQuery = new RunQuery(this.RunQueryToUse);
            const result = await runQuery.RunQuery(
                {
                    QueryID: query.ID,
                    Parameters: parameters,
                    MaxRows: maxRows,
                    StartRow: startRow,
                },
                this.metadata.CurrentUser,
            );

            if (!result.Success) {
                return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: result.ErrorMessage || 'Query execution failed.' };
            }

            // Record execution for context continuity (identity only).
            this.lastExecutedQueryId = query.ID;
            this.lastExecutedQueryName = query.Name;

            // Defensive second bound: a provider that ignored MaxRows can never
            // leak more than the cap to the agent.
            const bounded = boundResultRows(result.Results, maxRows);
            // The TRUE total available, independent of the MaxRows/page cap —
            // this is what answers "how many rows does this query return?".
            const totalRowCount = resolveTotalRowCount(result.TotalRowCount, bounded.length);
            return { Success: true, Results: bounded, RowCount: bounded.length, TotalRowCount: totalRowCount };
        } catch (e) {
            return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: e instanceof Error ? e.message : 'Query execution failed.' };
        }
    }

    private async handleRunStoredQueryTool(params: Record<string, unknown>): Promise<QueryExecutionToolResult> {
        const raw = String(params?.['query'] ?? params?.['queryId'] ?? params?.['QueryId'] ?? '');
        const resolved = this.resolveRunnableQuery(raw);
        if (!resolved.ok) return resolved.result;

        const maxRows = normalizeMaxRows(params?.['MaxRows'], DEFAULT_QUERY_MAX_ROWS);
        const parameters = normalizeQueryParameters(params?.['Parameters']);

        const exec = await this.executeStoredQuery(resolved.query, maxRows, parameters);
        if (exec.Success) {
            this.publishAgentContext();
        }
        return exec;
    }

    private async handlePageQueryResultsTool(params: Record<string, unknown>): Promise<QueryExecutionToolResult> {
        const raw = String(params?.['query'] ?? params?.['queryId'] ?? params?.['QueryId'] ?? '');
        const resolved = this.resolveRunnableQuery(raw);
        if (!resolved.ok) return resolved.result;

        const { startRow, pageNumber, pageSize } = computePaging(params?.['PageNumber'], params?.['PageSize']);
        const parameters = normalizeQueryParameters(params?.['Parameters']);

        const exec = await this.executeStoredQuery(resolved.query, pageSize, parameters, startRow);
        if (exec.Success) {
            this.publishAgentContext();
        }
        return { ...exec, PageNumber: pageNumber, PageSize: pageSize };
    }

    /**
     * Return a stored query's parameter + result-field definitions so the agent
     * knows what to pass and what it gets back. Read-only — NEVER returns SQL.
     */
    private handleGetQueryMetadataTool(params: Record<string, unknown>): QueryMetadataToolResult {
        const raw = String(params?.['query'] ?? params?.['queryId'] ?? params?.['QueryId'] ?? '');
        if (!raw.trim()) {
            return { Success: false, ErrorMessage: 'A query name or ID is required.' };
        }
        const query = this.resolveQuery(raw);
        if (!query) {
            return { Success: false, ErrorMessage: `No query named or identified by "${raw}" (or you lack permission to view it).` };
        }
        const parameters: QueryParameterMetadata[] = query.QueryParameters.map(p => ({
            Name: p.Name,
            Type: p.Type,
            IsRequired: p.IsRequired === true,
            Description: p.Description ?? null,
        }));
        const fields: string[] = query.QueryFields.map(f => f.Name);
        return {
            Success: true,
            QueryName: query.Name,
            Description: query.Description ?? null,
            Parameters: parameters,
            Fields: fields,
        };
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
        // Ensure any pending debounced settings are flushed
        UserInfoEngine.Instance.FlushPendingSettings();
        // Remove resize listeners if active
        document.removeEventListener('mousemove', this.boundOnResizeMove);
        document.removeEventListener('mouseup', this.boundOnResizeEnd);
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Queries';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-database';
    }

    // ========================================
    // Data Loading
    // ========================================

    private async loadData(forceRefresh = false): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            // Force QueryEngine refresh when explicitly refreshing (user clicked Refresh)
            if (forceRefresh) {
                await QueryEngine.Instance.Config(true);
            }

            // Load all queries from QueryEngine (event-driven cache, returns MJQueryEntityExtended[])
            const qe = QueryEngine.Instance;
            this.categories = qe.Categories || [];
            this.queries = (qe.Queries || []).filter(q =>
                q.UserCanRun(this.metadata.CurrentUser).canRun
            );

            this.applyFilters();
            this.buildCategoryTree();

            // Mark data as loaded
            this.dataLoaded = true;

            // Apply initial query params for deep linking
            const params = this.GetQueryParams();
            if (params['queryId']) {
                this.selectQueryById(params['queryId']);
            }

        } catch (error) {
            console.error('Error loading queries:', error);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
            this.publishAgentContext();
        }
    }

    private buildCategoryTree(): void {
        const categoryMap = new Map<string, CategoryNode>();

        // Use filtered queries (status + search filters applied)
        const visibleQueries = this.filteredQueries;

        // Create nodes for all categories, restoring expanded state
        for (const category of this.categories) {
            const queriesInCategory = visibleQueries.filter(q => UUIDsEqual(q.CategoryID, category.ID));
            categoryMap.set(category.ID, {
                category,
                children: [],
                queries: queriesInCategory,
                expanded: this.expandedState.get(category.ID) ?? false,
                level: 0
            });
        }

        // Build tree structure
        const roots: CategoryNode[] = [];
        for (const category of this.categories) {
            const node = categoryMap.get(category.ID)!;
            if (category.ParentID) {
                const parent = categoryMap.get(category.ParentID);
                if (parent) {
                    node.level = parent.level + 1;
                    parent.children.push(node);
                } else {
                    roots.push(node);
                }
            } else {
                roots.push(node);
            }
        }

        // Add uncategorized queries to a virtual root
        const uncategorizedQueries = visibleQueries.filter(q => !q.CategoryID);
        if (uncategorizedQueries.length > 0) {
            const uncategorizedCategory = {
                ID: '__uncategorized__',
                Name: 'Uncategorized',
                Description: 'Queries without a category'
            } as unknown as MJQueryCategoryEntity;
            roots.push({
                category: uncategorizedCategory,
                children: [],
                queries: uncategorizedQueries,
                expanded: this.expandedState.get('__uncategorized__') ?? false,
                level: 0
            });
        }

        // Sort children recursively
        const sortNodes = (nodes: CategoryNode[]): void => {
            nodes.sort((a, b) => a.category.Name.localeCompare(b.category.Name));
            for (const node of nodes) {
                node.queries.sort((a, b) => a.Name.localeCompare(b.Name));
                sortNodes(node.children);
            }
        };
        sortNodes(roots);

        this.categoryTree = roots;
    }

    // ========================================
    // Search
    // ========================================

    public onSearchChange(value: string): void {
        this.searchText = value;
        this.applyFilters();
        this.buildCategoryTree();

        // Expand all categories when searching so results are visible
        if (value) {
            this.expandAll();
        }

        this.cdr.markForCheck();
        this.publishAgentContext();
    }

    public clearSearch(): void {
        this.searchText = '';
        this.applyFilters();
        this.buildCategoryTree();
        this.cdr.markForCheck();
    }

    // ========================================
    // Status Filters
    // ========================================

    /** Toggle a status filter on/off and rebuild the tree */
    public toggleStatusFilter(status: string): void {
        this.StatusFilters[status] = !this.StatusFilters[status];
        this.applyFilters();
        this.buildCategoryTree();
        this.saveStatusFilters();
        this.cdr.markForCheck();
    }

    /** Get the count of queries with a given status */
    public getStatusCount(status: string): number {
        return this.queries.filter(q => q.Status === status).length;
    }

    /** Get the CSS color for a query status */
    public getStatusColor(status: string): string {
        switch (status) {
            case 'Approved':  return 'var(--mj-status-success)';
            case 'Pending':   return 'var(--mj-status-warning)';
            case 'Rejected':  return 'var(--mj-status-error)';
            case 'Expired':   return 'var(--mj-text-muted)';
            default:          return 'var(--mj-text-muted)';
        }
    }

    /** Get the Font Awesome icon for a query status */
    public getStatusIcon(status: string): string {
        switch (status) {
            case 'Approved':  return 'fa-check-circle';
            case 'Pending':   return 'fa-clock';
            case 'Rejected':  return 'fa-times-circle';
            case 'Expired':   return 'fa-archive';
            default:          return 'fa-question-circle';
        }
    }

    /** Apply both status and search filters to produce filteredQueries */
    private applyFilters(): void {
        // First filter by status
        let result = this.queries.filter(q => this.StatusFilters[q.Status] === true);

        // Then filter by search text
        if (this.searchText.trim()) {
            const searchLower = this.searchText.toLowerCase();
            result = result.filter(q =>
                q.Name.toLowerCase().includes(searchLower) ||
                q.Description?.toLowerCase().includes(searchLower) ||
                q.Category?.toLowerCase().includes(searchLower)
            );
        }

        this.filteredQueries = result;
        this.filteredQueryIds = new Set(result.map(q => q.ID.toLowerCase()));
    }

    /** Load saved status filter preferences */
    private loadSavedStatusFilters(): void {
        const saved = UserInfoEngine.Instance.GetSetting(QueryBrowserResourceComponent.STATUS_FILTERS_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Merge saved values onto defaults (preserves any new statuses added later)
                for (const key of Object.keys(this.StatusFilters)) {
                    if (typeof parsed[key] === 'boolean') {
                        this.StatusFilters[key] = parsed[key];
                    }
                }
            } catch {
                // Ignore invalid JSON, keep defaults
            }
        }
    }

    /** Save status filter preferences with debouncing */
    private saveStatusFilters(): void {
        UserInfoEngine.Instance.SetSettingDebounced(
            QueryBrowserResourceComponent.STATUS_FILTERS_KEY,
            JSON.stringify(this.StatusFilters)
        );
    }

    /** Load saved expanded/collapsed state for category nodes */
    private loadSavedExpandedState(): void {
        const saved = UserInfoEngine.Instance.GetSetting(QueryBrowserResourceComponent.EXPANDED_STATE_KEY);
        if (saved) {
            try {
                const parsed: Record<string, boolean> = JSON.parse(saved);
                for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value === 'boolean') {
                        this.expandedState.set(key, value);
                    }
                }
            } catch {
                // Ignore invalid JSON, start fresh
            }
        }
    }

    /** Save expanded/collapsed state with debouncing */
    private saveExpandedState(): void {
        const obj: Record<string, boolean> = {};
        for (const [key, value] of this.expandedState.entries()) {
            obj[key] = value;
        }
        UserInfoEngine.Instance.SetSettingDebounced(
            QueryBrowserResourceComponent.EXPANDED_STATE_KEY,
            JSON.stringify(obj)
        );
    }

    // ========================================
    // Tree Navigation
    // ========================================

    public toggleExpand(node: CategoryNode, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        node.expanded = !node.expanded;
        this.expandedState.set(node.category.ID, node.expanded);
        // Track the most recently expanded folder as the active category context
        if (node.expanded && node.category.ID !== '__uncategorized__') {
            this.activeCategoryID = node.category.ID;
        }
        this.saveExpandedState();
        this.cdr.markForCheck();
    }

    public expandAll(): void {
        const expand = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                node.expanded = true;
                this.expandedState.set(node.category.ID, true);
                expand(node.children);
            }
        };
        expand(this.categoryTree);
        this.saveExpandedState();
        this.cdr.markForCheck();
    }

    public collapseAll(): void {
        const collapse = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                node.expanded = false;
                this.expandedState.set(node.category.ID, false);
                collapse(node.children);
            }
        };
        collapse(this.categoryTree);
        this.saveExpandedState();
        this.cdr.markForCheck();
    }

    public selectQuery(query: MJQueryEntityExtended, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        const changed = !UUIDsEqual(this.selectedQuery?.ID, query.ID);
        this.selectedQuery = query;
        if (changed) {
            // New selection — the viewer will re-run; clear any prior run state.
            this.resetSelectedQueryRunState();
        }
        if (query.CategoryID) {
            this.activeCategoryID = query.CategoryID;
        }
        this.UpdateQueryParams({ queryId: query.ID });
        this.NotifyDisplayNameChanged(query.Name || 'Query');
        this.cdr.markForCheck();
        this.publishAgentContext();
    }

    public isQueryVisible(query: MJQueryEntityExtended): boolean {
        if (!this.searchText) return true;
        return this.filteredQueryIds.has(query.ID.toLowerCase());
    }

    public hasVisibleContent(node: CategoryNode): boolean {
        if (!this.searchText) return true;

        // Check if any queries in this category match
        if (node.queries.some(q => this.isQueryVisible(q))) {
            return true;
        }

        // Check if any child categories have visible content
        return node.children.some(child => this.hasVisibleContent(child));
    }

    // ========================================
    // Query Viewer Events
    // ========================================

    public onEntityLinkClick(event: QueryEntityLinkClickEvent): void {
        // Look up the entity's actual primary key field name from metadata
        const entity = this.metadata.Entities.find(e => e.Name === event.entityName);
        const pkField = entity?.FirstPrimaryKey;
        const pkFieldName = pkField?.Name || 'ID';

        const compositeKey = new CompositeKey([{ FieldName: pkFieldName, Value: event.recordId }]);
        this.navigationService.OpenEntityRecord(event.entityName, compositeKey);
    }

    public onRowDoubleClick(event: QueryRowClickEvent): void {
        // Could show record details or other action
    }

    /**
     * Capture the embedded viewer's executed row count when it finishes running
     * the SELECTED query (auto-run on select, or user-run). We read the TRUE
     * total (TotalRowCount, falling back to the returned row count) so the agent
     * can answer "how many rows?" from context without re-running.
     *
     * 🚨 SAFETY: we store ONLY the count + a has-run flag here — never the SQL,
     * never the result rows. The published context honors the same boundary.
     */
    public onViewerQueryComplete(result: RunQueryResult): void {
        this.selectedQueryHasRun = true;
        this.selectedQueryRowCount = resolveTotalRowCount(result?.TotalRowCount, result?.RowCount ?? 0);
        this.publishAgentContext();
    }

    /**
     * Reset the SELECTED query's executed-run state. Called whenever the
     * selection changes so the published context never reports a stale row count
     * for a freshly-selected (not-yet-run) query.
     */
    private resetSelectedQueryRunState(): void {
        this.selectedQueryHasRun = false;
        this.selectedQueryRowCount = null;
    }

    public onOpenQueryRecord(event: { queryId: string; queryName: string }): void {
        // Open the Query entity record using navigation service
        const compositeKey = CompositeKey.FromID(event.queryId);
        this.navigationService.OpenEntityRecord('MJ: Queries', compositeKey);
    }

    public onCompositionTokenClick(event: CompositionTokenClickEvent): void {
        // Find the referenced query by matching name and category path
        const targetQuery = this.findQueryByCompositionPath(event.FullPath);
        if (targetQuery) {
            this.expandTreeToQuery(targetQuery);
            this.selectQuery(targetQuery);
        } else {
            // Query not in the current list — could be filtered out or in a different status
            console.warn(`Composition target query not found: "${event.FullPath}"`);
        }
    }

    /**
     * Find a query by its composition path (e.g., "Demos/Active Users").
     * Matches the last segment as query name and preceding segments as category hierarchy.
     */
    private findQueryByCompositionPath(fullPath: string): MJQueryEntityExtended | null {
        const segments = fullPath.split('/').map(s => s.trim()).filter(s => s.length > 0);
        if (segments.length === 0) return null;

        const queryName = segments[segments.length - 1];
        const categorySegments = segments.slice(0, -1);

        // First try: exact match on Name + CategoryPath
        let result = this.queries.find(q => {
            if (q.Name !== queryName) return false;
            if (categorySegments.length === 0) return true;
            const expectedPath = '/' + categorySegments.join('/') + '/';
            return q.CategoryPath === expectedPath;
        });

        // Fallback: match on Name alone if category path didn't match
        if (!result) {
            result = this.queries.find(q => q.Name === queryName);
        }

        return result ?? null;
    }

    /**
     * Expand category tree nodes to reveal a specific query.
     */
    private expandTreeToQuery(query: MJQueryEntityExtended): void {
        const expandInNodes = (nodes: CategoryNode[]): boolean => {
            for (const node of nodes) {
                // Check if this node directly contains the query
                if (node.queries.some(q => UUIDsEqual(q.ID, query.ID))) {
                    node.expanded = true;
                    return true;
                }
                // Check children recursively
                if (expandInNodes(node.children)) {
                    node.expanded = true;
                    return true;
                }
            }
            return false;
        };

        expandInNodes(this.categoryTree);
        this.cdr.markForCheck();
    }

    /** No-results message for the query list (echoes the search term). */
    public get NoQueryResultsMessage(): string {
        return `No queries match "${this.searchText}".`;
    }

    /** True when the current user has permission to create new queries. */
    public get CanCreateQuery(): boolean {
        const entity = this.metadata.EntityByName('MJ: Queries');
        if (!entity || !this.metadata.CurrentUser) return false;
        return entity.GetUserPermisions(this.metadata.CurrentUser).CanCreate;
    }

    /** True when the current user has permission to edit queries. */
    public get CanEditQuery(): boolean {
        const entity = this.metadata.EntityByName('MJ: Queries');
        if (!entity || !this.metadata.CurrentUser) return false;
        return entity.GetUserPermisions(this.metadata.CurrentUser).CanUpdate;
    }

    // ========================================
    // Drawer — Open / Close
    // ========================================

    /** Close the drawer when Escape is pressed (if open). */
    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        if (this.ShowQueryDrawer) {
            this.CloseDrawer();
        }
    }

    /** Open the drawer in create mode, optionally pre-selecting a category. */
    public OpenCreateDrawer(categoryID?: string): void {
        this.DrawerMode = 'create';
        this.DrawerQueryId = null;
        this.DrawerName = '';
        this.DrawerSQL = '';
        this.DrawerDescription = '';
        // Default to the explicit category, or the most recently active category
        this.DrawerCategoryID = categoryID ?? this.activeCategoryID ?? '';
        this.DrawerStatus = 'Pending';
        this.DrawerReusable = false;
        this.DrawerNameError = false;
        this.DrawerSaveError = null;
        this.captureDrawerSnapshot();
        this.ShowQueryDrawer = true;
        this.cdr.markForCheck();
        setTimeout(() => this.drawerSqlEditor?.setValue(''), 0);
    }

    /**
     * Open the drawer in edit mode, pre-populated from a MJQueryEntityExtended.
     * Stops event propagation so clicking the edit icon doesn't also select the query.
     */
    public OpenEditDrawer(query: MJQueryEntityExtended, event?: Event): void {
        if (event) event.stopPropagation();
        this.DrawerMode = 'edit';
        this.DrawerQueryId = query.ID;
        this.DrawerName = query.Name ?? '';
        this.DrawerSQL = query.SQL ?? '';
        this.DrawerDescription = query.Description ?? '';
        this.DrawerCategoryID = query.CategoryID ?? '';
        this.DrawerStatus = query.Status ?? 'Pending';
        this.DrawerReusable = query.Reusable ?? false;
        this.DrawerNameError = false;
        this.DrawerSaveError = null;
        this.captureDrawerSnapshot();
        this.ShowQueryDrawer = true;
        this.cdr.markForCheck();
        setTimeout(() => this.drawerSqlEditor?.setValue(this.DrawerSQL), 0);
    }

    /**
     * Close the drawer. If dirty, ask for confirmation unless force=true.
     */
    public CloseDrawer(force = false): void {
        if (!force && this.IsDrawerDirty) {
            if (!confirm('You have unsaved changes. Discard them?')) return;
        }
        this.ShowQueryDrawer = false;
        this.cdr.markForCheck();
    }

    /** Close drawer when clicking the backdrop. */
    public OnDrawerBackdropClick(): void {
        this.CloseDrawer();
    }

    // ========================================
    // Drawer — Form Helpers
    // ========================================

    /** Update DrawerSQL when the code editor emits a change. */
    public OnDrawerSQLChange(value: string): void {
        this.DrawerSQL = value;
    }

    /** Update DrawerCategoryID when the tree dropdown selection changes. */
    public OnDrawerCategoryChange(value: CompositeKey | CompositeKey[] | null): void {
        if (value instanceof CompositeKey && value.HasValue) {
            this.DrawerCategoryID = value.KeyValuePairs[0]?.Value ?? '';
        } else {
            this.DrawerCategoryID = '';
        }
    }

    private get currentDrawerSnapshot(): string {
        return JSON.stringify({
            name: this.DrawerName,
            sql: this.DrawerSQL,
            description: this.DrawerDescription,
            categoryID: this.DrawerCategoryID,
            status: this.DrawerStatus,
            reusable: this.DrawerReusable,
        });
    }

    private captureDrawerSnapshot(): void {
        this.initialDrawerSnapshot = this.currentDrawerSnapshot;
    }

    public get IsDrawerDirty(): boolean {
        return this.currentDrawerSnapshot !== this.initialDrawerSnapshot;
    }

    // ========================================
    // Drawer — Save
    // ========================================

    /** Save the drawer form (create or edit). */
    public async SaveDrawer(): Promise<void> {
        this.DrawerNameError = !this.DrawerName.trim();
        this.DrawerSaveError = null;
        if (this.DrawerNameError) {
            this.cdr.markForCheck();
            return;
        }

        this.IsSavingDrawer = true;
        this.cdr.markForCheck();

        try {
            const entity = await this.metadata.GetEntityObject<MJQueryEntityExtended>('MJ: Queries');

            if (this.DrawerMode === 'edit' && this.DrawerQueryId) {
                const loaded = await entity.Load(this.DrawerQueryId);
                if (!loaded) {
                    this.DrawerSaveError = 'Could not load query record. Please refresh and try again.';
                    return;
                }
            }

            entity.Name = this.DrawerName.trim();
            entity.SQL = this.DrawerSQL;
            entity.Description = this.DrawerDescription;
            entity.CategoryID = this.DrawerCategoryID || null;
            entity.Status = this.DrawerStatus;
            entity.Reusable = this.DrawerReusable;

            const saved = await entity.Save();
            if (saved) {
                const savedId = entity.ID;
                this.ShowQueryDrawer = false;
                await this.loadData(true);
                const refreshed = this.queries.find(q => UUIDsEqual(q.ID, savedId));
                if (refreshed) {
                    this.selectedQuery = refreshed;
                    this.expandCategoryForQuery(refreshed);
                    this.UpdateQueryParams({ queryId: refreshed.ID });
                }
            } else {
                this.DrawerSaveError = 'Save failed. Please check your inputs and try again.';
            }
        } catch (e) {
            console.error('Error saving query:', e);
            this.DrawerSaveError = 'An unexpected error occurred while saving.';
        } finally {
            this.IsSavingDrawer = false;
            this.cdr.markForCheck();
        }
    }

    // ========================================
    // Drawer — Open Full Record
    // ========================================

    /** Open the full entity form in a new tab (for sub-entity management). */
    public OpenFullRecord(): void {
        if (!this.DrawerQueryId) return;
        this.navigationService.OpenEntityRecord(
            'MJ: Queries',
            CompositeKey.FromID(this.DrawerQueryId)
        );
        this.CloseDrawer(true);
    }

    // ========================================
    // Utilities
    // ========================================

    public getTotalQueryCount(): number {
        return this.queries.length;
    }

    public getNodeQueryCount(node: CategoryNode): number {
        let count = node.queries.length;
        for (const child of node.children) {
            count += this.getNodeQueryCount(child);
        }
        return count;
    }

    public refresh(): void {
        this.selectedQuery = null;
        this.resetSelectedQueryRunState();
        this.UpdateQueryParams({ queryId: null });
        this.NotifyDisplayNameChanged('Queries');
        this.loadData(true);
    }

    public trackByCategory(index: number, node: CategoryNode): string {
        return node.category.ID;
    }

    public trackByQuery(index: number, query: MJQueryEntityExtended): string {
        return query.ID;
    }

    // ========================================
    // Deep Linking
    // ========================================

    /**
     * Select a query by ID, expanding the tree to show it.
     * Clears selection if no matching query is found.
     */
    private selectQueryById(queryId: string): void {
        const query = this.queries.find(q => UUIDsEqual(q.ID, queryId));
        if (query) {
            if (!UUIDsEqual(this.selectedQuery?.ID, query.ID)) {
                this.selectedQuery = query;
                this.resetSelectedQueryRunState();
                this.expandCategoryForQuery(query);
                this.NotifyDisplayNameChanged(query.Name || 'Query');
            }
        } else {
            this.selectedQuery = null;
            this.resetSelectedQueryRunState();
            this.NotifyDisplayNameChanged('Queries');
        }
        this.cdr.markForCheck();
    }

    /**
     * React to back/forward navigation or deep-link activation.
     * Called by the base class when the URL query params change externally.
     */
    protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
        if (!this.dataLoaded) return;
        if (params['queryId']) {
            this.selectQueryById(params['queryId']);
        } else {
            this.selectedQuery = null;
            this.resetSelectedQueryRunState();
            this.NotifyDisplayNameChanged('Queries');
            this.cdr.markForCheck();
        }
    }

    /**
     * Expands the category tree to show the given query
     */
    private expandCategoryForQuery(query: MJQueryEntityExtended): void {
        if (!query.CategoryID) return;

        const expandToTarget = (nodes: CategoryNode[], targetCategoryId: string): boolean => {
            for (const node of nodes) {
                if (UUIDsEqual(node.category.ID, targetCategoryId)) {
                    node.expanded = true;
                    this.expandedState.set(node.category.ID, true);
                    return true;
                }
                if (expandToTarget(node.children, targetCategoryId)) {
                    node.expanded = true;
                    this.expandedState.set(node.category.ID, true);
                    return true;
                }
            }
            return false;
        };

        if (expandToTarget(this.categoryTree, query.CategoryID)) {
            this.saveExpandedState();
        }
    }

    // ========================================
    // Panel Resize
    // ========================================

    /**
     * Load saved panel width from user settings
     */
    private loadSavedPanelWidth(): void {
        const saved = UserInfoEngine.Instance.GetSetting(QueryBrowserResourceComponent.SETTINGS_KEY);
        if (saved) {
            const width = parseInt(saved, 10);
            if (!isNaN(width) && width >= QueryBrowserResourceComponent.MIN_PANEL_WIDTH && width <= QueryBrowserResourceComponent.MAX_PANEL_WIDTH) {
                this.PanelWidth = width;
            }
        }
    }

    /**
     * Start resizing the left panel via drag handle
     */
    public onResizeStart(event: MouseEvent): void {
        event.preventDefault();
        this.IsResizing = true;
        this.cdr.markForCheck();

        // Run outside Angular zone for performance during mousemove
        this.zone.runOutsideAngular(() => {
            document.addEventListener('mousemove', this.boundOnResizeMove);
            document.addEventListener('mouseup', this.boundOnResizeEnd);
        });
    }

    private onResizeMove(event: MouseEvent): void {
        if (!this.IsResizing) return;

        const containerRect = this.elementRef.nativeElement.querySelector('.query-browser-container')?.getBoundingClientRect();
        if (!containerRect) return;

        const newWidth = event.clientX - containerRect.left;
        const clamped = Math.max(
            QueryBrowserResourceComponent.MIN_PANEL_WIDTH,
            Math.min(QueryBrowserResourceComponent.MAX_PANEL_WIDTH, newWidth)
        );

        this.PanelWidth = clamped;
        this.zone.run(() => this.cdr.markForCheck());
    }

    private onResizeEnd(): void {
        if (!this.IsResizing) return;
        this.IsResizing = false;

        document.removeEventListener('mousemove', this.boundOnResizeMove);
        document.removeEventListener('mouseup', this.boundOnResizeEnd);

        // Persist width with debouncing
        UserInfoEngine.Instance.SetSettingDebounced(
            QueryBrowserResourceComponent.SETTINGS_KEY,
            this.PanelWidth.toString()
        );

        this.zone.run(() => this.cdr.markForCheck());
    }

    /** Case-insensitive UUID check whether a query is the currently selected query. */
    public IsQuerySelected(query: MJQueryEntityExtended): boolean {
        return UUIDsEqual(this.selectedQuery?.ID, query.ID);
    }
}

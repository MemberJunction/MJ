/**
 * Custom SearchScope form (P2D.7 Angular half).
 *
 * Adds a "Reranker" custom section that:
 *   - Renders a dropdown of registered rerankers — currently a hardcoded list
 *     mirroring `BaseReRanker.GetAvailableRerankers()` server-side, with each
 *     option's HasCost flag surfaced inline so authors can see at a glance
 *     which options will incur API spend.
 *   - Reads / writes the current selection from `record.ScopeConfig` JSON's
 *     `reRanker.driverClass` key — same path the SearchEngine reads at runtime.
 *
 * **Discovery follow-up:** the canonical source of available rerankers is
 * `BaseReRanker.GetAvailableRerankers()` in `@memberjunction/search-engine`,
 * but that's a Node-only package and can't be imported in the browser.
 * A small GraphQL query (e.g. `AvailableRerankers`) on MJServer that calls
 * the helper server-side would let this dropdown auto-discover any
 * third-party reranker registered with ClassFactory. Tracked as a follow-up
 * — for now the hardcoded list covers the 5 rerankers shipped in Phase 2D.
 *
 * The CodeGen-generated `RerankerBudgetCents` numeric input is already on
 * the form (in the "Details" section); we don't need to recreate it.
 * The dropdown above + budget input below give scope authors the full
 * Phase 2D configuration surface.
 */
import { Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { LogError, RunView } from '@memberjunction/core';
import { MJSearchScopeEntity, MJSearchExecutionLogEntityType } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SearchService, SearchResultItem, StreamingProviderStatus } from '@memberjunction/ng-search';
import { MJSearchScopeFormComponent } from '../../generated/Entities/MJSearchScope/mjsearchscope.form.component';

interface FusionWeightRow {
    /** Source-type key the SearchEngine matches against (e.g. 'vector', 'fulltext'). */
    Key: string;
    /** Friendly label for the slider — same value as Key today, kept separate for future i18n. */
    Label: string;
    /** Working value of the slider (1-decimal precision) — bound via two-way. */
    Weight: number;
}

/**
 * Built-in source types the SearchEngine ships. New 3rd-party provider
 * SourceTypes (e.g. external clusters) won't appear here unless the scope
 * author adds them via the JSON Scope Config block — by design, since the
 * fusion-weights UI is for the four canonical built-ins.
 */
const BUILT_IN_SOURCE_TYPES: string[] = ['vector', 'fulltext', 'entity', 'storage'];

interface RerankerOption {
    DriverClass: string;
    Name: string;
    HasCost: boolean;
}

/**
 * Hardcoded list mirroring the rerankers `@memberjunction/search-engine`
 * registers with ClassFactory. Update when adding a new built-in reranker
 * or when the GraphQL discovery query lands.
 */
const BUILT_IN_RERANKERS: RerankerOption[] = [
    { DriverClass: 'NoopReRanker', Name: 'NoopReRanker (pass-through)', HasCost: false },
    { DriverClass: 'CohereReRanker', Name: 'Cohere (rerank-v3.5)', HasCost: true },
    { DriverClass: 'VoyageReRanker', Name: 'Voyage (rerank-2)', HasCost: true },
    { DriverClass: 'OpenAIReRanker', Name: 'OpenAI (gpt-4o-mini judge)', HasCost: true },
    { DriverClass: 'BGEReRanker', Name: 'BGE (local, free)', HasCost: false },
];

@RegisterClass(BaseFormComponent, 'MJ: Search Scopes')
@Component({
    standalone: false,
    selector: 'mj-searchscope-form-extended',
    templateUrl: './searchscope-form.component.html',
    styleUrls: ['./searchscope-form.component.css'],
})
export class MJSearchScopeFormComponentExtended extends MJSearchScopeFormComponent implements OnDestroy {
    public override record!: MJSearchScopeEntity;

    public readonly AvailableRerankers: RerankerOption[] = BUILT_IN_RERANKERS;

    /** Live-preview state (P4.1). */
    public PreviewQuery = '';
    public PreviewIsRunning = false;
    public PreviewResults: SearchResultItem[] = [];
    public PreviewProviders: StreamingProviderStatus[] = [];
    public PreviewElapsedMs: number | null = null;
    public PreviewError: string | null = null;
    private previewSubscription: Subscription | null = null;
    private searchService = new SearchService();

    /**
     * P4.3 — A/B comparison via Kendall-tau between consecutive preview runs.
     * After RunPreview completes, the previous run's RecordIDs are diffed
     * against the current run and the rank-correlation similarity is shown
     * inline ("82% similar to last run"). Authors use this to immediately
     * see how much a reranker swap or fusion-weight tweak shifted the ranking.
     */
    private PreviousRunRecordIDs: string[] = [];
    public LastRunSimilarityPercent: number | null = null;

    public override ngOnDestroy(): void {
        this.previewSubscription?.unsubscribe();
        this.previewSubscription = null;
    }

    /**
     * P4.1 — run a streaming preview against this scope. Uses the same
     * SearchService.StreamSearch path the production search UI uses, scoped
     * to just this scope's ID. Renders progressively as each provider
     * reports back so authors can see chip-by-chip what each tuning change
     * actually affects.
     */
    public RunPreview(): void {
        if (!this.record?.ID || this.PreviewIsRunning) return;
        const query = this.PreviewQuery.trim();
        if (!query) return;

        // Tear down any previous run before starting a new one.
        this.previewSubscription?.unsubscribe();
        this.PreviewIsRunning = true;
        this.PreviewResults = [];
        this.PreviewProviders = [];
        this.PreviewElapsedMs = null;
        this.PreviewError = null;

        this.previewSubscription = this.searchService.StreamSearch({
            Query: query,
            MaxResults: 25,
            ActiveFilters: {},
            IncludeSources: ['vector', 'fulltext', 'entity', 'storage'],
            ScopeIDs: [this.record.ID],
        }).subscribe({
            next: (event) => {
                if (event.Phase === 'provider' && event.ProviderName) {
                    this.PreviewProviders = [
                        ...this.PreviewProviders,
                        {
                            Name: event.ProviderName,
                            Count: event.Results?.length ?? 0,
                            ElapsedMs: event.ElapsedMs ?? 0,
                            State: 'Completed',
                        },
                    ];
                    if (event.Results) {
                        this.PreviewResults = [...this.PreviewResults, ...event.Results].sort((a, b) => b.Score - a.Score);
                    }
                } else if (event.Phase === 'final' && event.Results) {
                    this.PreviewResults = [...event.Results].sort((a, b) => b.Score - a.Score);
                    this.PreviewElapsedMs = event.ElapsedMs ?? null;
                }
            },
            error: (err: Error) => {
                this.PreviewError = err.message ?? String(err);
                this.PreviewIsRunning = false;
            },
            complete: () => {
                this.PreviewIsRunning = false;
                // Compute Kendall-tau against the prior run, then capture this
                // run's order as the next baseline.
                const currentIDs = this.PreviewResults.map(r => r.RecordID);
                if (this.PreviousRunRecordIDs.length > 0 && currentIDs.length > 0) {
                    const tau = MJSearchScopeFormComponentExtended.kendallTauOnSharedItems(
                        this.PreviousRunRecordIDs,
                        currentIDs,
                    );
                    if (tau !== null) {
                        // Map [-1, 1] tau onto a [0, 100] "% similar" gauge so non-stats
                        // authors can read it. -1 (reverse) = 0%, 0 (uncorrelated) = 50%,
                        // +1 (identical) = 100%.
                        this.LastRunSimilarityPercent = Math.round((tau + 1) * 50);
                    }
                }
                this.PreviousRunRecordIDs = currentIDs;
            },
        });
    }

    public CancelPreview(): void {
        this.previewSubscription?.unsubscribe();
        this.previewSubscription = null;
        this.PreviewIsRunning = false;
    }

    /**
     * Compute Kendall-tau rank correlation on the items present in both lists.
     * Items only in one list are ignored (partial-overlap handling). Returns
     * null when the shared overlap is too small (< 2 items) to be meaningful.
     *
     * Tau formula: (concordant - discordant) / (N * (N-1) / 2)
     * where concordant = pairs ranked in the same order in both lists,
     * discordant = pairs ranked in opposite order, N = shared item count.
     */
    private static kendallTauOnSharedItems(listA: string[], listB: string[]): number | null {
        const rankA = new Map(listA.map((id, i) => [id, i]));
        const rankB = new Map(listB.map((id, i) => [id, i]));
        const shared = listA.filter(id => rankB.has(id));
        const n = shared.length;
        if (n < 2) return null;
        let concordant = 0;
        let discordant = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const a = (rankA.get(shared[i])! - rankA.get(shared[j])!);
                const b = (rankB.get(shared[i])! - rankB.get(shared[j])!);
                const product = a * b;
                if (product > 0) concordant++;
                else if (product < 0) discordant++;
                // Ties (product === 0) ignored — items at same rank
            }
        }
        const totalPairs = (n * (n - 1)) / 2;
        if (totalPairs === 0) return null;
        return (concordant - discordant) / totalPairs;
    }

    /**
     * Override the section list to include the new "Reranker" section before
     * "Details". The generated `initSections()` doesn't know about our custom
     * section so we replace the list. Order matches the template's render order.
     */
    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeDefinition', sectionName: 'Scope Definition', isExpanded: true },
            { sectionKey: 'scopeConfiguration', sectionName: 'Scope Configuration', isExpanded: true },
            { sectionKey: 'accessControl', sectionName: 'Access Control', isExpanded: false },
            { sectionKey: 'lifecycleManagement', sectionName: 'Lifecycle Management', isExpanded: false },
            { sectionKey: 'technicalConfiguration', sectionName: 'Technical Configuration', isExpanded: false },
            { sectionKey: 'fusionWeights', sectionName: 'Fusion Weights', isExpanded: false },
            { sectionKey: 'reranker', sectionName: 'Reranker', isExpanded: false },
            { sectionKey: 'livePreview', sectionName: 'Live Preview', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJSearchScopeTestQueries', sectionName: 'Search Scope Test Queries', isExpanded: false },
            { sectionKey: 'mJSearchScopeStorageAccounts', sectionName: 'Search Scope Storage Accounts', isExpanded: false },
            { sectionKey: 'mJSearchScopeEntities', sectionName: 'Search Scope Entities', isExpanded: false },
            { sectionKey: 'mJSearchScopeExternalIndexes', sectionName: 'Search Scope External Indexes', isExpanded: false },
            { sectionKey: 'mJSearchScopeProviders', sectionName: 'Search Scope Providers', isExpanded: false },
            { sectionKey: 'mJAIAgentSearchScopes', sectionName: 'AI Agent Search Scopes', isExpanded: false },
            { sectionKey: 'mJSearchScopePermissions', sectionName: 'Search Scope Permissions', isExpanded: false },
        ]);
    }

    /**
     * Currently-selected reranker driver class, parsed from `record.ScopeConfig`.
     * Empty string means "no reranker explicitly chosen" — runtime defaults
     * to NoopReRanker. Stored as `ScopeConfig.reRanker.driverClass`.
     */
    public get SelectedRerankerDriverClass(): string {
        const cfg = this.parseScopeConfig();
        return (cfg?.['reRanker'] as { driverClass?: string } | undefined)?.driverClass ?? '';
    }

    public set SelectedRerankerDriverClass(value: string) {
        const cfg = this.parseScopeConfig() ?? {};
        const reRanker = (cfg['reRanker'] as Record<string, unknown> | undefined) ?? {};
        if (value && value.trim().length > 0) {
            reRanker['driverClass'] = value;
        } else {
            delete reRanker['driverClass'];
        }
        cfg['reRanker'] = reRanker;
        this.record.ScopeConfig = JSON.stringify(cfg, null, 2);
    }

    /**
     * Whether the currently-selected reranker incurs API cost — used to render
     * an inline cost-warning indicator next to the dropdown.
     */
    public get SelectedRerankerHasCost(): boolean {
        const driver = this.SelectedRerankerDriverClass;
        return BUILT_IN_RERANKERS.find(r => r.DriverClass === driver)?.HasCost ?? false;
    }

    /**
     * Whether the CSV export is currently running. Drives the button's disabled
     * state + spinner.
     */
    public IsExportingTuningCsv = false;

    /**
     * P4.2 — fusion weight sliders for each canonical SearchEngine source type.
     * Backed by `SearchScope.ScopeConfig.fusionWeights` JSON (the runtime path
     * — see plans/search-scopes-rag-plus/RAG_plan.md §8 Multi-Scope RRF Fusion). Plan task originally
     * proposed `SearchScopeProvider.Weight` but that column doesn't exist in
     * Phase 1; the JSON path is the actual contract the SearchEngine reads.
     */
    private _fusionWeights: FusionWeightRow[] | null = null;

    public get FusionWeights(): FusionWeightRow[] {
        if (!this._fusionWeights) {
            const cfg = this.parseScopeConfig();
            const stored = (cfg?.['fusionWeights'] as Record<string, unknown> | undefined) ?? {};
            this._fusionWeights = BUILT_IN_SOURCE_TYPES.map(key => {
                const value = stored[key];
                const weight = typeof value === 'number' && Number.isFinite(value) ? value : 1;
                return { Key: key, Label: key, Weight: weight };
            });
        }
        return this._fusionWeights;
    }

    /**
     * Persist a fusion weight change back to `ScopeConfig.fusionWeights`. The
     * caller is the slider's `(change)` event so writes happen only on
     * slide-end, not on every drag tick.
     */
    public OnFusionWeightChanged(row: FusionWeightRow, raw: number | string): void {
        const value = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(value)) return;
        row.Weight = value;

        const cfg = this.parseScopeConfig() ?? {};
        const weights = (cfg['fusionWeights'] as Record<string, unknown> | undefined) ?? {};
        if (Math.abs(value - 1) < 0.001) {
            // Default value — drop the explicit override so future engine-default
            // changes flow through naturally.
            delete weights[row.Key];
        } else {
            weights[row.Key] = +value.toFixed(2);
        }
        if (Object.keys(weights).length > 0) {
            cfg['fusionWeights'] = weights;
        } else {
            delete cfg['fusionWeights'];
        }
        this.record.ScopeConfig = JSON.stringify(cfg, null, 2);
    }

    /**
     * P3.4 — export the last 500 SearchExecutionLog rows for this scope as CSV.
     * Used by scope authors for offline tuning analysis (open in a spreadsheet,
     * pivot by reranker / status / latency, etc.). Filtered to this scope's ID
     * so multi-tenant deployments don't leak other scopes' query history.
     */
    public async ExportTuningCsv(): Promise<void> {
        if (!this.record?.ID || this.IsExportingTuningCsv) return;
        this.IsExportingTuningCsv = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJSearchExecutionLogEntityType>({
                EntityName: 'MJ: Search Execution Logs',
                // Constrain to the columns the CSV writer actually emits — avoids
                // pulling the wider entity (per Section 6.8).
                Fields: [
                    '__mj_CreatedAt', 'Status', 'Query', 'ResultCount', 'TotalDurationMs',
                    'RerankerName', 'RerankerCostCents', 'FailureReason', 'UserID', 'AIAgentID',
                ],
                ExtraFilter: `SearchScopeID='${this.record.ID.replace(/'/g, "''")}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 500,
                ResultType: 'simple',
            });
            if (!result.Success) {
                LogError(`SearchScope CSV export failed: ${result.ErrorMessage ?? 'unknown error'}`);
                return;
            }
            const rows = (result.Results ?? []) as MJSearchExecutionLogEntityType[];
            this.downloadCsv(rows);
        } finally {
            this.IsExportingTuningCsv = false;
        }
    }

    private downloadCsv(rows: MJSearchExecutionLogEntityType[]): void {
        const headers = [
            'CreatedAt', 'Status', 'Query', 'ResultCount', 'TotalDurationMs',
            'RerankerName', 'RerankerCostCents', 'FailureReason', 'UserID', 'AIAgentID',
        ];
        const lines = [headers.join(',')];
        for (const r of rows) {
            const cells = [
                this.escapeCsv(String(r.__mj_CreatedAt ?? '')),
                this.escapeCsv(String(r.Status ?? '')),
                this.escapeCsv(String(r.Query ?? '')),
                String(r.ResultCount ?? 0),
                String(r.TotalDurationMs ?? 0),
                this.escapeCsv(String(r.RerankerName ?? '')),
                String(r.RerankerCostCents ?? ''),
                this.escapeCsv(String(r.FailureReason ?? '')),
                String(r.UserID ?? ''),
                String(r.AIAgentID ?? ''),
            ];
            lines.push(cells.join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const name = (this.record?.Name ?? 'scope').replace(/[^\w\-]+/g, '_');
        link.setAttribute('download', `searchscope-tuning-${name}-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    private escapeCsv(value: string): string {
        if (value == null) return '';
        // Quote when the value contains a comma, quote, newline, or starts with
        // formula-injection characters. Inside a quoted value, escape inner
        // quotes by doubling.
        if (/[",\n\r]/.test(value) || /^[=+\-@]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    private parseScopeConfig(): Record<string, unknown> | null {
        if (!this.record?.ScopeConfig) return null;
        try {
            const parsed = JSON.parse(this.record.ScopeConfig);
            return (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : null;
        } catch {
            return null;
        }
    }
}

export function LoadMJSearchScopeFormComponentExtended(): void {
    // Tree-shake prevention; called from custom-forms.module's LoadCoreCustomForms()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = MJSearchScopeFormComponentExtended;
}

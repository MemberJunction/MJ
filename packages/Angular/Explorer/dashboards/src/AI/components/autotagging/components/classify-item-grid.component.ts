/**
 * @fileoverview Classify · Content Item Grid (Phase 4 audit/analytics).
 *
 * Thin, reusable AG Grid listing of content items in one of two modes:
 *   - scoped to a single pipeline run via `[RunID]` (items processed in that run), or
 *   - all items (when `[RunID]` is null).
 *
 * Read-only: uses `ResultType:'simple'` + an explicit narrow `Fields` list, and a
 * load-more / page-size widening approach mirroring the host dashboard. Selecting a
 * row bubbles `(ItemSelected)` UP — this component owns no navigation (the host owns
 * NavigationService and opens the drilldown).
 */
import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    inject,
} from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    ColDef,
    GridApi,
    GridOptions,
    GridReadyEvent,
    ModuleRegistry,
    AllCommunityModule,
    Theme,
    themeAlpine,
    RowClickedEvent,
} from 'ag-grid-community';
import { ClassifyItemGridRow } from '../shared/classify.types';
import { deriveDisplayName, formatDate } from '../shared/classify.format';

// Register AG Grid community modules once (idempotent across grids in the bundle).
ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
    standalone: false,
    selector: 'classify-item-grid',
    templateUrl: './classify-item-grid.component.html',
    styleUrls: ['./classify-item-grid.component.css'],
})
export class ClassifyItemGridComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** One page worth of additional rows fetched when "Load more" is clicked. */
    private static readonly PAGE_SIZE = 100;

    /**
     * When set, scope the grid to items processed by this pipeline run. When null,
     * show all content items. Re-fetches on change (setter pattern, not ngOnChanges).
     */
    private _runID: string | null = null;
    @Input()
    set RunID(value: string | null) {
        if (value === this._runID) return;
        this._runID = value;
        this._pageSize = ClassifyItemGridComponent.PAGE_SIZE;
        void this.loadItems();
    }
    get RunID(): string | null {
        return this._runID;
    }

    /** When true, the grid loads its data on init. Lets a parent defer the query until the section is shown. */
    private _autoLoad = true;
    @Input()
    set AutoLoad(value: boolean) {
        const was = this._autoLoad;
        this._autoLoad = value;
        if (value && !was && !this._loaded) void this.loadItems();
    }
    get AutoLoad(): boolean {
        return this._autoLoad;
    }

    /** Emits the selected content item's ID when a row is clicked. */
    @Output() ItemSelected = new EventEmitter<string>();

    public Rows: ClassifyItemGridRow[] = [];
    public IsLoading = false;
    public IsLoadingMore = false;
    public TotalCount = 0;

    private _loaded = false;
    private _pageSize = ClassifyItemGridComponent.PAGE_SIZE;
    private gridApi: GridApi | null = null;

    public get HasMore(): boolean {
        return this.TotalCount > this.Rows.length;
    }

    // ── AG Grid configuration ──

    public Theme: Theme = themeAlpine.withParams({
        backgroundColor: 'var(--mj-bg-surface)',
        foregroundColor: 'var(--mj-text-primary)',
        textColor: 'var(--mj-text-primary)',
        borderColor: 'var(--mj-border-default)',
        chromeBackgroundColor: 'var(--mj-bg-surface-card)',
        headerBackgroundColor: 'var(--mj-bg-surface-card)',
        headerTextColor: 'var(--mj-text-secondary)',
        cellTextColor: 'var(--mj-text-primary)',
        subtleTextColor: 'var(--mj-text-muted)',
        dataBackgroundColor: 'var(--mj-bg-surface)',
        oddRowBackgroundColor: 'var(--mj-bg-surface-card)',
        rowHoverColor: 'var(--mj-bg-surface-hover, color-mix(in srgb, var(--mj-brand-primary) 5%, var(--mj-bg-surface)))',
        selectedRowBackgroundColor: 'color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface))',
        accentColor: 'var(--mj-brand-primary)',
        borderRadius: 'var(--mj-radius-sm)',
        browserColorScheme: 'inherit',
    });

    public GridOptions: GridOptions<ClassifyItemGridRow> = {
        animateRows: true,
        rowHeight: 36,
        headerHeight: 40,
        suppressCellFocus: true,
        enableCellTextSelection: true,
        suppressNoRowsOverlay: true,
    };

    public DefaultColDef: ColDef = {
        sortable: true,
        resizable: true,
        minWidth: 80,
    };

    public ColumnDefs: ColDef<ClassifyItemGridRow>[] = [
        { field: 'DisplayName', headerName: 'Item', flex: 2, minWidth: 220, tooltipField: 'DisplayName' },
        { field: 'SourceName', headerName: 'Source', flex: 1, minWidth: 140 },
        { field: 'TagCount', headerName: 'Tags', width: 90, type: 'numericColumn' },
        { field: 'TaggingStatus', headerName: 'Status', width: 130 },
        { field: 'UpdatedAt', headerName: 'Updated', width: 160, sort: 'desc',
          comparator: (_a, _b, nodeA, nodeB) =>
              (nodeA.data?.UpdatedAtRaw ?? '').localeCompare(nodeB.data?.UpdatedAtRaw ?? '') },
    ];

    public OnGridReady(event: GridReadyEvent<ClassifyItemGridRow>): void {
        this.gridApi = event.api;
        this.gridApi.setGridOption('rowData', this.Rows);
    }

    public OnRowClicked(event: RowClickedEvent<ClassifyItemGridRow>): void {
        if (event.data) this.ItemSelected.emit(event.data.ID);
    }

    /** Public refresh entry point (parent toolbar / load-more handler). */
    public async Reload(): Promise<void> {
        this._pageSize = ClassifyItemGridComponent.PAGE_SIZE;
        await this.loadItems();
    }

    public async LoadMore(): Promise<void> {
        if (this.IsLoadingMore || !this.HasMore) return;
        this.IsLoadingMore = true;
        this.cdr.detectChanges();
        this._pageSize += ClassifyItemGridComponent.PAGE_SIZE;
        await this.loadItems();
        this.IsLoadingMore = false;
        this.cdr.detectChanges();
    }

    private async loadItems(): Promise<void> {
        if (!this._autoLoad) return;
        this.IsLoading = true;
        this.cdr.detectChanges();

        // When scoped to a run, resolve the run's source + time window so we can
        // constrain the item query. There is no per-item run join table in the
        // schema, so we scope by ContentSource + the run's processing window
        // (same time-correlation basis the rest of the pipeline uses).
        let extraFilter = '';
        if (this._runID) {
            const scope = await this.resolveRunScope(this._runID);
            if (scope === null) {
                this.applyRows([], 0);
                return;
            }
            extraFilter = scope;
        }

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: extraFilter,
            OrderBy: '__mj_UpdatedAt DESC',
            MaxRows: this._pageSize,
            StartRow: 0,
            ResultType: 'simple',
            Fields: ['ID', 'Name', 'Description', 'ContentSource', 'TaggingStatus', 'EmbeddingStatus', '__mj_UpdatedAt'],
        }, this.ProviderToUse.CurrentUser);

        if (!result.Success) {
            this.applyRows([], 0);
            return;
        }

        const tagCounts = await this.loadTagCounts(result.Results.map(r => r['ID'] as string));
        const rows = result.Results.map(r => this.toRow(r, tagCounts));
        this.applyRows(rows, result.TotalRowCount);
    }

    /**
     * Build the item-level filter that scopes to a pipeline run: the run's
     * ContentSource, optionally bounded by the run's processing window. Returns
     * null on a hard failure (so the caller short-circuits to an empty grid).
     */
    private async resolveRunScope(runID: string): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ SourceID: string; StartTime: string | null; EndTime: string | null }>({
            EntityName: 'MJ: Content Process Runs',
            ExtraFilter: `ID='${runID}'`,
            Fields: ['SourceID', 'StartTime', 'EndTime'],
            ResultType: 'simple',
        }, this.ProviderToUse.CurrentUser);
        if (!result.Success || result.Results.length === 0) return null;

        const run = result.Results[0];
        const fragments = [`ContentSourceID='${run.SourceID.replace(/'/g, '')}'`];
        if (run.StartTime) fragments.push(`__mj_UpdatedAt >= '${this.toSqlDate(run.StartTime)}'`);
        if (run.EndTime) fragments.push(`__mj_UpdatedAt <= '${this.toSqlDate(run.EndTime)}'`);
        return fragments.join(' AND ');
    }

    /** Format an ISO date value for a SQL string literal (UTC, no tz suffix surprises). */
    private toSqlDate(value: string): string {
        const d = new Date(value);
        return isNaN(d.getTime()) ? value.replace(/'/g, '') : d.toISOString().replace('T', ' ').replace('Z', '');
    }

    /** Count tags per item for the visible page (one RunView, aggregated client-side). */
    private async loadTagCounts(itemIDs: string[]): Promise<Map<string, number>> {
        const counts = new Map<string, number>();
        if (itemIDs.length === 0) return counts;
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ ItemID: string }>({
            EntityName: 'MJ: Content Item Tags',
            ExtraFilter: this.buildItemIDInFilter(itemIDs, 'ItemID'),
            Fields: ['ItemID'],
            ResultType: 'simple',
        }, this.ProviderToUse.CurrentUser);
        if (result.Success) {
            for (const r of result.Results) {
                counts.set(r.ItemID, (counts.get(r.ItemID) ?? 0) + 1);
            }
        }
        return counts;
    }

    private toRow(r: Record<string, unknown>, tagCounts: Map<string, number>): ClassifyItemGridRow {
        const id = r['ID'] as string;
        const updatedAt = (r['__mj_UpdatedAt'] as string) ?? '';
        return {
            ID: id,
            DisplayName: deriveDisplayName({ Name: r['Name'] as string | null, Description: r['Description'] as string | null }),
            SourceName: (r['ContentSource'] as string) ?? 'Unknown',
            TagCount: tagCounts.get(id) ?? 0,
            EmbeddingStatus: (r['EmbeddingStatus'] as string) ?? '',
            TaggingStatus: (r['TaggingStatus'] as string) ?? '',
            UpdatedAt: updatedAt ? formatDate(updatedAt) : '—',
            UpdatedAtRaw: updatedAt,
        };
    }

    private applyRows(rows: ClassifyItemGridRow[], total: number): void {
        this.Rows = rows;
        this.TotalCount = total;
        this.IsLoading = false;
        this._loaded = true;
        this.gridApi?.setGridOption('rowData', rows);
        this.cdr.detectChanges();
    }

    /** Build an `IN (...)` filter from item IDs, defensively stripping quotes. */
    private buildItemIDInFilter(ids: string[], column = 'ID'): string {
        const quoted = ids.map(id => `'${id.replace(/'/g, '')}'`).join(',');
        return `${column} IN (${quoted})`;
    }
}

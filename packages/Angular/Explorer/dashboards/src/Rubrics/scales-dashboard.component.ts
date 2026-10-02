import { ChangeDetectionStrategy, ChangeDetectorRef, Component, AfterViewInit, inject } from '@angular/core';
import { ColDef, GridOptions, RowClickedEvent } from 'ag-grid-community';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { CatalogGridTheme } from './catalog-grid';

type Row = Record<string, unknown>;

export interface ScaleCatalogRow {
    Id: string;
    Name: string;
    Type: string;
    Frozen: boolean;
}

/** Scales list. A scale is frozen when a published version uses it. */
@RegisterClass(BaseDashboard, 'RubricScalesDashboard')
@Component({
    standalone: false,
    selector: 'mj-rubric-scales-dashboard',
    templateUrl: './scales-dashboard.component.html',
    styleUrls: ['./rubrics-catalog.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RubricScalesDashboardComponent extends BaseDashboard implements AfterViewInit {
    public Loading = true;
    public LoadError = '';
    public Search = '';
    public Rows: ScaleCatalogRow[] = [];
    public readonly Theme = CatalogGridTheme();
    public readonly GridOptions: GridOptions<ScaleCatalogRow> = { domLayout: 'autoHeight', suppressCellFocus: true, animateRows: true };
    public readonly ColumnDefs: ColDef<ScaleCatalogRow>[] = [
        { field: 'Name', headerName: 'Name', flex: 2 },
        { field: 'Type', headerName: 'Type', flex: 1 },
        { field: 'Frozen', headerName: 'Published use', flex: 1, valueFormatter: params => params.value ? 'Locked by a published rubric' : 'Editable' },
    ];
    private readonly changeDetector = inject(ChangeDetectorRef);

    protected initDashboard(): void {}

    public override async GetResourceDisplayName(): Promise<string> {
        return 'Scales';
    }

    protected async loadData(): Promise<void> {
        this.Loading = true;
        this.changeDetector.markForCheck();
        try {
            const view = RunView.FromMetadataProvider(this.ProviderToUse);
            const user = this.ProviderToUse.CurrentUser;
            const [scales, criteria, versions] = await view.RunViews([
                { EntityName: 'MJ: Rubric Scales', ResultType: 'simple', MaxRows: 300, OrderBy: 'Name' },
                { EntityName: 'MJ: Rubric Criteria', ResultType: 'simple', MaxRows: 2000 },
                { EntityName: 'MJ: Rubric Versions', ExtraFilter: "Status='Published'", ResultType: 'simple', MaxRows: 500 },
            ], user);
            const failed = [scales, criteria, versions].find(result => !result.Success);
            if (failed) {
                this.LoadError = failed.ErrorMessage || 'Could not load scales.';
                this.Rows = [];
                return;
            }
            this.LoadError = '';
            const published = new Set(((versions.Results as Row[] ?? [])).map(row => String(row.ID).toLowerCase()));
            const frozenScales = new Set(((criteria.Results as Row[] ?? []))
                .filter(row => published.has(String(row.RubricVersionID ?? '').toLowerCase()) && row.ScaleID)
                .map(row => String(row.ScaleID).toLowerCase()));
            this.Rows = ((scales.Results as Row[] ?? [])).map(row => ({
                Id: String(row.ID),
                Name: String(row.Name ?? ''),
                Type: String(row.ScaleType ?? ''),
                Frozen: frozenScales.has(String(row.ID).toLowerCase()),
            }));
        } finally {
            this.Loading = false;
            this.changeDetector.markForCheck();
            this.publishAgent();
        }
    }

    public ngAfterViewInit(): void {
        this.publishAgent();
    }

    public get Visible(): ScaleCatalogRow[] {
        const query = this.Search.trim().toLowerCase();
        if (!query) return this.Rows;
        return this.Rows.filter(row => `${row.Name} ${row.Type}`.toLowerCase().includes(query));
    }

    public OnSearch(value: string): void {
        this.Search = value;
        this.publishAgent();
        this.changeDetector.markForCheck();
    }

    public Open(id: string): void {
        this.navigationService.OpenEntityRecord('MJ: Rubric Scales', CompositeKey.FromID(id));
    }

    public OnRow(event: RowClickedEvent<ScaleCatalogRow>): void {
        if (event.data) this.Open(event.data.Id);
    }

    public NewScale(): void {
        this.navigationService.OpenNewEntityRecord('MJ: Rubric Scales');
    }

    private publishAgent(): void {
        this.navigationService.SetAgentContext(this, { Search: this.Search, RowCount: this.Visible.length });
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'OpenScale',
                Description: 'Open a rubric scale record by its id.',
                ParameterSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
                Handler: async (params: Record<string, unknown>) => {
                    const id = String(params['id'] ?? '');
                    if (!this.Rows.some(row => row.Id.toLowerCase() === id.toLowerCase())) return { Success: false, ErrorMessage: 'That scale is not in the list.' };
                    this.Open(id);
                    return { Success: true };
                },
            },
            {
                Name: 'NewScale',
                Description: 'Start a new rubric scale.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.NewScale();
                    return { Success: true };
                },
            },
        ]);
    }
}

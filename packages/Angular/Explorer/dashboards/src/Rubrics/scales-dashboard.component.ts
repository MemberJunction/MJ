import { ChangeDetectionStrategy, ChangeDetectorRef, Component, AfterViewInit } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';

type Row = Record<string, unknown>;

export interface ScaleCatalogRow {
    id: string;
    name: string;
    type: string;
    frozen: boolean;
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
    public Search = '';
    public Rows: ScaleCatalogRow[] = [];

    public constructor(private changeDetector: ChangeDetectorRef) {
        super();
    }

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
            const [scales, criteria, versions] = await Promise.all([
                view.RunView({ EntityName: 'MJ: Rubric Scales', ResultType: 'simple', MaxRows: 300, OrderBy: 'Name' }, user),
                view.RunView({ EntityName: 'MJ: Rubric Criteria', ResultType: 'simple', MaxRows: 2000 }, user),
                view.RunView({ EntityName: 'MJ: Rubric Versions', ExtraFilter: "Status='Published'", ResultType: 'simple', MaxRows: 500 }, user),
            ]);
            const published = new Set(((versions.Results as Row[] ?? [])).map(row => String(row.ID).toLowerCase()));
            const frozenScales = new Set(((criteria.Results as Row[] ?? []))
                .filter(row => published.has(String(row.RubricVersionID ?? '').toLowerCase()) && row.ScaleID)
                .map(row => String(row.ScaleID).toLowerCase()));
            this.Rows = ((scales.Results as Row[] ?? [])).map(row => ({
                id: String(row.ID),
                name: String(row.Name ?? ''),
                type: String(row.ScaleType ?? ''),
                frozen: frozenScales.has(String(row.ID).toLowerCase()),
            }));
        } finally {
            this.Loading = false;
            this.changeDetector.markForCheck();
            this.PublishAgent();
        }
    }

    public ngAfterViewInit(): void {
        this.PublishAgent();
    }

    public get Visible(): ScaleCatalogRow[] {
        const query = this.Search.trim().toLowerCase();
        if (!query) return this.Rows;
        return this.Rows.filter(row => `${row.name} ${row.type}`.toLowerCase().includes(query));
    }

    public OnSearch(value: string): void {
        this.Search = value;
        this.changeDetector.markForCheck();
    }

    public Open(id: string): void {
        this.navigationService.OpenEntityRecord('MJ: Rubric Scales', CompositeKey.FromID(id));
    }

    public NewScale(): void {
        this.navigationService.OpenNewEntityRecord('MJ: Rubric Scales');
    }

    private PublishAgent(): void {
        this.navigationService.SetAgentContext(this, { Search: this.Search, RowCount: this.Visible.length });
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'OpenScale',
                Description: 'Open a rubric scale record by its id.',
                ParameterSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
                Handler: async (params: Record<string, unknown>) => {
                    const id = String(params['id'] ?? '');
                    if (!this.Rows.some(row => row.id.toLowerCase() === id.toLowerCase())) return { Success: false, ErrorMessage: 'That scale is not in the list.' };
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

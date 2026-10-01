import { ChangeDetectionStrategy, ChangeDetectorRef, Component, AfterViewInit } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { catalogRow, type CatalogRowView, type CatalogRubricInput } from '@memberjunction/ng-rubrics';

type Row = Record<string, unknown>;

/** Rubrics catalog. Opens a rubric record. It does not edit the tree. */
@RegisterClass(BaseDashboard, 'RubricsDashboard')
@Component({
    standalone: false,
    selector: 'mj-rubrics-dashboard',
    templateUrl: './rubrics-dashboard.component.html',
    styleUrls: ['./rubrics-catalog.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RubricsDashboardComponent extends BaseDashboard implements AfterViewInit {
    public Loading = true;
    public Search = '';
    public Rows: CatalogRowView[] = [];

    public constructor(private changeDetector: ChangeDetectorRef) {
        super();
    }

    protected initDashboard(): void {}

    public override async GetResourceDisplayName(): Promise<string> {
        return 'Rubrics';
    }

    protected async loadData(): Promise<void> {
        this.Loading = true;
        this.changeDetector.markForCheck();
        try {
            const view = RunView.FromMetadataProvider(this.ProviderToUse);
            const user = this.ProviderToUse.CurrentUser;
            const [rubrics, versions, criteria, categories, scales] = await Promise.all([
                view.RunView({ EntityName: 'MJ: Rubrics', ResultType: 'simple', MaxRows: 300, OrderBy: 'Name' }, user),
                view.RunView({ EntityName: 'MJ: Rubric Versions', ResultType: 'simple', MaxRows: 800 }, user),
                view.RunView({ EntityName: 'MJ: Rubric Criteria', ResultType: 'simple', MaxRows: 2000 }, user),
                view.RunView({ EntityName: 'MJ: Rubric Categories', ResultType: 'simple', MaxRows: 300 }, user),
                view.RunView({ EntityName: 'MJ: Rubric Scales', ResultType: 'simple', MaxRows: 300 }, user),
            ]);
            const categoryNames = new Map((categories.Results as Row[] ?? []).map(row => [String(row.ID).toLowerCase(), String(row.Name ?? '')]));
            const scaleNames: Record<string, string> = {};
            for (const row of (scales.Results as Row[] ?? [])) scaleNames[String(row.ID).toLowerCase()] = String(row.Name ?? '');
            const criteriaByVersion = new Map<string, Row[]>();
            for (const row of (criteria.Results as Row[] ?? [])) {
                const versionId = String(row.RubricVersionID ?? '').toLowerCase();
                const list = criteriaByVersion.get(versionId) ?? [];
                list.push(row);
                criteriaByVersion.set(versionId, list);
            }
            const versionsByRubric = new Map<string, Row[]>();
            for (const row of (versions.Results as Row[] ?? [])) {
                const rubricId = String(row.RubricID ?? '').toLowerCase();
                const list = versionsByRubric.get(rubricId) ?? [];
                list.push(row);
                versionsByRubric.set(rubricId, list);
            }
            this.Rows = ((rubrics.Results as Row[] ?? [])).map(rubric => catalogRow(this.inputFor(rubric, categoryNames, versionsByRubric, criteriaByVersion, scaleNames)));
        } finally {
            this.Loading = false;
            this.changeDetector.markForCheck();
            this.PublishAgent();
        }
    }

    public ngAfterViewInit(): void {
        this.PublishAgent();
    }

    public get Visible(): CatalogRowView[] {
        const query = this.Search.trim().toLowerCase();
        if (!query) return this.Rows;
        return this.Rows.filter(row => `${row.name} ${row.description ?? ''} ${row.categoryName}`.toLowerCase().includes(query));
    }

    public get DraftCount(): number {
        return this.Rows.filter(row => row.draftLabel !== 'none').length;
    }

    public OnSearch(value: string): void {
        this.Search = value;
        this.PublishAgent();
        this.changeDetector.markForCheck();
    }

    public Open(id: string): void {
        this.navigationService.OpenEntityRecord('MJ: Rubrics', CompositeKey.FromID(id));
    }

    public NewRubric(): void {
        this.navigationService.OpenNewEntityRecord('MJ: Rubrics');
    }

    private inputFor(rubric: Row, categoryNames: Map<string, string>, versionsByRubric: Map<string, Row[]>, criteriaByVersion: Map<string, Row[]>, scaleNames: Record<string, string>): CatalogRubricInput {
        const versions = versionsByRubric.get(String(rubric.ID).toLowerCase()) ?? [];
        return {
            id: String(rubric.ID),
            name: String(rubric.Name ?? ''),
            description: rubric.Description == null || rubric.Description === '' ? null : String(rubric.Description),
            categoryName: categoryNames.get(String(rubric.CategoryID ?? '').toLowerCase()) ?? null,
            scaleNames,
            versions: versions.map(version => ({
                id: String(version.ID),
                rubricId: String(rubric.ID),
                status: String(version.Status ?? ''),
                majorVersion: version.MajorVersion == null || version.MajorVersion === '' ? null : Number(version.MajorVersion),
                minorVersion: version.MinorVersion == null || version.MinorVersion === '' ? null : Number(version.MinorVersion),
                patchVersion: version.PatchVersion == null || version.PatchVersion === '' ? null : Number(version.PatchVersion),
                criteria: (criteriaByVersion.get(String(version.ID).toLowerCase()) ?? []).map(criterion => ({
                    id: String(criterion.ID),
                    key: String(criterion.Key ?? ''),
                    name: String(criterion.Name ?? ''),
                    nodeType: String(criterion.NodeType ?? 'Criterion'),
                    weight: Number(criterion.Weight ?? 1),
                    scaleId: criterion.ScaleID == null || criterion.ScaleID === '' ? null : String(criterion.ScaleID),
                    isGate: criterion.IsGate === true || criterion.IsGate === 1,
                })),
            })),
        };
    }

    private PublishAgent(): void {
        this.navigationService.SetAgentContext(this, {
            Search: this.Search,
            RowCount: this.Visible.length,
            DraftCount: this.Visible.filter(row => row.draftLabel !== 'none').length,
        });
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'OpenRubric',
                Description: 'Open a rubric record from the catalog by its id.',
                ParameterSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
                Handler: async (params: Record<string, unknown>) => {
                    const id = String(params['id'] ?? '');
                    if (!this.Rows.some(row => row.id.toLowerCase() === id.toLowerCase())) return { Success: false, ErrorMessage: 'That rubric is not in the catalog.' };
                    this.Open(id);
                    return { Success: true };
                },
            },
            {
                Name: 'NewRubric',
                Description: 'Start a new rubric record.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.NewRubric();
                    return { Success: true };
                },
            },
        ]);
    }
}

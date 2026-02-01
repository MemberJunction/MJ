import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView, Metadata, EntityInfo } from '@memberjunction/core';
import { ResourceData, VersionLabelEntityType, VersionLabelItemEntityType, VersionLabelEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLVersionHistoryClient, CreateVersionLabelResult } from '@memberjunction/graphql-dataprovider';

export function LoadVersionHistoryLabelsResource() {
    // Prevents tree-shaking
}

interface ScopeStat {
    Scope: string;
    Count: number;
    Icon: string;
    Color: string;
}

interface StatusStat {
    Status: string;
    Count: number;
    Color: string;
}

interface RecordOption {
    ID: string;
    DisplayName: string;
    Selected: boolean;
}

interface VersionLabelPreferences {
    ViewMode: 'card' | 'list';
    ActiveScopeFilter: string;
    ActiveStatusFilter: string;
    DefaultDetailTab: string;
    SortField: string;
    SortDirection: 'asc' | 'desc';
}

type SortField = 'Name' | 'Scope' | 'Status' | 'Items' | 'Date';

@RegisterClass(BaseResourceComponent, 'VersionHistoryLabelsResource')
@Component({
    selector: 'mj-version-history-labels-resource',
    templateUrl: './labels-resource.component.html',
    styleUrls: ['./labels-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionHistoryLabelsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    private static readonly PREFS_KEY = 'VersionHistory.Labels.UserPreferences';

    public IsLoading = true;

    // View mode
    public ViewMode: 'card' | 'list' = 'card';

    // Detail panel
    public SelectedLabel: VersionLabelEntityType | null = null;
    public ShowDetailPanel = false;

    // Stats
    public TotalLabels = 0;
    public ActiveLabels = 0;
    public ArchivedLabels = 0;
    public RestoredLabels = 0;

    // Grouped data
    public ScopeStats: ScopeStat[] = [];
    public StatusStats: StatusStat[] = [];
    public Labels: VersionLabelEntityType[] = [];
    public FilteredLabels: VersionLabelEntityType[] = [];
    public ItemCountMap = new Map<string, number>();

    // Filters
    public ScopeFilter = '';
    public StatusFilter = '';
    public SearchText = '';

    // Sorting
    public SortField: SortField = 'Date';
    public SortDirection: 'asc' | 'desc' = 'desc';

    // User preferences
    private preferencesLoaded = false;

    // Create Label Dialog
    public ShowCreateDialog = false;
    public CreateStep: 'entity' | 'records' | 'details' | 'creating' | 'done' = 'entity';
    public EntitySearchText = '';
    public FilteredEntities: EntityInfo[] = [];
    public SelectedEntity: EntityInfo | null = null;
    public RecordSearchText = '';
    public AvailableRecords: RecordOption[] = [];
    public FilteredRecords: RecordOption[] = [];
    public IsLoadingRecords = false;
    public LabelName = '';
    public LabelDescription = '';
    public IsCreatingLabel = false;
    public CreateError = '';
    public CreatedLabelCount = 0;
    public CreatedItemCount = 0;

    private metadata = new Metadata();
    private destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        this.loadUserPreferences();
        this.LoadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Labels';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-tags';
    }

    // =======================================================================
    // Data loading
    // =======================================================================

    public async LoadData(): Promise<void> {
        try {
            this.IsLoading = true;
            this.cdr.markForCheck();

            const rv = new RunView();

            const [labelsResult, itemsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Version Labels',
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 500,
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Version Label Items',
                    Fields: ['VersionLabelID'],
                    ResultType: 'simple'
                }
            ]);

            if (labelsResult.Success) {
                this.Labels = labelsResult.Results as VersionLabelEntityType[];
                const items = itemsResult.Success
                    ? itemsResult.Results as VersionLabelItemEntityType[]
                    : [];
                this.ItemCountMap = this.buildItemCountMap(items);
                this.computeStats();
                this.applyFilters();
            }
        } catch (error) {
            console.error('Error loading version labels:', error);
        } finally {
            this.IsLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private buildItemCountMap(items: VersionLabelItemEntityType[]): Map<string, number> {
        const counts = new Map<string, number>();
        for (const item of items) {
            const labelId = item.VersionLabelID ?? '';
            counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
        }
        return counts;
    }

    public GetItemCount(labelId: string | undefined): number {
        return this.ItemCountMap.get(labelId ?? '') ?? 0;
    }

    public ResolveEntityName(entityId: string | undefined): string {
        if (!entityId) return '';
        const entity = this.metadata.Entities.find(e => e.ID === entityId);
        return entity ? entity.Name : '';
    }

    // =======================================================================
    // Stats
    // =======================================================================

    private computeStats(): void {
        // Only count root-level labels (exclude children) for stats
        const rootLabels = this.Labels.filter(l => !l.ParentID);
        this.TotalLabels = rootLabels.length;
        this.ActiveLabels = rootLabels.filter(l => l.Status === 'Active').length;
        this.ArchivedLabels = rootLabels.filter(l => l.Status === 'Archived').length;
        this.RestoredLabels = rootLabels.filter(l => l.Status === 'Restored').length;

        this.ScopeStats = this.computeScopeStats();
        this.StatusStats = this.computeStatusStats();
    }

    private computeScopeStats(): ScopeStat[] {
        const scopeMap = new Map<string, number>();
        for (const label of this.Labels) {
            const scope = label.Scope ?? 'Record';
            scopeMap.set(scope, (scopeMap.get(scope) ?? 0) + 1);
        }

        const scopeConfig: Record<string, { Icon: string; Color: string }> = {
            'System': { Icon: 'fa-solid fa-globe', Color: '#6366f1' },
            'Entity': { Icon: 'fa-solid fa-table', Color: '#3b82f6' },
            'Record': { Icon: 'fa-solid fa-file', Color: '#10b981' }
        };

        return Array.from(scopeMap.entries()).map(([scope, count]) => ({
            Scope: scope,
            Count: count,
            Icon: scopeConfig[scope]?.Icon ?? 'fa-solid fa-tag',
            Color: scopeConfig[scope]?.Color ?? '#64748b'
        }));
    }

    private computeStatusStats(): StatusStat[] {
        const statusMap = new Map<string, number>();
        for (const label of this.Labels) {
            const status = label.Status ?? 'Active';
            statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
        }

        const statusColors: Record<string, string> = {
            'Active': '#10b981',
            'Archived': '#6b7280',
            'Restored': '#f59e0b'
        };

        return Array.from(statusMap.entries()).map(([status, count]) => ({
            Status: status,
            Count: count,
            Color: statusColors[status] ?? '#64748b'
        }));
    }

    // =======================================================================
    // Filters
    // =======================================================================

    public applyFilters(): void {
        // First: exclude child labels (those with ParentID) from top-level list
        let result = this.Labels.filter(l => !l.ParentID);

        // Apply scope filter
        if (this.ScopeFilter) {
            result = result.filter(l => l.Scope === this.ScopeFilter);
        }

        // Apply status filter
        if (this.StatusFilter) {
            result = result.filter(l => l.Status === this.StatusFilter);
        }

        // Apply search
        if (this.SearchText) {
            const search = this.SearchText.toLowerCase();
            result = result.filter(l => {
                const name = (l.Name ?? '').toLowerCase();
                const desc = (l.Description ?? '').toLowerCase();
                const entityName = (l.Entity ?? this.ResolveEntityName(l.EntityID)).toLowerCase();
                return name.includes(search) || desc.includes(search) || entityName.includes(search);
            });
        }

        // Apply sorting
        result = this.sortLabels(result);

        this.FilteredLabels = result;
        this.cdr.markForCheck();
    }

    private sortLabels(labels: VersionLabelEntityType[]): VersionLabelEntityType[] {
        const dir = this.SortDirection === 'asc' ? 1 : -1;
        return [...labels].sort((a, b) => {
            switch (this.SortField) {
                case 'Name':
                    return dir * (a.Name ?? '').localeCompare(b.Name ?? '');
                case 'Scope':
                    return dir * (a.Scope ?? '').localeCompare(b.Scope ?? '');
                case 'Status':
                    return dir * (a.Status ?? '').localeCompare(b.Status ?? '');
                case 'Items': {
                    const aCount = this.GetItemCount(a.ID);
                    const bCount = this.GetItemCount(b.ID);
                    return dir * (aCount - bCount);
                }
                case 'Date':
                default: {
                    const aDate = (a as Record<string, unknown>)['__mj_CreatedAt'] ?? '';
                    const bDate = (b as Record<string, unknown>)['__mj_CreatedAt'] ?? '';
                    return dir * String(aDate).localeCompare(String(bDate));
                }
            }
        });
    }

    public OnSortChange(field: SortField): void {
        if (this.SortField === field) {
            this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.SortField = field;
            this.SortDirection = field === 'Date' ? 'desc' : 'asc';
        }
        this.applyFilters();
        this.persistPreferences();
    }

    public GetSortIcon(field: SortField): string {
        if (this.SortField !== field) return 'fa-solid fa-sort';
        return this.SortDirection === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
    }

    public OnScopeFilterChange(scope: string): void {
        this.ScopeFilter = this.ScopeFilter === scope ? '' : scope;
        this.applyFilters();
        this.persistPreferences();
    }

    public OnStatusFilterChange(status: string): void {
        this.StatusFilter = this.StatusFilter === status ? '' : status;
        this.applyFilters();
        this.persistPreferences();
    }

    public OnSearchChange(text: string): void {
        this.SearchText = text;
        this.applyFilters();
    }

    public Refresh(): void {
        this.LoadData();
    }

    // =======================================================================
    // View mode and detail panel
    // =======================================================================

    public ToggleViewMode(): void {
        this.ViewMode = this.ViewMode === 'card' ? 'list' : 'card';
        this.persistPreferences();
        this.cdr.markForCheck();
    }

    public SetViewMode(mode: 'card' | 'list'): void {
        if (this.ViewMode !== mode) {
            this.ViewMode = mode;
            this.persistPreferences();
            this.cdr.markForCheck();
        }
    }

    public OnLabelClick(label: VersionLabelEntityType): void {
        this.SelectedLabel = label;
        this.ShowDetailPanel = true;
        this.cdr.markForCheck();
    }

    public OnDetailPanelClose(): void {
        this.ShowDetailPanel = false;
        this.SelectedLabel = null;
        this.cdr.markForCheck();
    }

    public OnLabelUpdated(): void {
        this.LoadData();
    }

    // =======================================================================
    // User preferences
    // =======================================================================

    private loadUserPreferences(): void {
        try {
            const json = UserInfoEngine.Instance.GetSetting(VersionHistoryLabelsResourceComponent.PREFS_KEY);
            if (json) {
                const prefs = JSON.parse(json) as VersionLabelPreferences;
                this.ViewMode = prefs.ViewMode ?? 'card';
                this.ScopeFilter = prefs.ActiveScopeFilter ?? '';
                this.StatusFilter = prefs.ActiveStatusFilter ?? '';
                if (prefs.SortField) this.SortField = prefs.SortField as SortField;
                if (prefs.SortDirection) this.SortDirection = prefs.SortDirection;
            }
        } catch (e) {
            console.warn('[VersionLabels] Failed to load user preferences:', e);
        } finally {
            this.preferencesLoaded = true;
        }
    }

    private persistPreferences(): void {
        if (!this.preferencesLoaded) return;

        const prefs: VersionLabelPreferences = {
            ViewMode: this.ViewMode,
            ActiveScopeFilter: this.ScopeFilter,
            ActiveStatusFilter: this.StatusFilter,
            DefaultDetailTab: 'overview',
            SortField: this.SortField,
            SortDirection: this.SortDirection,
        };

        UserInfoEngine.Instance.SetSettingDebounced(
            VersionHistoryLabelsResourceComponent.PREFS_KEY,
            JSON.stringify(prefs)
        );
    }

    // =======================================================================
    // Create Label Dialog
    // =======================================================================

    public OpenCreateDialog(): void {
        this.resetCreateDialog();
        this.ShowCreateDialog = true;
        this.FilteredEntities = this.getTrackableEntities();
        this.cdr.markForCheck();
    }

    public CloseCreateDialog(): void {
        this.ShowCreateDialog = false;
        this.cdr.markForCheck();
    }

    public OnEntitySearchChange(text: string): void {
        this.EntitySearchText = text;
        const search = text.toLowerCase();
        const all = this.getTrackableEntities();
        this.FilteredEntities = search
            ? all.filter(e => e.Name.toLowerCase().includes(search))
            : all;
        this.cdr.markForCheck();
    }

    public SelectEntity(entity: EntityInfo): void {
        this.SelectedEntity = entity;
        this.CreateStep = 'records';
        this.loadEntityRecords(entity);
    }

    public OnRecordSearchChange(text: string): void {
        this.RecordSearchText = text;
        const search = text.toLowerCase();
        this.FilteredRecords = search
            ? this.AvailableRecords.filter(r => r.DisplayName.toLowerCase().includes(search))
            : [...this.AvailableRecords];
        this.cdr.markForCheck();
    }

    public ToggleRecordSelection(record: RecordOption): void {
        record.Selected = !record.Selected;
        this.cdr.markForCheck();
    }

    public SelectAllRecords(): void {
        for (const r of this.FilteredRecords) {
            r.Selected = true;
        }
        this.cdr.markForCheck();
    }

    public DeselectAllRecords(): void {
        for (const r of this.AvailableRecords) {
            r.Selected = false;
        }
        this.cdr.markForCheck();
    }

    public get SelectedRecordCount(): number {
        return this.AvailableRecords.filter(r => r.Selected).length;
    }

    public GoToDetailsStep(): void {
        if (this.SelectedRecordCount === 0) return;
        this.CreateStep = 'details';
        this.LabelName = this.suggestLabelName();
        this.cdr.markForCheck();
    }

    public GoBackToRecords(): void {
        this.CreateStep = 'records';
        this.cdr.markForCheck();
    }

    public GoBackToEntity(): void {
        this.CreateStep = 'entity';
        this.SelectedEntity = null;
        this.AvailableRecords = [];
        this.FilteredRecords = [];
        this.cdr.markForCheck();
    }

    public async CreateLabels(): Promise<void> {
        if (!this.SelectedEntity || !this.LabelName.trim()) return;

        this.IsCreatingLabel = true;
        this.CreateStep = 'creating';
        this.CreateError = '';
        this.CreatedLabelCount = 0;
        this.CreatedItemCount = 0;
        this.cdr.markForCheck();

        try {
            const selected = this.AvailableRecords.filter(r => r.Selected);
            const md = new Metadata();

            if (selected.length === 1) {
                await this.createSingleLabel(md, selected[0]);
            } else {
                await this.createGroupedLabels(md, selected);
            }

            this.CreateStep = 'done';
        } catch (e: unknown) {
            this.CreateError = e instanceof Error ? e.message : String(e);
            this.CreateStep = 'done';
        } finally {
            this.IsCreatingLabel = false;
            this.cdr.markForCheck();
        }
    }

    public FinishCreate(): void {
        this.CloseCreateDialog();
        this.LoadData();
    }

    // =======================================================================
    // Create helpers
    // =======================================================================

    private async createSingleLabel(md: Metadata, record: RecordOption): Promise<void> {
        const vhClient = new GraphQLVersionHistoryClient(GraphQLDataProvider.Instance);
        const result = await vhClient.CreateLabel({
            Name: this.LabelName.trim(),
            Description: this.LabelDescription.trim() || undefined,
            Scope: 'Record',
            EntityName: this.SelectedEntity!.Name,
            RecordKeys: [{ Key: 'ID', Value: record.ID }],
            IncludeDependencies: true,
        });

        if (!result.Success) {
            throw new Error(result.Error ?? 'Failed to create version label');
        }

        this.CreatedLabelCount = 1;
        this.CreatedItemCount = result.ItemsCaptured ?? 0;
    }

    private async createGroupedLabels(md: Metadata, records: RecordOption[]): Promise<void> {
        const vhClient = new GraphQLVersionHistoryClient(GraphQLDataProvider.Instance);

        // Create parent container label (no RecordKey → acts as a grouping label)
        const parentResult = await vhClient.CreateLabel({
            Name: this.LabelName.trim(),
            Description: this.LabelDescription.trim() || undefined,
            Scope: 'Entity',
            EntityName: this.SelectedEntity!.Name,
        });

        if (!parentResult.Success) {
            throw new Error(parentResult.Error ?? 'Failed to create parent version label');
        }

        this.CreatedLabelCount = 1;
        this.CreatedItemCount = parentResult.ItemsCaptured ?? 0;
        this.cdr.markForCheck();

        // Create child labels for each selected record
        for (const record of records) {
            const childResult = await vhClient.CreateLabel({
                Name: `${this.LabelName.trim()} — ${record.DisplayName}`,
                Description: this.LabelDescription.trim() || undefined,
                Scope: 'Record',
                EntityName: this.SelectedEntity!.Name,
                RecordKeys: [{ Key: 'ID', Value: record.ID }],
                ParentID: parentResult.LabelID,
                IncludeDependencies: true,
            });

            if (!childResult.Success) {
                console.error(`Failed to create child label for record ${record.ID}: ${childResult.Error}`);
                continue;
            }

            this.CreatedLabelCount++;
            this.CreatedItemCount += childResult.ItemsCaptured ?? 0;
            this.cdr.markForCheck();
        }
    }

    private async loadEntityRecords(entity: EntityInfo): Promise<void> {
        this.IsLoadingRecords = true;
        this.AvailableRecords = [];
        this.FilteredRecords = [];
        this.RecordSearchText = '';
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const nameField = this.findNameField(entity);
            const fields = nameField ? ['ID', nameField] : ['ID'];

            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: entity.Name,
                Fields: fields,
                OrderBy: nameField ?? 'ID',
                MaxRows: 500,
                ResultType: 'simple'
            });

            if (result.Success) {
                this.AvailableRecords = result.Results.map(r => ({
                    ID: String(r['ID'] ?? ''),
                    DisplayName: nameField
                        ? String(r[nameField] ?? r['ID'] ?? '')
                        : String(r['ID'] ?? ''),
                    Selected: false
                }));
                this.FilteredRecords = [...this.AvailableRecords];
            }
        } catch (error) {
            console.error('Error loading entity records:', error);
        } finally {
            this.IsLoadingRecords = false;
            this.cdr.markForCheck();
        }
    }

    private findNameField(entity: EntityInfo): string | null {
        // Look for common display name fields in order of preference
        const candidates = ['Name', 'Title', 'DisplayName', 'Label', 'Subject', 'Description'];
        for (const name of candidates) {
            const field = entity.Fields.find(f =>
                f.Name.toLowerCase() === name.toLowerCase() && f.TSType === 'string'
            );
            if (field) return field.Name;
        }
        // Fall back to the entity's NameField if defined
        return null;
    }

    private getTrackableEntities(): EntityInfo[] {
        return this.metadata.Entities
            .filter(e => e.TrackRecordChanges)
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    private suggestLabelName(): string {
        const entityName = this.SelectedEntity?.Name ?? '';
        const selected = this.AvailableRecords.filter(r => r.Selected);
        if (selected.length === 1) {
            return `${selected[0].DisplayName} v1.0`;
        }
        const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `${entityName} — ${date}`;
    }

    private resetCreateDialog(): void {
        this.CreateStep = 'entity';
        this.EntitySearchText = '';
        this.SelectedEntity = null;
        this.RecordSearchText = '';
        this.AvailableRecords = [];
        this.FilteredRecords = [];
        this.IsLoadingRecords = false;
        this.LabelName = '';
        this.LabelDescription = '';
        this.IsCreatingLabel = false;
        this.CreateError = '';
        this.CreatedLabelCount = 0;
        this.CreatedItemCount = 0;
    }

    // =======================================================================
    // Display helpers
    // =======================================================================

    public GetScopeIcon(scope: string | undefined): string {
        const icons: Record<string, string> = {
            'System': 'fa-solid fa-globe',
            'Entity': 'fa-solid fa-table',
            'Record': 'fa-solid fa-file'
        };
        return icons[scope ?? ''] ?? 'fa-solid fa-tag';
    }

    public GetStatusClass(status: string | undefined): string {
        const classes: Record<string, string> = {
            'Active': 'status-active',
            'Archived': 'status-archived',
            'Restored': 'status-restored'
        };
        return classes[status ?? ''] ?? '';
    }

    public FormatDate(date: Date | string | undefined): string {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    public FormatNumber(num: number): string {
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
    }

    public FormatDuration(ms: number | undefined): string {
        if (!ms) return '';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    }

    public IsGroupParent(label: VersionLabelEntityType): boolean {
        return !label.RecordID && !label.ParentID && !!label.EntityID;
    }

    public GetChildLabels(parentId: string | undefined): VersionLabelEntityType[] {
        if (!parentId) return [];
        return this.Labels.filter(l => l.ParentID === parentId);
    }
}

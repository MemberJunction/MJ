import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView, Metadata, BaseEntity } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadVersionHistoryLabelsResource() {
    // Prevents tree-shaking
}

interface LabelViewModel {
    ID: string;
    Name: string;
    Description: string;
    Scope: string;
    Status: string;
    EntityID: string;
    EntityName: string;
    RecordID: string;
    CreatedAt: Date;
    CreatedByUserID: string;
    CreatedByUserName: string;
    ItemCount: number;
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

@RegisterClass(BaseResourceComponent, 'VersionHistoryLabelsResource')
@Component({
    selector: 'mj-version-history-labels-resource',
    templateUrl: './labels-resource.component.html',
    styleUrls: ['./labels-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionHistoryLabelsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public IsLoading = true;

    // Stats
    public TotalLabels = 0;
    public ActiveLabels = 0;
    public ArchivedLabels = 0;
    public RestoredLabels = 0;

    // Grouped data
    public ScopeStats: ScopeStat[] = [];
    public StatusStats: StatusStat[] = [];
    public Labels: LabelViewModel[] = [];
    public FilteredLabels: LabelViewModel[] = [];

    // Filters
    public ScopeFilter = '';
    public StatusFilter = '';
    public SearchText = '';

    private destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
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
                const itemCounts = this.buildItemCountMap(
                    itemsResult.Success ? itemsResult.Results as Record<string, unknown>[] : []
                );
                this.processLabels(labelsResult.Results as Record<string, unknown>[], itemCounts);
            }
        } catch (error) {
            console.error('Error loading version labels:', error);
        } finally {
            this.IsLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private buildItemCountMap(items: Record<string, unknown>[]): Map<string, number> {
        const counts = new Map<string, number>();
        for (const item of items) {
            const labelId = item['VersionLabelID'] as string;
            counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
        }
        return counts;
    }

    private processLabels(rows: Record<string, unknown>[], itemCounts: Map<string, number>): void {
        this.Labels = rows.map(row => ({
            ID: row['ID'] as string,
            Name: row['Name'] as string,
            Description: (row['Description'] as string) ?? '',
            Scope: row['Scope'] as string,
            Status: row['Status'] as string,
            EntityID: (row['EntityID'] as string) ?? '',
            EntityName: this.resolveEntityName(row['EntityID'] as string),
            RecordID: (row['RecordID'] as string) ?? '',
            CreatedAt: new Date(row['__mj_CreatedAt'] as string),
            CreatedByUserID: (row['CreatedByUserID'] as string) ?? '',
            CreatedByUserName: '',
            ItemCount: itemCounts.get(row['ID'] as string) ?? 0
        }));

        this.computeStats();
        this.applyFilters();
    }

    private resolveEntityName(entityId: string): string {
        if (!entityId) return '';
        try {
            const md = new Metadata();
            const entity = md.Entities.find(e => e.ID === entityId);
            return entity ? entity.Name : '';
        } catch {
            return '';
        }
    }

    private computeStats(): void {
        this.TotalLabels = this.Labels.length;
        this.ActiveLabels = this.Labels.filter(l => l.Status === 'Active').length;
        this.ArchivedLabels = this.Labels.filter(l => l.Status === 'Archived').length;
        this.RestoredLabels = this.Labels.filter(l => l.Status === 'Restored').length;

        this.ScopeStats = this.computeScopeStats();
        this.StatusStats = this.computeStatusStats();
    }

    private computeScopeStats(): ScopeStat[] {
        const scopeMap = new Map<string, number>();
        for (const label of this.Labels) {
            scopeMap.set(label.Scope, (scopeMap.get(label.Scope) ?? 0) + 1);
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
            statusMap.set(label.Status, (statusMap.get(label.Status) ?? 0) + 1);
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

    public applyFilters(): void {
        this.FilteredLabels = this.Labels.filter(l => {
            if (this.ScopeFilter && l.Scope !== this.ScopeFilter) return false;
            if (this.StatusFilter && l.Status !== this.StatusFilter) return false;
            if (this.SearchText) {
                const search = this.SearchText.toLowerCase();
                return l.Name.toLowerCase().includes(search) ||
                       l.Description.toLowerCase().includes(search) ||
                       l.EntityName.toLowerCase().includes(search);
            }
            return true;
        });
        this.cdr.markForCheck();
    }

    public OnScopeFilterChange(scope: string): void {
        this.ScopeFilter = this.ScopeFilter === scope ? '' : scope;
        this.applyFilters();
    }

    public OnStatusFilterChange(status: string): void {
        this.StatusFilter = this.StatusFilter === status ? '' : status;
        this.applyFilters();
    }

    public OnSearchChange(text: string): void {
        this.SearchText = text;
        this.applyFilters();
    }

    public Refresh(): void {
        this.LoadData();
    }

    public GetScopeIcon(scope: string): string {
        const icons: Record<string, string> = {
            'System': 'fa-solid fa-globe',
            'Entity': 'fa-solid fa-table',
            'Record': 'fa-solid fa-file'
        };
        return icons[scope] ?? 'fa-solid fa-tag';
    }

    public GetStatusClass(status: string): string {
        const classes: Record<string, string> = {
            'Active': 'status-active',
            'Archived': 'status-archived',
            'Restored': 'status-restored'
        };
        return classes[status] ?? '';
    }

    public FormatDate(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    public FormatNumber(num: number): string {
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
    }
}

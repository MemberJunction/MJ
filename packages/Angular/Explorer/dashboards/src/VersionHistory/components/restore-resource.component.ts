import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView, Metadata } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadVersionHistoryRestoreResource() {
    // Prevents tree-shaking
}

interface RestoreHistoryItem {
    ID: string;
    LabelID: string;
    LabelName: string;
    RestoreDate: Date;
    RestoredByUserID: string;
    Status: string;
    TotalItems: number;
    ItemsRestored: number;
    ItemsFailed: number;
    ItemsSkipped: number;
    DryRun: boolean;
    SafetyLabelID: string;
    ErrorLog: string;
}

@RegisterClass(BaseResourceComponent, 'VersionHistoryRestoreResource')
@Component({
    selector: 'mj-version-history-restore-resource',
    templateUrl: './restore-resource.component.html',
    styleUrls: ['./restore-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionHistoryRestoreResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public IsLoading = true;

    // Stats
    public TotalRestores = 0;
    public SuccessfulRestores = 0;
    public FailedRestores = 0;
    public DryRunCount = 0;

    // Data
    public Restores: RestoreHistoryItem[] = [];
    public FilteredRestores: RestoreHistoryItem[] = [];

    // Filters
    public StatusFilter = '';
    public ShowDryRunOnly = false;

    // Expanded detail
    public ExpandedRestoreId = '';

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
        return 'Restore History';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-clock-rotate-left';
    }

    public async LoadData(): Promise<void> {
        try {
            this.IsLoading = true;
            this.cdr.markForCheck();

            const rv = new RunView();

            const [restoresResult, labelsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Version Label Restores',
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 200,
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Version Labels',
                    Fields: ['ID', 'Name'],
                    ResultType: 'simple'
                }
            ]);

            if (restoresResult.Success) {
                const labelMap = this.buildLabelNameMap(
                    labelsResult.Success ? labelsResult.Results as Record<string, unknown>[] : []
                );
                this.processRestores(restoresResult.Results as Record<string, unknown>[], labelMap);
            }
        } catch (error) {
            console.error('Error loading restore history:', error);
        } finally {
            this.IsLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private buildLabelNameMap(labels: Record<string, unknown>[]): Map<string, string> {
        const map = new Map<string, string>();
        for (const label of labels) {
            map.set(label['ID'] as string, label['Name'] as string);
        }
        return map;
    }

    private processRestores(
        rows: Record<string, unknown>[],
        labelMap: Map<string, string>
    ): void {
        this.Restores = rows.map(row => ({
            ID: row['ID'] as string,
            LabelID: row['VersionLabelID'] as string,
            LabelName: labelMap.get(row['VersionLabelID'] as string) ?? 'Unknown',
            RestoreDate: new Date(row['__mj_CreatedAt'] as string),
            RestoredByUserID: (row['RestoredByUserID'] as string) ?? '',
            Status: row['Status'] as string,
            TotalItems: (row['TotalItems'] as number) ?? 0,
            ItemsRestored: (row['ItemsRestored'] as number) ?? 0,
            ItemsFailed: (row['ItemsFailed'] as number) ?? 0,
            ItemsSkipped: (row['ItemsSkipped'] as number) ?? 0,
            DryRun: (row['DryRun'] as boolean) ?? false,
            SafetyLabelID: (row['SafetyLabelID'] as string) ?? '',
            ErrorLog: (row['ErrorLog'] as string) ?? ''
        }));

        this.computeStats();
        this.applyFilters();
    }

    private computeStats(): void {
        this.TotalRestores = this.Restores.length;
        this.SuccessfulRestores = this.Restores.filter(r => r.Status === 'Completed').length;
        this.FailedRestores = this.Restores.filter(r => r.Status === 'Failed').length;
        this.DryRunCount = this.Restores.filter(r => r.DryRun).length;
    }

    public applyFilters(): void {
        this.FilteredRestores = this.Restores.filter(r => {
            if (this.StatusFilter && r.Status !== this.StatusFilter) return false;
            if (this.ShowDryRunOnly && !r.DryRun) return false;
            return true;
        });
        this.cdr.markForCheck();
    }

    public OnStatusFilterChange(status: string): void {
        this.StatusFilter = this.StatusFilter === status ? '' : status;
        this.applyFilters();
    }

    public ToggleDryRunFilter(): void {
        this.ShowDryRunOnly = !this.ShowDryRunOnly;
        this.applyFilters();
    }

    public ToggleExpand(restoreId: string): void {
        this.ExpandedRestoreId = this.ExpandedRestoreId === restoreId ? '' : restoreId;
        this.cdr.markForCheck();
    }

    public IsExpanded(restoreId: string): boolean {
        return this.ExpandedRestoreId === restoreId;
    }

    public GetStatusClass(status: string): string {
        const classes: Record<string, string> = {
            'Completed': 'status-success',
            'Failed': 'status-failed',
            'In Progress': 'status-progress',
            'Pending': 'status-pending'
        };
        return classes[status] ?? '';
    }

    public GetStatusIcon(status: string): string {
        const icons: Record<string, string> = {
            'Completed': 'fa-solid fa-circle-check',
            'Failed': 'fa-solid fa-circle-xmark',
            'In Progress': 'fa-solid fa-spinner fa-spin',
            'Pending': 'fa-solid fa-clock'
        };
        return icons[status] ?? 'fa-solid fa-circle';
    }

    public GetProgressPercent(restore: RestoreHistoryItem): number {
        if (restore.TotalItems === 0) return 0;
        return Math.round((restore.ItemsRestored / restore.TotalItems) * 100);
    }

    public FormatDate(date: Date): string {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    public Refresh(): void {
        this.LoadData();
    }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
import { ResourceData, UserInfoEngine, VersionLabelRestoreEntityType } from '@memberjunction/core-entities';

interface VersionRestorePreferences {
    StatusFilter: string;
}

export function LoadVersionHistoryRestoreResource() {
    // Prevents tree-shaking
}

@RegisterClass(BaseResourceComponent, 'VersionHistoryRestoreResource')
@Component({
  standalone: false,
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
    public PartialRestores = 0;

    // Data
    public Restores: VersionLabelRestoreEntityType[] = [];
    public FilteredRestores: VersionLabelRestoreEntityType[] = [];

    // Filters
    public StatusFilter = '';

    // Expanded detail
    public ExpandedRestoreId = '';

    private static readonly PREFS_KEY = 'VersionHistory.Restore.UserPreferences';
    private preferencesLoaded = false;
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
            const result = await rv.RunView<VersionLabelRestoreEntityType>({
                EntityName: 'MJ: Version Label Restores',
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 200,
                ResultType: 'simple'
            });

            if (result.Success) {
                this.Restores = result.Results;
                this.computeStats();
                this.applyFilters();
            }
        } catch (error) {
            console.error('Error loading restore history:', error);
        } finally {
            this.IsLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private computeStats(): void {
        this.TotalRestores = this.Restores.length;
        this.SuccessfulRestores = this.Restores.filter(r => r.Status === 'Complete').length;
        this.FailedRestores = this.Restores.filter(r => r.Status === 'Error').length;
        this.PartialRestores = this.Restores.filter(r => r.Status === 'Partial').length;
    }

    public applyFilters(): void {
        this.FilteredRestores = this.Restores.filter(r => {
            if (this.StatusFilter && r.Status !== this.StatusFilter) return false;
            return true;
        });
        this.cdr.markForCheck();
    }

    public OnStatusFilterChange(status: string): void {
        this.StatusFilter = this.StatusFilter === status ? '' : status;
        this.applyFilters();
        this.persistPreferences();
    }

    private loadUserPreferences(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(VersionHistoryRestoreResourceComponent.PREFS_KEY);
            if (raw) {
                const prefs: VersionRestorePreferences = JSON.parse(raw);
                if (prefs.StatusFilter != null) {
                    this.StatusFilter = prefs.StatusFilter;
                }
            }
        } catch (error) {
            console.error('Error loading restore preferences:', error);
            this.StatusFilter = '';
        }
        this.preferencesLoaded = true;
    }

    private persistPreferences(): void {
        if (!this.preferencesLoaded) return;
        const prefs: VersionRestorePreferences = {
            StatusFilter: this.StatusFilter
        };
        UserInfoEngine.Instance.SetSettingDebounced(VersionHistoryRestoreResourceComponent.PREFS_KEY, JSON.stringify(prefs));
    }

    public ToggleExpand(restoreId: string | undefined): void {
        const id = restoreId ?? '';
        this.ExpandedRestoreId = this.ExpandedRestoreId === id ? '' : id;
        this.cdr.markForCheck();
    }

    public IsExpanded(restoreId: string | undefined): boolean {
        return this.ExpandedRestoreId === (restoreId ?? '');
    }

    public GetStatusClass(status: string | undefined): string {
        const classes: Record<string, string> = {
            'Complete': 'status-success',
            'Error': 'status-failed',
            'In Progress': 'status-progress',
            'Pending': 'status-pending',
            'Partial': 'status-partial'
        };
        return classes[status ?? ''] ?? '';
    }

    public GetStatusIcon(status: string | undefined): string {
        const icons: Record<string, string> = {
            'Complete': 'fa-solid fa-circle-check',
            'Error': 'fa-solid fa-circle-xmark',
            'In Progress': 'fa-solid fa-spinner fa-spin',
            'Pending': 'fa-solid fa-clock',
            'Partial': 'fa-solid fa-circle-half-stroke'
        };
        return icons[status ?? ''] ?? 'fa-solid fa-circle';
    }

    public GetProgressPercent(restore: VersionLabelRestoreEntityType): number {
        if (!restore.TotalItems) return 0;
        return Math.round(((restore.CompletedItems ?? 0) / restore.TotalItems) * 100);
    }

    public FormatDate(date: Date | string | undefined): string {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleDateString('en-US', {
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

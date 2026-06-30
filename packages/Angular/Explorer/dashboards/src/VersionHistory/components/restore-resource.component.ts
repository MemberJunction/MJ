import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
import { ResourceData, UserInfoEngine, MJVersionLabelRestoreEntityType } from '@memberjunction/core-entities';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { AgentToolResult, validateStringParam } from '../../shared/agent-tool-validation';
import {
    buildVersionHistoryRestoreAgentContext,
    isValidRestoreStatusFilter,
    resolveRestore,
    RESTORE_STATUS_FILTERS,
    RESTORE_LIST_CAP,
    RestoreSnapshot,
    RestoreSummaryItem,
} from '../version-history-restore-agent-context';

interface VersionRestorePreferences {
    StatusFilter: string;
}
@RegisterClass(BaseResourceComponent, 'VersionHistoryRestoreResource')
@Component({
  standalone: false,
    selector: 'mj-version-history-restore-resource',
    templateUrl: './restore-resource.component.html',
    styleUrls: ['./restore-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionHistoryRestoreResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {
    public IsLoading = true;

    // Stats
    public TotalRestores = 0;
    public SuccessfulRestores = 0;
    public FailedRestores = 0;
    public PartialRestores = 0;

    // Data
    public Restores: MJVersionLabelRestoreEntityType[] = [];
    public FilteredRestores: MJVersionLabelRestoreEntityType[] = [];

    // Filters
    public StatusFilter = '';

    // Expanded detail
    public ExpandedRestoreId = '';

    private static readonly PREFS_KEY = 'VersionHistory.Restore.UserPreferences';
    private preferencesLoaded = false;
    protected override destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        super.ngOnInit();
        this.loadUserPreferences();
        this.LoadData();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * After the view initializes, publish the initial agent context and register
     * the client tools the AI agent can invoke against this surface. The ongoing
     * context re-emit happens in {@link applyFilters} / {@link LoadData}.
     */
    ngAfterViewInit(): void {
        this.publishAgentContext();
        this.registerAgentClientTools();
    }

    // ========================================
    // AI AGENT CONTEXT & CLIENT TOOLS
    //
    // 🔒 SAFETY BOUNDARY: This surface exposes ONLY read-only / filter / refresh /
    // select-for-view tools to the agent. The actual restore/rollback operation is
    // DESTRUCTIVE (it overwrites live records from a historical version) and is
    // intentionally NOT exposed as a client tool — neither is any label mutation
    // or deletion. SelectRestore only EXPANDS a history row for inspection; it
    // performs no restore. The agent can browse, filter, and inspect restore
    // history; a human must initiate any real restore from the UI.
    // ========================================

    /**
     * Publish the current Restore-surface state to the AI agent via NavigationService.
     * Shaping lives in the pure {@link buildVersionHistoryRestoreAgentContext} helper
     * so it stays unit-testable. Called on load and on every filter change.
     */
    private publishAgentContext(): void {
        const recentRestores: RestoreSummaryItem[] = this.FilteredRestores
            .slice(0, RESTORE_LIST_CAP)
            .map(r => ({ ID: r.ID ?? '', Name: r.VersionLabel ?? '', Status: r.Status ?? '' }));
        const selected = this.ExpandedRestoreId
            ? this.Restores.find(r => r.ID === this.ExpandedRestoreId)
            : undefined;
        const context = buildVersionHistoryRestoreAgentContext({
            TotalRestores: this.TotalRestores,
            SuccessfulRestores: this.SuccessfulRestores,
            FailedRestores: this.FailedRestores,
            PartialRestores: this.PartialRestores,
            StatusFilter: this.StatusFilter,
            FilteredRestoreCount: this.FilteredRestores.length,
            RecentRestores: recentRestores,
            SelectedRestoreId: selected?.ID ?? null,
            SelectedRestoreName: selected?.VersionLabel ?? null,
        });
        this.navigationService.SetAgentContext(this, context);
    }

    /** The loaded restores narrowed to the resolver's {@link RestoreSnapshot} shape. */
    private restoreSnapshots(): RestoreSnapshot[] {
        return this.Restores.map(r => ({ ID: r.ID ?? '', Name: r.VersionLabel ?? '', Status: r.Status ?? '' }));
    }

    /**
     * Register the read-only client tools the AI agent can invoke against the
     * Restore surface. Each handler is tolerant — it never throws and returns a
     * typed `{ Success, Data?, ErrorMessage? }` result.
     *
     * Tools:
     * - FilterRestoresByStatus: filter the history by a restore status.
     * - RefreshRestoreHistory: reload the restore history from the server.
     * - GetRestoreStats: return the current restore-status counts.
     * - SelectRestore: expand a restore's detail row (by ID or name) for viewing.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'FilterRestoresByStatus',
                Description: `Filter the restore history by status. Valid values: ${RESTORE_STATUS_FILTERS.filter(s => s).join(', ')}. Pass an empty string to clear the filter.`,
                ParameterSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterRestoresByStatus(params),
            },
            {
                Name: 'RefreshRestoreHistory',
                Description: 'Reload the restore history from the server.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.LoadData();
                    return { Success: true, Data: { TotalRestores: this.TotalRestores } };
                },
            },
            {
                Name: 'GetRestoreStats',
                Description: 'Get the current restore-history statistics (total, successful, failed, partial, and filtered counts).',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => ({
                    Success: true,
                    Data: {
                        TotalRestores: this.TotalRestores,
                        SuccessfulRestores: this.SuccessfulRestores,
                        FailedRestores: this.FailedRestores,
                        PartialRestores: this.PartialRestores,
                        StatusFilter: this.StatusFilter,
                        FilteredRestoreCount: this.FilteredRestores.length,
                    },
                }),
            },
            {
                Name: 'SelectRestore',
                Description: 'Expand a restore history entry by its ID or name to inspect its details. Resolution: exact ID, then exact name, then a name-contains match. View-only — performs no restore, rollback, or mutation.',
                ParameterSchema: { type: 'object', properties: { restore: { type: 'string', description: 'Restore ID or name.' } }, required: ['restore'] },
                Handler: async (params: Record<string, unknown>) => this.toolSelectRestore(params),
            },
        ]);
    }

    /**
     * Expand a restore's detail row by ID or name (view-only). Resolves via the
     * pure {@link resolveRestore} helper (exact ID → exact name → name-contains).
     * Never throws.
     */
    private toolSelectRestore(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
        const parsed = validateStringParam(params['restore'], 'restore');
        if (!parsed.ok) {
            return parsed.result;
        }
        const resolution = resolveRestore(parsed.value, this.restoreSnapshots());
        if (!resolution.ok) {
            return { Success: false, ErrorMessage: resolution.error };
        }
        // Set the expanded id directly (ToggleExpand has toggle semantics; we want
        // the agent to always land on the resolved restore being expanded).
        this.ExpandedRestoreId = resolution.restore.ID;
        this.publishAgentContext();
        this.cdr.markForCheck();
        return { Success: true, Data: { SelectedRestoreId: resolution.restore.ID, SelectedRestoreName: resolution.restore.Name } };
    }

    /**
     * Apply a status filter for the restore history. Validates the requested
     * status and sets it deterministically (does NOT use the toggle semantics of
     * {@link OnStatusFilterChange}, so the agent always lands on the requested
     * filter regardless of the current state).
     */
    private toolFilterRestoresByStatus(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
        const parsed = validateStringParam(params['status'], 'status');
        if (!parsed.ok) {
            return parsed.result;
        }
        if (!isValidRestoreStatusFilter(parsed.value)) {
            const valid = RESTORE_STATUS_FILTERS.filter(s => s).join(', ');
            return { Success: false, ErrorMessage: `Invalid status "${parsed.value}". Expected one of: ${valid} (or an empty string to clear).` };
        }
        this.StatusFilter = parsed.value;
        this.applyFilters();
        this.persistPreferences();
        return { Success: true, Data: { StatusFilter: this.StatusFilter, FilteredRestoreCount: this.FilteredRestores.length } };
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

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJVersionLabelRestoreEntityType>({
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
            this.publishAgentContext();
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
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnStatusFilterChange(status: string): void {
        this.StatusFilter = this.StatusFilter === status ? '' : status;
        this.applyFilters();
        this.persistPreferences();
    }

    // -- Concise chrome: Status lives behind the one Filter popover ------------

    public get statusFilterFields(): FilterFieldConfig[] {
        return [{
            key: 'status',
            type: 'chips',
            label: 'Status',
            chipOptions: [
                { text: 'All', value: '' },
                { text: 'Complete', value: 'Complete', icon: 'fa-solid fa-circle-check' },
                { text: 'Error', value: 'Error', icon: 'fa-solid fa-circle-xmark' },
                { text: 'Partial', value: 'Partial', icon: 'fa-solid fa-circle-half-stroke' },
            ],
        }];
    }

    public get statusFilterValues(): Record<string, unknown> {
        return { status: this.StatusFilter };
    }

    public get ActiveFilterCount(): number {
        return this.StatusFilter ? 1 : 0;
    }

    public onFilterValuesChange(values: Record<string, unknown>): void {
        this.StatusFilter = (values['status'] as string) ?? '';
        this.applyFilters();
        this.persistPreferences();
    }

    public resetStatusFilter(): void {
        this.StatusFilter = '';
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

    public GetProgressPercent(restore: MJVersionLabelRestoreEntityType): number {
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

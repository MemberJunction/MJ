import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ResourceData, MJAuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
import { FilterFieldConfig, ViewToggleOption } from '@memberjunction/ng-ui-components';
// The Credential Access AuditLogType ID from metadata
const CREDENTIAL_ACCESS_AUDIT_LOG_TYPE_ID = 'E8D4D100-E785-42D3-997F-ECFF3B0BCFC0';

interface AuditLogWithDetails extends MJAuditLogEntity {
    parsedDetails?: ParsedDetails;
}

interface ParsedDetails {
    operation?: string;
    subsystem?: string;
    credentialType?: string;
    credentialId?: string;
    ipAddress?: string;
    userAgent?: string;
    duration?: number;
    errorMessage?: string;
}

interface TimelineGroup {
    date: string;
    displayDate: string;
    logs: AuditLogWithDetails[];
}

@RegisterClass(BaseResourceComponent, 'CredentialsAuditResource')
@Component({
  standalone: false,
    selector: 'mj-credentials-audit-resource',
    templateUrl: './credentials-audit-resource.component.html',
    styleUrls: ['./credentials-audit-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsAuditResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public AuditLogs: AuditLogWithDetails[] = [];

    /** @deprecated Use {@link AuditLogs}. */
    public get auditLogs(): AuditLogWithDetails[] {
      return this.AuditLogs;
    }
    /** @deprecated Use {@link AuditLogs}. */
    public set auditLogs(value: AuditLogWithDetails[]) {
      this.AuditLogs = value;
    }
    public FilteredLogs: AuditLogWithDetails[] = [];

    /** @deprecated Use {@link FilteredLogs}. */
    public get filteredLogs(): AuditLogWithDetails[] {
      return this.FilteredLogs;
    }
    /** @deprecated Use {@link FilteredLogs}. */
    public set filteredLogs(value: AuditLogWithDetails[]) {
      this.FilteredLogs = value;
    }
    public TimelineGroups: TimelineGroup[] = [];

    /** @deprecated Use {@link TimelineGroups}. */
    public get timelineGroups(): TimelineGroup[] {
      return this.TimelineGroups;
    }
    /** @deprecated Use {@link TimelineGroups}. */
    public set timelineGroups(value: TimelineGroup[]) {
      this.TimelineGroups = value;
    }

    public SelectedStatus = '';

    /** @deprecated Use {@link SelectedStatus}. */
    public get selectedStatus() {
      return this.SelectedStatus;
    }
    /** @deprecated Use {@link SelectedStatus}. */
    public set selectedStatus(value) {
      this.SelectedStatus = value;
    }
    public SelectedOperation = '';

    /** @deprecated Use {@link SelectedOperation}. */
    public get selectedOperation() {
      return this.SelectedOperation;
    }
    /** @deprecated Use {@link SelectedOperation}. */
    public set selectedOperation(value) {
      this.SelectedOperation = value;
    }
    public DateRange = '7';

    /** @deprecated Use {@link DateRange}. */
    public get dateRange() {
      return this.DateRange;
    }
    /** @deprecated Use {@link DateRange}. */
    public set dateRange(value) {
      this.DateRange = value;
    } // days
    public SearchText = '';

    /** @deprecated Use {@link SearchText}. */
    public get searchText() {
      return this.SearchText;
    }
    /** @deprecated Use {@link SearchText}. */
    public set searchText(value) {
      this.SearchText = value;
    }
    public ViewMode: 'table' | 'timeline' = 'timeline';

    /** @deprecated Use {@link ViewMode}. */
    public get viewMode(): 'table' | 'timeline' {
      return this.ViewMode;
    }
    /** @deprecated Use {@link ViewMode}. */
    public set viewMode(value: 'table' | 'timeline') {
      this.ViewMode = value;
    }
    public ExpandedLogId: string | null = null;

    /** @deprecated Use {@link ExpandedLogId}. */
    public get expandedLogId(): string | null {
      return this.ExpandedLogId;
    }
    /** @deprecated Use {@link ExpandedLogId}. */
    public set expandedLogId(value: string | null) {
      this.ExpandedLogId = value;
    }

    // Chart data
    public HourlyData: { hour: string; success: number; failed: number }[] = [];

    /** @deprecated Use {@link HourlyData}. */
    public get hourlyData(): { hour: string; success: number; failed: number }[] {
      return this.HourlyData;
    }
    /** @deprecated Use {@link HourlyData}. */
    public set hourlyData(value: { hour: string; success: number; failed: number }[]) {
      this.HourlyData = value;
    }
    public OperationCounts: Map<string, number> = new Map();

    /** @deprecated Use {@link OperationCounts}. */
    public get operationCounts(): Map<string, number> {
      return this.OperationCounts;
    }
    /** @deprecated Use {@link OperationCounts}. */
    public set operationCounts(value: Map<string, number>) {
      this.OperationCounts = value;
    }

    public readonly ViewOptions: ViewToggleOption[] = [
        { key: 'timeline', icon: 'fa-solid fa-timeline', title: 'Timeline view' },
        { key: 'table', icon: 'fa-solid fa-table', title: 'Table view' }
    ];

    /** @deprecated Use {@link ViewOptions}. */
    public get viewOptions(): ViewToggleOption[] {
      return this.ViewOptions;
    }

    public get FilterFields(): FilterFieldConfig[] {
        return [
            {
                key: 'status',
                type: 'dropdown',
                label: 'Status',
                icon: 'fa-solid fa-circle-info',
                placeholder: 'All Statuses',
                options: [
                    { text: 'All Statuses', value: '' },
                    { text: 'Success', value: 'Success' },
                    { text: 'Failed', value: 'Failed' }
                ]
            },
            {
                key: 'operation',
                type: 'dropdown',
                label: 'Operation',
                icon: 'fa-solid fa-bolt',
                placeholder: 'All Operations',
                filterable: true,
                options: [
                    { text: 'All Operations', value: '' },
                    ...this.GetOperationList().map(op => ({ text: op, value: op }))
                ]
            },
            {
                key: 'dateRange',
                type: 'dropdown',
                label: 'Time range',
                icon: 'fa-solid fa-clock',
                options: [
                    { text: 'Last 24 hours', value: '1' },
                    { text: 'Last 7 days', value: '7' },
                    { text: 'Last 30 days', value: '30' },
                    { text: 'Last 90 days', value: '90' }
                ]
            }
        ];
    }
    public get FilterValues(): Record<string, unknown> {
        return {
            status: this.SelectedStatus,
            operation: this.SelectedOperation,
            dateRange: this.DateRange
        };
    }
    public get ActiveFilterCount(): number {
        let n = 0;
        if (this.SelectedStatus) n++;
        if (this.SelectedOperation) n++;
        if (this.DateRange && this.DateRange !== '7') n++;  // 7-day is the default; don't count it
        return n;
    }
    public OnFilterValuesChange(v: Record<string, unknown>): void {
        const next = (v ?? {}) as { status?: string; operation?: string; dateRange?: string };
        if ((next.status ?? '') !== this.SelectedStatus) {
            this.OnStatusFilterChange(next.status ?? '');
        }
        if ((next.operation ?? '') !== this.SelectedOperation) {
            this.OnOperationFilterChange(next.operation ?? '');
        }
        if ((next.dateRange ?? '7') !== this.DateRange) {
            this.OnDateRangeChange(next.dateRange ?? '7');
        }
    }

    /** @deprecated Use {@link OnFilterValuesChange}. */
    public onFilterValuesChange(v: Record<string, unknown>): void {
      return this.OnFilterValuesChange(v);
    }
    public ResetFilters(): void {
        if (this.SelectedStatus) this.OnStatusFilterChange('');
        if (this.SelectedOperation) this.OnOperationFilterChange('');
        if (this.DateRange !== '7') this.OnDateRangeChange('7');
    }

    /** @deprecated Use {@link ResetFilters}. */
    public resetFilters(): void {
      return this.ResetFilters();
    }

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        super.ngOnInit();
        this.loadData();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        // Cleanup if needed
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Audit Trail';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-clipboard-list';
    }

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);

            // Calculate date filter
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(this.DateRange, 10));
            const dateFilter = `AuditLogTypeID = '${CREDENTIAL_ACCESS_AUDIT_LOG_TYPE_ID}' AND __mj_CreatedAt >= '${startDate.toISOString()}'`;

            const result = await rv.RunView<AuditLogWithDetails>({
                EntityName: 'MJ: Audit Logs',
                ExtraFilter: dateFilter,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 500,
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.AuditLogs = result.Results;
                this.parseAllDetails();
                this.ApplyFilters();
                this.buildChartData();
            }

        } catch (error) {
            console.error('Error loading audit logs:', error);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private parseAllDetails(): void {
        for (const log of this.AuditLogs) {
            log.parsedDetails = this.parseDetails(log);
        }
    }

    private parseDetails(log: MJAuditLogEntity): ParsedDetails {
        try {
            if (log.Details) {
                return JSON.parse(log.Details);
            }
        } catch (e) {
            // Ignore parse errors
        }
        return {};
    }

    public OnStatusFilterChange(status: string): void {
        this.SelectedStatus = status;
        this.ApplyFilters();
    }

    /** @deprecated Use {@link OnStatusFilterChange}. */
    public onStatusFilterChange(status: string): void {
      return this.OnStatusFilterChange(status);
    }

    public OnOperationFilterChange(operation: string): void {
        this.SelectedOperation = operation;
        this.ApplyFilters();
    }

    /** @deprecated Use {@link OnOperationFilterChange}. */
    public onOperationFilterChange(operation: string): void {
      return this.OnOperationFilterChange(operation);
    }

    public OnDateRangeChange(days: string): void {
        this.DateRange = days;
        this.loadData();
    }

    /** @deprecated Use {@link OnDateRangeChange}. */
    public onDateRangeChange(days: string): void {
      return this.OnDateRangeChange(days);
    }

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.ApplyFilters();
    }

    /** @deprecated Use {@link OnSearchChange}. */
    public onSearchChange(value: string): void {
      return this.OnSearchChange(value);
    }

    public ClearSearch(): void {
        this.SearchText = '';
        this.ApplyFilters();
    }

    /** @deprecated Use {@link ClearSearch}. */
    public clearSearch(): void {
      return this.ClearSearch();
    }

    /** True when search and/or any filter narrow the log list. */
    public get IsListNarrowed(): boolean {
        return !!(this.SearchText || this.SelectedStatus || this.SelectedOperation);
    }

    /** Empty-state CTA: reset search + status + operation filters. */
    public ResetAuditFilters(): void {
        this.SearchText = '';
        this.SelectedStatus = '';
        this.SelectedOperation = '';
        this.ApplyFilters();
    }

    /** @deprecated Use {@link ResetAuditFilters}. */
    public resetAuditFilters(): void {
      return this.ResetAuditFilters();
    }

    public SetViewMode(mode: 'table' | 'timeline'): void {
        this.ViewMode = mode;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link SetViewMode}. */
    public setViewMode(mode: 'table' | 'timeline'): void {
      return this.SetViewMode(mode);
    }

    /**
     * Accordion ExpandedChange handler for an audit timeline row. Single-expand
     * (radio-like) model: expanding a row sets it as the sole open row (the
     * template's `expandedLogId === log.ID` binding collapses the prior one);
     * collapsing the open row clears it. OnPush — drives change detection.
     */
    public OnLogExpandedChange(logId: string, expanded: boolean): void {
        this.ExpandedLogId = expanded ? logId : null;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnLogExpandedChange}. */
    public onLogExpandedChange(logId: string, expanded: boolean): void {
      return this.OnLogExpandedChange(logId, expanded);
    }

    public ApplyFilters(): void {
        let filtered = [...this.AuditLogs];

        if (this.SelectedStatus) {
            filtered = filtered.filter(log => log.Status === this.SelectedStatus);
        }

        if (this.SelectedOperation) {
            filtered = filtered.filter(log => {
                const op = log.parsedDetails?.operation || 'Access';
                return op === this.SelectedOperation;
            });
        }

        if (this.SearchText) {
            const searchLower = this.SearchText.toLowerCase();
            filtered = filtered.filter(log => {
                const user = (log.User || '').toLowerCase();
                const desc = (log.Description || '').toLowerCase();
                const subsystem = (log.parsedDetails?.subsystem || '').toLowerCase();
                const credType = (log.parsedDetails?.credentialType || '').toLowerCase();
                return user.includes(searchLower) ||
                    desc.includes(searchLower) ||
                    subsystem.includes(searchLower) ||
                    credType.includes(searchLower);
            });
        }

        this.FilteredLogs = filtered;
        this.buildTimelineGroups();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ApplyFilters}. */
    public applyFilters(): void {
      return this.ApplyFilters();
    }

    private buildTimelineGroups(): void {
        const groups = new Map<string, AuditLogWithDetails[]>();

        for (const log of this.FilteredLogs) {
            const date = new Date(log.__mj_CreatedAt);
            const dateKey = date.toISOString().split('T')[0];

            if (!groups.has(dateKey)) {
                groups.set(dateKey, []);
            }
            groups.get(dateKey)!.push(log);
        }

        this.TimelineGroups = Array.from(groups.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, logs]) => ({
                date,
                displayDate: this.formatGroupDate(date),
                logs
            }));
    }

    private formatGroupDate(dateString: string): string {
        const date = new Date(dateString);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
            });
        }
    }

    private buildChartData(): void {
        // Build hourly distribution for today
        const hourCounts: { [key: string]: { success: number; failed: number } } = {};
        const today = new Date().toDateString();

        for (let i = 0; i < 24; i++) {
            const hour = i.toString().padStart(2, '0') + ':00';
            hourCounts[hour] = { success: 0, failed: 0 };
        }

        for (const log of this.AuditLogs) {
            const date = new Date(log.__mj_CreatedAt);
            if (date.toDateString() === today) {
                const hour = date.getHours().toString().padStart(2, '0') + ':00';
                if (log.Status === 'Success') {
                    hourCounts[hour].success++;
                } else {
                    hourCounts[hour].failed++;
                }
            }
        }

        this.HourlyData = Object.entries(hourCounts).map(([hour, counts]) => ({
            hour,
            ...counts
        }));

        // Build operation counts
        this.OperationCounts.clear();
        for (const log of this.AuditLogs) {
            const op = log.parsedDetails?.operation || 'Access';
            this.OperationCounts.set(op, (this.OperationCounts.get(op) || 0) + 1);
        }
    }

    public GetMaxHourlyCount(): number {
        return Math.max(...this.HourlyData.map(d => d.success + d.failed), 1);
    }

    /** @deprecated Use {@link GetMaxHourlyCount}. */
    public getMaxHourlyCount(): number {
      return this.GetMaxHourlyCount();
    }

    public GetOperationList(): string[] {
        return Array.from(this.OperationCounts.keys());
    }

    /** @deprecated Use {@link GetOperationList}. */
    public getOperationList(): string[] {
      return this.GetOperationList();
    }

    public GetStatusClass(status: string): string {
        switch (status) {
            case 'Success': return 'success';
            case 'Failed': return 'failed';
            default: return 'unknown';
        }
    }

    /** @deprecated Use {@link GetStatusClass}. */
    public getStatusClass(status: string): string {
      return this.GetStatusClass(status);
    }

    public GetOperationType(log: AuditLogWithDetails): string {
        return log.parsedDetails?.operation || 'Access';
    }

    /** @deprecated Use {@link GetOperationType}. */
    public getOperationType(log: AuditLogWithDetails): string {
      return this.GetOperationType(log);
    }

    public GetSubsystem(log: AuditLogWithDetails): string {
        return log.parsedDetails?.subsystem || '';
    }

    /** @deprecated Use {@link GetSubsystem}. */
    public getSubsystem(log: AuditLogWithDetails): string {
      return this.GetSubsystem(log);
    }

    public GetOperationIcon(operation: string): string {
        switch (operation.toLowerCase()) {
            case 'access': return 'fa-solid fa-eye';
            case 'create': return 'fa-solid fa-plus';
            case 'update': return 'fa-solid fa-pen';
            case 'delete': return 'fa-solid fa-trash';
            case 'rotate': return 'fa-solid fa-rotate';
            case 'validate': return 'fa-solid fa-check-circle';
            default: return 'fa-solid fa-circle';
        }
    }

    /** @deprecated Use {@link GetOperationIcon}. */
    public getOperationIcon(operation: string): string {
      return this.GetOperationIcon(operation);
    }

    public GetOperationColor(operation: string): string {
        switch (operation.toLowerCase()) {
            case 'access': return 'var(--mj-brand-primary)';
            case 'create': return 'var(--mj-status-success)';
            case 'update': return 'var(--mj-status-warning)';
            case 'delete': return 'var(--mj-status-error)';
            case 'rotate': return 'var(--mj-brand-primary)';
            case 'validate': return 'var(--mj-brand-primary)';
            default: return 'var(--mj-text-secondary)';
        }
    }

    /** @deprecated Use {@link GetOperationColor}. */
    public getOperationColor(operation: string): string {
      return this.GetOperationColor(operation);
    }

    public formatDate(date: Date | string | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    public FormatTime(date: Date | string | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /** @deprecated Use {@link FormatTime}. */
    public formatTime(date: Date | string | null): string {
      return this.FormatTime(date);
    }

    public formatDuration(ms: number | undefined): string {
        if (!ms) return '-';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    public Refresh(): void {
        this.loadData();
    }

    /** @deprecated Use {@link Refresh}. */
    public refresh(): void {
      return this.Refresh();
    }

    public GetSuccessCount(): number {
        return this.AuditLogs.filter(log => log.Status === 'Success').length;
    }

    /** @deprecated Use {@link GetSuccessCount}. */
    public getSuccessCount(): number {
      return this.GetSuccessCount();
    }

    public GetFailedCount(): number {
        return this.AuditLogs.filter(log => log.Status === 'Failed').length;
    }

    /** @deprecated Use {@link GetFailedCount}. */
    public getFailedCount(): number {
      return this.GetFailedCount();
    }

    public GetSuccessRate(): number {
        if (this.AuditLogs.length === 0) return 0;
        return Math.round((this.GetSuccessCount() / this.AuditLogs.length) * 100);
    }

    /** @deprecated Use {@link GetSuccessRate}. */
    public getSuccessRate(): number {
      return this.GetSuccessRate();
    }

    public GetUniqueUserCount(): number {
        const users = new Set(this.AuditLogs.map(log => log.User).filter(Boolean));
        return users.size;
    }

    /** @deprecated Use {@link GetUniqueUserCount}. */
    public getUniqueUserCount(): number {
      return this.GetUniqueUserCount();
    }

    public ExportToCSV(): void {
        const headers = ['Timestamp', 'User', 'Operation', 'Status', 'Description', 'Subsystem', 'Credential Type'];
        const rows = this.FilteredLogs.map(log => [
            this.formatDate(log.__mj_CreatedAt),
            log.User || '',
            this.GetOperationType(log),
            log.Status || '',
            log.Description || '',
            this.GetSubsystem(log),
            log.parsedDetails?.credentialType || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `credential-audit-log-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }

    /** @deprecated Use {@link ExportToCSV}. */
    public exportToCSV(): void {
      return this.ExportToCSV();
    }
}

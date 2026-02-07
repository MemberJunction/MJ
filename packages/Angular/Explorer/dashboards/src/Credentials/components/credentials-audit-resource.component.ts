import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ResourceData, AuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
// The Credential Access AuditLogType ID from metadata
const CREDENTIAL_ACCESS_AUDIT_LOG_TYPE_ID = 'E8D4D100-E785-42D3-997F-ECFF3B0BCFC0';

interface AuditLogWithDetails extends AuditLogEntity {
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
    public auditLogs: AuditLogWithDetails[] = [];
    public filteredLogs: AuditLogWithDetails[] = [];
    public timelineGroups: TimelineGroup[] = [];

    public selectedStatus = '';
    public selectedOperation = '';
    public dateRange = '7'; // days
    public searchText = '';
    public viewMode: 'table' | 'timeline' = 'timeline';
    public expandedLogId: string | null = null;

    // Chart data
    public hourlyData: { hour: string; success: number; failed: number }[] = [];
    public operationCounts: Map<string, number> = new Map();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        this.loadData();
    }

    ngOnDestroy(): void {
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

            const rv = new RunView();

            // Calculate date filter
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(this.dateRange, 10));
            const dateFilter = `AuditLogTypeID = '${CREDENTIAL_ACCESS_AUDIT_LOG_TYPE_ID}' AND __mj_CreatedAt >= '${startDate.toISOString()}'`;

            const result = await rv.RunView<AuditLogWithDetails>({
                EntityName: 'Audit Logs',
                ExtraFilter: dateFilter,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 500,
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.auditLogs = result.Results;
                this.parseAllDetails();
                this.applyFilters();
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
        for (const log of this.auditLogs) {
            log.parsedDetails = this.parseDetails(log);
        }
    }

    private parseDetails(log: AuditLogEntity): ParsedDetails {
        try {
            if (log.Details) {
                return JSON.parse(log.Details);
            }
        } catch (e) {
            // Ignore parse errors
        }
        return {};
    }

    public onStatusFilterChange(status: string): void {
        this.selectedStatus = status;
        this.applyFilters();
    }

    public onOperationFilterChange(operation: string): void {
        this.selectedOperation = operation;
        this.applyFilters();
    }

    public onDateRangeChange(days: string): void {
        this.dateRange = days;
        this.loadData();
    }

    public onSearchChange(value: string): void {
        this.searchText = value;
        this.applyFilters();
    }

    public clearSearch(): void {
        this.searchText = '';
        this.applyFilters();
    }

    public setViewMode(mode: 'table' | 'timeline'): void {
        this.viewMode = mode;
        this.cdr.markForCheck();
    }

    public toggleLogExpand(logId: string): void {
        this.expandedLogId = this.expandedLogId === logId ? null : logId;
        this.cdr.markForCheck();
    }

    public applyFilters(): void {
        let filtered = [...this.auditLogs];

        if (this.selectedStatus) {
            filtered = filtered.filter(log => log.Status === this.selectedStatus);
        }

        if (this.selectedOperation) {
            filtered = filtered.filter(log => {
                const op = log.parsedDetails?.operation || 'Access';
                return op === this.selectedOperation;
            });
        }

        if (this.searchText) {
            const searchLower = this.searchText.toLowerCase();
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

        this.filteredLogs = filtered;
        this.buildTimelineGroups();
        this.cdr.markForCheck();
    }

    private buildTimelineGroups(): void {
        const groups = new Map<string, AuditLogWithDetails[]>();

        for (const log of this.filteredLogs) {
            const date = new Date(log.__mj_CreatedAt);
            const dateKey = date.toISOString().split('T')[0];

            if (!groups.has(dateKey)) {
                groups.set(dateKey, []);
            }
            groups.get(dateKey)!.push(log);
        }

        this.timelineGroups = Array.from(groups.entries())
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

        for (const log of this.auditLogs) {
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

        this.hourlyData = Object.entries(hourCounts).map(([hour, counts]) => ({
            hour,
            ...counts
        }));

        // Build operation counts
        this.operationCounts.clear();
        for (const log of this.auditLogs) {
            const op = log.parsedDetails?.operation || 'Access';
            this.operationCounts.set(op, (this.operationCounts.get(op) || 0) + 1);
        }
    }

    public getMaxHourlyCount(): number {
        return Math.max(...this.hourlyData.map(d => d.success + d.failed), 1);
    }

    public getOperationList(): string[] {
        return Array.from(this.operationCounts.keys());
    }

    public getStatusClass(status: string): string {
        switch (status) {
            case 'Success': return 'success';
            case 'Failed': return 'failed';
            default: return 'unknown';
        }
    }

    public getOperationType(log: AuditLogWithDetails): string {
        return log.parsedDetails?.operation || 'Access';
    }

    public getSubsystem(log: AuditLogWithDetails): string {
        return log.parsedDetails?.subsystem || '';
    }

    public getOperationIcon(operation: string): string {
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

    public getOperationColor(operation: string): string {
        switch (operation.toLowerCase()) {
            case 'access': return '#6366f1';
            case 'create': return '#10b981';
            case 'update': return '#f59e0b';
            case 'delete': return '#ef4444';
            case 'rotate': return '#8b5cf6';
            case 'validate': return '#06b6d4';
            default: return '#6b7280';
        }
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

    public formatTime(date: Date | string | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    public formatDuration(ms: number | undefined): string {
        if (!ms) return '-';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    public refresh(): void {
        this.loadData();
    }

    public getSuccessCount(): number {
        return this.auditLogs.filter(log => log.Status === 'Success').length;
    }

    public getFailedCount(): number {
        return this.auditLogs.filter(log => log.Status === 'Failed').length;
    }

    public getSuccessRate(): number {
        if (this.auditLogs.length === 0) return 0;
        return Math.round((this.getSuccessCount() / this.auditLogs.length) * 100);
    }

    public getUniqueUserCount(): number {
        const users = new Set(this.auditLogs.map(log => log.User).filter(Boolean));
        return users.size;
    }

    public exportToCSV(): void {
        const headers = ['Timestamp', 'User', 'Operation', 'Status', 'Description', 'Subsystem', 'Credential Type'];
        const rows = this.filteredLogs.map(log => [
            this.formatDate(log.__mj_CreatedAt),
            log.User || '',
            this.getOperationType(log),
            log.Status || '',
            log.Description || '',
            this.getSubsystem(log),
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
}

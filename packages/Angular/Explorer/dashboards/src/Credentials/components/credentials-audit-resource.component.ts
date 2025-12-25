import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ResourceData, AuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';

export function LoadCredentialsAuditResource() {
    // Prevents tree-shaking
}

// The Credential Access AuditLogType ID from metadata
const CREDENTIAL_ACCESS_AUDIT_LOG_TYPE_ID = 'E8D4D100-E785-42D3-997F-ECFF3B0BCFC0';

@RegisterClass(BaseResourceComponent, 'CredentialsAuditResource')
@Component({
    selector: 'mj-credentials-audit-resource',
    templateUrl: './credentials-audit-resource.component.html',
    styleUrls: ['./credentials-audit-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsAuditResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public auditLogs: AuditLogEntity[] = [];
    public filteredLogs: AuditLogEntity[] = [];

    public selectedStatus = '';
    public dateRange = '7'; // days

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

            const result = await rv.RunView<AuditLogEntity>({
                EntityName: 'Audit Logs',
                ExtraFilter: dateFilter,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 500,
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.auditLogs = result.Results;
                this.applyFilters();
            }

        } catch (error) {
            console.error('Error loading audit logs:', error);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    public onStatusFilterChange(status: string): void {
        this.selectedStatus = status;
        this.applyFilters();
    }

    public onDateRangeChange(days: string): void {
        this.dateRange = days;
        this.loadData();
    }

    private applyFilters(): void {
        let filtered = [...this.auditLogs];

        if (this.selectedStatus) {
            filtered = filtered.filter(log => log.Status === this.selectedStatus);
        }

        this.filteredLogs = filtered;
        this.cdr.markForCheck();
    }

    public getStatusClass(status: string): string {
        switch (status) {
            case 'Success': return 'success';
            case 'Failed': return 'failed';
            default: return 'unknown';
        }
    }

    public getOperationType(log: AuditLogEntity): string {
        try {
            if (log.Details) {
                const details = JSON.parse(log.Details);
                return details.operation || 'Access';
            }
        } catch (e) {
            // Ignore parse errors
        }
        return 'Access';
    }

    public getSubsystem(log: AuditLogEntity): string {
        try {
            if (log.Details) {
                const details = JSON.parse(log.Details);
                return details.subsystem || '';
            }
        } catch (e) {
            // Ignore parse errors
        }
        return '';
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

    public refresh(): void {
        this.loadData();
    }

    public getSuccessCount(): number {
        return this.auditLogs.filter(log => log.Status === 'Success').length;
    }

    public getFailedCount(): number {
        return this.auditLogs.filter(log => log.Status === 'Failed').length;
    }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';

/**
 * Tree-shaking prevention function
 */
export function LoadCommunicationLogsResource() {
    // Force inclusion in production builds
}

@RegisterClass(BaseResourceComponent, 'CommunicationLogsResource')
@Component({
  standalone: false,
    selector: 'mj-communication-logs-resource',
    template: `
    <div class="logs-container">
        <header class="logs-header">
            <div class="title-area">
                <h1>Communication Logs</h1>
                <p>Full audit trail of all messages</p>
            </div>
            <div class="header-actions">
                <div class="search-box">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" placeholder="Search logs..." (input)="onSearch($event)">
                </div>
            </div>
        </header>

        <div class="grid-wrapper">
            <div *ngIf="isLoading" class="loading-overlay">
                <div class="spinner"></div>
            </div>

            <table class="custom-grid">
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Direction</th>
                        <th>Provider</th>
                        <th>Type</th>
                        <th>Date</th>
                        <th>Error Message</th>
                    </tr>
                </thead>
                <tbody>
                    <tr *ngFor="let log of filteredLogs">
                        <td>
                            <span class="status-pill" [class]="log.Status.toLowerCase()">
                                {{log.Status}}
                            </span>
                        </td>
                        <td>
                            <span class="direction-icon" [class]="log.Direction.toLowerCase()">
                                <i [class]="log.Direction === 'Sending' ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
                                {{log.Direction}}
                            </span>
                        </td>
                        <td>{{log.CommunicationProvider}}</td>
                        <td>{{log.CommunicationProviderMessageType}}</td>
                        <td>{{log.MessageDate | date:'medium'}}</td>
                        <td class="error-cell" [title]="log.ErrorMessage">{{log.ErrorMessage || '-'}}</td>
                    </tr>
                    <tr *ngIf="filteredLogs.length === 0 && !isLoading">
                        <td colspan="6" class="no-data">No logs found matching your criteria</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
  `,
    styles: [`
    .logs-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background-color: #f8fafc;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .logs-header {
        padding: 24px 32px;
        background: white;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .title-area h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 800;
        color: #0f172a;
    }
    .title-area p {
        margin: 4px 0 0;
        color: #64748b;
        font-size: 0.875rem;
    }
    .search-box {
        position: relative;
        width: 300px;
    }
    .search-box i {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: #94a3b8;
    }
    .search-box input {
        width: 100%;
        padding: 10px 12px 10px 40px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.875rem;
        transition: all 0.2s;
    }
    .search-box input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .grid-wrapper {
        flex: 1;
        padding: 24px 32px;
        overflow-y: auto;
        position: relative;
    }

    .custom-grid {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        border: 1px solid #e2e8f0;
    }
    .custom-grid th {
        background: #f8fafc;
        padding: 16px;
        text-align: left;
        font-size: 0.75rem;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid #e2e8f0;
    }
    .custom-grid td {
        padding: 16px;
        font-size: 0.875rem;
        color: #1e293b;
        border-bottom: 1px solid #f1f5f9;
    }
    .custom-grid tr:last-child td {
        border-bottom: none;
    }
    .custom-grid tr:hover td {
        background: #f8fafc;
    }

    .status-pill {
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
    }
    .status-pill.complete { background: #dcfce7; color: #166534; }
    .status-pill.failed { background: #fee2e2; color: #991b1b; }
    .status-pill.pending { background: #fef3c7; color: #92400e; }

    .direction-icon {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
    }
    .direction-icon.sending { color: #3b82f6; }
    .direction-icon.receiving { color: #8b5cf6; }

    .error-cell {
        color: #ef4444;
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .no-data {
        text-align: center;
        padding: 48px !important;
        color: #94a3b8;
        font-style: italic;
    }

    .loading-overlay {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(255,255,255,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
    }
    .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #e2e8f0;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class CommunicationLogsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public logs: any[] = [];
    public filteredLogs: any[] = [];
    public isLoading = false;
    private searchTerm = '';

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    async ngOnInit(): Promise<void> {
        await this.loadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void { }

    public async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'Communication Logs',
                OrderBy: 'MessageDate DESC',
                MaxRows: 100,
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.logs = result.Results;
                this.applyFilter();
            }
        } catch (error) {
            console.error('Error loading logs:', error);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    public onSearch(event: any): void {
        this.searchTerm = event.target.value.toLowerCase();
        this.applyFilter();
    }

    private applyFilter(): void {
        if (!this.searchTerm) {
            this.filteredLogs = this.logs;
        } else {
            this.filteredLogs = this.logs.filter(l =>
                l.CommunicationProvider?.toLowerCase().includes(this.searchTerm) ||
                l.CommunicationProviderMessageType?.toLowerCase().includes(this.searchTerm) ||
                l.Status?.toLowerCase().includes(this.searchTerm) ||
                l.ErrorMessage?.toLowerCase().includes(this.searchTerm)
            );
        }
        this.cdr.detectChanges();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Logs';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-list-ul';
    }
}

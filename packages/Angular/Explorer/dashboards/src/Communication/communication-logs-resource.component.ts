import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData, MJCommunicationLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
@RegisterClass(BaseResourceComponent, 'CommunicationLogsResource')
@Component({
  standalone: false,
    selector: 'mj-communication-logs-resource',
    template: `
    <div class="logs-wrapper">
      <div class="card">
        <div class="logs-toolbar">
          <div class="search-input-wrapper">
            <i class="fa-solid fa-search"></i>
            <input type="text" placeholder="Search messages, providers, recipients..." (input)="onSearch($event)">
          </div>
          <div class="filter-chip" [class.active]="statusFilter === ''"
            (click)="onStatusFilter('')">
            <i class="fa-solid fa-filter"></i> All
          </div>
          <div class="filter-chip" [class.active]="statusFilter === 'Complete'"
            (click)="onStatusFilter('Complete')">
            <i class="fa-solid fa-check-circle"></i> Sent
          </div>
          <div class="filter-chip" [class.active]="statusFilter === 'Failed'"
            (click)="onStatusFilter('Failed')">
            <i class="fa-solid fa-times-circle"></i> Failed
          </div>
          <div class="filter-chip" [class.active]="statusFilter === 'Pending'"
            (click)="onStatusFilter('Pending')">
            <i class="fa-solid fa-clock"></i> Pending
          </div>
          <div class="toolbar-spacer"></div>
          <button class="tb-btn" (click)="loadData()">
            <i class="fa-solid fa-rotate" [class.spinning]="isLoading"></i> Refresh
          </button>
        </div>
        <div class="table-wrapper">
          <table class="log-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Direction</th>
                <th>Provider</th>
                <th>Type</th>
                <th>Date</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              @for (log of filteredLogs; track log) {
                <tr>
                  <td>
                    <span class="log-status-badge" [ngClass]="getStatusClass(log.Status)">
                      <i [class]="getStatusIcon(log.Status)"></i>
                      {{log.Status}}
                    </span>
                  </td>
                  <td>
                    <span class="log-direction" [ngClass]="log.Direction.toLowerCase()">
                      <i [class]="log.Direction === 'Sending' ? 'fa-solid fa-arrow-up-right' : 'fa-solid fa-arrow-down-left'"></i>
                      {{log.Direction}}
                    </span>
                  </td>
                  <td>
                    <span class="log-provider-badge">
                      <i [class]="getProviderIcon(log.CommunicationProvider)" [style.color]="getProviderColor(log.CommunicationProvider)"></i>
                      {{log.CommunicationProvider}}
                    </span>
                  </td>
                  <td>{{log.CommunicationProviderMessageType}}</td>
                  <td>{{log.MessageDate | date:'medium'}}</td>
                  <td>
                    @if (log.ErrorMessage) {
                      <span class="log-error-text" [title]="log.ErrorMessage">
                        {{log.ErrorMessage}}
                      </span>
                    }
                    @if (!log.ErrorMessage) {
                      <span class="no-error">&mdash;</span>
                    }
                  </td>
                </tr>
              }
              @if (filteredLogs.length === 0 && !isLoading) {
                <tr>
                  <td colspan="6" class="no-data">
                    <div class="empty-state">
                      <i class="fa-solid fa-inbox"></i>
                      <p>No logs found matching your criteria</p>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
    `,
    styles: [`
    .logs-wrapper {
        height: 100%;
        padding: 24px;
        background: var(--mj-bg-surface);
    }
    .card {
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    /* TOOLBAR */
    .logs-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border-bottom: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-sunken);
        flex-shrink: 0;
    }
    .search-input-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        max-width: 400px;
        padding: 6px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        background: var(--mj-bg-surface);
        transition: border-color 0.15s, box-shadow 0.15s;
    }
    .search-input-wrapper:focus-within {
        border-color: var(--mj-brand-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
    }
    .search-input-wrapper i { color: var(--mj-text-muted); font-size: 12px; }
    .search-input-wrapper input {
        flex: 1; border: none; outline: none;
        background: transparent; font-size: 12px;
        font-family: inherit; color: var(--mj-text-primary);
    }
    .search-input-wrapper input::placeholder { color: var(--mj-text-muted); }

    .filter-chip {
        display: inline-flex; align-items: center;
        gap: 4px; padding: 4px 10px;
        border: 1px solid var(--mj-border-default);
        border-radius: 16px;
        background: var(--mj-bg-surface-card);
        font-size: 11px; font-weight: 500;
        color: var(--mj-text-secondary);
        cursor: pointer; transition: all 0.15s;
    }
    .filter-chip:hover {
        border-color: var(--mj-border-strong);
        background: var(--mj-bg-surface-sunken);
    }
    .filter-chip.active {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
    }
    .filter-chip i { font-size: 10px; }

    .toolbar-spacer { flex: 1; }

    .tb-btn {
        display: inline-flex; align-items: center;
        gap: 6px; padding: 6px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-secondary);
        font-size: 12px; font-weight: 500;
        cursor: pointer; transition: all 0.15s ease;
        font-family: inherit;
    }
    .tb-btn:hover {
        background: var(--mj-bg-surface-sunken);
        border-color: var(--mj-border-strong);
        color: var(--mj-text-primary);
    }
    .tb-btn i { font-size: 12px; }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinning { animation: spin 1s linear infinite; }

    /* TABLE */
    .table-wrapper { flex: 1; overflow-y: auto; }

    .log-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }
    .log-table thead {
        background: var(--mj-bg-surface-sunken);
        position: sticky; top: 0; z-index: 1;
    }
    .log-table th {
        padding: 10px 16px;
        text-align: left;
        font-weight: 700; font-size: 10px;
        text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--mj-text-muted);
        border-bottom: 1px solid var(--mj-border-default);
        white-space: nowrap;
    }
    .log-table td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--mj-border-default);
        color: var(--mj-text-primary);
        vertical-align: middle;
    }
    .log-table tbody tr { transition: background 0.15s; }
    .log-table tbody tr:hover { background: var(--mj-bg-surface-sunken); }

    .log-status-badge {
        display: inline-flex; align-items: center;
        gap: 4px; font-size: 11px; font-weight: 600;
        padding: 3px 10px;
        border-radius: 4px;
    }
    .log-status-badge.complete {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }
    .log-status-badge.failed {
        background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        color: var(--mj-status-error);
    }
    .log-status-badge.pending {
        background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
        color: var(--mj-status-warning);
    }
    .log-status-badge.in-progress {
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
    }

    .log-direction {
        display: flex; align-items: center;
        gap: 4px; font-size: 11px;
        color: var(--mj-text-muted);
    }
    .log-direction i { font-size: 10px; }
    .log-direction.sending i { color: var(--mj-brand-primary); }
    .log-direction.receiving i { color: var(--mj-status-success); }

    .log-provider-badge {
        display: inline-flex; align-items: center;
        gap: 6px; padding: 3px 10px;
        border-radius: 4px;
        background: var(--mj-bg-surface-sunken);
        font-weight: 500;
    }

    .log-error-text {
        color: var(--mj-status-error);
        max-width: 200px;
        overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; font-size: 11px;
        display: block;
    }
    .no-error { color: var(--mj-text-muted); }

    .no-data { padding: 0 !important; }
    .empty-state {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 48px 0; color: var(--mj-text-muted);
    }
    .empty-state i { font-size: 2rem; margin-bottom: 12px; opacity: 0.5; }
    .empty-state p { margin: 0; font-size: 13px; }
  `]
})
export class CommunicationLogsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public logs: MJCommunicationLogEntity[] = [];
    public filteredLogs: MJCommunicationLogEntity[] = [];
    public isLoading = false;
    public statusFilter = '';
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
            const result = await rv.RunView<MJCommunicationLogEntity>({
                EntityName: 'MJ: Communication Logs',
                OrderBy: 'MessageDate DESC',
                MaxRows: 200,
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

    public onSearch(event: Event): void {
        this.searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
        this.applyFilter();
    }

    public onStatusFilter(status: string): void {
        this.statusFilter = status;
        this.applyFilter();
    }

    public getStatusClass(status: string): string {
        const s = (status || '').toLowerCase();
        if (s === 'complete') return 'complete';
        if (s === 'failed') return 'failed';
        if (s === 'pending') return 'pending';
        if (s === 'in-progress') return 'in-progress';
        return '';
    }

    public getStatusIcon(status: string): string {
        const s = (status || '').toLowerCase();
        if (s === 'complete') return 'fa-solid fa-check';
        if (s === 'failed') return 'fa-solid fa-xmark';
        if (s === 'pending') return 'fa-solid fa-clock';
        if (s === 'in-progress') return 'fa-solid fa-spinner';
        return 'fa-solid fa-circle';
    }

    public getProviderIcon(name: string): string {
        if (!name) return 'fa-solid fa-server';
        const n = name.toLowerCase();
        if (n.includes('sendgrid')) return 'fa-solid fa-envelope';
        if (n.includes('twilio')) return 'fa-solid fa-comment-sms';
        if (n.includes('gmail') || n.includes('google')) return 'fa-brands fa-google';
        if (n.includes('microsoft') || n.includes('graph')) return 'fa-brands fa-microsoft';
        return 'fa-solid fa-server';
    }

    public getProviderColor(name: string): string {
        if (!name) return 'inherit';
        const n = name.toLowerCase();
        if (n.includes('sendgrid')) return '#1A82E2';
        if (n.includes('twilio')) return '#F22F46';
        if (n.includes('gmail') || n.includes('google')) return '#EA4335';
        if (n.includes('microsoft') || n.includes('graph')) return '#0078D4';
        return 'inherit';
    }

    private applyFilter(): void {
        let filtered = this.logs;

        if (this.statusFilter) {
            filtered = filtered.filter(l => l.Status === this.statusFilter);
        }

        if (this.searchTerm) {
            filtered = filtered.filter(l =>
                l.CommunicationProvider?.toLowerCase().includes(this.searchTerm) ||
                l.CommunicationProviderMessageType?.toLowerCase().includes(this.searchTerm) ||
                l.Status?.toLowerCase().includes(this.searchTerm) ||
                l.ErrorMessage?.toLowerCase().includes(this.searchTerm)
            );
        }

        this.filteredLogs = filtered;
        this.cdr.detectChanges();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Message Logs';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-list-ul';
    }
}

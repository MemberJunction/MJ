import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { UUIDsEqual } from '@memberjunction/global';
import { IRunViewProvider } from '@memberjunction/core';
import { IntegrationDataService, IntegrationRunRow, RunDetailRow } from '../../services/integration-data.service';

type RunStatusColorType = 'amber' | 'green' | 'red';

@Component({
  standalone: false,
  selector: 'app-run-history-panel',
  template: `
    @if (IsLoading) {
      <div class="history-loading">
        <mj-loading text="Loading run history..." size="small"></mj-loading>
      </div>
    } @else if (Runs.length === 0) {
      <div class="history-empty">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <p>No runs recorded yet</p>
      </div>
    } @else {
      <div class="history-panel">
        <table class="history-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Records</th>
              <th>Run By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (run of Runs; track run.ID) {
              <tr class="run-row" [class.selected]="IsSelectedRun(run.ID)"
                  (click)="OnRunClick(run)">
                <td>{{ FormatDate(run.StartedAt) }}</td>
                <td>
                  <span class="run-status-chip" [class]="'chip-' + StatusColor(run)">
                    <i [class]="StatusIcon(run)"></i>
                    {{ run.Status }}
                  </span>
                </td>
                <td class="duration-cell">{{ FormatDuration(run) }}</td>
                <td>{{ run.TotalRecords | number }}</td>
                <td>{{ run.RunByUser }}</td>
                <td>
                  <i class="fa-solid fa-chevron-right detail-arrow"
                     [class.rotated]="IsSelectedRun(run.ID)"></i>
                </td>
              </tr>
              @if (IsSelectedRun(run.ID) && IsLoadingDetails) {
                <tr class="detail-row">
                  <td colspan="6">
                    <mj-loading text="Loading details..." size="small"></mj-loading>
                  </td>
                </tr>
              }
              @if (IsSelectedRun(run.ID) && !IsLoadingDetails && RunDetails.length > 0) {
                <tr class="detail-row">
                  <td colspan="6">
                    <div class="detail-panel">
                      <h4>Entity Breakdown</h4>
                      <table class="detail-table">
                        <thead>
                          <tr>
                            <th>Entity</th>
                            <th>Processed</th>
                            <th>Created</th>
                            <th>Updated</th>
                            <th>Errors</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (detail of RunDetails; track detail.EntityID) {
                            <tr>
                              <td>{{ detail.Entity }}</td>
                              <td>{{ detail.RecordsProcessed | number }}</td>
                              <td>{{ detail.RecordsCreated | number }}</td>
                              <td>{{ detail.RecordsUpdated | number }}</td>
                              <td [class.error-count]="detail.RecordsErrored > 0">
                                {{ detail.RecordsErrored | number }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>

                      <!-- Error details expandable -->
                      @if (run.ErrorLog) {
                        <div class="error-details-section">
                          <button class="error-toggle" (click)="ToggleErrorLog($event)">
                            <i class="fa-solid fa-exclamation-triangle"></i>
                            Error Details
                            <i class="fa-solid fa-chevron-down toggle-icon"
                               [class.rotated]="ShowErrorLog"></i>
                          </button>
                          @if (ShowErrorLog) {
                            <pre class="error-log">{{ run.ErrorLog }}</pre>
                          }
                        </div>
                      }
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .history-loading, .history-empty {
      padding: 24px; text-align: center; color: var(--mj-text-muted);
    }
    .history-empty i { font-size: 24px; margin-bottom: 8px; display: block; }

    .history-panel { margin-top: 8px; }

    .history-table {
      width: 100%; border-collapse: collapse; font-size: 13px;
    }
    .history-table th {
      text-align: left; padding: 6px 8px;
      border-bottom: 2px solid var(--mj-border-default); color: var(--mj-text-secondary); font-weight: 600;
    }
    .run-row { cursor: pointer; }
    .run-row:hover { background: var(--mj-bg-surface-sunken); }
    .run-row.selected { background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface)); }
    .run-row td { padding: 6px 8px; border-bottom: 1px solid var(--mj-border-default); }

    /* Status Chips with icon */
    .run-status-chip {
      font-size: 11px; font-weight: 600; padding: 3px 8px;
      border-radius: 10px; display: inline-flex; align-items: center; gap: 4px;
      white-space: nowrap;
    }
    .chip-green { background: #e6f9ed; color: #1b7a3d; }
    .chip-amber { background: #fff7e0; color: #b5850a; }
    .chip-red   { background: #fde8e8; color: #c62828; }

    .duration-cell {
      font-variant-numeric: tabular-nums;
      color: var(--mj-text-secondary);
    }

    .detail-arrow { transition: transform 0.2s; font-size: 11px; color: var(--mj-text-muted); }
    .detail-arrow.rotated { transform: rotate(90deg); }

    .detail-row td { padding: 0; }
    .detail-panel {
      padding: 12px 16px; background: var(--mj-bg-surface-sunken);
      border-left: 3px solid var(--mj-brand-primary);
    }
    .detail-panel h4 { margin: 0 0 8px 0; font-size: 13px; }

    .detail-table {
      width: 100%; border-collapse: collapse; font-size: 12px;
    }
    .detail-table th {
      text-align: left; padding: 4px 6px; color: var(--mj-text-muted); font-weight: 500;
    }
    .detail-table td { padding: 4px 6px; }
    .error-count { color: #c62828; font-weight: 600; }

    /* Error Details */
    .error-details-section {
      margin-top: 12px;
      border-top: 1px solid var(--mj-border-default);
      padding-top: 8px;
    }
    .error-toggle {
      background: none; border: none; cursor: pointer;
      font-size: 12px; font-weight: 600; color: #c62828;
      display: flex; align-items: center; gap: 6px;
      padding: 4px 0;
    }
    .error-toggle:hover { text-decoration: underline; }
    .toggle-icon {
      transition: transform 0.2s; font-size: 10px;
    }
    .toggle-icon.rotated { transform: rotate(180deg); }
    .error-log {
      margin: 8px 0 0 0; padding: 10px;
      background: #fff0f0; border: 1px solid #fdd;
      border-radius: 4px; font-size: 11px;
      white-space: pre-wrap; word-break: break-word;
      max-height: 200px; overflow-y: auto;
      color: #7a1111;
    }
  `]
})
export class RunHistoryPanelComponent implements OnChanges {
  @Input() CompanyIntegrationID: string | null = null;
  @Input() ViewProvider: IRunViewProvider | null = null;

  Runs: IntegrationRunRow[] = [];
  RunDetails: RunDetailRow[] = [];
  SelectedRunID: string | null = null;
  IsLoading = false;
  IsLoadingDetails = false;
  ShowErrorLog = false;

  private dataService = inject(IntegrationDataService);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['CompanyIntegrationID'] && this.CompanyIntegrationID) {
      this.LoadRuns();
    }
  }

  async LoadRuns(): Promise<void> {
    if (!this.CompanyIntegrationID) return;
    this.IsLoading = true;
    this.SelectedRunID = null;
    this.RunDetails = [];
    this.ShowErrorLog = false;
    try {
      this.Runs = await this.dataService.LoadRunHistory(
        this.CompanyIntegrationID, 10, this.ViewProvider
      );
    } finally {
      this.IsLoading = false;
    }
  }

  async OnRunClick(run: IntegrationRunRow): Promise<void> {
    if (UUIDsEqual(this.SelectedRunID, run.ID)) {
      this.SelectedRunID = null;
      this.RunDetails = [];
      this.ShowErrorLog = false;
      return;
    }
    this.SelectedRunID = run.ID;
    this.IsLoadingDetails = true;
    this.RunDetails = [];
    this.ShowErrorLog = false;
    try {
      this.RunDetails = await this.dataService.LoadRunDetails(run.ID, this.ViewProvider);
    } finally {
      this.IsLoadingDetails = false;
    }
  }

  IsSelectedRun(id: string): boolean {
    return UUIDsEqual(this.SelectedRunID, id);
  }

  StatusColor(run: IntegrationRunRow): RunStatusColorType {
    if (run.Status === 'Success') return 'green';
    if (run.Status === 'Failed') return 'red';
    return 'amber';
  }

  StatusIcon(run: IntegrationRunRow): string {
    if (run.Status === 'Success') return 'fa-solid fa-circle-check';
    if (run.Status === 'Failed') return 'fa-solid fa-circle-xmark';
    if (run.Status === 'In Progress') return 'fa-solid fa-spinner fa-spin';
    return 'fa-solid fa-clock';
  }

  FormatDate(dateStr: string | null): string {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  FormatDuration(run: IntegrationRunRow): string {
    if (!run.StartedAt || !run.EndedAt) return '--';
    const ms = new Date(run.EndedAt).getTime() - new Date(run.StartedAt).getTime();
    return this.dataService.FormatDuration(ms);
  }

  ToggleErrorLog(event: Event): void {
    event.stopPropagation();
    this.ShowErrorLog = !this.ShowErrorLog;
  }
}

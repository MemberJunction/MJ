import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { IntegrationDataService, IntegrationRunRow, RunDetailRow } from '../../services/integration-data.service';

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
              <th>Records</th>
              <th>Run By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (run of Runs; track run.ID) {
              <tr class="run-row" [class.selected]="SelectedRunID === run.ID"
                  (click)="OnRunClick(run)">
                <td>{{ FormatDate(run.StartedAt) }}</td>
                <td>
                  <span class="run-status" [class]="'status-' + StatusColor(run)">
                    {{ run.Status }}
                  </span>
                </td>
                <td>{{ run.TotalRecords | number }}</td>
                <td>{{ run.RunByUser }}</td>
                <td>
                  <i class="fa-solid fa-chevron-right detail-arrow"
                     [class.rotated]="SelectedRunID === run.ID"></i>
                </td>
              </tr>
              @if (SelectedRunID === run.ID && RunDetails.length > 0) {
                <tr class="detail-row">
                  <td colspan="5">
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
                          @for (detail of RunDetails; track detail.ID) {
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
                    </div>
                  </td>
                </tr>
              }
              @if (SelectedRunID === run.ID && IsLoadingDetails) {
                <tr class="detail-row">
                  <td colspan="5">
                    <mj-loading text="Loading details..." size="small"></mj-loading>
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
      padding: 24px; text-align: center; color: #888;
    }
    .history-empty i { font-size: 24px; margin-bottom: 8px; display: block; }

    .history-panel { margin-top: 8px; }

    .history-table {
      width: 100%; border-collapse: collapse; font-size: 13px;
    }
    .history-table th {
      text-align: left; padding: 6px 8px;
      border-bottom: 2px solid #eee; color: #666; font-weight: 600;
    }
    .run-row { cursor: pointer; }
    .run-row:hover { background: #f8f9fa; }
    .run-row.selected { background: #f0f4ff; }
    .run-row td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }

    .run-status {
      font-size: 11px; font-weight: 600; padding: 2px 6px;
      border-radius: 8px;
    }
    .status-green { background: #e6f9ed; color: #1b7a3d; }
    .status-amber { background: #fff7e0; color: #b5850a; }
    .status-red   { background: #fde8e8; color: #c62828; }

    .detail-arrow { transition: transform 0.2s; font-size: 11px; color: #999; }
    .detail-arrow.rotated { transform: rotate(90deg); }

    .detail-row td { padding: 0; }
    .detail-panel {
      padding: 12px 16px; background: #fafbfc;
      border-left: 3px solid var(--primary-color, #4a6cf7);
    }
    .detail-panel h4 { margin: 0 0 8px 0; font-size: 13px; }

    .detail-table {
      width: 100%; border-collapse: collapse; font-size: 12px;
    }
    .detail-table th {
      text-align: left; padding: 4px 6px; color: #888; font-weight: 500;
    }
    .detail-table td { padding: 4px 6px; }
    .error-count { color: #c62828; font-weight: 600; }
  `]
})
export class RunHistoryPanelComponent implements OnChanges {
  @Input() CompanyIntegrationID: string | null = null;

  Runs: IntegrationRunRow[] = [];
  RunDetails: RunDetailRow[] = [];
  SelectedRunID: string | null = null;
  IsLoading = false;
  IsLoadingDetails = false;

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
    try {
      this.Runs = await this.dataService.LoadRunHistory(this.CompanyIntegrationID);
    } finally {
      this.IsLoading = false;
    }
  }

  async OnRunClick(run: IntegrationRunRow): Promise<void> {
    if (this.SelectedRunID === run.ID) {
      this.SelectedRunID = null;
      this.RunDetails = [];
      return;
    }
    this.SelectedRunID = run.ID;
    this.IsLoadingDetails = true;
    this.RunDetails = [];
    try {
      this.RunDetails = await this.dataService.LoadRunDetails(run.ID);
    } finally {
      this.IsLoadingDetails = false;
    }
  }

  StatusColor(run: IntegrationRunRow): string {
    if (run.Status === 'Success') return 'green';
    if (run.Status === 'Failed') return 'red';
    return 'amber';
  }

  FormatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
}

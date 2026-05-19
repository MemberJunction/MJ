import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { RunView } from '@memberjunction/core';

/** Summary metrics for the dashboard cards */
export interface ArchiveRunMetrics {
  TotalRuns: number;
  TotalRecordsArchived: number;
  TotalStorageBytes: number;
  LastRunDate: Date | null;
}

/** Represents a single archive run */
export interface ArchiveRunSummary {
  ID: string;
  ConfigurationName: string;
  StartedAt: Date;
  CompletedAt: Date | null;
  Status: string;
  RecordsArchived: number;
  RecordsFailed: number;
  RecordsSkipped: number;
  TotalBytes: number;
  DurationSeconds: number;
}

/** Detail record for a single archived item within a run */
export interface ArchiveRunDetailRow {
  ID: string;
  EntityName: string;
  RecordID: string;
  Status: string;
  StoragePath: string;
  Bytes: number;
  ArchivedAt: string;
}

@Component({
  standalone: false,
  selector: 'mj-archive-run-viewer',
  templateUrl: './archive-run-viewer.component.html',
  styleUrls: ['./archive-run-viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchiveRunViewerComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  /** Summary metrics */
  Metrics: ArchiveRunMetrics = {
    TotalRuns: 0,
    TotalRecordsArchived: 0,
    TotalStorageBytes: 0,
    LastRunDate: null,
  };

  /** All archive runs */
  Runs: ArchiveRunSummary[] = [];

  /** Currently selected run for the drawer */
  SelectedRun: ArchiveRunSummary | null = null;

  /** Detail records for the selected run */
  RunDetails: ArchiveRunDetailRow[] = [];

  /** Whether the drawer is open */
  DrawerOpen = false;

  /** Whether the main data is loading */
  IsLoading = true;

  /** Whether drawer details are loading */
  IsDrawerLoading = false;

  private destroyed = false;

  ngOnInit(): void {
    this.loadRunData();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  /** Open the drawer for a specific run */
  async OpenRunDrawer(run: ArchiveRunSummary): Promise<void> {
    this.SelectedRun = run;
    this.DrawerOpen = true;
    this.cdr.markForCheck();
    await this.loadRunDetails(run.ID);
  }

  /** Close the drawer */
  CloseDrawer(): void {
    this.DrawerOpen = false;
    this.SelectedRun = null;
    this.RunDetails = [];
    this.cdr.markForCheck();
  }

  /** Format bytes into a readable string */
  FormatBytes(bytes: number | string | null | undefined): string {
    const numBytes = Number(bytes);
    if (!numBytes || numBytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    const value = numBytes / Math.pow(k, i);
    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }

  /** Format a date for display */
  FormatDate(date: Date | null): string {
    if (!date) return 'N/A';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Format duration in seconds to a readable string */
  FormatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  /** Get CSS class for a status badge */
  GetStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'success':
      case 'completed':
        return 'status-badge-success';
      case 'failed':
      case 'error':
        return 'status-badge-error';
      case 'running':
      case 'in progress':
        return 'status-badge-info';
      default:
        return 'status-badge-default';
    }
  }

  /** Load all run data and compute metrics */
  private async loadRunData(): Promise<void> {
    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const runs = await this.fetchRuns();
      this.Runs = runs;
      this.Metrics = this.computeMetrics(runs);
    } catch {
      this.Runs = [];
    } finally {
      this.IsLoading = false;
      this.markForCheckIfAlive();
    }
  }

  /** Fetch run records from the server */
  private async fetchRuns(): Promise<ArchiveRunSummary[]> {
    const rv = new RunView();
    const result = await rv.RunView<RunRecord>({
      EntityName: 'MJ: Archive Runs',
      ExtraFilter: '',
      OrderBy: 'StartedAt DESC',
      ResultType: 'simple',
    });

    if (!result.Success) return [];
    return result.Results.map((r) => this.mapRunRecord(r));
  }

  /** Map a raw run record to a typed summary */
  private mapRunRecord(r: RunRecord): ArchiveRunSummary {
    const startedAt = new Date(r.StartedAt);
    const completedAt = r.CompletedAt ? new Date(r.CompletedAt) : null;
    const durationSeconds = completedAt
      ? Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)
      : 0;

    return {
      ID: r.ID,
      ConfigurationName: r.ArchiveConfiguration ?? '',
      StartedAt: startedAt,
      CompletedAt: completedAt,
      Status: r.Status ?? 'Unknown',
      RecordsArchived: Number(r.ArchivedRecords) || 0,
      RecordsFailed: Number(r.FailedRecords) || 0,
      RecordsSkipped: Number(r.SkippedRecords) || 0,
      TotalBytes: Number(r.TotalBytesArchived) || 0,
      DurationSeconds: durationSeconds,
    };
  }

  /** Compute summary metrics from all runs */
  private computeMetrics(runs: ArchiveRunSummary[]): ArchiveRunMetrics {
    return {
      TotalRuns: runs.length,
      TotalRecordsArchived: runs.reduce((sum, r) => sum + r.RecordsArchived, 0),
      TotalStorageBytes: runs.reduce((sum, r) => sum + r.TotalBytes, 0),
      LastRunDate: runs.length > 0 ? runs[0].StartedAt : null,
    };
  }

  /** Load detail records for a specific run */
  private async loadRunDetails(runId: string): Promise<void> {
    this.IsDrawerLoading = true;
    this.RunDetails = [];
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const escapedId = runId.replace(/'/g, "''");
      const result = await rv.RunView<DetailRecord>({
        EntityName: 'MJ: Archive Run Details',
        ExtraFilter: `ArchiveRunID='${escapedId}'`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'simple',
        Fields: ['ID', 'Entity', 'RecordID', 'Status', 'StoragePath', 'BytesArchived', '__mj_CreatedAt'],
      });

      if (result.Success) {
        this.RunDetails = result.Results.map((r) => this.mapDetailRecord(r));
      }
    } catch {
      this.RunDetails = [];
    } finally {
      this.IsDrawerLoading = false;
      this.markForCheckIfAlive();
    }
  }

  /** Map a raw detail record to a typed row */
  private mapDetailRecord(r: DetailRecord): ArchiveRunDetailRow {
    return {
      ID: r.ID,
      EntityName: r.Entity ?? '',
      RecordID: r.RecordID ?? '',
      Status: r.Status ?? 'Unknown',
      StoragePath: r.StoragePath ?? '',
      Bytes: Number(r.BytesArchived) || 0,
      ArchivedAt: r.__mj_CreatedAt ?? '',
    };
  }

  /** Mark for check only if not destroyed */
  private markForCheckIfAlive(): void {
    if (!this.destroyed) {
      this.cdr.markForCheck();
    }
  }
}

/** Shape of a run record from the simple RunView query */
interface RunRecord {
  ID: string;
  ArchiveConfiguration: string;
  StartedAt: string;
  CompletedAt: string;
  Status: string;
  ArchivedRecords: number;
  FailedRecords: number;
  SkippedRecords: number;
  TotalBytesArchived: number;
}

/** Shape of a detail record from the simple RunView query */
interface DetailRecord {
  ID: string;
  Entity: string;
  RecordID: string;
  Status: string;
  StoragePath: string;
  BytesArchived: number;
  __mj_CreatedAt: string;
}

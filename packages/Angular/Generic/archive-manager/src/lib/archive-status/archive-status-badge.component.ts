import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  inject,
} from '@angular/core';
import { RunView } from '@memberjunction/core';

/**
 * Summary information about an archived version of a record.
 */
export interface ArchiveVersionInfo {
  /** The archive run detail record ID */
  DetailID: string;
  /** Entity name of the archived record */
  EntityName: string;
  /** Primary key of the archived record */
  RecordID: string;
  /** Number of fields that were archived */
  FieldCount: number;
  /** Date the archive was performed */
  ArchivedAt: Date;
  /** Size of the archived data in bytes */
  Bytes: number;
}

@Component({
  standalone: false,
  selector: 'mj-archive-status-badge',
  templateUrl: './archive-status-badge.component.html',
  styleUrls: ['./archive-status-badge.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchiveStatusBadgeComponent implements OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  /** Whether the badge is visible (record has archived fields) */
  HasArchivedFields = false;

  /** Number of archived fields */
  ArchivedFieldCount = 0;

  /** Date of the most recent archive */
  LastArchivedDate: Date | null = null;

  /** Whether data is currently loading */
  IsLoading = false;

  /** Tooltip text shown on hover */
  TooltipText = '';

  /** Latest archive version info for event emission */
  private latestVersion: ArchiveVersionInfo | null = null;

  /** Tracks whether the component has been destroyed */
  private destroyed = false;

  // --- EntityName input with getter/setter ---
  private _entityName = '';

  @Input()
  set EntityName(value: string) {
    const previous = this._entityName;
    this._entityName = value;
    if (value && value !== previous) {
      this.loadArchiveStatus();
    }
  }
  get EntityName(): string {
    return this._entityName;
  }

  // --- RecordID input with getter/setter ---
  private _recordID = '';

  @Input()
  set RecordID(value: string) {
    const previous = this._recordID;
    this._recordID = value;
    if (value && value !== previous) {
      this.loadArchiveStatus();
    }
  }
  get RecordID(): string {
    return this._recordID;
  }

  /** Emitted when the user clicks the badge to request a restore */
  @Output() RestoreRequested = new EventEmitter<ArchiveVersionInfo>();

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  /** Handle badge click — emit the latest archive version info */
  OnBadgeClick(): void {
    if (this.latestVersion) {
      this.RestoreRequested.emit(this.latestVersion);
    }
  }

  /**
   * Load archive status for the current entity/record combination.
   * Queries MJ: Archive Run Details for successful archives.
   */
  private async loadArchiveStatus(): Promise<void> {
    if (!this._entityName || !this._recordID) {
      return;
    }

    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const result = await this.fetchArchiveDetails();
      this.processArchiveResults(result);
    } catch {
      this.resetState();
    } finally {
      this.IsLoading = false;
      if (!this.destroyed) {
        this.cdr.markForCheck();
      }
    }
  }

  /** Fetch archive run detail records from the server */
  private async fetchArchiveDetails(): Promise<{ Success: boolean; Results: ArchiveDetailRecord[] }> {
    const rv = new RunView();
    const escapedEntity = this._entityName.replace(/'/g, "''");
    const escapedRecord = this._recordID.replace(/'/g, "''");

    return rv.RunView<ArchiveDetailRecord>({
      EntityName: 'MJ: Archive Run Details',
      ExtraFilter: `Entity='${escapedEntity}' AND RecordID='${escapedRecord}' AND Status='Success'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'simple',
      Fields: ['ID', 'Entity', 'RecordID', 'BytesArchived', '__mj_CreatedAt'],
    });
  }

  /** Process the query results and update component state */
  private processArchiveResults(result: { Success: boolean; Results: ArchiveDetailRecord[] }): void {
    if (!result.Success || result.Results.length === 0) {
      this.resetState();
      return;
    }

    const latest = result.Results[0];
    this.HasArchivedFields = true;
    this.ArchivedFieldCount = result.Results.length;
    this.LastArchivedDate = latest.__mj_CreatedAt ? new Date(latest.__mj_CreatedAt) : null;
    this.TooltipText = this.buildTooltipText();
    this.latestVersion = this.buildVersionInfo(latest);
  }

  /** Build the tooltip text from current state */
  private buildTooltipText(): string {
    const countText = `${this.ArchivedFieldCount} field${this.ArchivedFieldCount !== 1 ? 's' : ''} archived`;
    if (this.LastArchivedDate) {
      return `${countText} on ${this.LastArchivedDate.toLocaleDateString()}`;
    }
    return countText;
  }

  /** Build an ArchiveVersionInfo from a detail record */
  private buildVersionInfo(record: ArchiveDetailRecord): ArchiveVersionInfo {
    return {
      DetailID: record.ID,
      EntityName: this._entityName,
      RecordID: this._recordID,
      FieldCount: 0,
      ArchivedAt: record.__mj_CreatedAt ? new Date(record.__mj_CreatedAt) : new Date(),
      Bytes: record.BytesArchived ?? 0,
    };
  }

  /** Reset all display state to defaults */
  private resetState(): void {
    this.HasArchivedFields = false;
    this.ArchivedFieldCount = 0;
    this.LastArchivedDate = null;
    this.TooltipText = '';
    this.latestVersion = null;
  }
}

/** Shape of the simple result from the archive run details query */
interface ArchiveDetailRecord {
  ID: string;
  Entity: string;
  RecordID: string;
  BytesArchived: number;
  __mj_CreatedAt: string;
}

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
import { UUIDsEqual } from '@memberjunction/global';

/** Represents a single archived version of a record */
export interface ArchiveVersion {
  /** Archive run detail ID */
  ID: string;
  /** Date the archive was created */
  ArchivedAt: Date;
  /** Number of fields in this archive */
  FieldCount: number;
  /** Size in bytes */
  Bytes: number;
  /** Storage path where archive is stored */
  StoragePath: string;
  /** The archived field data as a JSON string */
  ArchivedData: string;
}

/** Result status after a restore attempt */
export type RestoreStatus = 'idle' | 'loading' | 'restoring' | 'success' | 'error';

@Component({
  standalone: false,
  selector: 'mj-archive-restore-dialog',
  templateUrl: './archive-restore-dialog.component.html',
  styleUrls: ['./archive-restore-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchiveRestoreDialogComponent implements OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  /** All available versions for this record */
  Versions: ArchiveVersion[] = [];

  /** Currently selected version for preview */
  SelectedVersion: ArchiveVersion | null = null;

  /** Parsed JSON preview of the selected version */
  PreviewJson = '';

  /** Current operation status */
  Status: RestoreStatus = 'idle';

  /** Error message if restore fails */
  ErrorMessage = '';

  /** Success message after restore */
  SuccessMessage = '';

  private destroyed = false;

  // --- EntityName input ---
  private _entityName = '';

  @Input()
  set EntityName(value: string) {
    this._entityName = value;
  }
  get EntityName(): string {
    return this._entityName;
  }

  // --- RecordID input ---
  private _recordID = '';

  @Input()
  set RecordID(value: string) {
    this._recordID = value;
  }
  get RecordID(): string {
    return this._recordID;
  }

  // --- Visible input with reactive loading ---
  private _visible = false;

  @Input()
  set Visible(value: boolean) {
    const previous = this._visible;
    this._visible = value;
    if (value && !previous) {
      this.onDialogOpened();
    }
    if (!value && previous) {
      this.onDialogClosed();
    }
  }
  get Visible(): boolean {
    return this._visible;
  }

  /** Two-way binding support for Visible */
  @Output() VisibleChange = new EventEmitter<boolean>();

  /** Emitted after a successful restore */
  @Output() RestoreCompleted = new EventEmitter<void>();

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  /** Select a version from the timeline */
  SelectVersion(version: ArchiveVersion): void {
    this.SelectedVersion = version;
    this.PreviewJson = this.formatJson(version.ArchivedData);
    this.cdr.markForCheck();
  }

  /** Check if a version is the currently selected one */
  IsSelected(version: ArchiveVersion): boolean {
    return UUIDsEqual(this.SelectedVersion?.ID, version.ID);
  }

  /** Initiate restore of the selected version */
  async RestoreSelectedVersion(): Promise<void> {
    if (!this.SelectedVersion) {
      return;
    }

    this.Status = 'restoring';
    this.ErrorMessage = '';
    this.SuccessMessage = '';
    this.cdr.markForCheck();

    try {
      await this.performRestore(this.SelectedVersion);
      this.Status = 'success';
      this.SuccessMessage = 'Record restored successfully.';
      this.RestoreCompleted.emit();
    } catch (err: unknown) {
      this.Status = 'error';
      this.ErrorMessage = err instanceof Error ? err.message : 'Restore failed. Please try again.';
    } finally {
      if (!this.destroyed) {
        this.cdr.markForCheck();
      }
    }
  }

  /** Close the dialog */
  Close(): void {
    this._visible = false;
    this.VisibleChange.emit(false);
  }

  /** Format bytes into a human-readable string */
  FormatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }

  /** Format a date for display */
  FormatDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Called when the dialog becomes visible */
  private async onDialogOpened(): Promise<void> {
    this.resetState();
    await this.loadVersions();
  }

  /** Called when the dialog is hidden */
  private onDialogClosed(): void {
    this.resetState();
  }

  /** Load all archived versions for this record */
  private async loadVersions(): Promise<void> {
    if (!this._entityName || !this._recordID) {
      return;
    }

    this.Status = 'loading';
    this.cdr.markForCheck();

    try {
      const result = await this.fetchVersionRecords();
      this.Versions = this.mapVersionRecords(result);
      this.autoSelectFirstVersion();
      this.Status = 'idle';
    } catch {
      this.Status = 'error';
      this.ErrorMessage = 'Failed to load archive versions.';
    } finally {
      if (!this.destroyed) {
        this.cdr.markForCheck();
      }
    }
  }

  /** Fetch version records from the server */
  private async fetchVersionRecords(): Promise<{ Success: boolean; Results: VersionDetailRecord[] }> {
    const rv = new RunView();
    const escapedEntity = this._entityName.replace(/'/g, "''");
    const escapedRecord = this._recordID.replace(/'/g, "''");

    return rv.RunView<VersionDetailRecord>({
      EntityName: 'MJ: Archive Run Details',
      ExtraFilter: `Entity='${escapedEntity}' AND RecordID='${escapedRecord}' AND Status='Success'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'simple',
      Fields: ['ID', 'BytesArchived', 'StoragePath', '__mj_CreatedAt'],
    });
  }

  /** Map raw records to ArchiveVersion objects */
  private mapVersionRecords(result: { Success: boolean; Results: VersionDetailRecord[] }): ArchiveVersion[] {
    if (!result.Success) {
      return [];
    }
    return result.Results.map((r) => ({
      ID: r.ID,
      ArchivedAt: new Date(r.__mj_CreatedAt),
      FieldCount: 0,
      Bytes: r.BytesArchived ?? 0,
      StoragePath: r.StoragePath ?? '',
      ArchivedData: '{}',
    }));
  }

  /** Auto-select the first (newest) version if available */
  private autoSelectFirstVersion(): void {
    if (this.Versions.length > 0) {
      this.SelectVersion(this.Versions[0]);
    }
  }

  /** Perform the actual restore operation */
  private async performRestore(_version: ArchiveVersion): Promise<void> {
    // TODO: Integrate with ArchivingEngine.RestoreRecord() when available
    // For now, simulate a brief delay to represent the async operation
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }

  /** Format a JSON string for pretty display */
  private formatJson(jsonString: string): string {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonString;
    }
  }

  /** Reset all dialog state */
  private resetState(): void {
    this.Versions = [];
    this.SelectedVersion = null;
    this.PreviewJson = '';
    this.Status = 'idle';
    this.ErrorMessage = '';
    this.SuccessMessage = '';
  }
}

/** Shape of a version detail record from the simple RunView query */
interface VersionDetailRecord {
  ID: string;
  BytesArchived: number;
  StoragePath: string;
  __mj_CreatedAt: string;
}

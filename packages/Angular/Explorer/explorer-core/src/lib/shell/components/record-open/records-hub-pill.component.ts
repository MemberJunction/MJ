import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter, inject } from '@angular/core';
import { WorkspaceStateManager, WorkspaceTab } from '@memberjunction/ng-base-application';
import { IsRecordsTabConfiguration, SafeDetectChanges } from '@memberjunction/ng-shared';
import { Subscription } from 'rxjs';

/**
 * Persistent "Records" nav pill (records-style record opens).
 *
 * The invariant this design guarantees: no matter where you are in the app,
 * any open record is at most 2 clicks away — the pill (1st click) resumes
 * the LAST-VIEWED record; the strip that appears while viewing records gets
 * you to any other open record (2nd click).
 *
 * Renders only while at least one record is open, with a count badge. Shows
 * the active state when the user is currently viewing a record. Lives at the
 * shell level (after the app nav) so it persists across app switches — the
 * records pool is global, not per-app.
 */
@Component({
  standalone: true,
  selector: 'mj-records-hub-pill',
  templateUrl: './records-hub-pill.component.html',
  styleUrls: ['./records-hub-pill.component.css']
})
export class RecordsHubPillComponent implements OnInit, OnDestroy {
  private workspaceManager = inject(WorkspaceStateManager);
  private cdr = inject(ChangeDetectorRef);

  /** Emitted after the pill resumes a record (hosts may close drawers etc.) */
  @Output() Activated = new EventEmitter<void>();

  /** Open record tabs (any app) */
  public RecordTabs: WorkspaceTab[] = [];
  /** True when the workspace's active tab is a record (pill shows active) */
  public ViewingRecord = false;

  private activeTabId: string | null = null;
  /** Last record tab the user actually viewed — the pill's resume target */
  private lastViewedRecordTabId: string | null = null;
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = this.workspaceManager.Configuration.subscribe(config => {
      this.RecordTabs = (config?.tabs ?? [])
        .filter(t => IsRecordsTabConfiguration(t.configuration))
        .sort((a, b) => a.sequence - b.sequence);
      this.activeTabId = config?.activeTabId ?? null;
      const activeIsRecord = this.RecordTabs.some(t => t.id === this.activeTabId);
      this.ViewingRecord = activeIsRecord;
      if (activeIsRecord) {
        this.lastViewedRecordTabId = this.activeTabId;
      } else if (this.lastViewedRecordTabId && !this.RecordTabs.some(t => t.id === this.lastViewedRecordTabId)) {
        this.lastViewedRecordTabId = null; // resume target was closed
      }
      // Zoneless: RxJS-driven mutation needs an explicit CD kick
      SafeDetectChanges(this.cdr);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Open-record count for the badge */
  get Count(): number {
    return this.RecordTabs.length;
  }

  /**
   * Pill click: resume the last-viewed record, falling back to the most
   * recently accessed open record. No-op when already viewing a record.
   */
  Activate(): void {
    if (this.ViewingRecord || this.RecordTabs.length === 0) {
      return;
    }
    const target =
      this.RecordTabs.find(t => t.id === this.lastViewedRecordTabId) ??
      [...this.RecordTabs].sort((a, b) => (b.lastAccessedAt || '').localeCompare(a.lastAccessedAt || ''))[0];
    this.workspaceManager.SetActiveTab(target.id);
    this.Activated.emit();
  }
}

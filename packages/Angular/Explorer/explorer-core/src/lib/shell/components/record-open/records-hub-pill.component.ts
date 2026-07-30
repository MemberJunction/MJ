import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter, inject } from '@angular/core';
import { WorkspaceStateManager, WorkspaceTab } from '@memberjunction/ng-base-application';
import { IsRecordsRegionTab, IsRecordsTabConfiguration, SafeDetectChanges, ExplorerBreakpointService } from '@memberjunction/ng-shared';
import { Subscription } from 'rxjs';
import { RecordSwitcherService } from './record-switcher.service';

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
  private breakpoint = inject(ExplorerBreakpointService);
  private recordSwitcher = inject(RecordSwitcherService);

  /** Emitted after the pill resumes a record (hosts may close drawers etc.) */
  @Output() Activated = new EventEmitter<void>();

  /** Open record tabs (any app) */
  public RecordTabs: WorkspaceTab[] = [];
  /**
   * ALL open records including workspace-docked ones — the MOBILE pill's
   * universe (docked/region composition is a desktop concept; the mobile
   * switcher sheet lists both, and the badge must match its row count).
   */
  public AllRecordTabs: WorkspaceTab[] = [];
  /** True when the workspace's active tab is a record (pill shows active) */
  public ViewingRecord = false;

  private activeTabId: string | null = null;
  /** Last record tab the user actually viewed — the pill's resume target */
  private lastViewedRecordTabId: string | null = null;
  private sub?: Subscription;
  private breakpointSub?: Subscription;

  ngOnInit(): void {
    this.sub = this.workspaceManager.Configuration.subscribe(config => {
      // REGION records only: a record docked to the workspace ("Move to
      // Workspace") is a visible main-layout tab — it doesn't count toward
      // the pill's badge and is never a resume target.
      this.RecordTabs = (config?.tabs ?? [])
        .filter(t => IsRecordsRegionTab(t.configuration))
        .sort((a, b) => a.sequence - b.sequence);
      this.AllRecordTabs = (config?.tabs ?? [])
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
    // Count/visibility read the breakpoint (mobile badge includes docked
    // records) — re-render on crossings
    this.breakpointSub = this.breakpoint.IsMobile$.subscribe(() => {
      SafeDetectChanges(this.cdr);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.breakpointSub?.unsubscribe();
  }

  /**
   * Open-record count for the badge. On mobile this includes workspace-docked
   * records — the badge must match the switcher sheet's row count. Desktop
   * badge semantics unchanged (region only; docked records are visible
   * main-layout tabs and don't need a counter).
   */
  get Count(): number {
    return this.breakpoint.IsMobile ? this.AllRecordTabs.length : this.RecordTabs.length;
  }

  /**
   * Pill click.
   *
   * MOBILE: open the record switcher sheet — even while viewing a record
   * (on desktop that case is a no-op because the strip is already showing;
   * on mobile there IS no strip, the sheet is how you switch). The Activated
   * emission closes the drawer the pill lives in.
   *
   * DESKTOP: resume the last-viewed record, falling back to the most
   * recently accessed open record. No-op when already viewing a record.
   */
  Activate(): void {
    if (this.breakpoint.IsMobile) {
      if (this.AllRecordTabs.length === 0) {
        return;
      }
      this.recordSwitcher.Open();
      this.Activated.emit();
      return;
    }
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

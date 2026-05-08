import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewEncapsulation,
} from '@angular/core';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  AfterRecordRestoreEventArgs,
  AfterRecycleBinOpenEventArgs,
  AfterRestoreCommitEventArgs,
  BeforeRecordRestoreEventArgs,
  BeforeRecycleBinOpenEventArgs,
  BeforeRestoreCommitEventArgs,
} from './events/recycle-bin-events';

/**
 * Tiny composite that renders a Recycle Bin **chip button** (with live
 * deleted-record count badge) and hosts the {@link RecycleBinComponent}
 * slide-in panel that opens when clicked.
 *
 * Designed to be dropped into any toolbar in three lines:
 *
 * @example
 *   <mj-recycle-bin-chip
 *     *ngIf="ShowRecycleBin"
 *     [EntityName]="effectiveEntity?.Name">
 *   </mj-recycle-bin-chip>
 *
 * The chip auto-hides itself when:
 *  - No `EntityName` is provided
 *  - The entity has `TrackRecordChanges = false`
 *  - The user lacks `CanDelete` permission on the entity
 *  - The deleted-record count is zero
 *
 * Each of those is the right behavior to avoid cluttering toolbars on
 * entities where the bin is irrelevant.
 *
 * Consumers who want to intercept any bin action can pass through the
 * standard cancelable Before/After events.
 */
@Component({
  standalone: false,
  selector: 'mj-recycle-bin-chip',
  template: `
    @if (IsVisible) {
      <button class="rbc-chip"
        type="button"
        (click)="Toggle()"
        [attr.title]="'Recycle Bin · ' + DeletedCount + ' deleted record' + (DeletedCount === 1 ? '' : 's')">
        <i class="fa-solid fa-trash-can-arrow-up" aria-hidden="true"></i>
        <span class="rbc-chip-label">Recycle Bin</span>
        <span class="rbc-chip-count">{{ DeletedCount }}</span>
      </button>

      <mj-recycle-bin
        [Visible]="PanelVisible"
        [EntityName]="EntityName"
        [ContextUser]="ContextUser"
        (Closed)="OnPanelClosed()"
        (BeforeRecycleBinOpen)="BeforeRecycleBinOpen.emit($event)"
        (AfterRecycleBinOpen)="OnAfterRecycleBinOpen($event)"
        (BeforeRecordRestore)="BeforeRecordRestore.emit($event)"
        (AfterRecordRestore)="AfterRecordRestore.emit($event)"
        (BeforeRestoreCommit)="BeforeRestoreCommit.emit($event)"
        (AfterRestoreCommit)="OnAfterRestoreCommit($event)">
      </mj-recycle-bin>
    }
  `,
  styles: [`
    .rbc-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 11px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      background: color-mix(in srgb, var(--mj-status-info) 8%, var(--mj-bg-surface));
      color: color-mix(in srgb, var(--mj-status-info) 80%, var(--mj-text-secondary));
      border: 1px solid color-mix(in srgb, var(--mj-status-info) 25%, var(--mj-border-default));
      cursor: pointer;
      font-family: inherit;
      transition: background-color 0.1s, border-color 0.1s;
    }
    .rbc-chip:hover {
      background: color-mix(in srgb, var(--mj-status-info) 14%, var(--mj-bg-surface));
      border-color: var(--mj-status-info);
    }
    .rbc-chip-label {
      /* always show on wider screens; hide on narrow if needed */
    }
    .rbc-chip-count {
      background: var(--mj-status-info);
      color: var(--mj-text-inverse, #fff);
      border-radius: 10px;
      padding: 1px 7px;
      font-size: 10px;
      font-weight: 700;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RecycleBinChipComponent extends BaseAngularComponent implements OnInit  {
  /**
   * Entity name whose deleted records will be surfaced. When null/empty,
   * the chip hides itself entirely.
   */
  private _entityName: string | null = null;
  @Input()
  set EntityName(value: string | null) {
    if (value !== this._entityName) {
      this._entityName = value;
      if (this.isInitialized) this.refreshCount();
    }
  }
  get EntityName(): string | null {
    return this._entityName;
  }

  /**
   * Optional context user for permission checks. Falls back to
   * `this.ProviderToUse.CurrentUser` when omitted.
   */
  @Input() ContextUser: UserInfo | null = null;

  // ─── Re-emitted events from the inner panel ────────────────────

  @Output() BeforeRecycleBinOpen = new EventEmitter<BeforeRecycleBinOpenEventArgs>();
  @Output() AfterRecycleBinOpen = new EventEmitter<AfterRecycleBinOpenEventArgs>();
  @Output() BeforeRecordRestore = new EventEmitter<BeforeRecordRestoreEventArgs>();
  @Output() AfterRecordRestore = new EventEmitter<AfterRecordRestoreEventArgs>();
  @Output() BeforeRestoreCommit = new EventEmitter<BeforeRestoreCommitEventArgs>();
  @Output() AfterRestoreCommit = new EventEmitter<AfterRestoreCommitEventArgs>();

  // ─── Public template state ──────────────────────────────────────

  public DeletedCount = 0;
  public PanelVisible = false;
  public IsVisible = false;
  public CanDelete = false;
  public TracksChanges = false;

  private isInitialized = false;

  constructor(private cdr: ChangeDetectorRef) {
  super();}

  ngOnInit(): void {
    this.isInitialized = true;
    this.refreshCount();
  }

  public Toggle(): void {
    this.PanelVisible = !this.PanelVisible;
    this.cdr.markForCheck();
  }

  public OnPanelClosed(): void {
    this.PanelVisible = false;
    // Refresh count — a restore may have removed an entry from the bin
    this.refreshCount();
  }

  /**
   * After-events bubble through but we also use them to refresh the count
   * — restoring a record means it's no longer "deleted".
   */
  public OnAfterRecycleBinOpen(e: AfterRecycleBinOpenEventArgs): void {
    this.DeletedCount = e.deletedRecordCount;
    this.AfterRecycleBinOpen.emit(e);
    this.cdr.markForCheck();
  }

  public OnAfterRestoreCommit(e: AfterRestoreCommitEventArgs): void {
    if (e.success) this.DeletedCount = Math.max(0, this.DeletedCount - 1);
    this.AfterRestoreCommit.emit(e);
    this.cdr.markForCheck();
  }

  /**
   * Loads the deleted-record count and visibility flags. Called on init,
   * when EntityName changes, and after the panel closes (so a restore
   * decrements the badge).
   */
  private async refreshCount(): Promise<void> {
    this.IsVisible = false;
    this.DeletedCount = 0;

    if (!this._entityName) {
      this.cdr.markForCheck();
      return;
    }

    const md = this.ProviderToUse;
    const entityInfo = md.Entities.find(
      e => e.Name.trim().toLowerCase() === this._entityName!.trim().toLowerCase(),
    );
    if (!entityInfo) {
      this.cdr.markForCheck();
      return;
    }

    this.TracksChanges = !!entityInfo.TrackRecordChanges;
    if (!this.TracksChanges) {
      this.cdr.markForCheck();
      return;
    }

    const effectiveUser = this.ContextUser ?? md.CurrentUser;
    if (!effectiveUser) {
      this.cdr.markForCheck();
      return;
    }
    const perms = entityInfo.GetUserPermisions(effectiveUser);
    this.CanDelete = perms?.CanDelete ?? false;
    if (!this.CanDelete) {
      this.cdr.markForCheck();
      return;
    }

    // Cheap count query — just IDs, capped low
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<{ ID: string; RecordID: string }>({
        EntityName: 'MJ: Record Changes',
        Fields: ['ID', 'RecordID'],
        ExtraFilter: `EntityID='${entityInfo.ID}' AND Type='Delete'`,
        OrderBy: 'ChangedAt DESC',
        MaxRows: 500,
        ResultType: 'simple',
      }, this.ContextUser ?? undefined);

      if (result.Success) {
        // Distinct RecordIDs (a record might have been deleted, recreated, deleted again)
        const distinct = new Set(result.Results.map(r => r.RecordID));
        this.DeletedCount = distinct.size;
      }
    } catch {
      // Silently ignore — chip just won't show
    }

    this.IsVisible = this.DeletedCount > 0;
    this.cdr.markForCheck();
  }
}

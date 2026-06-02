import { Directive, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { BaseEntity, CompositeKey } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import { MjEntityFormHostComponent } from '../host/entity-form-host.component';
import { EntityFormConfig } from '../types/entity-form-config';
import { FormNavigationEvent } from '../types/navigation-events';
import {
  FormNotificationEvent, RecordDeletedEvent, RecordSaveFailedEvent, ValidationFailedEvent
} from '../types/form-types';
import { BaseFormComponent } from '../base-form-component';

/** How an overlay closed. */
export type FormOverlayCloseReason = 'save' | 'cancel';

/**
 * Shared logic for the form overlay shells ({@link MjFormDialogComponent} and
 * {@link MjFormSlideInComponent}). Both wrap an {@link MjEntityFormHostComponent}
 * in chrome that owns the title + Save/Cancel, bubble the host's events upward,
 * and proxy the form inputs downward.
 *
 * Subclasses provide only the template; all input/output plumbing lives here.
 */
@Directive()
export abstract class BaseFormOverlay extends BaseAngularComponent {
  /** Reference to the hosted form (template must name the host `#host`). */
  @ViewChild('host') protected host?: MjEntityFormHostComponent;

  // ── Record selection (mirror MjEntityFormHostComponent) ──────────────────

  /** Entity name to load. Ignored when {@link Record} is supplied. */
  @Input() EntityName: string | null = null;
  /** Primary key of the record to edit. Empty/absent → new record. */
  @Input() PrimaryKey?: CompositeKey;
  /** Convenience single-column ('ID') key; used when {@link PrimaryKey} is absent. */
  @Input() RecordID?: string;
  /** Pre-loaded record to bind directly (skips load). */
  @Input() Record: BaseEntity | null = null;
  /** New-record default values: URL-segment string or plain object. */
  @Input() NewRecordValues: string | Record<string, unknown> | null = null;
  /** Force edit mode (default: new → edit, existing → read). */
  @Input() EditMode: boolean | null = null;
  /** Per-instance form config (toolbar/sections/width/links). */
  @Input() Config: EntityFormConfig | null = null;

  // ── Chrome ────────────────────────────────────────────────────────────────

  /** Title shown in the chrome. When empty, derived from the record on load. */
  @Input() Title = '';
  /** Whether to show the Save/Cancel footer. Default: true. */
  @Input() ShowFooter = true;
  /** Save button label. */
  @Input() SaveButtonText = 'Save';
  /** Cancel button label. */
  @Input() CancelButtonText = 'Cancel';

  private _visible = false;
  private _closed = false;
  /** Two-way: whether the overlay is shown. */
  @Input()
  set Visible(value: boolean) {
    if (value !== this._visible) {
      this._visible = value;
      if (value) this._closed = false; // re-arm for the next close
      this.VisibleChange.emit(value);
    }
  }
  get Visible(): boolean { return this._visible; }

  // ── Outputs ─────────────────────────────────────────────────────────────

  @Output() VisibleChange = new EventEmitter<boolean>();
  /** Emitted after a successful save (carries the saved entity). */
  @Output() Saved = new EventEmitter<BaseEntity>();
  /** Emitted when the overlay closes (save or cancel). */
  @Output() Closed = new EventEmitter<FormOverlayCloseReason>();
  /** Re-emitted host navigation requests (consumer decides; chrome never routes). */
  @Output() Navigate = new EventEmitter<FormNavigationEvent>();
  /** Re-emitted host notifications. */
  @Output() Notification = new EventEmitter<FormNotificationEvent>();
  /** Re-emitted host record-deleted. */
  @Output() RecordDeleted = new EventEmitter<RecordDeletedEvent>();
  /** Re-emitted host save-failed. */
  @Output() RecordSaveFailed = new EventEmitter<RecordSaveFailedEvent>();
  /** Re-emitted host validation-failed. */
  @Output() ValidationFailed = new EventEmitter<ValidationFailedEvent>();
  /** Re-emitted host load error. */
  @Output() LoadError = new EventEmitter<{ title: string; detail: string }>();
  /** The live form instance, for power-user wiring. */
  @Output() FormCreated = new EventEmitter<BaseFormComponent>();

  // ── State ─────────────────────────────────────────────────────────────────

  /** True while a save is in flight (disables the Save button). */
  public saving = false;
  /** Title actually rendered (Title input, or derived from the record). */
  public effectiveTitle = '';

  /** The live form component instance (for power-user wiring via MJFormRef). */
  get formInstance(): BaseFormComponent | null {
    return this.host?.form ?? null;
  }

  /** Resolves the primary key to pass to the host (PrimaryKey beats RecordID). */
  protected get effectivePrimaryKey(): CompositeKey | undefined {
    if (this.PrimaryKey) return this.PrimaryKey;
    if (this.RecordID) return CompositeKey.FromID(this.RecordID);
    return undefined;
  }

  // ── Host event handlers (wired in subclass templates) ─────────────────────

  /** Save via the hosted form. Closing happens on the resulting `Saved` event. */
  async onSaveClick(): Promise<void> {
    if (!this.host) return;
    this.saving = true;
    try {
      await this.host.Save();
    } finally {
      this.saving = false;
    }
  }

  onHostSaved(record: BaseEntity): void {
    this.Saved.emit(record);
    this.close('save');
  }

  onCancel(): void {
    if (this._closed) return;
    this.host?.Cancel();
    this.close('cancel');
  }

  /** Host asked to be dismissed (e.g. Discard on a brand-new record). */
  onHostDismissed(): void {
    this.close('cancel');
  }

  onFormCreated(form: BaseFormComponent): void {
    this.FormCreated.emit(form);
    if (!this.Title) {
      const rec = form.record;
      const entityLabel = rec?.EntityInfo?.DisplayName ?? rec?.EntityInfo?.Name ?? '';
      this.effectiveTitle = rec?.IsSaved
        ? `${entityLabel}`
        : `New ${entityLabel}`;
    } else {
      this.effectiveTitle = this.Title;
    }
  }

  /** Hide the overlay and emit Closed exactly once per open. Idempotent. */
  protected close(reason: FormOverlayCloseReason): void {
    if (this._closed) return;
    this._closed = true;
    if (this._visible) {
      this._visible = false;
      this.VisibleChange.emit(false);
    }
    this.Closed.emit(reason);
  }
}

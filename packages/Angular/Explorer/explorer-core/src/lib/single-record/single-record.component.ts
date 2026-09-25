import { Component, EventEmitter, inject, Input, Output, ViewChild } from '@angular/core';
import { CompositeKey, BaseEntity } from '@memberjunction/core';
import { EntityFormMode, FormNavigationEvent, FormNotificationEvent, MJFormPresenterService, MjEntityFormHostComponent } from '@memberjunction/ng-base-forms';
import { NavigationService, RecentAccessService, SharedService } from '@memberjunction/ng-shared';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Explorer-side host for a single entity record in the main tab area.
 *
 * This is now a **thin wrapper** around the Generic `<mj-entity-form-host>`
 * (in `@memberjunction/ng-base-forms`), which owns all the mechanics: resolving
 * the form (class / custom / interactive override + variants), loading the
 * record, dynamically creating the form, binding it, and tearing it down.
 *
 * SingleRecordComponent's only remaining job is the **Explorer mapping**:
 * translating the host's framework-agnostic events into Explorer services —
 * `Navigate` → {@link NavigationService}, `Notification` → {@link SharedService},
 * record loads → {@link RecentAccessService} — none of which belong in a Generic
 * component.
 */
@Component({
  standalone: false,
  selector: 'mj-single-record',
  templateUrl: './single-record.component.html',
  styleUrls: ['./single-record.component.css']
})
export class SingleRecordComponent extends BaseAngularComponent {
  @Input() public PrimaryKey: CompositeKey = new CompositeKey();
  @Input() public entityName: string | null = '';
  @Input() public NewRecordValues: string | Record<string, unknown> | null = '';
  /**
   * `'standard'` asks the host for the CodeGen form even when a custom form is
   * registered (MJ#4755). The mount-time mode; later changes go through
   * {@link SwitchFormMode} so the host's unsaved-work guard applies.
   */
  @Input() public FormMode: EntityFormMode = 'default';

  /**
   * Re-emitted host `FormModeChange`: the mode changed inside the host — the
   * strip, a {@link SwitchFormMode} call, or an interactive-variant pick
   * (which returns to `'default'`).
   */
  @Output() public FormModeChange: EventEmitter<EntityFormMode> = new EventEmitter<EntityFormMode>();

  /** @deprecated Use {@link NewRecordValues}. */
  @Input() public set newRecordValues(value: string | Record<string, unknown> | null) {
    this.NewRecordValues = value;
  }
  /** @deprecated Use {@link NewRecordValues}. */
  public get newRecordValues(): string | Record<string, unknown> | null {
    return this.NewRecordValues;
  }

  @Output() public LoadComplete: EventEmitter<void> = new EventEmitter<void>();

  /**
   * @deprecated Use {@link LoadComplete}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (loadComplete) keeps working. Must stay AFTER LoadComplete: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public loadComplete = this.LoadComplete;
  @Output() public RecordSaved: EventEmitter<BaseEntity> = new EventEmitter<BaseEntity>();

  /**
   * @deprecated Use {@link RecordSaved}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (recordSaved) keeps working. Must stay AFTER RecordSaved: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public recordSaved = this.RecordSaved;
  /** Emitted when the hosted form asks to be dismissed (e.g. Discard on a new record). */
  @Output() public RecordDismissed: EventEmitter<void> = new EventEmitter<void>();

  /**
   * @deprecated Use {@link RecordDismissed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (recordDismissed) keeps working. Must stay AFTER RecordDismissed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public recordDismissed = this.RecordDismissed;

  @ViewChild(MjEntityFormHostComponent) private formHost?: MjEntityFormHostComponent;

  /**
   * Switch the mounted form between custom and standard (MJ#4755) through the
   * host's guarded switch. False when refused (unsaved work — the host has
   * already raised a warning) or when no host is mounted yet.
   */
  public SwitchFormMode(mode: EntityFormMode): boolean {
    return this.formHost?.SwitchFormMode(mode) ?? false;
  }

  /**
   * True while the hosted form is in edit mode. The host already exposes the
   * live form instance, so this is a read, not a new event pipeline.
   *
   * MJ forms are read-only until the user explicitly clicks Edit, so edit mode
   * is a deliberate gesture and a sound proxy for "there is work in here worth
   * protecting" — which is all the preview-tab replacement guard needs.
   */
  public IsEditing(): boolean {
    return this.formHost?.Form?.EditMode === true;
  }

  private navigationService = inject(NavigationService);
  private sharedService = inject(SharedService);
  private formPresenter = inject(MJFormPresenterService);
  private recentAccessService = new RecentAccessService();

  /** Unblock the shell's first-resource-load gate (success or error). */
  OnLoadComplete(): void {
    this.LoadComplete.emit();
  }

  /** @deprecated Use {@link OnLoadComplete}. */
  onLoadComplete(): void {
    return this.OnLoadComplete();
  }

  /** Log access for existing records once the form's record is ready. */
  OnRecordReady(record: BaseEntity): void {
    if (record?.IsSaved) {
      this.recentAccessService.logAccess(record.EntityInfo.Name, record.PrimaryKey, 'record');
    }
  }

  /** @deprecated Use {@link OnRecordReady}. */
  onRecordReady(record: BaseEntity): void {
    return this.OnRecordReady(record);
  }

  OnSaved(record: BaseEntity): void {
    this.RecordSaved.emit(record);
  }

  /** @deprecated Use {@link OnSaved}. */
  onSaved(record: BaseEntity): void {
    return this.OnSaved(record);
  }

  OnNotification(event: FormNotificationEvent): void {
    this.sharedService.CreateSimpleNotification(event.Message, event.Type, event.Duration);
  }

  /** @deprecated Use {@link OnNotification}. */
  onNotification(event: FormNotificationEvent): void {
    return this.OnNotification(event);
  }

  /** Map the form's navigation requests onto Explorer's NavigationService. */
  HandleNavigation(event: FormNavigationEvent): void {
    switch (event.Kind) {
      case 'record':
        this.navigationService.OpenEntityRecord(event.EntityName, event.PrimaryKey, { forceNewTab: event.OpenInNewTab });
        break;
      case 'new-record':
        // Creating a related record from inside an open form: force a new tab so the
        // parent record stays intact in single-resource mode.
        this.navigationService.OpenNewEntityRecord(event.EntityName, {
          newRecordValues: event.DefaultValues,
          forceNewTab: true,
        });
        break;
      case 'entity-hierarchy':
        this.navigationService.OpenEntityRecord(event.EntityName, event.PrimaryKey);
        break;
      case 'external-link':
        window.open(event.Url, '_blank');
        break;
      case 'email':
        window.open(`mailto:${event.EmailAddress}`, '_self');
        break;
      case 'dismiss':
        this.RecordDismissed.emit();
        break;
      case 'create-related': {
        // A FK field wants a new related record created. Open the related entity's form
        // as a dialog/slide-in (prefilled), then hand the saved record back so the field
        // can select it.
        const ref = this.formPresenter.Open({
          EntityName: event.EntityName,
          Presentation: event.Presentation ?? 'dialog',
          NewRecordValues: event.NewRecordValues,
          Provider: event.Provider,
        });
        ref.AfterSaved().then(created => event.Complete(created));
        break;
      }
    }
  }

  /** @deprecated Use {@link HandleNavigation}. */
  handleNavigation(event: FormNavigationEvent): void {
    return this.HandleNavigation(event);
  }
}

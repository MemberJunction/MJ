import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CompositeKey, BaseEntity } from '@memberjunction/core';
import { FormNavigationEvent, FormNotificationEvent, MJFormPresenterService } from '@memberjunction/ng-base-forms';
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
  @Input() public newRecordValues: string | Record<string, unknown> | null = '';

  @Output() public loadComplete: EventEmitter<void> = new EventEmitter<void>();
  @Output() public recordSaved: EventEmitter<BaseEntity> = new EventEmitter<BaseEntity>();
  /** Emitted when the hosted form asks to be dismissed (e.g. Discard on a new record). */
  @Output() public recordDismissed: EventEmitter<void> = new EventEmitter<void>();

  private navigationService = inject(NavigationService);
  private sharedService = inject(SharedService);
  private formPresenter = inject(MJFormPresenterService);
  private recentAccessService = new RecentAccessService();

  /** Unblock the shell's first-resource-load gate (success or error). */
  onLoadComplete(): void {
    this.loadComplete.emit();
  }

  /** Log access for existing records once the form's record is ready. */
  onRecordReady(record: BaseEntity): void {
    if (record?.IsSaved) {
      this.recentAccessService.logAccess(record.EntityInfo.Name, record.PrimaryKey, 'record');
    }
  }

  onSaved(record: BaseEntity): void {
    this.recordSaved.emit(record);
  }

  onNotification(event: FormNotificationEvent): void {
    this.sharedService.CreateSimpleNotification(event.Message, event.Type, event.Duration);
  }

  /** Map the form's navigation requests onto Explorer's NavigationService. */
  handleNavigation(event: FormNavigationEvent): void {
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
        this.recordDismissed.emit();
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
}

import { AfterViewInit, ChangeDetectorRef, Component, ComponentRef, EventEmitter, inject, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router'
import { Metadata, KeyValuePair, CompositeKey, BaseEntity, BaseEntityEvent, FieldValueCollection, EntityFieldTSType } from '@memberjunction/core';
import { Subscription } from 'rxjs';
import { MJGlobal } from '@memberjunction/global';
import { Container } from '@memberjunction/ng-container-directives';
import { BaseFormComponent, FormNavigationEvent, FormNotificationEvent } from '@memberjunction/ng-base-forms';
import { NavigationService, RecentAccessService, SharedService } from '@memberjunction/ng-shared';


import { BaseAngularComponent } from '@memberjunction/ng-base-types';
@Component({
  standalone: false,
  selector: 'mj-single-record',
  templateUrl: './single-record.component.html',
  styleUrls: ['./single-record.component.css']
})
export class SingleRecordComponent extends BaseAngularComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(Container, {static: true}) formContainer!: Container;
  @Input() public PrimaryKey: CompositeKey = new CompositeKey();
  @Input() public entityName: string | null = '';
  @Input() public newRecordValues: string | Record<string, unknown> | null = '';

  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();
  @Output() public recordSaved: EventEmitter<BaseEntity> = new EventEmitter<BaseEntity>();

  private recentAccessService: RecentAccessService;
  private navigationService = inject(NavigationService);
  private sharedService = inject(SharedService);
  private cdr = inject(ChangeDetectorRef);

  constructor (private route: ActivatedRoute) {
    super();
    this.recentAccessService = new RecentAccessService();
  }

  public appDescription: string = ''
  public useGenericForm: boolean = false;
  public loading: boolean = true;
  public errorTitle: string | null = null;
  public errorDetail: string | null = null;

  // Track dynamically created components and entities for cleanup
  private _formComponentRef: ComponentRef<BaseFormComponent> | null = null;
  private _currentRecord: BaseEntity | null = null;
  private _eventHandlerSubscription: Subscription | null = null;
  private _formEventSubscriptions: Subscription[] = [];

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    this.LoadForm(this.PrimaryKey, <string>this.entityName)
  }

  public async LoadForm(primaryKey: CompositeKey, entityName: string) {
    // Perform any necessary actions with the ViewID, such as fetching data
    if (!entityName || entityName.trim().length === 0) {
      // No entity yet — caller will re-invoke once it has one. Don't emit loadComplete;
      // it would race the real load. The shell's recovery timer will surface the
      // "taking longer than expected" reset if this is the terminal state.
      return;
    }

    this.entityName = entityName;
    if (primaryKey.HasValue) {
      // we have an existing record to load up
      this.PrimaryKey = primaryKey;
    }
    else {
      // new record, no existing primary key
      this.PrimaryKey = new CompositeKey();
    }

    const formReg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entityName);

    const md = this.ProviderToUse;
    const entity = md.EntityByName(entityName);
    const permissions = entity?.GetUserPermisions(md.CurrentUser);

    try {
      if (!entity) {
        this.failWithUserError(
          `Entity not found: "${entityName}"`,
          `This MemberJunction instance has no metadata for entity "${entityName}". Check that the entity name in the URL matches a row in __mj.Entity, and that the metadata cache is current.`
        );
        return;
      }

      if (!formReg) {
        this.failWithUserError(
          `No form is registered for "${entityName}".`,
          `MemberJunction could not find an Angular form component registered against BaseFormComponent for entity "${entityName}". This usually means CodeGen has not generated a form for this entity in the running build (forms live under packages/MJExplorer or your app's entity-form package). Run CodeGen, ensure the generated module is imported, or register a custom form via @RegisterClass(BaseFormComponent, '${entityName}').`,
          { entityId: entity.ID, recordKey: primaryKey?.ToString?.() ?? '(none)' }
        );
        return;
      }

      const record = await md.GetEntityObject<BaseEntity>(entityName);
      if (!record) {
        throw new Error(`Unable to instantiate entity ${entityName} with primary key values: ${primaryKey.ToString()}`);
      }

      if (primaryKey.HasValue) {
        const loadOk = await record.InnerLoad(primaryKey);
        if (!loadOk) {
          this.failWithUserError(
            `Could not load ${entityName} record.`,
            record.LatestResult?.Message
              ? `Server error: ${record.LatestResult.Message}`
              : `InnerLoad returned false for entity "${entityName}" with key ${primaryKey.ToString()}. The record may not exist, you may lack permission to view it, or the load may have been blocked server-side.`,
            { recordKey: primaryKey.ToString() }
          );
          return;
        }
        // Log access to existing record (fire-and-forget, don't await)
        this.recentAccessService.logAccess(entityName, primaryKey, 'record');
      }
      else {
        record.NewRecord();
        this.SetNewRecordValues(record);
      }

      // CRITICAL: Track the event handler subscription for cleanup
      this._eventHandlerSubscription = record.RegisterEventHandler((eventType: BaseEntityEvent) => {
        if (eventType.type === 'save')
          this.recordSaved.emit(record);
      });

      const viewContainerRef = this.formContainer.viewContainerRef;
      viewContainerRef.clear();

      const componentRef = viewContainerRef.createComponent<typeof formReg.SubClass>(formReg.SubClass);

      // Track component and record for cleanup
      this._formComponentRef = componentRef;
      this._currentRecord = record;

      componentRef.instance.record = record
      componentRef.instance.userPermissions = permissions
      componentRef.instance.EditMode = !primaryKey.HasValue; // for new records go direct into edit mode

      // Subscribe to form @Output events and map them to Explorer services
      this.subscribeToFormEvents(componentRef.instance);

      this.useGenericForm = false;
      this.errorTitle = null;
      this.errorDetail = null;
      this.loadComplete.emit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.failWithUserError(
        `Failed to load ${entityName} record.`,
        `An unexpected error occurred while loading this record: ${msg}`,
        { error: err }
      );
    }

    this.loading = false;
    this.cdr.detectChanges();
  }

  /**
   * Render a user-visible error state inside the record pane AND log a structured
   * console.error for developers. Always emits `loadComplete` so the Explorer shell
   * does not hang on its first-resource-load gate.
   */
  private failWithUserError(title: string, detail: string, context?: Record<string, unknown>): void {
    this.errorTitle = title;
    this.errorDetail = detail;
    this.loading = false;

    // Single structured console.error for devs — easy to grep, easy to read.
    console.error(
      `[SingleRecord] ${title}\n${detail}` +
        (context ? `\nContext: ${JSON.stringify(context, null, 2)}` : '')
    );

    // Clear any prior form/component so the error UI is what shows.
    if (this._formComponentRef) {
      try { this._formComponentRef.destroy(); } catch { /* noop */ }
      this._formComponentRef = null;
    }
    if (this.formContainer?.viewContainerRef) {
      this.formContainer.viewContainerRef.clear();
    }

    // Always unblock the shell.
    this.loadComplete.emit();
    this.cdr.detectChanges();
  }

  protected SetNewRecordValues(record: BaseEntity) {
    if (!this.newRecordValues) {
      return;
    }

    // Handle both object and string (URL segment) formats
    if (typeof this.newRecordValues === 'string') {
      if (this.newRecordValues.length === 0) {
        return;
      }
      // we have a URL segment string format: "field1|value1||field2|value2"
      const fv = new FieldValueCollection();
      fv.SimpleLoadFromURLSegment(this.newRecordValues);
      // now apply the values to the record
      fv.KeyValuePairs.filter(kvp => kvp.Value !== null && kvp.Value !== undefined).forEach(kvp => {
        const f = record.Fields.find(f => f.Name.trim().toLowerCase() === kvp.FieldName.trim().toLowerCase());
        if (f) {
          // make sure we set the value to the right type based on the f.TSType property
          switch (f.EntityFieldInfo.TSType) {
            case EntityFieldTSType.String:
              record.Set(kvp.FieldName, kvp.Value);
              break;
            case EntityFieldTSType.Number:
              record.Set(kvp.FieldName, parseFloat(kvp.Value));
              break;
            case EntityFieldTSType.Boolean:
              if (kvp.Value === 'false' || kvp.Value === '0' || kvp.Value.toString().trim().length === 0 )
                record.Set(kvp.FieldName, false);
              else
                record.Set(kvp.FieldName, true);
              break;
            case EntityFieldTSType.Date:
              record.Set(kvp.FieldName, new Date(kvp.Value));
              break;
          }
        }
      });
    }
    else {
      // we have a plain object format: { field1: value1, field2: value2 }
      const recordValues = this.newRecordValues as Record<string, unknown>;
      Object.keys(recordValues)
        .filter(key => recordValues[key] !== null && recordValues[key] !== undefined)
        .forEach(key => {
          const f = record.Fields.find(f => f.Name.trim().toLowerCase() === key.trim().toLowerCase());
          if (f) {
            const value = recordValues[key];
            // Set the value with proper type conversion
            switch (f.EntityFieldInfo.TSType) {
              case EntityFieldTSType.String:
                record.Set(key, value?.toString() || '');
                break;
              case EntityFieldTSType.Number:
                record.Set(key, typeof value === 'number' ? value : parseFloat(value?.toString() || '0'));
                break;
              case EntityFieldTSType.Boolean:
                if (typeof value === 'boolean') {
                  record.Set(key, value);
                }
                else if (typeof value === 'string') {
                  record.Set(key, value !== 'false' && value !== '0' && value.trim().length > 0);
                }
                else {
                  record.Set(key, !!value);
                }
                break;
              case EntityFieldTSType.Date:
                record.Set(key, value instanceof Date ? value : new Date(value?.toString() || ''));
                break;
              default:
                record.Set(key, value);
                break;
            }
          }
        });
    }
  }

  /**
   * Subscribe to BaseFormComponent @Output events and map them to Explorer services.
   */
  private subscribeToFormEvents(form: BaseFormComponent): void {
    this.cleanupFormSubscriptions();

    this._formEventSubscriptions.push(
      form.Navigate.subscribe((event: FormNavigationEvent) => this.handleNavigation(event)),
      form.Notification.subscribe((event: FormNotificationEvent) => {
        this.sharedService.CreateSimpleNotification(event.Message, event.Type, event.Duration);
      })
    );
  }

  private handleNavigation(event: FormNavigationEvent): void {
    switch (event.Kind) {
      case 'record':
        this.navigationService.OpenEntityRecord(event.EntityName, event.PrimaryKey, { forceNewTab: event.OpenInNewTab });
        break;
      case 'new-record':
        // Creating a new related record from inside an open record form (e.g. + New
        // on a related-entity grid). Force a new tab so the parent record stays
        // intact — otherwise the new-record form silently replaces the parent in
        // single-resource mode and the user loses their context. This is the
        // original intent of dea32401ff, now stated explicitly at the call site
        // instead of as a global navigation heuristic.
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
    }
  }

  private cleanupFormSubscriptions(): void {
    for (const sub of this._formEventSubscriptions) {
      sub.unsubscribe();
    }
    this._formEventSubscriptions = [];
  }

  ngOnDestroy(): void {
    // CRITICAL: Clean up form event subscriptions first
    this.cleanupFormSubscriptions();

    // CRITICAL: Clean up dynamically created form component to prevent zombie components
    if (this._formComponentRef) {
      this._formComponentRef.destroy();
      this._formComponentRef = null;
    }

    // CRITICAL: Unsubscribe from event handler to prevent memory leaks
    if (this._eventHandlerSubscription) {
      this._eventHandlerSubscription.unsubscribe();
      this._eventHandlerSubscription = null;
    }
    
    // Clean up record reference
    if (this._currentRecord) {
      this._currentRecord = null;
    }
    
    // Clear the view container to ensure no lingering references
    if (this.formContainer?.viewContainerRef) {
      this.formContainer.viewContainerRef.clear();
    }
    
    // Reset state
    this.loading = true;
    this.useGenericForm = false;
  }
}

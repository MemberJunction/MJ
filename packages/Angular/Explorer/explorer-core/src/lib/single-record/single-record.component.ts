import { AfterViewInit, Component, ComponentRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router'
import { Metadata, KeyValuePair, CompositeKey, BaseEntity, BaseEntityEvent, FieldValueCollection, EntityFieldTSType } from '@memberjunction/core';
import { Subscription } from 'rxjs';
import { MJGlobal } from '@memberjunction/global';
import { Container } from '@memberjunction/ng-container-directives';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';


@Component({
  selector: 'mj-single-record',
  templateUrl: './single-record.component.html',
  styleUrls: ['./single-record.component.css']
})
export class SingleRecordComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(Container, {static: true}) formContainer!: Container;
  @Input() public PrimaryKey: CompositeKey = new CompositeKey();
  @Input() public entityName: string | null = '';
  @Input() public newRecordValues: string | null = '';

  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();
  @Output() public recordSaved: EventEmitter<BaseEntity> = new EventEmitter<BaseEntity>();

  constructor (private route: ActivatedRoute) {

  }

  public appDescription: string = ''
  public useGenericForm: boolean = false;
  public loading: boolean = true;

  // Track dynamically created components and entities for cleanup
  private _formComponentRef: ComponentRef<any> | null = null;
  private _currentRecord: BaseEntity | null = null;
  private _eventHandlerSubscription: Subscription | null = null;

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    console.log(`[PERF] SingleRecord: ngAfterViewInit starting for entity: ${this.entityName}`);
    this.LoadForm(this.PrimaryKey, <string>this.entityName)
  }

  public async LoadForm(primaryKey: CompositeKey, entityName: string) {
    const performanceStart = performance.now();
    console.log(`[PERF] SingleRecord.LoadForm: Starting for entity: ${entityName}, PK: ${primaryKey?.ToString()}`);
    
    // Perform any necessary actions with the ViewID, such as fetching data
    if (!entityName || entityName.trim().length === 0) {
      console.log(`[PERF] SingleRecord.LoadForm: ABORTED - no entity name`);
      return; // not ready to load
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

    console.log(`[PERF] SingleRecord: Getting form registration for ${entityName}`);
    const formReg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entityName);
    
    console.log(`[PERF] SingleRecord: Creating metadata and finding entity ${entityName}`);
    const md = new Metadata();
    const entity = md.Entities.find(e => {
      return e.Name === entityName
    });
    const permissions = entity?.GetUserPermisions(md.CurrentUser);

    if (formReg) {
      console.log(`[PERF] SingleRecord: Getting entity object for ${entityName}`);
      const record = await md.GetEntityObject<BaseEntity>(entityName);
      if (record) {
        if (primaryKey.HasValue) {
          console.log(`[PERF] SingleRecord: Loading existing record with PK: ${primaryKey.ToString()}`);
          const loadStart = performance.now();
          await record.InnerLoad(primaryKey);
          console.log(`[PERF] SingleRecord: Record loaded in ${(performance.now() - loadStart).toFixed(2)}ms`);
        }
        else {
          console.log(`[PERF] SingleRecord: Creating new record`);
          record.NewRecord();
          this.SetNewRecordValues(record);          
        }

        // CRITICAL: Track the event handler subscription for cleanup
        console.log(`[PERF] SingleRecord: Registering event handler`);
        this._eventHandlerSubscription = record.RegisterEventHandler((eventType: BaseEntityEvent) => {
          if (eventType.type === 'save')
            this.recordSaved.emit(record);
        });
        
        console.log(`[PERF] SingleRecord: Creating form component`);
        const componentStart = performance.now();
        const viewContainerRef = this.formContainer.viewContainerRef;
        viewContainerRef.clear();

        const componentRef = viewContainerRef.createComponent<typeof formReg.SubClass>(formReg.SubClass);
        console.log(`[PERF] SingleRecord: Form component created in ${(performance.now() - componentStart).toFixed(2)}ms`);
        
        // Track component and record for cleanup
        this._formComponentRef = componentRef;
        this._currentRecord = record;
        
        console.log(`[PERF] SingleRecord: Setting component properties`);
        componentRef.instance.record = record
        componentRef.instance.userPermissions = permissions
        componentRef.instance.EditMode = !primaryKey.HasValue; // for new records go direct into edit mode

        this.useGenericForm = false;
        console.log(`[PERF] SingleRecord: Emitting loadComplete, total time: ${(performance.now() - performanceStart).toFixed(2)}ms`);
        this.loadComplete.emit();
      }
      else
        throw new Error(`Unable to load entity ${entityName} with primary key values: ${primaryKey.ToString()}`);
    }

    this.loading = false;
    console.log(`[PERF] SingleRecord: LoadForm completed for ${entityName} in ${(performance.now() - performanceStart).toFixed(2)}ms`);
  }

  protected SetNewRecordValues(record: BaseEntity) {
    if (this.newRecordValues && this.newRecordValues.length > 0) {
      // we have some provided new record values to apply
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
  }

  ngOnDestroy(): void {
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

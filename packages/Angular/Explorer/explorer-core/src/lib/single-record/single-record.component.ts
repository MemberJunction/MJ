import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router'
import { Metadata, KeyValuePair, CompositeKey, BaseEntity, BaseEntityEvent, FieldValueCollection, EntityFieldTSType } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { Container } from '@memberjunction/ng-container-directives';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';


@Component({
  selector: 'mj-single-record',
  templateUrl: './single-record.component.html',
  styleUrls: ['./single-record.component.css']
})
export class SingleRecordComponent implements OnInit, AfterViewInit {
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

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    this.LoadForm(this.PrimaryKey, <string>this.entityName)
  }

  public async LoadForm(primaryKey: CompositeKey, entityName: string) {
    // Perform any necessary actions with the ViewID, such as fetching data
    if (!entityName || entityName.trim().length === 0) 
      return; // not ready to load

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
    const md = new Metadata();
    const entity = md.Entities.find(e => {
      return e.Name === entityName
    });
    const permissions = entity?.GetUserPermisions(md.CurrentUser);

    if (formReg) {
      const record = await md.GetEntityObject<BaseEntity>(entityName);
      if (record) {
        if (primaryKey.HasValue)  
          await record.InnerLoad(primaryKey);
        else {
          record.NewRecord();
          this.SetNewRecordValues(record);          
        }

        record.RegisterEventHandler((eventType: BaseEntityEvent) => {
          if (eventType.type === 'save')
            this.recordSaved.emit(record);
        })
        const viewContainerRef = this.formContainer.viewContainerRef;
        viewContainerRef.clear();

        const componentRef = viewContainerRef.createComponent<typeof formReg.SubClass>(formReg.SubClass);
        componentRef.instance.record = record
        componentRef.instance.userPermissions = permissions
        componentRef.instance.EditMode = !primaryKey.HasValue; // for new records go direct into edit mode

        this.useGenericForm = false;
        this.loadComplete.emit();
      }
      else
        throw new Error(`Unable to load entity ${entityName} with primary key values: ${primaryKey.ToString()}`);
    }


    this.loading = false;
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
}

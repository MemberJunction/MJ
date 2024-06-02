import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router'
import { Metadata, KeyValuePair, CompositeKey, BaseEntity, BaseEntityEvent } from '@memberjunction/core';
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
}

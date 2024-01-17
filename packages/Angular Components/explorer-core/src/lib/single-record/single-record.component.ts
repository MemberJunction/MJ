import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router'
import { Metadata, PrimaryKeyValue } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { Container } from '@memberjunction/ng-container-directives';
import { BaseFormComponent } from '../generic/base-form-component';


@Component({
  selector: 'app-single-record',
  templateUrl: './single-record.component.html',
  styleUrls: ['./single-record.component.css']
})
export class SingleRecordComponent implements OnInit, AfterViewInit {
  @ViewChild(Container, {static: true}) formContainer!: Container;
  @Input() public primaryKeyValues: PrimaryKeyValue[] = [];
  @Input() public entityName: string | null = '';

  @Output() public loadComplete: EventEmitter<any> = new EventEmitter<any>();

  constructor (private route: ActivatedRoute) {

  }

  public appDescription: string = ''
  public useGenericForm: boolean = false;
  public loading: boolean = true;

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    this.LoadForm(this.primaryKeyValues, <string>this.entityName)
  }

  async LoadForm(primaryKeyValues: PrimaryKeyValue[], entityName: string) {
    // Perform any necessary actions with the ViewID, such as fetching data
    if (primaryKeyValues && entityName) {
      this.entityName = entityName
      this.primaryKeyValues = primaryKeyValues

      const formReg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entityName);
      const md = new Metadata();
      const entity = md.Entities.find(e => {
        return e.Name === entityName
      });
      const permissions = entity?.GetUserPermisions(md.CurrentUser);

      if (formReg) {
        const record = await md.GetEntityObject(entityName);
        if (record) {
          await record.InnerLoad(primaryKeyValues);

          const viewContainerRef = this.formContainer.viewContainerRef;
          viewContainerRef.clear();

          const componentRef = viewContainerRef.createComponent<typeof formReg.SubClass>(formReg.SubClass);
          componentRef.instance.record = record
          componentRef.instance.userPermissions = permissions

          this.useGenericForm = false;
          this.loadComplete.emit();
        }
        else
          throw new Error(`Unable to load entity ${entityName} with primary key values: ${primaryKeyValues.map(p => p.FieldName + ': ' + p.Value).join(', ')}`)
      }

      this.loading = false;
    }
  }
}

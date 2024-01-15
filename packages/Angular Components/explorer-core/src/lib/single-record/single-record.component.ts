import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router'
import { Metadata } from '@memberjunction/core';
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
  @Input() public primaryKeyValue: any = null;
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
    this.LoadForm(this.primaryKeyValue, <string>this.entityName)
  }

  async LoadForm(primaryKeyValue: any, entityName: string) {
    // Perform any necessary actions with the ViewID, such as fetching data
    if (primaryKeyValue && entityName) {
      this.entityName = entityName
      this.primaryKeyValue = primaryKeyValue

      const formReg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entityName);
      const md = new Metadata();
      const entity = md.Entities.find(e => {
        return e.Name === entityName
      });
      const permissions = entity?.GetUserPermisions(md.CurrentUser);

      if (formReg) {
        const record = await md.GetEntityObject(entityName);
        if (record) {
          await record.Load(primaryKeyValue);

          const viewContainerRef = this.formContainer.viewContainerRef;
          viewContainerRef.clear();

          const componentRef = viewContainerRef.createComponent<typeof formReg.SubClass>(formReg.SubClass);
          componentRef.instance.record = record
          componentRef.instance.userPermissions = permissions

          this.useGenericForm = false;
          this.loadComplete.emit();
        }
        else
          throw new Error(`Unable to load entity ${entityName} with primary key value of: ${primaryKeyValue}`)
      }

      this.loading = false;
    }
  }
}

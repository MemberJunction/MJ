import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router'
import { Metadata, PotentialDuplicateRequest, KeyValuePair, CompositeKey } from '@memberjunction/core';
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
  @Input() public KeyValuePairs: KeyValuePair[] = [];
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
    let compositeKey: CompositeKey = new CompositeKey();
    compositeKey.KeyValuePairs = this.KeyValuePairs;
    this.LoadForm(compositeKey, <string>this.entityName)
  }

  async LoadForm(compositeKey: CompositeKey, entityName: string) {
    // Perform any necessary actions with the ViewID, such as fetching data
    if (compositeKey.KeyValuePairs && entityName) {
      this.entityName = entityName
      this.KeyValuePairs = compositeKey.KeyValuePairs;

      const formReg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entityName);
      const md = new Metadata();
      const entity = md.Entities.find(e => {
        return e.Name === entityName
      });
      const permissions = entity?.GetUserPermisions(md.CurrentUser);

      if (formReg) {
        const record = await md.GetEntityObject(entityName);
        if (record) {
          await record.InnerLoad(compositeKey);

          const viewContainerRef = this.formContainer.viewContainerRef;
          viewContainerRef.clear();

          const componentRef = viewContainerRef.createComponent<typeof formReg.SubClass>(formReg.SubClass);
          componentRef.instance.record = record
          componentRef.instance.userPermissions = permissions

          this.useGenericForm = false;
          this.loadComplete.emit();
        }
        else
          throw new Error(`Unable to load entity ${entityName} with primary key values: ${compositeKey.ToString()}`);
      }

      this.loading = false;
    }
  }
}

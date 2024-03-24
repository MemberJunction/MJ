import { Component, Input, Output, ViewChild, ViewContainerRef, OnChanges, SimpleChanges, EventEmitter } from '@angular/core';

import { BaseEntity } from '@memberjunction/core';
import { SharedService, kendoSVGIcon } from '@memberjunction/ng-shared'
import { UserEntity, UserRoleEntity } from '@memberjunction/core-entities';
import { ClassRegistration, MJGlobal } from '@memberjunction/global';
import { BaseFormComponent, BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
 
 
@Component({
  selector: 'mj-entity-form-dialog',
  templateUrl: './entity-form-dialog.component.html',
  styleUrls: ['./entity-form-dialog.component.css']
})
export class EntityFormDialog {
  /**
   * The title of the dialog
   */
  @Input() Title: string = '';
  @Input() ShowSaveButton: boolean = true;
  @Input() ShowCancelButton: boolean = true;

  @Input() Width: number = 800;
  @Input() Height: number = 600;

  @Input() Mode: 'complete' | 'section' = 'complete';
  @Input() SectionName: string = '';
  @Input() Record: BaseEntity | null = null;

  /**
   * If true, when the user clicks the Save button, the Record will be saved. Only applicable if ShowSaveButton is true.
   */
  @Input() HandleSave: boolean = true;
  /**
   * If true, when the user clicks the Cancel button, the Record will be reverted to its original state. Only applicable if ShowCancelButton is true.
   */
  @Input() AutoRevertOnCancel: boolean = true;

  @Output() close: EventEmitter<'Save' | 'Cancel'> = new EventEmitter<'Save' | 'Cancel'>();

  private _visible = false;
  @Input()
  set Visible(val: boolean) {
    this._visible = val;
    if (val) {
      Promise.resolve().then(() => {
        // At this point, the DOM should be updated, and `this.container` should be available.
        this.showForm();
      });  
    }
  }
  get Visible(): boolean {
    return this._visible;
  }

  @ViewChild('dynamicFormContainer', { read: ViewContainerRef }) container!: ViewContainerRef;

  public showForm() {
    if (!this.container) 
      throw new Error('Container not found');
    if (!this.Record)
      throw new Error('Record is a required property');

    // Ensure the container is clear before inserting a new component
    this.container.clear();

    // here we want to grab the right type of object to instantiate based on the settings either mode of complete or section
    // if section, we grab a sub-class of BaseFormSectionComponent, if complete, we grab a sub-class of the BaseForComponent class
    let reg: ClassRegistration;
    if (this.Mode === 'complete') {
      reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, this.Record?.EntityInfo.Name);
    } else {
      reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormSectionComponent, this.Record?.EntityInfo.Name + '.' + this.SectionName);
    }

    if (reg && reg.SubClass) {
      // we have our class registration
      const component = this.container.createComponent(reg.SubClass);
      if (this.Record && component.instance instanceof BaseFormSectionComponent) {
        component.instance.record = this.Record;
        component.instance.EditMode = true;
      }
      else if (this.Record && component.instance instanceof BaseFormComponent) {
        component.instance.record = this.Record;
        component.instance.EditMode = true;
      }
    }
  }

  public async closeWindow(status: 'Save' | 'Cancel') {
    this.Visible = false;
    if (this.Record) {
      if (this.HandleSave && status === 'Save') {
        if (!await this.Record.Save()) {
          SharedService.Instance.CreateSimpleNotification(`Error saving ${this.Record.EntityInfo.Name} record, rolling back changes`, 'error');
          this.Record.Revert();  
        }
      }
      if (this.AutoRevertOnCancel && status === 'Cancel') {
        this.Record.Revert();
      }
    }
    this.close.emit(status);
  }
}

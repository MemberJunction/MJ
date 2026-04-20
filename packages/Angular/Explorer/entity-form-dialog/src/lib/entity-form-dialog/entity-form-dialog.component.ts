import { Component, Input, Output, ViewChild, ViewContainerRef, EventEmitter } from '@angular/core';

import { BaseEntity } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared'
import { ClassRegistration, MJGlobal } from '@memberjunction/global';
import { BaseFormComponent, BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
 

/**
 * This dialog will display the form for a given entity. Using the configuration settings you can display the entire form
 * or a specific section of the form. You can also control the visibility of the Save and Cancel buttons, and the behavior
 * of the Save and Cancel buttons.
 */
@Component({
  standalone: false,
  selector: 'mj-entity-form-dialog',
  templateUrl: './entity-form-dialog.component.html',
  styleUrls: ['./entity-form-dialog.component.css']
})
export class EntityFormDialogComponent {
  /**
   * The title of the dialog
   */
  @Input() Title: string = '';
  /**
   * If set to true the Save button will be displayed. If set to false, the Save button will be hidden.
   */
  @Input() ShowSaveButton: boolean = true;
  /**
   * If set to true the Cancel button will be displayed. If set to false, the Cancel button will be hidden.
   */
  @Input() ShowCancelButton: boolean = true;

  /**
   * Initial width of the dialog
   */
  @Input() Width: number = 800;
  /**
   * Initial height of the dialog
   */
  @Input() Height: number = 600;

  /**
   * When set to complete, the entire form will be displayed. When set to section, only the specified section of the form will be displayed that is specified in the SectionName property.
   */
  @Input() Mode: 'complete' | 'section' = 'complete';
  /**
   * If Mode is set to section, this property will specify the name of the section to display. This property is ignored if Mode is set to complete.
   */
  @Input() SectionName: string = '';
  /**
   * The record to display in the form. This property is required. The record must be an instance a BaseEntity derived class.
   */
  @Input() Record: BaseEntity | null = null;

  /**
   * If true, when the user clicks the Save button, the Record will be saved. Only applicable if ShowSaveButton is true.
   */
  @Input() HandleSave: boolean = true;
  /**
   * If true, when the user clicks the Cancel button, the Record will be reverted to its original state. Only applicable if ShowCancelButton is true.
   */
  @Input() AutoRevertOnCancel: boolean = true;

  /**
   * This event will be emitted when the dialog is closed. The event will contain the status of the dialog, which will be either 'Save' or 'Cancel'.
   */
  @Output() DialogClosed: EventEmitter<'Save' | 'Cancel'> = new EventEmitter<'Save' | 'Cancel'>();

  private _visible = false;
  /**
   * Controls the visibility of the dialog. When set to true, the dialog will be displayed. When set to false, the dialog will be hidden.
   */
  @Input()
  set Visible(val: boolean) {
    this._visible = val;
    if (val) {
      Promise.resolve().then(() => {
        // At this point, the DOM should be updated, and `this.container` should be available.
        this.ShowForm();
      });  
    }
  }
  get Visible(): boolean {
    return this._visible;
  }

  @ViewChild('dynamicFormContainer', { read: ViewContainerRef }) container!: ViewContainerRef;

  /**
   * This method can be called to show the form.  
   */
  public ShowForm() {
    if (!this.Visible) {
      this.Visible = true; // set to visible and bail as the rest will end up calling this function again but after a promise which will allow Angular to update the DOM
      return;
    }
    
    if (!this.container) 
      throw new Error('Container not found');
    if (!this.Record)
      throw new Error('Record is a required property');

    // Ensure the container is clear before inserting a new component
    this.container.clear();

    // here we want to grab the right type of object to instantiate based on the settings either mode of complete or section
    // if section, we grab a sub-class of BaseFormSectionComponent, if complete, we grab a sub-class of the BaseForComponent class
    let reg: ClassRegistration | null;
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

  /**
   * This method can be called to close the dialog. It will emit the 'close' event with the status of the dialog.
   * @param status 
   */
  public async CloseWindow(status: 'Save' | 'Cancel') {
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
    this.DialogClosed.emit(status);
  }
}

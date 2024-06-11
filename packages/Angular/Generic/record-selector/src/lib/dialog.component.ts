import { Component, ViewChild, ElementRef, Output, EventEmitter, OnInit, Input, AfterViewInit, AfterViewChecked } from '@angular/core';

import { Metadata, BaseEntity, LogError, KeyValuePair, RunQueryParams, RunQuery } from '@memberjunction/core';
  
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal } from '@memberjunction/global';
import { ListBoxToolbarConfig } from '@progress/kendo-angular-listbox';
 
@Component({
  selector: 'mj-record-selector-dialog',
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.css']
})
export class RecordSelectorDialogComponent {
  @Input() DialogTitle: string = 'Select Records';
  @Input() DialogWidth: string = '800px';
  @Input() DialogHeight: string = '600px';

  @Input() get DialogVisible(): boolean {
    return this._dialogVisible;
  }
  set DialogVisible(value: boolean) {
    if (value !== this._dialogVisible && value) {
      // showing the dialog
      this.RefreshInitialValues();
    }
    this._dialogVisible = value;
  }
  private _dialogVisible: boolean = false;
  /**
   * Emits when the dialog is closed, the parameter is true if the dialog was closed with the OK button, false if it was closed with the Cancel button
   */
  @Output() DialogClosed = new EventEmitter<boolean>();

  ///// REST OF THE BELOW JUST GET MAPPED TO THE CONTAINED RecordSelectorComponent
  /**
   * The name of the entity to show records for.
   */
  @Input() EntityName: string = '';
  /**
   * The field name within the entity to show in the list items
   */
  @Input() DisplayField: string = '';

  /**
   * The list of records that are available
   */
  @Input() AvailableRecords: BaseEntity[] = [];

  /**
   * The list of records that are selected
   */
  @Input() SelectedRecords: BaseEntity[] = [];
  /**
   * The list of records that are not selected
   */
  @Input() UnselectedRecords: BaseEntity[] = [];
 

  /**
   * Configurable settings for the toolbar
   */
  @Input() public ToolbarSettings: ListBoxToolbarConfig = {
    position: "right",
    tools: ["moveUp", "moveDown", "transferAllFrom", "transferFrom", "transferAllTo", "transferTo", "remove"],
  };

  @Output() RecordSelected = new EventEmitter<BaseEntity[]>();
  @Output() RecordUnselected = new EventEmitter<BaseEntity[]>();

  protected _initialSelected: BaseEntity[] = [];
  protected _initialUnselected: BaseEntity[] = []; 
   
  protected RefreshInitialValues() {
    this._initialSelected = this.SelectedRecords.slice();
    this._initialUnselected = this.UnselectedRecords.slice();
  }

  public OnCancel() {
    // now modify the SelectedRecords Array and UnselectedRecords arrays in place in order
    // to ensure they're the same arrays and drive data binding changes
    this.SelectedRecords.length = 0;
    this.UnselectedRecords.length = 0;
    this._initialSelected.forEach(r => this.SelectedRecords.push(r));
    this._initialUnselected.forEach(r => this.UnselectedRecords.push(r));
     
    this.DialogVisible = false;
    this.DialogClosed.emit(false);
  }

  public OnOK() {
    this._initialSelected = this.SelectedRecords.slice();
    this._initialUnselected = this.UnselectedRecords.slice();
 

    this.DialogVisible = false;
    this.DialogClosed.emit(true);
  }
}

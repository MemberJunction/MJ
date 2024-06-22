import { Component, ViewChild, ElementRef, Output, EventEmitter, OnInit, Input, AfterViewInit, AfterViewChecked } from '@angular/core';

import { Metadata, BaseEntity, LogError, KeyValuePair, RunQueryParams, RunQuery } from '@memberjunction/core';
  
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal } from '@memberjunction/global';
import { ListBoxToolbarConfig } from '@progress/kendo-angular-listbox';
 
@Component({
  selector: 'mj-template-preview-dialog',
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.css']
})
export class TemplatePreviewDialogComponent {
  @Input() DialogTitle: string = 'Select Template';
  @Input() DialogWidth: string = '700px';
  @Input() DialogHeight: string = '450px';

  @Input() get DialogVisible(): boolean {
    return this._dialogVisible;
  }
  set DialogVisible(value: boolean) {
    if (value !== this._dialogVisible && value) {
      // showing the dialog
      //this.RefreshInitialValues();
    }
    this._dialogVisible = value;
  }
  private _dialogVisible: boolean = false;
  /**
   * Emits when the dialog is closed, the parameter is true if the dialog was closed with the OK button, false if it was closed with the Cancel button
   */
  @Output() DialogClosed = new EventEmitter<boolean>();
 
 

  /**
   * Configurable settings for the toolbar
   */
  @Input() public ToolbarSettings: ListBoxToolbarConfig = {
    position: "right",
    tools: ["moveUp", "transferFrom", "transferAllFrom", "transferAllTo", "transferTo", "moveDown"],
  };

  @Output() RecordSelected = new EventEmitter<BaseEntity[]>();
  @Output() RecordUnselected = new EventEmitter<BaseEntity[]>();

  protected _initialSelected: BaseEntity[] = [];
  protected _initialUnselected: BaseEntity[] = []; 
    

  public OnCancel() { 
    this.DialogVisible = false;
    this.DialogClosed.emit(false);
  }

  public OnOK() { 
    this.DialogVisible = false;
    this.DialogClosed.emit(true);
  }
}

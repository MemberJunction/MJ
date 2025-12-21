import { Component, ViewChild, ElementRef, Output, EventEmitter, OnInit, Input, AfterViewInit, AfterViewChecked } from '@angular/core';

import { Metadata, BaseEntity, LogError, KeyValuePair, RunQueryParams, RunQuery, EntityInfo, RunViewParams } from '@memberjunction/core';
  
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal } from '@memberjunction/global';
import { ListBoxToolbarConfig } from '@progress/kendo-angular-listbox';
 
@Component({
  standalone: false,
  selector: 'mj-entity-communications-preview-window',
  templateUrl: './window.component.html',
  styleUrls: ['./window.component.css']
})
export class EntityCommunicationsPreviewWindowComponent {
  @Input() Title: string = 'Communications Preview';
  @Input() Width = 650;
  @Input() Height = 600;
  @Input() MinWidth = 400;
  @Input() MinHeight = 350;
  @Input() Resizable = true;

  @Input() entityInfo: EntityInfo | undefined;
  @Input() runViewParams: RunViewParams | undefined;

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

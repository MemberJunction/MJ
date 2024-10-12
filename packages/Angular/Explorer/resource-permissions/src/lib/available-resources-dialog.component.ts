import { Component, Output, EventEmitter, Input, OnInit  } from '@angular/core';

import { BaseEntity, EntityFieldInfo, UserInfo } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/ng-shared';
   
 
@Component({
  selector: 'mj-available-resources-dialog',
  templateUrl: './available-resources-dialog.component.html',
  styleUrls: ['./available-resources-dialog.component.css']
})
export class AvailableResourcesDialogComponent implements OnInit {
  @Input() DialogTitle: string = 'Available Resources';
  @Input() DialogWidth: string = '700px';
  @Input() DialogHeight: string = '450px';


  @Input() get DialogVisible(): boolean {
    return this._dialogVisible;
  }
  set DialogVisible(value: boolean) {
    if (value !== this._dialogVisible && value) {
      // do init stuff here as needed
    }
    this._dialogVisible = value;
  }
  private _dialogVisible: boolean = false;

  public OnCancel() {
    this.DialogVisible = false;
    this.DialogClosed.emit(false);
  }

  public OnOK() {
    this.DialogVisible = false;
    this.DialogClosed.emit(true);
  }
  /**
   * Emits when the dialog is closed, the parameter is true if the dialog was closed with the OK button, false if it was closed with the Cancel button
   */
  @Output() DialogClosed = new EventEmitter<boolean>();

  @Output() SelectedResourcesChanged = new EventEmitter<ResourceData[]>();

  ///// REST OF THE BELOW JUST GET MAPPED TO THE CONTAINED RecordSelectorComponent
  /**
   * Optional, set this to the currently selected record to start the dialog with that record selected, if desired. This property will be updated as the user selects records in the dialog.
   */
  @Input() SelectedResources: ResourceData[] =[];
  @Input() User!: UserInfo;
  /**
   * Resource Type to show available resources for
   */
  @Input() ResourceTypeID!: string;
  @Input() SelectionMode: 'Single' | 'Multiple' = 'Single';

  public BubbleOnSelectedResourcesChanged(resources: ResourceData[]) {
    this.SelectedResources = resources;
    this.SelectedResourcesChanged.emit(resources);
  }

  public ngOnInit(): void {
      if (!this.User) {
          throw new Error('User is a required property for the AvailableResourcesDialogComponent');
      }
  }
}

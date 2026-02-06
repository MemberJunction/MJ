import { Component, Output, EventEmitter, Input  } from '@angular/core';

import { BaseEntity, EntityFieldInfo } from '@memberjunction/core';
   
 
@Component({
  standalone: false,
  selector: 'mj-find-record-dialog',
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.css']
})
export class FindRecordDialogComponent {
  @Input() DialogTitle: string = 'Find Record';
  @Input() DialogWidth: string = '700px';
  @Input() DialogHeight: string = '450px';

  /**
   * Optional, set this to the currently selected record to start the dialog with that record selected, if desired. This property will be updated as the user selects records in the dialog.
   */
  @Input() SelectedRecord: BaseEntity | null = null;

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
   * Optional, list of fields to be displayed in the grid of search results, if not specified, the default fields will be displayed
   */
  @Input() DisplayFields: EntityFieldInfo[] = []; // Fields to display in the grid



   /**
    * When a record is selected, this event is emitted with the selected record
    */
  @Output() OnRecordSelected = new EventEmitter<BaseEntity>();

  public OnCancel() {
    this.DialogVisible = false;
    this.DialogClosed.emit(false);
  }

  public BubbleOnRecordSelected(record: any) {
    this.SelectedRecord = record;
    this.OnRecordSelected.emit(record);
  }

  public OnOK() {
    this.DialogVisible = false;
    this.DialogClosed.emit(true);
  }
}

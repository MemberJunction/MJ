import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IMetadataProvider } from '@memberjunction/core';

/**
 * Simple dialog wrapper component for the data context component
 */
@Component({
  selector: 'mj-data-context-dialog',
  templateUrl: './ng-data-context-dialog.component.html',
  styleUrls: ['./ng-data-context-dialog.component.css']
})
export class DataContextDialogComponent {
  @Output() dialogClosed = new EventEmitter();
  @Input() dataContextId!: string;
  @Input() Provider: IMetadataProvider | null = null;

  closePropertiesDialog(){
    this.dialogClosed.emit();
  }
}

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IMetadataProvider } from '@memberjunction/core';

/**
 * Enhanced dialog wrapper component for the data context viewer
 */
@Component({
  standalone: false,
  selector: 'mj-data-context-dialog',
  templateUrl: './ng-data-context-dialog.component.html',
  styleUrls: ['./ng-data-context-dialog.component.css']
})
export class DataContextDialogComponent {
  @Output() dialogClosed = new EventEmitter();
  @Input() dataContextId!: string;
  @Input() dataContextName?: string;
  @Input() Provider: IMetadataProvider | null = null;
  
  public isMaximized: boolean = false;

  public get dialogWidth(): number {
    return this.isMaximized ? window.innerWidth * 0.95 : 900;
  }

  public get dialogHeight(): number {
    return this.isMaximized ? window.innerHeight * 0.95 : 700;
  }

  closeDialog(): void {
    this.dialogClosed.emit();
  }

  toggleMaximize(): void {
    this.isMaximized = !this.isMaximized;
  }
}
import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Dialog wrapper component for the deep diff viewer
 */
@Component({
  standalone: false,
  selector: 'mj-deep-diff-dialog',
  templateUrl: './deep-diff-dialog.component.html',
  styleUrls: ['./deep-diff-dialog.component.css']
})
export class DeepDiffDialogComponent {
  @Input() oldValue: any;
  @Input() newValue: any;
  @Input() title: string = 'Deep Diff Analysis';
  @Input() showSummary: boolean = true;
  @Input() showUnchanged: boolean = false;
  @Input() expandAll: boolean = false;
  @Input() maxDepth: number = 10;
  @Input() maxStringLength: number = 100;
  @Input() treatNullAsUndefined: boolean = false;
  @Input() visible: boolean = false;
  @Input() width: string = '80%';
  @Input() height: string = '80vh';
  
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  
  public isMaximized: boolean = false;

  public get dialogWidth(): string {
    return this.isMaximized ? '95vw' : this.width;
  }

  public get dialogHeight(): string {
    return this.isMaximized ? '95vh' : this.height;
  }

  closeDialog(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.close.emit();
  }

  toggleMaximize(): void {
    this.isMaximized = !this.isMaximized;
  }
}
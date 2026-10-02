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
  @Output() DialogClosed = new EventEmitter();

  /**
   * @deprecated Use {@link DialogClosed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (dialogClosed) keeps working. Must stay AFTER DialogClosed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() dialogClosed = this.DialogClosed;
  @Input() DataContextId!: string;

  /** @deprecated Use {@link DataContextId}. */
  @Input() set dataContextId(value: string) {
    this.DataContextId = value;
  }
  /** @deprecated Use {@link DataContextId}. */
  get dataContextId(): string {
    return this.DataContextId;
  }
  @Input() DataContextName?: string;

  /** @deprecated Use {@link DataContextName}. */
  @Input() set dataContextName(value: string | undefined) {
    this.DataContextName = value;
  }
  /** @deprecated Use {@link DataContextName}. */
  get dataContextName(): string | undefined {
    return this.DataContextName;
  }
  @Input() Provider: IMetadataProvider | null = null;
  
  public IsMaximized: boolean = false;

  /** @deprecated Use {@link IsMaximized}. */
  public get isMaximized(): boolean {
    return this.IsMaximized;
  }
  /** @deprecated Use {@link IsMaximized}. */
  public set isMaximized(value: boolean) {
    this.IsMaximized = value;
  }

  public get DialogWidth(): number {
    return this.IsMaximized ? window.innerWidth * 0.95 : 900;
  }

  /** @deprecated Use {@link DialogWidth}. */
  public get dialogWidth(): number {
    return this.DialogWidth;
  }

  public get DialogHeight(): number {
    return this.IsMaximized ? window.innerHeight * 0.95 : 700;
  }

  /** @deprecated Use {@link DialogHeight}. */
  public get dialogHeight(): number {
    return this.DialogHeight;
  }

  CloseDialog(): void {
    this.DialogClosed.emit();
  }

  /** @deprecated Use {@link CloseDialog}. */
  closeDialog(): void {
    return this.CloseDialog();
  }

  ToggleMaximize(): void {
    this.IsMaximized = !this.IsMaximized;
  }

  /** @deprecated Use {@link ToggleMaximize}. */
  toggleMaximize(): void {
    return this.ToggleMaximize();
  }
}
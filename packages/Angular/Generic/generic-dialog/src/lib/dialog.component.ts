import { Component, Output, EventEmitter, Input, ChangeDetectorRef, ElementRef, ContentChild, AfterContentInit } from '@angular/core';

/**
 * Generic base dialog component that can be used as a base for other dialogs by using this component as shown here in any other Angular component.
 * The custom-actions slot shown below is entirely optional, if you don't need anything beyond OK/Cancel, you can leave this out entirely. You can also turn off the
 * built-in OK and Cancel buttons using the ShowOKButton and ShowCancelButton properties.
 * 
 * <mj-generic-dialog DialogTitle="Your Dialog Title" [DialogVisible]="YourVisibleStateVariable" (DialogClosed)="YourDialogClosedEventHandler($event)">
 *   <div>
 *      Your content goes in here
 *   </div>
 *   <div custom-actions>
 *     <button kendoButton (click)="customOkClick()" themeColor="primary">Custom OK</button>
 *     <button kendoButton (click)="customCancelClick()">Custom Cancel</button>
 *     <button kendoButton (click)="additionalAction()">Additional Action</button>
 *   </div>
 * </mj-generic-dialog>
 */
@Component({
  standalone: false,
  selector: 'mj-generic-dialog',
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.css']
})
export class GenericDialogComponent implements AfterContentInit {
  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * Dialog title
   */
  @Input() DialogTitle: string = 'Default Title';
  /**
   * Optional, width of the dialog in pixels or percentage 
   */
  @Input() DialogWidth: string = '700px';
  /**
   * Optional, height of the dialog in pixels or percentage 
   */
  @Input() DialogHeight: string = '450px';

  /**
   * Ability to turn off the built-in OK button if it is not desired
   */
  @Input() ShowOKButton: boolean = true;

  /**
   * Text displayed on the OK button, defaults to "OK" if not provided
   */
  @Input() OKButtonText: string = "OK";

  /**
   * Text displayed on the Cancel button, defaults to "Cancel" if not provided
   */
  @Input() CancelButtonText: string = "Cancel";

  /**
   * Ability to turn off the built-in Cancel button if it is not desired
   */
  @Input() ShowCancelButton: boolean = true;

  /**
   * Determines if the dialog is visible or not, bind this to a variable in your containing component that is changed to true when you want the dialog shown. When the user closes the dialog this property will 
   * be set to false automatically.
   */
  @Input() get DialogVisible(): boolean {
    return this._dialogVisible;
  }
  set DialogVisible(value: boolean) {
    if (value !== this._dialogVisible && value) {
      // showing the dialog when it wasn't shown, refresh the data
      this.RefreshData.emit();
    }
    this._dialogVisible = value;
    this.cdr.detectChanges(); // Ensure visibility updates immediately
  }
  private _dialogVisible: boolean = false;


  /**
   * Emits when the dialog is closed, the parameter is true if the dialog was closed with the OK button, false if it was closed with the Cancel button
   */
  @Output() DialogClosed = new EventEmitter<boolean>();

  /**
   * This event is fired during the component lifecycle if the dialog wants the user of the dialog to refresh the data provided within its content.
   */
  @Output() RefreshData = new EventEmitter<void>();

  /**
   * Internal event handler for the Cancel button, you can call this method directly if you want to simulate the user clicking on the Cancel button
   */
  public HandleCancelClick() {
    this.DialogVisible = false;
    this.DialogClosed.emit(false);
  }

  /**
   * Internal event handler for the OK button, you can call this method directly if you want to simulate the user clicking on the OK button
   */
  public HandleOKClick() {
    this.DialogVisible = false;
    this.DialogClosed.emit(true);
  }

  private _hasCustomActions: boolean = false;
  /**
   * Returns true if the dialog has custom actions defined in the custom-actions slot
   */
  public get HasCustomActions(): boolean {
    return this._hasCustomActions;
  }

  @ContentChild('custom-actions', { static: false }) customActions!: ElementRef;

  ngAfterContentInit() {
      this._hasCustomActions = !!this.customActions;
  }
}

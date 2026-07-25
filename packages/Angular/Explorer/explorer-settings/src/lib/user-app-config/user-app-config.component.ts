import { Component, Input, Output, EventEmitter } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Full-screen modal dialog for configuring user's application visibility and
 * order. Thin wrapper: the actual configuration UI (list/reorder/persistence)
 * lives in `mj-user-app-config-content`, which the shell's app launcher also
 * embeds directly as an in-panel view. This wrapper only provides the modal
 * chrome + the `ShowDialog`/`Open()`/`Close()` API its dialog consumers use
 * (e.g. the Home dashboard).
 *
 * The content component loads its data in ngOnInit — because it is created
 * fresh under this template's `@if (ShowDialog)`, every `Open()` gets a fresh
 * load, preserving the historical behavior.
 */
@Component({
  standalone: false,
  selector: 'mj-user-app-config',
  templateUrl: './user-app-config.component.html',
  styleUrls: ['./user-app-config.component.css']
})
export class UserAppConfigComponent extends BaseAngularComponent {
  private _showDialog = false;

  @Input()
  set ShowDialog(value: boolean) {
    if (value !== this._showDialog) {
      this._showDialog = value;
    }
  }
  get ShowDialog(): boolean {
    return this._showDialog;
  }

  @Output() ShowDialogChange = new EventEmitter<boolean>();
  @Output() ConfigSaved = new EventEmitter<void>();

  /**
   * Opens the dialog (the embedded content component loads on creation)
   */
  Open(): void {
    this._showDialog = true;
    this.ShowDialogChange.emit(true);
  }

  /**
   * Closes the dialog without saving
   */
  Close(): void {
    this._showDialog = false;
    this.ShowDialogChange.emit(false);
  }

  /** Content saved successfully — surface it and close */
  OnContentSaved(): void {
    this.ConfigSaved.emit();
    this.Close();
  }
}

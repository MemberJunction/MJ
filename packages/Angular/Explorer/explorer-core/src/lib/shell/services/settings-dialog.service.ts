import { Injectable, ViewContainerRef } from '@angular/core';
import { MJDialogService, MJDialogRef } from '@memberjunction/ng-ui-components';
import { SettingsComponent } from '@memberjunction/ng-explorer-settings';

/**
 * Service to open the Settings component in a full-screen modal dialog.
 * This keeps the workspace intact while allowing users to configure settings.
 */
@Injectable({
  providedIn: 'root'
})
export class SettingsDialogService {
  private dialogRef: MJDialogRef | null = null;

  constructor(private dialogService: MJDialogService) {}

  /**
   * Opens the Settings component in a full-screen MJ Dialog
   * @param containerRef ViewContainerRef to anchor the dialog (usually from the shell component)
   */
  open(containerRef: ViewContainerRef): void {
    // Don't open multiple windows
    if (this.dialogRef) {
      return;
    }

    this.dialogRef = this.dialogService.open({
      content: SettingsComponent,
      title: 'Settings',
      width: window.innerWidth,
      height: window.innerHeight,
      minWidth: 400,
      appendTo: containerRef
    });

    // Handle dialog close
    this.dialogRef.Result.subscribe(() => {
      this.dialogRef = null;
    });
  }

  /**
   * Closes the settings dialog if open
   */
  close(): void {
    if (this.dialogRef) {
      this.dialogRef.Close();
      this.dialogRef = null;
    }
  }

  /**
   * Check if the settings dialog is currently open
   */
  get isOpen(): boolean {
    return this.dialogRef !== null;
  }
}

import { Injectable } from '@angular/core';
import { DialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { TestRunDialogComponent } from '../components/test-run-dialog.component';

export interface TestDialogOptions {
  testId?: string;
  suiteId?: string;
  mode?: 'test' | 'suite';
}

@Injectable({
  providedIn: 'root'
})
export class TestingDialogService {
  private activeDialogs: DialogRef[] = [];

  constructor(private dialogService: DialogService) {}

  OpenTestRunDialog(options?: TestDialogOptions): DialogRef {
    // Close and destroy all existing dialogs
    this.closeAllDialogs();

    const dialogRef = this.dialogService.open({
      title: 'Run Test',
      content: TestRunDialogComponent,
      width: 800,
      height: 700,
      minWidth: 600,
      minHeight: 500
    });

    // Track this dialog
    this.activeDialogs.push(dialogRef);

    // Remove from tracking and destroy when closed
    dialogRef.result.subscribe(
      () => {
        this.removeDialog(dialogRef);
      },
      () => {
        this.removeDialog(dialogRef);
      }
    );

    const dialogInstance = dialogRef.content.instance as TestRunDialogComponent;

    if (options?.mode) {
      dialogInstance.runMode = options.mode;
    }

    if (options?.testId) {
      dialogInstance.selectedTestId = options.testId;
      dialogInstance.runMode = 'test';
    }

    if (options?.suiteId) {
      dialogInstance.selectedSuiteId = options.suiteId;
      dialogInstance.runMode = 'suite';
    }

    return dialogRef;
  }

  private closeAllDialogs(): void {
    // Close all dialogs in reverse order (newest first)
    while (this.activeDialogs.length > 0) {
      const dialog = this.activeDialogs.pop();
      if (dialog) {
        try {
          dialog.close();
        } catch (e) {
          // Dialog might already be closed
        }
      }
    }
  }

  private removeDialog(dialogRef: DialogRef): void {
    const index = this.activeDialogs.indexOf(dialogRef);
    if (index > -1) {
      this.activeDialogs.splice(index, 1);
    }
  }

  OpenTestDialog(testId: string): DialogRef {
    return this.OpenTestRunDialog({ testId, mode: 'test' });
  }

  OpenSuiteDialog(suiteId: string): DialogRef {
    return this.OpenTestRunDialog({ suiteId, mode: 'suite' });
  }
}

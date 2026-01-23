import { Injectable, Inject, ViewContainerRef } from '@angular/core';
import { DialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { FeedbackFormComponent } from '../components/feedback-form.component';
import { FeedbackConfig, FEEDBACK_CONFIG } from '../feedback.config';
import { FeedbackCategory } from '../feedback.types';

/**
 * Options for opening the feedback dialog
 */
export interface FeedbackDialogOptions {
  /** ViewContainerRef for proper dialog placement */
  viewContainerRef?: ViewContainerRef;
  /** Pre-select a category */
  prefilledCategory?: FeedbackCategory | string;
  /** Pre-fill the title */
  prefilledTitle?: string;
  /** Additional context data to include */
  contextData?: Record<string, unknown>;
  /** Current page/view name (for apps where URL doesn't change during navigation) */
  currentPage?: string;
}

/**
 * Service for managing the feedback dialog lifecycle
 */
@Injectable({
  providedIn: 'root'
})
export class FeedbackDialogService {
  private activeDialogs: DialogRef[] = [];

  constructor(
    private dialogService: DialogService,
    @Inject(FEEDBACK_CONFIG) private config: FeedbackConfig
  ) {}

  /**
   * Open the feedback dialog
   * @param options - Dialog configuration options
   * @returns DialogRef for the opened dialog
   */
  public OpenFeedbackDialog(options?: FeedbackDialogOptions): DialogRef {
    // Close any existing dialogs first
    this.closeAllDialogs();

    const dialogRef = this.dialogService.open({
      title: this.config.title || 'Submit Feedback',
      content: FeedbackFormComponent,
      width: 700,
      height: 650,
      minWidth: 500,
      minHeight: 500,
      appendTo: options?.viewContainerRef
    });

    // Track this dialog
    this.activeDialogs.push(dialogRef);

    // Remove from tracking when closed
    dialogRef.result.subscribe(
      () => this.removeDialog(dialogRef),
      () => this.removeDialog(dialogRef)
    );

    // Configure the dialog instance
    const instance = dialogRef.content.instance as FeedbackFormComponent;

    if (options?.prefilledCategory) {
      instance.PrefilledCategory = options.prefilledCategory;
    }

    if (options?.prefilledTitle) {
      instance.PrefilledTitle = options.prefilledTitle;
    }

    if (options?.contextData) {
      instance.ContextData = options.contextData;
    }

    if (options?.currentPage) {
      console.log('[FeedbackDialog] Setting CurrentPage on form:', options.currentPage);
      instance.CurrentPage = options.currentPage;
    }

    return dialogRef;
  }

  /**
   * Open dialog pre-configured for bug reporting
   */
  public OpenBugReportDialog(options?: Omit<FeedbackDialogOptions, 'prefilledCategory'>): DialogRef {
    return this.OpenFeedbackDialog({
      ...options,
      prefilledCategory: 'bug'
    });
  }

  /**
   * Open dialog pre-configured for feature requests
   */
  public OpenFeatureRequestDialog(options?: Omit<FeedbackDialogOptions, 'prefilledCategory'>): DialogRef {
    return this.OpenFeedbackDialog({
      ...options,
      prefilledCategory: 'feature'
    });
  }

  /**
   * Close all open feedback dialogs
   */
  public CloseAllDialogs(): void {
    this.closeAllDialogs();
  }

  /**
   * Internal method to close all dialogs
   */
  private closeAllDialogs(): void {
    while (this.activeDialogs.length > 0) {
      const dialog = this.activeDialogs.pop();
      if (dialog) {
        try {
          dialog.close();
        } catch {
          // Dialog might already be closed
        }
      }
    }
  }

  /**
   * Remove a dialog from tracking
   */
  private removeDialog(dialogRef: DialogRef): void {
    const index = this.activeDialogs.indexOf(dialogRef);
    if (index > -1) {
      this.activeDialogs.splice(index, 1);
    }
  }
}

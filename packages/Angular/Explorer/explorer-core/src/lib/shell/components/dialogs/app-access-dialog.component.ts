import { Component, Input, Output, EventEmitter, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';

/**
 * Type of app access issue
 */
export type AppAccessDialogType =
  | 'not_installed'    // User can install the app
  | 'disabled'         // User has disabled the app, can re-enable
  | 'no_access'        // User doesn't have permission
  | 'not_found'        // App doesn't exist
  | 'inactive'         // App is inactive/disabled by admin
  | 'no_apps'          // User has no apps configured at all
  | 'layout_error';    // Golden Layout failed to initialize

/**
 * Configuration for the app access dialog
 */
export interface AppAccessDialogConfig {
  type: AppAccessDialogType;
  appName?: string;
  appId?: string;
}

/**
 * Result from the dialog
 */
export interface AppAccessDialogResult {
  action: 'install' | 'enable' | 'redirect' | 'dismissed';
  appId?: string;
}

/**
 * Dialog component for handling app access errors.
 * Shows appropriate messages and actions based on the type of access issue.
 * Features auto-dismiss with countdown timer for certain dialog types.
 */
@Component({
  selector: 'mj-app-access-dialog',
  templateUrl: './app-access-dialog.component.html',
  styleUrls: ['./app-access-dialog.component.css']
})
export class AppAccessDialogComponent implements OnDestroy {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() result = new EventEmitter<AppAccessDialogResult>();

  config: AppAccessDialogConfig | null = null;
  isProcessing = false;

  // Auto-dismiss countdown
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  countdownSeconds = 0;
  private readonly AUTO_DISMISS_SECONDS = 5;

  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * Show the dialog with the specified configuration
   */
  show(config: AppAccessDialogConfig): void {
    this.config = config;
    this.visible = true;
    this.isProcessing = false;
    this.visibleChange.emit(true);

    // Start countdown for types that auto-dismiss
    if (this.shouldAutoDismiss()) {
      this.startCountdown();
    }

    this.cdr.detectChanges();
  }

  /**
   * Hide the dialog
   */
  hide(): void {
    this.stopCountdown();
    this.visible = false;
    this.visibleChange.emit(false);
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  /**
   * Get the dialog title based on type
   */
  get title(): string {
    if (!this.config) return '';

    switch (this.config.type) {
      case 'not_installed':
        return 'Add Application?';
      case 'disabled':
        return 'Add Application?';
      case 'no_access':
        return 'Access Denied';
      case 'not_found':
        return 'Application Not Found';
      case 'inactive':
        return 'Application Unavailable';
      case 'no_apps':
        return 'No Applications Available';
      case 'layout_error':
        return 'Display Error';
      default:
        return 'Application Error';
    }
  }

  /**
   * Get the dialog icon based on type
   */
  get icon(): string {
    if (!this.config) return 'fa-circle-info';

    switch (this.config.type) {
      case 'not_installed':
      case 'disabled':
        return 'fa-circle-question';
      case 'no_access':
        return 'fa-lock';
      case 'not_found':
        return 'fa-circle-xmark';
      case 'inactive':
        return 'fa-circle-pause';
      case 'no_apps':
        return 'fa-folder-open';
      case 'layout_error':
        return 'fa-triangle-exclamation';
      default:
        return 'fa-circle-info';
    }
  }

  /**
   * Get the dialog icon color based on type
   */
  get iconColor(): string {
    if (!this.config) return '#666';

    switch (this.config.type) {
      case 'not_installed':
      case 'disabled':
        return '#2196F3'; // Blue for actionable
      case 'no_access':
      case 'inactive':
        return '#FF9800'; // Orange for warning
      case 'not_found':
      case 'layout_error':
        return '#F44336'; // Red for error
      case 'no_apps':
        return '#9E9E9E'; // Gray for info
      default:
        return '#666';
    }
  }

  /**
   * Get the main message based on type
   */
  get message(): string {
    if (!this.config) return '';

    const appName = this.config.appName || 'this application';

    switch (this.config.type) {
      case 'not_installed':
      case 'disabled':
        return `Would you like to add "${appName}" to your applications?`;
      case 'no_access':
        return `You don't have permission to access "${appName}".`;
      case 'not_found':
        return `The application "${appName}" doesn't exist in this system.`;
      case 'inactive':
        return `The application "${appName}" is currently inactive and unavailable.`;
      case 'no_apps':
        return `You don't have any applications configured. Your system administrator needs to set up your application access.`;
      case 'layout_error':
        return `There was an error displaying the application interface. The system will redirect you to an available application.`;
      default:
        return 'An error occurred while loading the application.';
    }
  }

  /**
   * Get the secondary/help message based on type
   */
  get helpMessage(): string {
    if (!this.config) return '';

    switch (this.config.type) {
      case 'not_installed':
      case 'disabled':
        return '';
      case 'no_access':
      case 'not_found':
      case 'inactive':
        return 'If you believe this is an error, please contact your system administrator.';
      case 'no_apps':
        return 'Please contact your system administrator to configure your application access.';
      case 'layout_error':
        return 'If this error persists, try clearing your browser cache or contact your system administrator.';
      default:
        return '';
    }
  }

  /**
   * Check if the primary action button should be shown
   */
  get showPrimaryAction(): boolean {
    if (!this.config) return false;
    return this.config.type === 'not_installed' || this.config.type === 'disabled';
  }

  /**
   * Get the primary action button text
   */
  get primaryActionText(): string {
    if (!this.config) return '';

    switch (this.config.type) {
      case 'not_installed':
      case 'disabled':
        return 'Add';
      default:
        return 'OK';
    }
  }

  /**
   * Get the secondary/dismiss button text with countdown if applicable
   * For actionable dialogs (install/enable), show "Cancel"
   * For non-actionable dialogs (errors), show "OK" with countdown
   */
  get dismissButtonText(): string {
    // For actionable dialogs, use "Cancel"
    if (this.showPrimaryAction) {
      return 'Cancel';
    }

    // For non-actionable dialogs, show countdown if active
    if (this.countdownSeconds > 0) {
      return `OK (${this.countdownSeconds})`;
    }
    return 'OK';
  }

  /**
   * Check if this dialog type should auto-dismiss
   */
  private shouldAutoDismiss(): boolean {
    if (!this.config) return false;
    return ['no_access', 'not_found', 'inactive', 'layout_error'].includes(this.config.type);
  }

  /**
   * Start the countdown timer for auto-dismiss
   */
  private startCountdown(): void {
    this.stopCountdown();
    this.countdownSeconds = this.AUTO_DISMISS_SECONDS;

    this.countdownInterval = setInterval(() => {
      this.countdownSeconds--;
      this.cdr.detectChanges();

      if (this.countdownSeconds <= 0) {
        this.onDismiss();
      }
    }, 1000);
  }

  /**
   * Stop the countdown timer
   */
  private stopCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.countdownSeconds = 0;
  }

  /**
   * Handle primary action (install/enable)
   */
  async onPrimaryAction(): Promise<void> {
    if (!this.config) return;

    this.isProcessing = true;
    this.cdr.detectChanges();

    const action = this.config.type === 'not_installed' ? 'install' : 'enable';

    this.result.emit({
      action,
      appId: this.config.appId
    });

    // Don't hide yet - let the parent component handle the result and close when ready
  }

  /**
   * Handle dismiss/redirect action
   */
  onDismiss(): void {
    this.stopCountdown();
    this.result.emit({ action: 'redirect' });
    this.hide();
  }

  /**
   * Mark processing as complete (called by parent after install/enable)
   */
  completeProcessing(): void {
    this.isProcessing = false;
    this.hide();
  }

  /**
   * Handle keyboard events for the dialog
   * Enter key triggers primary action (Install/Enable)
   * Escape key dismisses the dialog
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.visible || this.isProcessing) return;

    if (event.key === 'Enter') {
      // Enter triggers primary action if available
      if (this.showPrimaryAction) {
        event.preventDefault();
        event.stopPropagation();
        this.onPrimaryAction();
      }
    } else if (event.key === 'Escape') {
      // Escape dismisses the dialog
      event.preventDefault();
      event.stopPropagation();
      this.onDismiss();
    }
  }
}

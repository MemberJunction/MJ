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
  standalone: false,
  selector: 'mj-app-access-dialog',
  templateUrl: './app-access-dialog.component.html',
  styleUrls: ['./app-access-dialog.component.css']
})
export class AppAccessDialogComponent implements OnDestroy {
  @Input() Visible = false;

  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: AppAccessDialogComponent['Visible']) {
    this.Visible = value;
  }
  /** @deprecated Use {@link Visible}. */
  get visible(): AppAccessDialogComponent['Visible'] {
    return this.Visible;
  }
  @Output() VisibleChange = new EventEmitter<boolean>();

  /**
   * @deprecated Use {@link VisibleChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (visibleChange) keeps working. Must stay AFTER VisibleChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() visibleChange = this.VisibleChange;
  @Output() Result = new EventEmitter<AppAccessDialogResult>();

  /**
   * @deprecated Use {@link Result}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (result) keeps working. Must stay AFTER Result: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() result = this.Result;

  config: AppAccessDialogConfig | null = null;
  IsProcessing = false;

  /** @deprecated Use {@link IsProcessing}. */
  get isProcessing() {
    return this.IsProcessing;
  }
  /** @deprecated Use {@link IsProcessing}. */
  set isProcessing(value) {
    this.IsProcessing = value;
  }

  // Auto-dismiss countdown
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  CountdownSeconds = 0;

  /** @deprecated Use {@link CountdownSeconds}. */
  get countdownSeconds() {
    return this.CountdownSeconds;
  }
  /** @deprecated Use {@link CountdownSeconds}. */
  set countdownSeconds(value) {
    this.CountdownSeconds = value;
  }
  private readonly AUTO_DISMISS_SECONDS = 5;

  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * Show the dialog with the specified configuration
   */
  Show(config: AppAccessDialogConfig): void {
    this.config = config;
    this.Visible = true;
    this.IsProcessing = false;
    this.VisibleChange.emit(true);

    // Start countdown for types that auto-dismiss
    if (this.shouldAutoDismiss()) {
      this.startCountdown();
    }

    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link Show}. */
  show(config: AppAccessDialogConfig): void {
    return this.Show(config);
  }

  /**
   * Hide the dialog
   */
  Hide(): void {
    this.stopCountdown();
    this.Visible = false;
    this.VisibleChange.emit(false);
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link Hide}. */
  hide(): void {
    return this.Hide();
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
  get Icon(): string {
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

  /** @deprecated Use {@link Icon}. */
  get icon(): string {
    return this.Icon;
  }

  /**
   * Get the dialog icon color based on type
   */
  get IconColor(): string {
    if (!this.config) return 'var(--mj-text-secondary)';

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
        return 'var(--mj-text-secondary)';
    }
  }

  /** @deprecated Use {@link IconColor}. */
  get iconColor(): string {
    return this.IconColor;
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
  get HelpMessage(): string {
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

  /** @deprecated Use {@link HelpMessage}. */
  get helpMessage(): string {
    return this.HelpMessage;
  }

  /**
   * Check if the primary action button should be shown
   */
  get ShowPrimaryAction(): boolean {
    if (!this.config) return false;
    return this.config.type === 'not_installed' || this.config.type === 'disabled';
  }

  /** @deprecated Use {@link ShowPrimaryAction}. */
  get showPrimaryAction(): boolean {
    return this.ShowPrimaryAction;
  }

  /**
   * Get the primary action button text
   */
  get PrimaryActionText(): string {
    if (!this.config) return '';

    switch (this.config.type) {
      case 'not_installed':
      case 'disabled':
        return 'Add';
      default:
        return 'OK';
    }
  }

  /** @deprecated Use {@link PrimaryActionText}. */
  get primaryActionText(): string {
    return this.PrimaryActionText;
  }

  /**
   * Get the secondary/dismiss button text with countdown if applicable
   * For actionable dialogs (install/enable), show "Cancel"
   * For non-actionable dialogs (errors), show "OK" with countdown
   */
  get DismissButtonText(): string {
    // For actionable dialogs, use "Cancel"
    if (this.ShowPrimaryAction) {
      return 'Cancel';
    }

    // For non-actionable dialogs, show countdown if active
    if (this.CountdownSeconds > 0) {
      return `OK (${this.CountdownSeconds})`;
    }
    return 'OK';
  }

  /** @deprecated Use {@link DismissButtonText}. */
  get dismissButtonText(): string {
    return this.DismissButtonText;
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
    this.CountdownSeconds = this.AUTO_DISMISS_SECONDS;

    this.countdownInterval = setInterval(() => {
      this.CountdownSeconds--;
      this.cdr.detectChanges();

      if (this.CountdownSeconds <= 0) {
        this.OnDismiss();
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
    this.CountdownSeconds = 0;
  }

  /**
   * Handle primary action (install/enable)
   */
  async OnPrimaryAction(): Promise<void> {
    if (!this.config) return;

    this.IsProcessing = true;
    this.cdr.detectChanges();

    const action = this.config.type === 'not_installed' ? 'install' : 'enable';

    this.Result.emit({
      action,
      appId: this.config.appId
    });

    // Don't hide yet - let the parent component handle the result and close when ready
  }

  /** @deprecated Use {@link OnPrimaryAction}. */
  async onPrimaryAction(): Promise<void> {
    return this.OnPrimaryAction();
  }

  /**
   * Handle dismiss/redirect action
   */
  OnDismiss(): void {
    this.stopCountdown();
    this.Result.emit({ action: 'redirect' });
    this.Hide();
  }

  /** @deprecated Use {@link OnDismiss}. */
  onDismiss(): void {
    return this.OnDismiss();
  }

  /**
   * Mark processing as complete (called by parent after install/enable)
   */
  CompleteProcessing(): void {
    this.IsProcessing = false;
    this.Hide();
  }

  /** @deprecated Use {@link CompleteProcessing}. */
  completeProcessing(): void {
    return this.CompleteProcessing();
  }

  /**
   * Handle keyboard events for the dialog
   * Enter key triggers primary action (Install/Enable)
   * Escape key dismisses the dialog
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.Visible || this.IsProcessing) return;

    if (event.key === 'Enter') {
      // Enter triggers primary action if available
      if (this.ShowPrimaryAction) {
        event.preventDefault();
        event.stopPropagation();
        this.OnPrimaryAction();
      }
    } else if (event.key === 'Escape') {
      // Escape dismisses the dialog
      event.preventDefault();
      event.stopPropagation();
      this.OnDismiss();
    }
  }
}

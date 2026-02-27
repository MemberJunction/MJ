import { Component, Input } from '@angular/core';
import { FeedbackDialogService } from '../services/feedback-dialog.service';

/**
 * Position options for the floating feedback button
 */
export type FeedbackButtonPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

/**
 * Floating feedback button component
 *
 * @example
 * ```html
 * <!-- Basic usage - bottom right corner -->
 * <mj-feedback-button></mj-feedback-button>
 *
 * <!-- With label visible -->
 * <mj-feedback-button [ShowLabel]="true" ButtonText="Report Issue"></mj-feedback-button>
 *
 * <!-- Different position -->
 * <mj-feedback-button Position="bottom-left"></mj-feedback-button>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-feedback-button',
  template: `
    <button
      class="feedback-floating-button"
      [ngClass]="'position-' + Position"
      (click)="OpenFeedbackDialog()"
      [title]="ButtonText"
      type="button">
      <i class="fas fa-comment-dots"></i>
      @if (ShowLabel) {
        <span class="button-label">{{ ButtonText }}</span>
      }
    </button>
  `,
  styles: [`
    .feedback-floating-button {
      position: fixed;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: var(--mj-space-2);
      padding: var(--mj-space-3) var(--mj-space-4);
      border-radius: var(--mj-space-6);
      background: var(--mj-brand-primary);
      color: var(--mj-brand-on-primary);
      border: none;
      cursor: pointer;
      box-shadow: var(--mj-shadow-brand-md);
      transition: var(--mj-transition-base);
      font-size: var(--mj-text-sm);
      font-weight: var(--mj-font-medium);
      font-family: var(--mj-font-family);
    }

    .feedback-floating-button:hover {
      background: var(--mj-brand-primary-hover);
      transform: translateY(-2px);
      box-shadow: var(--mj-shadow-lg);
    }

    .feedback-floating-button:active {
      transform: translateY(0);
    }

    .feedback-floating-button i {
      font-size: 18px;
    }

    .button-label {
      white-space: nowrap;
    }

    /* Position variants */
    .position-bottom-right {
      bottom: var(--mj-space-6);
      right: var(--mj-space-6);
    }

    .position-bottom-left {
      bottom: var(--mj-space-6);
      left: var(--mj-space-6);
    }

    .position-top-right {
      top: var(--mj-space-6);
      right: var(--mj-space-6);
    }

    .position-top-left {
      top: var(--mj-space-6);
      left: var(--mj-space-6);
    }
  `]
})
export class FeedbackButtonComponent {
  /**
   * Position of the floating button
   */
  @Input() Position: FeedbackButtonPosition = 'bottom-right';

  /**
   * Whether to show the text label
   */
  @Input() ShowLabel = false;

  /**
   * Button text (shown as tooltip or label)
   */
  @Input() ButtonText = 'Feedback';

  /**
   * Optional callback to get the current page/view name.
   * Use this for apps where URL doesn't reflect navigation (e.g., tab-based apps).
   * @example
   * ```html
   * <mj-feedback-button [CurrentPageProvider]="getCurrentPage"></mj-feedback-button>
   * ```
   * ```typescript
   * getCurrentPage = (): string => {
   *   return this.workspaceManager.GetConfiguration()?.tabs
   *     .find(t => t.id === this.workspaceManager.GetActiveTabId())?.title || '';
   * };
   * ```
   */
  @Input() CurrentPageProvider?: () => string | undefined;

  constructor(
    private dialogService: FeedbackDialogService
  ) {}

  /**
   * Open the feedback dialog
   */
  OpenFeedbackDialog(): void {
    const currentPage = this.CurrentPageProvider?.();
    this.dialogService.OpenFeedbackDialog({
      currentPage
    });
  }
}

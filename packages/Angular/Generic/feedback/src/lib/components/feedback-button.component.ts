import { Component, Input, ViewContainerRef } from '@angular/core';
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
  selector: 'mj-feedback-button',
  template: `
    <button
      kendoButton
      class="feedback-floating-button"
      [ngClass]="'position-' + Position"
      (click)="OpenFeedbackDialog()"
      [title]="ButtonText">
      <i class="fas fa-comment-dots"></i>
      <span class="button-label" *ngIf="ShowLabel">{{ ButtonText }}</span>
    </button>
  `,
  styles: [`
    .feedback-floating-button {
      position: fixed;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 24px;
      background: #2563eb;
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
      transition: all 0.2s ease;
      font-size: 14px;
      font-weight: 500;
    }

    .feedback-floating-button:hover {
      background: #1d4ed8;
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.5);
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
      bottom: 24px;
      right: 24px;
    }

    .position-bottom-left {
      bottom: 24px;
      left: 24px;
    }

    .position-top-right {
      top: 24px;
      right: 24px;
    }

    .position-top-left {
      top: 24px;
      left: 24px;
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
    private dialogService: FeedbackDialogService,
    private vcr: ViewContainerRef
  ) {}

  /**
   * Open the feedback dialog
   */
  OpenFeedbackDialog(): void {
    const currentPage = this.CurrentPageProvider?.();
    console.log('[FeedbackButton] currentPage from provider:', currentPage);
    this.dialogService.OpenFeedbackDialog({
      viewContainerRef: this.vcr,
      currentPage
    });
  }
}

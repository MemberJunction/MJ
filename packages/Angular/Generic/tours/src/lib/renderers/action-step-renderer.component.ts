import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IActionStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';

/**
 * Non-modal `Action` step renderer (absorbs `FieldEntry` and `WaitForSignal`, §5.3).
 * Page stays interactive; F6 switches focus between this popover and the anchored target.
 */
@RegisterClass(BaseTourStepRenderer, 'Action')
@Component({
  selector: 'mj-tour-action-step',
  standalone: true,
  imports: [MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mjt-step-content"
      role="dialog"
      aria-modal="false"
      [attr.aria-labelledby]="StepHeadingId"
      [attr.aria-describedby]="Step.Body ? StepBodyId : null"
    >
      <div class="mjt-header">
        <div>
          <div class="mjt-progress">{{ ProgressLabel }}</div>
          <h2 class="mjt-title" [id]="StepHeadingId">{{ Step.Title }}</h2>
        </div>
        <button
          type="button"
          class="mjt-close-btn"
          aria-label="Close tour"
          (click)="OnDismiss()"
        >
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      @if (Step.Body) {
        <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(Step.Body)"></div>
      }

      @if (ShowWaitingIndicator) {
        <div class="mjt-waiting" role="status" aria-live="polite">
          <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
          <span>{{ WaitingMessage }}</span>
        </div>
      }

      @if (Step.Anchor) {
        <div class="mjt-hint">Press F6 to switch focus between this instruction and the target control.</div>
      }

      <div class="mjt-footer">
        <div class="mjt-footer-actions">
          @if (AllowManualSkip) {
            <button
              type="button"
              mjButton
              variant="primary"
              (click)="OnSkip()"
            >
              {{ SkipLabel }}
            </button>
          }
          @if (Session.CanGoBack) {
            <button
              type="button"
              mjButton
              variant="secondary"
              (click)="OnBack()"
            >
              Back
            </button>
          }
        </div>
        <button
          type="button"
          mjButton
          variant="flat"
          (click)="OnDismiss()"
        >
          Dismiss
        </button>
      </div>
    </div>
  `,
})
export class ActionStepRenderer extends BaseTourStepRenderer<IActionStepConfig> {
  public get ShowWaitingIndicator(): boolean {
    return Boolean(this.Step?.WaitingForCompletion && this.Step?.Configuration?.ShowWaitingIndicator !== false);
  }

  public get WaitingMessage(): string {
    return this.Step?.Configuration?.WaitingMessage ?? 'Waiting for you to complete this action...';
  }

  public get AllowManualSkip(): boolean {
    return Boolean(this.Step?.Configuration?.AllowManualSkip || this.Step?.IsOptional);
  }

  public get SkipLabel(): string {
    return this.Step?.Configuration?.SkipButtonText ?? 'Skip step';
  }

  public OnSkip(): void {
    this.NextRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnBack(): void {
    this.BackRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnDismiss(): void {
    this.DismissRequested.emit({ StepKey: this.Step.StepKey });
  }
}

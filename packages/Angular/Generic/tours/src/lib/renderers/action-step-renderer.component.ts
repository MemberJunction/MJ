import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IActionStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';
import { TourProgressRailComponent, TourStepHeaderComponent } from './tour-step-chrome.component';

/**
 * Non-modal `Action` step renderer (absorbs `FieldEntry` and `WaitForSignal`, §5.3).
 * Page stays interactive; F6 switches focus between this popover and the anchored target.
 */
@RegisterClass(BaseTourStepRenderer, 'Action')
@Component({
  selector: 'mj-tour-action-step',
  standalone: true,
  imports: [MJButtonDirective, TourStepHeaderComponent, TourProgressRailComponent],
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
      <mj-tour-step-header
        [Step]="Step"
        [HeadingId]="StepHeadingId"
        (Dismiss)="OnDismiss()"
      />

      @if (ShowWaitingIndicator) {
        <div class="mjt-awaiting-pill" role="status" aria-live="polite">
          <span class="mjt-awaiting-dot" aria-hidden="true"></span>
          <span>{{ WaitingMessage }}</span>
        </div>
      }

      @if (Step.Body) {
        <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(Step.Body)"></div>
      }

      @if (Step.Anchor) {
        <div class="mjt-hint">
          Press <kbd class="mjt-kbd">F6</kbd> to switch focus between this instruction and the target control.
        </div>
      }

      <div class="mjt-footer">
        <div class="mjt-footer-meta">
          <mj-tour-progress-rail
            [Session]="Session"
            (StepSelected)="StepSelected.emit($event)"
          />
          <span class="mjt-kbd-row" aria-hidden="true">
            <kbd class="mjt-kbd">&larr;</kbd>
            <kbd class="mjt-kbd">&rarr;</kbd>
            <kbd class="mjt-kbd">Esc</kbd>
          </span>
        </div>
        <div class="mjt-footer-actions">
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

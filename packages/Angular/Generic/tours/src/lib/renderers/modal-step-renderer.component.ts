import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IModalStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';

/**
 * Centered `Modal` step renderer (absorbs `welcome`, `announcement`, `checkpoint`, and `summary`, §5.3).
 */
@RegisterClass(BaseTourStepRenderer, 'Modal')
@Component({
  selector: 'mj-tour-modal-step',
  standalone: true,
  imports: [MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mjt-step-content"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="StepHeadingId"
      [attr.aria-describedby]="Step.Body ? StepBodyId : null"
    >
      <div class="mjt-header">
        <div>
          @if (ShowProgress) {
            <div class="mjt-progress">{{ ProgressLabel }}</div>
          }
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

      <div class="mjt-footer">
        <div class="mjt-footer-actions">
          <button
            type="button"
            mjButton
            variant="primary"
            (click)="OnPrimary()"
          >
            {{ PrimaryLabel }}
          </button>
          @if (NextTourKey) {
            <button
              type="button"
              mjButton
              variant="secondary"
              (click)="OnStartNextTour()"
            >
              Start next tour
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
          {{ SecondaryLabel }}
        </button>
      </div>
    </div>
  `,
})
export class ModalStepRenderer extends BaseTourStepRenderer<IModalStepConfig> {
  public get ShowProgress(): boolean {
    return this.Step?.Configuration?.ShowProgress !== false && this.Step?.TotalSteps > 1;
  }

  public get PrimaryLabel(): string {
    if (this.Step?.Configuration?.PrimaryButtonText) {
      return this.Step.Configuration.PrimaryButtonText;
    }
    if (this.Step?.Configuration?.Variant === 'checkpoint' || this.Step?.Configuration?.Variant === 'summary') {
      return 'Finish';
    }
    return this.Step && this.Step.StepIndex >= this.Step.TotalSteps - 1 ? 'Done' : 'Get started';
  }

  public get SecondaryLabel(): string {
    return this.Step?.Configuration?.SecondaryButtonText ?? 'Dismiss';
  }

  public get NextTourKey(): string | undefined {
    return this.Step?.Configuration?.NextTourKey;
  }

  public OnPrimary(): void {
    this.NextRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnStartNextTour(): void {
    if (this.NextTourKey) {
      this.NextTourRequested.emit(this.NextTourKey);
    }
  }

  public OnBack(): void {
    this.BackRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnDismiss(): void {
    this.DismissRequested.emit({ StepKey: this.Step.StepKey });
  }
}

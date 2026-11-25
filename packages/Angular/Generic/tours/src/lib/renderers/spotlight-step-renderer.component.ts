import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { ISpotlightStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';

@RegisterClass(BaseTourStepRenderer, 'Spotlight')
@Component({
  selector: 'mj-tour-spotlight-step',
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
            (click)="OnNext()"
          >
            {{ NextLabel }}
          </button>
          @if (Session.CanGoBack) {
            <button
              type="button"
              mjButton
              variant="secondary"
              (click)="OnBack()"
            >
              {{ BackLabel }}
            </button>
          }
        </div>
        <button
          type="button"
          mjButton
          variant="flat"
          (click)="OnDismiss()"
        >
          {{ DismissLabel }}
        </button>
      </div>
    </div>
  `,
})
export class SpotlightStepRenderer extends BaseTourStepRenderer<ISpotlightStepConfig> {
  public get ShowProgress(): boolean {
    return this.Step?.Configuration?.ShowProgress !== false;
  }

  public get NextLabel(): string {
    return this.Step?.Configuration?.NextButtonText ?? (this.isLastStep ? 'Done' : 'Next');
  }

  public get BackLabel(): string {
    return this.Step?.Configuration?.BackButtonText ?? 'Back';
  }

  public get DismissLabel(): string {
    return this.Step?.Configuration?.DismissButtonText ?? 'Dismiss';
  }

  private get isLastStep(): boolean {
    return this.Step ? this.Step.StepIndex >= this.Step.TotalSteps - 1 : false;
  }

  public OnNext(): void {
    this.NextRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnBack(): void {
    this.BackRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnDismiss(): void {
    this.DismissRequested.emit({ StepKey: this.Step.StepKey });
  }
}

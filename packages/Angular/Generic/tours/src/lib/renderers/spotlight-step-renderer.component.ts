import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { ISpotlightStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';
import { TourProgressRailComponent, TourStepHeaderComponent } from './tour-step-chrome.component';

@RegisterClass(BaseTourStepRenderer, 'Spotlight')
@Component({
  selector: 'mj-tour-spotlight-step',
  standalone: true,
  imports: [MJButtonDirective, TourStepHeaderComponent, TourProgressRailComponent],
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
      <mj-tour-step-header
        [Step]="Step"
        [HeadingId]="StepHeadingId"
        [ShowProgress]="ShowProgress"
        (Dismiss)="OnDismiss()"
      />

      @if (ShowGuideStatus) {
        <div class="mjt-awaiting-pill" role="status">
          <span class="mjt-awaiting-dot" aria-hidden="true"></span>
          <span>{{ GuideStatusText }}</span>
        </div>
      }

      @if (Step.Body) {
        <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(Step.Body)"></div>
      }

      <div class="mjt-footer">
        <div class="mjt-footer-meta">
          @if (ShowProgress) {
            <mj-tour-progress-rail
              [Session]="Session"
              (StepSelected)="StepSelected.emit($event)"
            />
          }
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
              {{ BackLabel }}
            </button>
          }
          <button
            type="button"
            mjButton
            variant="primary"
            (click)="OnNext()"
          >
            {{ NextLabel }}
          </button>
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
    </div>
  `,
})
export class SpotlightStepRenderer extends BaseTourStepRenderer<ISpotlightStepConfig> {
  public get ShowProgress(): boolean {
    return this.Step?.Configuration?.ShowProgress !== false;
  }

  public get ShowGuideStatus(): boolean {
    return this.Step?.Mode === 'Guide';
  }

  public get GuideStatusText(): string {
    return 'Interactive highlight active';
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

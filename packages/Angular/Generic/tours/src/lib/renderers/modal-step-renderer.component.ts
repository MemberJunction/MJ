import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  SimpleChanges,
  ViewEncapsulation,
  signal,
} from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IModalStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';
import { TourProgressRailComponent, TourStepHeaderComponent } from './tour-step-chrome.component';

/**
 * Centered `Modal` step renderer (absorbs `welcome`, `announcement`, `checkpoint`, and `summary`, §5.3).
 * Renders an expressive hero banner + 2-column mode selector (Visual Self-Paced vs Walk through with Sage)
 * on welcome steps when voice guidance is available.
 */
@RegisterClass(BaseTourStepRenderer, 'Modal')
@Component({
  selector: 'mj-tour-modal-step',
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
      @if (IsWelcomeHero) {
        <div class="mjt-hero-banner">
          <div class="mjt-hero-top">
            <span class="mjt-step-badge-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
            </span>
            <div class="mjt-footer-actions">
              <span class="mjt-duration-pill">~{{ EstimatedMinutesDisplay }} min · {{ TotalStepsCount }} steps</span>
              <button
                type="button"
                class="mjt-close-btn"
                tabindex="0"
                aria-label="Close tour"
                (click)="OnDismiss()"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>
          <h2 class="mjt-title" [id]="StepHeadingId">{{ Step.Title }}</h2>
          @if (Step.Body) {
            <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(Step.Body)"></div>
          }
        </div>
      } @else {
        <mj-tour-step-header
          [Step]="Step"
          [HeadingId]="StepHeadingId"
          [ShowProgress]="ShowProgress"
          (Dismiss)="OnDismiss()"
        />

        @if (Step.Body) {
          <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(Step.Body)"></div>
        }
      }

      @if (ShowModeSelector) {
        <div class="mjt-mode-grid" role="radiogroup" aria-label="Choose how you want to tour">
          <button
            type="button"
            class="mjt-mode-card"
            [class.mjt-mode-card--selected]="selectedMode() === 'visual'"
            [attr.aria-pressed]="selectedMode() === 'visual'"
            (click)="SelectMode('visual')"
          >
            <span class="mjt-mode-title">Self-Paced</span>
            <span class="mjt-hint">Step through crisp callouts at your own speed.</span>
          </button>
          <button
            type="button"
            class="mjt-mode-card"
            [class.mjt-mode-card--selected]="selectedMode() === 'voice'"
            [attr.aria-pressed]="selectedMode() === 'voice'"
            (click)="SelectMode('voice')"
          >
            <span class="mjt-mode-title">
              <span>Walk through with</span>
              <span class="mjt-sage-pill">Sage</span>
            </span>
            <span class="mjt-hint">Live voice guidance &amp; interactive demos.</span>
          </button>
        </div>
      }

      <div class="mjt-footer">
        <div class="mjt-footer-meta">
          @if (ShowProgress) {
            <mj-tour-progress-rail
              [Session]="Session"
              (StepSelected)="StepSelected.emit($event)"
            />
          }
        </div>
        <div class="mjt-footer-actions">
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
          @if (Session.CanGoBack && !IsWelcomeHero) {
            <button
              type="button"
              mjButton
              variant="secondary"
              (click)="OnBack()"
            >
              Back
            </button>
          }
          <button
            type="button"
            mjButton
            variant="primary"
            (click)="OnPrimary()"
          >
            {{ PrimaryLabel }}
          </button>
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
    </div>
  `,
})
export class ModalStepRenderer extends BaseTourStepRenderer<IModalStepConfig> implements OnChanges {
  protected readonly selectedMode = signal<'visual' | 'voice'>('visual');

  public ngOnChanges(changes: SimpleChanges): void {
    if ('VoiceGuideActive' in changes) {
      this.selectedMode.set(this.VoiceGuideActive ? 'voice' : 'visual');
    }
  }

  public get ShowProgress(): boolean {
    return this.Step?.Configuration?.ShowProgress !== false && (this.Step?.TotalSteps ?? 1) > 1;
  }

  public get IsWelcomeHero(): boolean {
    const variant = this.Step?.Configuration?.Variant;
    if (variant === 'welcome') {
      return true;
    }
    if (variant === 'checkpoint' || variant === 'summary' || variant === 'announcement') {
      return false;
    }
    return this.Step?.StepIndex === 0;
  }

  public get ShowModeSelector(): boolean {
    return Boolean(
      this.VoiceGuideAvailable &&
        (this.Step?.StepIndex === 0 || this.Step?.Configuration?.Variant === 'welcome'),
    );
  }

  public get TotalStepsCount(): number {
    return Math.max(1, this.Session?.StepCount ?? this.Step?.TotalSteps ?? 1);
  }

  public get EstimatedMinutesDisplay(): number {
    if (typeof this.EstimatedMinutes === 'number' && this.EstimatedMinutes > 0) {
      return Math.round(this.EstimatedMinutes);
    }
    return Math.max(1, Math.round(this.TotalStepsCount / 2));
  }

  public get PrimaryLabel(): string {
    if (this.Step?.Configuration?.PrimaryButtonText) {
      return this.Step.Configuration.PrimaryButtonText;
    }
    if (this.Step?.Configuration?.Variant === 'checkpoint' || this.Step?.Configuration?.Variant === 'summary') {
      return 'Finish';
    }
    if (this.IsWelcomeHero) {
      return 'Start Tour';
    }
    return this.Step && this.Step.StepIndex >= this.Step.TotalSteps - 1 ? 'Done' : 'Get started';
  }

  public get SecondaryLabel(): string {
    return this.Step?.Configuration?.SecondaryButtonText ?? 'Dismiss';
  }

  public get NextTourKey(): string | undefined {
    return this.Step?.Configuration?.NextTourKey;
  }

  public SelectMode(mode: 'visual' | 'voice'): void {
    this.selectedMode.set(mode);
  }

  public OnPrimary(): void {
    if (this.ShowModeSelector) {
      this.VoiceGuideToggled.emit(this.selectedMode() === 'voice');
    }
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

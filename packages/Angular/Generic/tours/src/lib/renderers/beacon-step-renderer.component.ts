import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  signal,
} from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IBeaconStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';

/** WCAG 2.2.2 Pause, Stop, Hide ceiling: decorative beacon pulse animation must auto-stop at or before 5 seconds. */
const MAX_WCAG_PULSE_MS = 5000;

/**
 * Non-modal `Beacon` step renderer (§5.3 & WCAG 2.2.2).
 * Renders a hotspot button whose pulse stops within <= 5 seconds and opens a hint dialog on click.
 */
@RegisterClass(BaseTourStepRenderer, 'Beacon')
@Component({
  selector: 'mj-tour-beacon-step',
  standalone: true,
  imports: [MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mjt-beacon-step">
      <button
        type="button"
        class="mjt-beacon-btn"
        [class.mjt-beacon-btn--pulsing]="isPulsing()"
        [attr.aria-expanded]="isExpanded()"
        [attr.aria-label]="'Hint: ' + Step.Title"
        (click)="ToggleExpanded()"
        (mouseenter)="OnMouseEnter()"
      >
        <i class="fa-solid fa-lightbulb" aria-hidden="true"></i>
      </button>

      @if (isExpanded()) {
        <div
          class="mjt-dialog mjt-dialog--popover"
          role="dialog"
          aria-modal="false"
          [attr.aria-labelledby]="StepHeadingId"
          [attr.aria-describedby]="Step.Body ? StepBodyId : null"
        >
          <div class="mjt-header">
            <h2 class="mjt-title" [id]="StepHeadingId">{{ Step.Title }}</h2>
            <button
              type="button"
              class="mjt-close-btn"
              aria-label="Close hint"
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
                (click)="OnContinue()"
              >
                Got it
              </button>
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
      }
    </div>
  `,
})
export class BeaconStepRenderer extends BaseTourStepRenderer<IBeaconStepConfig> implements OnInit, OnDestroy {
  protected readonly isPulsing = signal(true);
  protected readonly isExpanded = signal(false);
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;

  public get DismissLabel(): string {
    return this.Step?.Configuration?.DismissButtonText ?? 'Dismiss';
  }

  public ngOnInit(): void {
    const requested = this.Step?.Configuration?.PulseDurationMs ?? 4800;
    const boundedMs = Math.max(0, Math.min(MAX_WCAG_PULSE_MS, requested));
    this.pulseTimer = setTimeout(() => {
      this.isPulsing.set(false);
    }, boundedMs);
  }

  public ngOnDestroy(): void {
    if (this.pulseTimer !== null) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }
  }

  public ToggleExpanded(): void {
    this.isExpanded.update((prev) => !prev);
  }

  public OnMouseEnter(): void {
    if (this.Step?.Configuration?.OpenOnHover) {
      this.isExpanded.set(true);
    }
  }

  public OnContinue(): void {
    this.NextRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnDismiss(): void {
    this.DismissRequested.emit({ StepKey: this.Step.StepKey });
  }
}

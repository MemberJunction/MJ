import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { TourSignals, type IBannerStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from './base-step-renderer';

/**
 * Top-strip `Banner` step renderer (§5.3).
 */
@RegisterClass(BaseTourStepRenderer, 'Banner')
@Component({
  selector: 'mj-tour-banner-step',
  standalone: true,
  imports: [MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mjt-banner"
      [class.mjt-banner--success]="Tone === 'success'"
      [class.mjt-banner--warning]="Tone === 'warning'"
      role="dialog"
      aria-modal="false"
      [attr.aria-labelledby]="StepHeadingId"
      [attr.aria-describedby]="Step.Body ? StepBodyId : null"
    >
      <div>
        <h2 class="mjt-title" [id]="StepHeadingId">{{ Step.Title }}</h2>
        @if (Step.Body) {
          <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(Step.Body)"></div>
        }
      </div>
      <div class="mjt-footer-actions">
        @if (CtaText) {
          <button
            type="button"
            mjButton
            variant="primary"
            (click)="OnCta()"
          >
            {{ CtaText }}
          </button>
        }
        @if (Dismissible) {
          <button
            type="button"
            mjButton
            variant="flat"
            (click)="OnDismiss()"
          >
            Dismiss
          </button>
        }
      </div>
    </div>
  `,
})
export class BannerStepRenderer extends BaseTourStepRenderer<IBannerStepConfig> {
  public get Tone(): 'info' | 'success' | 'warning' {
    return this.Step?.Configuration?.Tone ?? 'info';
  }

  public get CtaText(): string | undefined {
    return this.Step?.Configuration?.CtaText;
  }

  public get Dismissible(): boolean {
    return this.Step?.Configuration?.Dismissible !== false;
  }

  public OnCta(): void {
    const signalKey = this.Step?.Configuration?.CtaSignalKey;
    if (signalKey) {
      TourSignals.Instance.Emit(signalKey, { StepKey: this.Step.StepKey });
      this.SignalEmitted.emit({ StepKey: this.Step.StepKey, SignalKey: signalKey });
    }
    const url = this.Step?.Configuration?.CtaUrl;
    if (url && /^https?:\/\//i.test(url) && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    this.NextRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnDismiss(): void {
    this.DismissRequested.emit({ StepKey: this.Step.StepKey });
  }
}

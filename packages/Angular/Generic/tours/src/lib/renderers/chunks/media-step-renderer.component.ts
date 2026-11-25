import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { TourSignals, type IMediaStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from '../base-step-renderer';
import { TourProgressRailComponent, TourStepHeaderComponent } from '../tour-step-chrome.component';

/**
 * Lazy-chunked `Media` step renderer (§5.3 & §18 Phase 3):
 * Accessible `<video controls>` with `<track kind="captions">` + transcript `<details>` or `<img>`.
 */
@RegisterClass(BaseTourStepRenderer, 'Media')
@Component({
  selector: 'mj-tour-media-step',
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
        (Dismiss)="OnDismiss()"
      />

      @if (Step.Body) {
        <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(Step.Body)"></div>
      }

      @if (SourceUrl) {
        <div class="mjt-media-frame">
          @if (IsVideo) {
            <video
              class="mjt-media-video"
              controls
              playsinline
              [attr.src]="SourceUrl"
              [attr.poster]="PosterUrl || null"
              [attr.aria-label]="AltText"
              (ended)="OnMediaEnded()"
            >
              @if (CaptionsUrl) {
                <track kind="captions" [attr.src]="CaptionsUrl" srclang="en" label="English captions" default />
              }
            </video>
          } @else {
            <img class="mjt-media-img" [attr.src]="SourceUrl" [attr.alt]="AltText" />
          }
        </div>
      }

      @if (Transcript) {
        <details class="mjt-transcript">
          <summary>Transcript</summary>
          <p>{{ Transcript }}</p>
        </details>
      }

      <div class="mjt-footer">
        <div class="mjt-footer-meta">
          <mj-tour-progress-rail
            [Session]="Session"
            (StepSelected)="StepSelected.emit($event)"
          />
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
            Dismiss
          </button>
        </div>
      </div>
    </div>
  `,
})
export class MediaStepRenderer extends BaseTourStepRenderer<IMediaStepConfig> {
  public get IsVideo(): boolean {
    return this.Step?.Configuration?.MediaType === 'video';
  }

  public get SourceUrl(): string {
    return this.Step?.Configuration?.SourceUrl ?? '';
  }

  public get CaptionsUrl(): string | undefined {
    return this.Step?.Configuration?.CaptionsUrl;
  }

  public get PosterUrl(): string | undefined {
    return this.Step?.Configuration?.PosterUrl;
  }

  public get AltText(): string {
    return this.Step?.Configuration?.AltText ?? this.Step?.Title ?? 'Tour media';
  }

  public get Transcript(): string | undefined {
    const cfg = this.Step?.Configuration as (IMediaStepConfig & { Transcript?: string }) | undefined;
    return cfg?.Transcript;
  }

  public get NextLabel(): string {
    return this.Step?.Configuration?.NextButtonText ?? 'Continue';
  }

  public OnMediaEnded(): void {
    const signalKey = `tours.media.ended.${this.Step.StepKey}`;
    TourSignals.Instance.Emit(signalKey, { StepKey: this.Step.StepKey });
    this.SignalEmitted.emit({ StepKey: this.Step.StepKey, SignalKey: signalKey });
    if (this.Step?.Configuration?.AutoAdvanceOnEnd) {
      this.NextRequested.emit({ StepKey: this.Step.StepKey });
    }
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

export function EnsureMediaStepRendererRegistered(): void {
  // Keeps @RegisterClass side effect intact in the lazy chunk
}

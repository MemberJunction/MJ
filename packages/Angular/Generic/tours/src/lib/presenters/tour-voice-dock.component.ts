import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  TemplateRef,
  ViewEncapsulation,
} from '@angular/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { TourSessionView } from '@memberjunction/tours-runtime';

/**
 * Template context exposed to host-projected `VoiceBarTemplate` inside `.mjt-voice-dock`.
 */
export interface TourVoiceBarContext {
  $implicit: TourSessionView;
  OnDemonstrate: () => void;
  OnConfirmMutation: () => void;
  OnCancelMutation: () => void;
}

/**
 * Embedded Sage dock rendered inside the active tour card footer and SidePanel bottom slot.
 * Renders:
 * 1. Inline confirmation bar when `Session.PendingDemonstrationConfirmation` is active
 * 2. Projected `VoiceBarTemplate` when `VoiceGuideActive && VoiceBarTemplate`
 * 3. Compact `"Walk through with Sage"` opt-in button when `VoiceGuideAvailable && !VoiceGuideActive`
 */
@Component({
  selector: 'mj-tour-voice-dock',
  standalone: true,
  imports: [NgTemplateOutlet, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (HasDockContent) {
      <div class="mjt-voice-dock">
        @if (Session?.PendingDemonstrationConfirmation; as pendingConfirm) {
          <div class="mjt-confirm-bar" role="alertdialog" aria-live="assertive" [attr.aria-label]="'Confirm Sage action'">
            <div>{{ pendingConfirm.Prompt }}</div>
            <div class="mjt-confirm-actions">
              <button
                type="button"
                mjButton
                Variant="primary"
                Size="sm"
                (click)="ConfirmMutation.emit()"
              >
                Confirm
              </button>
              <button
                type="button"
                mjButton
                Variant="secondary"
                Size="sm"
                (click)="CancelMutation.emit()"
              >
                Cancel
              </button>
            </div>
          </div>
        }

        @if (VoiceGuideActive && VoiceBarTemplate && Session) {
          <ng-container *ngTemplateOutlet="VoiceBarTemplate; context: BuildContext(Session)" />
        } @else if (ShowOptInButton) {
          <button
            type="button"
            class="mjt-sage-launch-btn"
            (click)="VoiceGuideRequested.emit(true)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            <span>Walk through with Sage</span>
          </button>
        }
      </div>
    }
  `,
})
export class TourVoiceDockComponent {
  @Input() public Session: TourSessionView | null = null;
  @Input() public VoiceBarTemplate: TemplateRef<TourVoiceBarContext> | null = null;
  @Input() public VoiceGuideAvailable = false;
  @Input() public VoiceGuideActive = false;

  @Output() public VoiceGuideRequested = new EventEmitter<boolean>();
  @Output() public DemonstrateRequested = new EventEmitter<{ ConfirmedMutation?: boolean }>();
  @Output() public ConfirmMutation = new EventEmitter<void>();
  @Output() public CancelMutation = new EventEmitter<void>();

  /** Welcome hero modals already display the Self-Paced vs Walk through with Sage cards inline. */
  public get ShowOptInButton(): boolean {
    if (!this.VoiceGuideAvailable || this.VoiceGuideActive) {
      return false;
    }
    const step = this.Session?.CurrentStep;
    if (step?.StepType === 'Modal') {
      const cfg = (step.Configuration ?? {}) as { Variant?: string };
      if (!cfg.Variant || cfg.Variant === 'welcome') {
        return false;
      }
    }
    return true;
  }

  public get HasDockContent(): boolean {
    if (this.Session?.PendingDemonstrationConfirmation) {
      return true;
    }
    if (this.VoiceGuideActive && this.VoiceBarTemplate && this.Session) {
      return true;
    }
    return this.ShowOptInButton;
  }

  public BuildContext(session: TourSessionView): TourVoiceBarContext {
    return {
      $implicit: session,
      OnDemonstrate: () => this.DemonstrateRequested.emit({}),
      OnConfirmMutation: () => this.ConfirmMutation.emit(),
      OnCancelMutation: () => this.CancelMutation.emit(),
    };
  }
}

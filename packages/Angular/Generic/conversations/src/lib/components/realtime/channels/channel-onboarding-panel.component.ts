import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { ChannelOnboardingDetails } from './base-realtime-channel-client';

/**
 * The FIRST-RUN INTRO overlay for an interactive channel — a generic, channel-agnostic card
 * the surface panel floats over a channel's pane the very first time a user opens that channel
 * (whiteboard, remote browser, …). It renders whatever {@link ChannelOnboardingDetails} the
 * channel plugin supplied (icon · heading · description · optional tips) and a single "Got it"
 * action plus a small ✕ — both emit {@link Dismissed}, which the host uses to mark the channel
 * seen (per user, via the user's settings) and hide the panel.
 *
 * This component owns NO persistence or channel knowledge: it's a pure presenter wired by
 * `RealtimeSurfaceTabsComponent`, so it stays reusable for any current or future channel. When
 * {@link Content} is `null` it renders nothing (the host already gates on that, but the guard
 * keeps the component safe to drop in unconditionally).
 */
@Component({
  standalone: true,
  selector: 'mj-channel-onboarding-panel',
  imports: [MJButtonDirective],
  template: `
    @if (Content; as content) {
      <div class="onboarding" role="dialog" aria-modal="false" [attr.aria-label]="content.Heading">
        <div class="onboarding__card">
          <button type="button"
                  class="onboarding__close"
                  (click)="Dismissed.emit()"
                  title="Dismiss"
                  aria-label="Dismiss">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>

          @if (content.IconClass) {
            <div class="onboarding__icon" aria-hidden="true">
              <i [class]="content.IconClass"></i>
            </div>
          }

          <h3 class="onboarding__heading">{{ content.Heading }}</h3>
          <p class="onboarding__description">{{ content.Description }}</p>

          @if (content.Tips?.length) {
            <ul class="onboarding__tips">
              @for (tip of content.Tips; track tip) {
                <li class="onboarding__tip">
                  <i class="fa-solid fa-check" aria-hidden="true"></i>
                  <span>{{ tip }}</span>
                </li>
              }
            </ul>
          }

          <div class="onboarding__actions">
            <button mjButton [variant]="'primary'" type="button" (click)="Dismissed.emit()">
              Got it
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      position: absolute;
      inset: 0;
      display: block;
      z-index: 5;
    }
    .onboarding {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      /* Translucent backdrop over the channel pane — token-derived, no hardcoded colors. */
      background: color-mix(in srgb, var(--mj-bg-overlay) 55%, transparent);
    }
    .onboarding__card {
      position: relative;
      width: 100%;
      max-width: 24rem;
      padding: 1.75rem 1.5rem 1.5rem;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg, 12px);
      background: var(--mj-bg-surface);
      box-shadow: 0 12px 32px color-mix(in srgb, var(--mj-bg-overlay) 35%, transparent);
      text-align: center;
    }
    .onboarding__close {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      width: 1.75rem;
      height: 1.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: var(--mj-radius-full, 999px);
      background: transparent;
      color: var(--mj-text-muted);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .onboarding__close:hover {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
    }
    .onboarding__icon {
      width: 3rem;
      height: 3rem;
      margin: 0 auto 0.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--mj-radius-full, 999px);
      font-size: 1.35rem;
      color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface-card));
    }
    .onboarding__heading {
      margin: 0 0 0.4rem;
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--mj-text-primary);
    }
    .onboarding__description {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.45;
      color: var(--mj-text-secondary);
    }
    .onboarding__tips {
      margin: 1rem 0 0;
      padding: 0;
      list-style: none;
      text-align: left;
    }
    .onboarding__tip {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.3rem 0;
      font-size: 0.85rem;
      line-height: 1.4;
      color: var(--mj-text-secondary);
    }
    .onboarding__tip i {
      margin-top: 0.18rem;
      font-size: 0.75rem;
      color: var(--mj-brand-primary);
    }
    .onboarding__actions {
      margin-top: 1.25rem;
      display: flex;
      justify-content: center;
    }
  `]
})
export class ChannelOnboardingPanelComponent {
  /** The intro content to present, or `null` to render nothing. */
  @Input() Content: ChannelOnboardingDetails | null = null;

  /** Emitted when the user dismisses the intro (the "Got it" button or the ✕). */
  @Output() Dismissed = new EventEmitter<void>();
}

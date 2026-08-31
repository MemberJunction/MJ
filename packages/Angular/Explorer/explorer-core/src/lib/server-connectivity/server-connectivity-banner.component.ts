import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { trigger, transition, style, animate, AnimationEvent } from '@angular/animations';
import { ServerConnectivityService } from '../services/server-connectivity.service';

/**
 * When visible, this banner sets --mj-connectivity-banner-height on <html>
 * so that any position:fixed element referencing the shell header offset
 * (e.g. app-switcher mobile dropdown) can account for the banner.
 */
@Component({
  selector: 'mj-server-connectivity-banner',
  standalone: true,
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ height: 0, opacity: 0, overflow: 'hidden' }),
        animate('300ms ease-out', style({ height: '*', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ height: 0, opacity: 0, overflow: 'hidden' }))
      ])
    ])
  ],
  template: `
    @if (!IsConnected()) {
      <div class="connectivity-banner" @slideDown (@slideDown.done)="OnAnimationDone($event)">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Server unavailable &mdash; viewing cached data. Some features may not work.</span>
      </div>
    }
  `,
  styles: [`
    :host {
      flex-shrink: 0;
      width: 100%;
    }

    .connectivity-banner {
      background: var(--mj-status-warning-bg);
      color: var(--mj-status-warning-text);
      border-bottom: 2px solid var(--mj-status-warning-border);
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
    }

    .connectivity-banner i {
      font-size: 16px;
      flex-shrink: 0;
    }

    .connectivity-banner span {
      text-align: center;
    }

    @media (max-width: 480px) {
      .connectivity-banner {
        padding: 6px 12px;
        font-size: 13px;
      }
    }
  `]
})
export class ServerConnectivityBannerComponent implements OnDestroy {
  private static readonly CSS_VAR = '--mj-connectivity-banner-height';

  private readonly connectivityService = inject(ServerConnectivityService);

  /**
   * Connectivity state as a **signal**, not a plain property — and that distinction is the
   * whole point of this shape.
   *
   * The socket state that feeds `IsConnected$` is reported by graphql-ws, which can announce
   * a drop from a callback that lands *inside* an in-flight change-detection pass (during app
   * startup this reliably happens after the banner's own view has been checked). Assigning a
   * plain property there mutates state the `@if` was already evaluated against, so dev-mode
   * check-no-changes reports `NG0100 ... Previous value: '-1'` — `-1` being the `@if` branch
   * index for "no branch rendered". Reading a signal from the template instead registers the
   * view as its consumer, so a write marks the view dirty and Angular re-refreshes it within
   * the same pass; the DOM and the expression can no longer disagree.
   *
   * `toSignal` also owns the subscription lifetime via `DestroyRef`, so there is no manual
   * `Subscription` to unsubscribe.
   */
  public readonly IsConnected = toSignal(this.connectivityService.IsConnected$, { initialValue: true });

  ngOnDestroy(): void {
    this.setBannerHeight(0);
  }

  /** After the enter/leave animation finishes, publish the banner height as a CSS custom property */
  OnAnimationDone(event: AnimationEvent): void {
    if (event.toState === 'void') {
      this.setBannerHeight(0);
    } else {
      const height = (event.element as HTMLElement).offsetHeight;
      this.setBannerHeight(height);
    }
  }

  private setBannerHeight(px: number): void {
    document.documentElement.style.setProperty(
      ServerConnectivityBannerComponent.CSS_VAR,
      `${px}px`
    );
  }
}

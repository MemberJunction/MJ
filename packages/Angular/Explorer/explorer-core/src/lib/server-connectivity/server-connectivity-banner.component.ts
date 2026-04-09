import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ServerConnectivityService } from '../services/server-connectivity.service';

@Component({
  selector: 'mj-server-connectivity-banner',
  standalone: true,
  template: `
    @if (!IsConnected) {
      <div class="connectivity-banner">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Server unavailable &mdash; viewing cached data. Some features may not work.</span>
      </div>
    }
  `,
  styles: [`
    .connectivity-banner {
      position: fixed;
      top: 56px;
      left: 0;
      right: 0;
      z-index: 9998;
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
      animation: connectivity-slide-down 0.3s ease-out;
    }

    .connectivity-banner i {
      font-size: 16px;
    }

    @keyframes connectivity-slide-down {
      0% {
        transform: translateY(-100%);
        opacity: 0;
      }
      100% {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `]
})
export class ServerConnectivityBannerComponent implements OnInit, OnDestroy {
  public IsConnected = true;
  private subscription: Subscription | undefined;

  constructor(private connectivityService: ServerConnectivityService) {}

  ngOnInit(): void {
    this.subscription = this.connectivityService.IsConnected$.subscribe(connected => {
      this.IsConnected = connected;
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}

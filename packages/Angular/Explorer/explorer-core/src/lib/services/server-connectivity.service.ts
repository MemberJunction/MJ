import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Polls MJAPI's /healthcheck endpoint and exposes connectivity state.
 *
 * Start polling after workspace initialization with `Start(healthCheckUrl)`.
 * Subscribe to `IsConnected$` for reactive updates.
 *
 * Rules:
 *  - 2 consecutive failures -> disconnected
 *  - 1 success -> connected
 *  - Pauses when tab is hidden, checks immediately on focus
 */
@Injectable({
  providedIn: 'root'
})
export class ServerConnectivityService implements OnDestroy {
  private static readonly POLL_INTERVAL_CONNECTED_MS = 30_000;
  private static readonly POLL_INTERVAL_DISCONNECTED_MS = 10_000;
  private static readonly FETCH_TIMEOUT_MS = 5_000;
  private static readonly FAILURES_BEFORE_DISCONNECT = 2;

  private readonly isConnected = new BehaviorSubject<boolean>(true);
  public readonly IsConnected$: Observable<boolean> = this.isConnected.asObservable();

  private healthCheckUrl: string | null = null;
  private consecutiveFailures = 0;
  private pollingTimerId: ReturnType<typeof setTimeout> | null = null;
  private boundVisibilityHandler: (() => void) | null = null;

  /** Synchronous getter for the current connectivity state */
  public get IsConnected(): boolean {
    return this.isConnected.value;
  }

  /**
   * Begin polling the health check endpoint.
   * Call once after workspace initialization succeeds.
   */
  public Start(healthCheckUrl: string): void {
    if (this.healthCheckUrl) {
      this.Stop(); // idempotent restart
    }
    this.healthCheckUrl = healthCheckUrl;
    this.consecutiveFailures = 0;
    this.isConnected.next(true);

    this.attachVisibilityListener();
    this.scheduleNextPoll();
  }

  /** Stop polling and clean up resources */
  public Stop(): void {
    this.clearPollTimer();
    this.detachVisibilityListener();
    this.healthCheckUrl = null;
  }

  /** Force an immediate health check and return the result */
  public async CheckNow(): Promise<boolean> {
    if (!this.healthCheckUrl) {
      return this.isConnected.value;
    }
    const reachable = await this.ping();
    this.applyPingResult(reachable);
    return this.isConnected.value;
  }

  ngOnDestroy(): void {
    this.Stop();
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async ping(): Promise<boolean> {
    if (!this.healthCheckUrl) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      ServerConnectivityService.FETCH_TIMEOUT_MS
    );

    try {
      const response = await fetch(this.healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private applyPingResult(reachable: boolean): void {
    if (reachable) {
      this.onPingSuccess();
    } else {
      this.onPingFailure();
    }
  }

  private onPingSuccess(): void {
    this.consecutiveFailures = 0;
    if (!this.isConnected.value) {
      this.isConnected.next(true);
      LogStatus('Server connectivity restored');
    }
  }

  private onPingFailure(): void {
    this.consecutiveFailures++;
    if (
      this.isConnected.value &&
      this.consecutiveFailures >= ServerConnectivityService.FAILURES_BEFORE_DISCONNECT
    ) {
      this.isConnected.next(false);
      LogError(`Server connectivity lost after ${this.consecutiveFailures} consecutive failures`);
    }
  }

  private scheduleNextPoll(): void {
    this.clearPollTimer();

    // Don't poll while the tab is hidden — we'll check on focus
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    const interval = this.isConnected.value
      ? ServerConnectivityService.POLL_INTERVAL_CONNECTED_MS
      : ServerConnectivityService.POLL_INTERVAL_DISCONNECTED_MS;

    this.pollingTimerId = setTimeout(async () => {
      await this.CheckNow();
      this.scheduleNextPoll();
    }, interval);
  }

  private clearPollTimer(): void {
    if (this.pollingTimerId != null) {
      clearTimeout(this.pollingTimerId);
      this.pollingTimerId = null;
    }
  }

  private attachVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    this.boundVisibilityHandler = () => this.onVisibilityChange();
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
  }

  private detachVisibilityListener(): void {
    if (this.boundVisibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      this.boundVisibilityHandler = null;
    }
  }

  private onVisibilityChange(): void {
    if (!this.healthCheckUrl) return;

    if (document.hidden) {
      this.clearPollTimer();
    } else {
      // Tab became visible — check immediately, then resume polling
      this.CheckNow().then(() => this.scheduleNextPoll());
    }
  }
}

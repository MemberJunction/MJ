import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { LogError, LogStatus } from '@memberjunction/core';
import { GraphQLDataProvider, SocketConnectionState } from '@memberjunction/graphql-dataprovider';

/**
 * Monitors MJAPI connectivity.
 *
 * Primary signal is the GraphQLDataProvider's WebSocket state (graphql-ws).
 * When the socket emits 'disconnected' (retries already exhausted by graphql-ws),
 * we fall back to polling /healthcheck until it returns 200, then force a socket
 * reconnect so the next subscription picks up a fresh client.
 *
 * 'unknown' (no active socket — either never opened or cleanly disposed) is
 * treated as healthy: absence of signal is not a signal of failure.
 */
@Injectable({
  providedIn: 'root'
})
export class ServerConnectivityService implements OnDestroy {
  private static readonly POLL_INTERVAL_MS = 30_000;
  private static readonly FETCH_TIMEOUT_MS = 5_000;

  private readonly isConnected = new BehaviorSubject<boolean>(true);
  public readonly IsConnected$: Observable<boolean> = this.isConnected.asObservable();

  private healthCheckUrl: string | null = null;
  private pollingTimerId: ReturnType<typeof setTimeout> | null = null;
  private socketSubscription: Subscription | null = null;
  private boundVisibilityHandler: (() => void) | null = null;

  /** Synchronous getter for the current connectivity state */
  public get IsConnected(): boolean {
    return this.isConnected.value;
  }

  /**
   * Begin monitoring connectivity.
   * Subscribes to the graphql-ws socket state and only polls /healthcheck
   * while the socket reports 'disconnected'.
   */
  public Start(healthCheckUrl: string): void {
    if (this.healthCheckUrl) {
      this.Stop(); // idempotent restart
    }
    this.healthCheckUrl = healthCheckUrl;
    this.isConnected.next(true);

    this.attachVisibilityListener();
    this.subscribeToSocketState();
  }

  /** Stop monitoring and clean up resources */
  public Stop(): void {
    this.clearPollTimer();
    this.detachVisibilityListener();
    if (this.socketSubscription) {
      this.socketSubscription.unsubscribe();
      this.socketSubscription = null;
    }
    this.healthCheckUrl = null;
  }

  /** Force an immediate health check and return the result */
  public async CheckNow(): Promise<boolean> {
    if (!this.healthCheckUrl) {
      return this.isConnected.value;
    }
    await this.runHealthCheck();
    return this.isConnected.value;
  }

  ngOnDestroy(): void {
    this.Stop();
  }

  // ── Private helpers ──────────────────────────────────────────────

  private subscribeToSocketState(): void {
    const provider = GraphQLDataProvider.Instance;
    if (!provider) {
      LogError('ServerConnectivityService: GraphQLDataProvider instance not available');
      return;
    }
    this.socketSubscription = provider.SocketConnectivity$.subscribe(state => {
      this.onSocketStateChange(state);
    });
  }

  private onSocketStateChange(state: SocketConnectionState): void {
    if (state === 'disconnected') {
      if (this.isConnected.value) {
        this.isConnected.next(false);
        LogError('Server connectivity lost (WebSocket closed)');
      }
      this.scheduleNextPoll();
    } else {
      // 'connected' or 'unknown' — treat as healthy
      this.clearPollTimer();
      if (!this.isConnected.value) {
        this.isConnected.next(true);
        LogStatus('Server connectivity restored (WebSocket reconnected)');
      }
    }
  }

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

  private async runHealthCheck(): Promise<void> {
    const reachable = await this.ping();
    if (reachable) {
      this.clearPollTimer();
      if (!this.isConnected.value) {
        this.isConnected.next(true);
        LogStatus('Server connectivity restored (/healthcheck OK)');
      }
      // Dispose the stale socket so the next subscription creates a fresh client
      GraphQLDataProvider.Instance?.ForceSocketReconnect();
    } else {
      // Still unreachable — schedule another poll
      this.scheduleNextPoll();
    }
  }

  private scheduleNextPoll(): void {
    this.clearPollTimer();

    // Don't poll while the tab is hidden — we'll check on focus
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    this.pollingTimerId = setTimeout(
      () => this.runHealthCheck(),
      ServerConnectivityService.POLL_INTERVAL_MS
    );
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
    } else if (!this.isConnected.value) {
      // Tab became visible while disconnected — check immediately
      this.runHealthCheck();
    }
  }
}

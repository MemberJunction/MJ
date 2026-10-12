import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, distinctUntilChanged, map } from 'rxjs';
import { LogError, LogStatus } from '@memberjunction/core';
import { GraphQLDataProvider, SocketConnectionState } from '@memberjunction/graphql-dataprovider';

/**
 * Monitors MJAPI connectivity.
 *
 * The WebSocket state (graphql-ws) is the ONLY signal that clears the warning. When the socket
 * emits 'disconnected' we poll /healthcheck, but a 200 there only triggers a reconnect attempt —
 * it never reports connectivity as restored on its own. HTTP reachability and socket liveness are
 * different properties, and trusting the first for the second is the defect behind MJ #4222.
 *
 * 'unknown' (no active socket — either never opened or cleanly disposed) is
 * treated as healthy: absence of signal is not a signal of failure.
 *
 * While degraded, {@link ConnectionState$} says WHY (MJ #5510). On a drop the service probes
 * /healthcheck once, straight away, and classifies the answer — a server whose event loop is stalled
 * is busy, not down, and telling users it is down sends them to refresh, which queues a full boot
 * onto the loop the moment it frees up. That probe only classifies: it never forces a reconnect or
 * clears the warning, so the rule above (only a real 'connected' ends an outage) still holds.
 */
export type ServerConnectionState =
  /** The socket is up, or there is none and nothing says the server is down. */
  | 'connected'
  /** The socket dropped but /healthcheck answers: the server is up and the socket is re-establishing. */
  | 'reconnecting'
  /** /healthcheck accepted the request but did not answer in time: the server is up and stalled. */
  | 'busy'
  /** /healthcheck was refused or answered with an error status: the server (or its front end) is down. */
  | 'unavailable';

/** What one /healthcheck probe found. */
type ProbeOutcome = 'answered' | 'timed-out' | 'failed';

@Injectable({
  providedIn: 'root'
})
export class ServerConnectivityService implements OnDestroy {
  private static readonly POLL_INTERVAL_MS = 30_000;
  private static readonly FETCH_TIMEOUT_MS = 5_000;

  private readonly connectionState = new BehaviorSubject<ServerConnectionState>('connected');
  /** Why the server is or is not reachable — drives the banner text. */
  public readonly ConnectionState$: Observable<ServerConnectionState> = this.connectionState.asObservable();
  /** `true` only in the 'connected' state. Kept for consumers that need just the yes/no. */
  public readonly IsConnected$: Observable<boolean> = this.connectionState.pipe(
    map((state) => state === 'connected'),
    distinctUntilChanged()
  );

  private healthCheckUrl: string | null = null;
  private pollingTimerId: ReturnType<typeof setTimeout> | null = null;
  private socketSubscription: Subscription | null = null;
  private boundVisibilityHandler: (() => void) | null = null;
  /**
   * Sticky once the socket reports a drop, cleared only by a real 'connected'. Without it the
   * transient 'unknown' emitted by our own ForceSocketReconnect() reads as recovery.
   */
  private degraded = false;

  /** Synchronous getter for the current connectivity state */
  public get IsConnected(): boolean {
    return this.connectionState.value === 'connected';
  }

  /** Synchronous getter for the current connection state */
  public get ConnectionState(): ServerConnectionState {
    return this.connectionState.value;
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
    this.degraded = false;
    this.connectionState.next('connected');

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
      return this.IsConnected;
    }
    await this.runHealthCheck();
    return this.IsConnected;
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
      const wasConnected = this.IsConnected;
      this.degraded = true;
      if (wasConnected) {
        // Most drops are a socket re-establishing; the classifying probe below corrects this
        // within FETCH_TIMEOUT_MS if the server is in fact stalled or down.
        this.connectionState.next('reconnecting');
        LogError('Server connectivity lost (WebSocket closed)');
        void this.classifyDrop();
      }
      this.scheduleNextPoll();
      return;
    }

    if (state === 'connected') {
      // The only signal that ends a known outage: frames can flow again.
      this.degraded = false;
      this.clearPollTimer();
      if (!this.IsConnected) {
        this.connectionState.next('connected');
        LogStatus('Server connectivity restored (WebSocket reconnected)');
      }
      return;
    }

    // 'unknown' — there is no socket at all. Absence of signal is not a signal of failure at
    // startup, so it stays healthy there. But it must NOT read as recovery once we already know
    // we are degraded: the poll calls ForceSocketReconnect(), which disposes the client and emits
    // exactly this state, so treating it as healthy let the service clear its own warning on a
    // socket it had just thrown away. Keep the warning and keep polling until a real 'connected'.
    if (this.degraded) {
      this.scheduleNextPoll();
      return;
    }
    this.clearPollTimer();
    if (!this.IsConnected) {
      this.connectionState.next('connected');
    }
  }

  /**
   * The immediate probe on a drop. Classifies only — no reconnect, no clearing — and drops its
   * result if the socket recovered (or the service stopped) while the probe was in flight.
   */
  private async classifyDrop(): Promise<void> {
    const outcome = await this.ping();
    if (this.degraded && this.healthCheckUrl) {
      this.connectionState.next(ServerConnectivityService.stateFor(outcome));
    }
  }

  private static stateFor(outcome: ProbeOutcome): ServerConnectionState {
    switch (outcome) {
      case 'answered':
        return 'reconnecting';
      case 'timed-out':
        return 'busy';
      default:
        return 'unavailable';
    }
  }

  /**
   * Probe /healthcheck. A timeout is told apart from a failure because they mean different things:
   * a refused connection or an error status fails fast (down), while a stalled MJAPI still has its
   * TCP connections accepted by the kernel and simply never answers (busy).
   */
  private async ping(): Promise<ProbeOutcome> {
    if (!this.healthCheckUrl) return 'failed';

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ServerConnectivityService.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(this.healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      return response.ok ? 'answered' : 'failed';
    } catch {
      return timedOut ? 'timed-out' : 'failed';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async runHealthCheck(): Promise<void> {
    const outcome = await this.ping();
    if (this.degraded) {
      this.connectionState.next(ServerConnectivityService.stateFor(outcome));
    }
    if (outcome === 'answered') {
      // Reachable over HTTP is a cue to retry the socket, NOT evidence the socket works.
      //
      // An HTTP 200 says the server process answers requests. It says nothing about whether
      // this browser's WebSocket can carry frames, and the two genuinely diverge: a half-open
      // socket (MJ #4222) leaves HTTP perfectly healthy while every push is dropped. Declaring
      // "restored" here cleared the banner while the push channel was still dead, and — because
      // the forced reconnect then failed — the banner reappeared moments later, flickering
      // instead of steadily warning.
      //
      // So ask for a reconnect and keep polling. The banner clears only when the socket itself
      // reports 'connected', through onSocketStateChange.
      const provider = GraphQLDataProvider.Instance;
      provider?.ForceSocketReconnect();

      // The one case where HTTP health is the whole truth: nothing is subscribed. The socket is
      // created lazily by the next subscription, so on a screen that opens none no 'connected'
      // can arrive and the warning would be stranded for the rest of the session — while no push
      // is being missed. A subscription opened later against a socket that is still down emits
      // 'disconnected' and raises the warning again.
      if (provider && provider.ActiveSubscriptionCount === 0) {
        this.degraded = false;
        this.clearPollTimer();
        if (!this.IsConnected) {
          this.connectionState.next('connected');
          LogStatus('Server connectivity restored (HTTP healthy, no active subscriptions)');
        }
        return;
      }

      this.scheduleNextPoll();
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
    } else if (!this.IsConnected) {
      // Tab became visible while disconnected — check immediately
      this.runHealthCheck();
    }
  }
}

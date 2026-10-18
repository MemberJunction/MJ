import type { Observable, Subscription } from 'rxjs';
import type { RealtimeSessionEvent, UnknownRealtimeSessionEvent } from '@memberjunction/ai-core-plus';

/** An event a session delivers: a known, typed one, or an app-defined one the runtime does not interpret. */
export type RealtimeSessionStreamEvent = RealtimeSessionEvent | UnknownRealtimeSessionEvent;

/** The slice of a verification status read the hub needs to recover a missed `identity.verified`. */
export interface RealtimeSessionVerificationSnapshot {
  VerificationState: 'unverified' | 'pending' | 'verified';
  VerifiedEmail?: string;
  VerifiedAt?: string;
  MaxSessionDeadlineIso?: string;
}

/**
 * Where session events come from — the transport seam. `GraphQLRealtimeSessionClient`
 * (`@memberjunction/graphql-dataprovider`) satisfies this structurally; a host on another transport
 * supplies its own.
 */
export interface IRealtimeSessionEventSource {
  /** Opens the session's event stream. It completes when the transport recycles (e.g. a token refresh). */
  SubscribeToSessionEvents(agentSessionId: string): Observable<RealtimeSessionStreamEvent>;
  /** Reads the session's verification state once — the durable backstop for an event missed while away. Never throws. */
  GetVerificationStatus(agentSessionId: string): Promise<RealtimeSessionVerificationSnapshot>;
}

/** Tuning for {@link RealtimeSessionEventHub}'s reconnect loop. */
export interface RealtimeSessionEventHubOptions {
  /** Consecutive failed/short-lived subscriptions tolerated before the hub gives up. Default 6. */
  MaxReconnectAttempts?: number;
  /** First reconnect delay; doubles per consecutive attempt up to {@link MaxBackoffMs}. Default 1000. */
  BaseBackoffMs?: number;
  /** Ceiling of the reconnect delay. Default 15000. */
  MaxBackoffMs?: number;
  /** A subscription that lived at least this long counts as healthy and resets the attempt counter. Default 30000. */
  StableAfterMs?: number;
}

const DEFAULTS: Required<RealtimeSessionEventHubOptions> = {
  MaxReconnectAttempts: 6,
  BaseBackoffMs: 1000,
  MaxBackoffMs: 15_000,
  StableAfterMs: 30_000
};

/**
 * Keeps one session's event stream open for the session's life and delivers every event to a sink.
 *
 * The stream is a long-lived subscription that ends when the transport recycles its connection (token
 * refresh, network blip) — and delivery has no replay, so an event published during the gap is gone.
 * The hub therefore, on every re-subscribe: opens the new subscription FIRST (so nothing published
 * from now on is missed), THEN reads the verification status once, and if the person verified while the
 * hub was away, delivers the `identity.verified` event it missed (marked `Recovered`).
 *
 * Reconnects are capped: a stream that keeps failing is given up on (once, loudly) rather than retried
 * forever; a stream that stayed up long enough counts as healthy and resets the cap.
 *
 * Framework-agnostic and clock-driven by `setTimeout`, so tests drive it with fake timers.
 */
export class RealtimeSessionEventHub {
  private readonly options: Required<RealtimeSessionEventHubOptions>;
  private sessionId: string | null = null;
  private subscription: Subscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private verifiedDelivered = false;
  /** Bumped by every Start/Stop so a late callback from a previous run can tell it is stale. */
  private generation = 0;

  constructor(
    private readonly source: IRealtimeSessionEventSource,
    private readonly deliver: (event: RealtimeSessionStreamEvent) => void,
    options: RealtimeSessionEventHubOptions = {}
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Whether the hub currently has (or is about to re-open) a subscription. */
  public get IsRunning(): boolean {
    return this.sessionId !== null;
  }

  /** Opens the stream for `agentSessionId`. Replaces any run in progress. */
  public Start(agentSessionId: string): void {
    this.Stop();
    this.sessionId = agentSessionId;
    this.attempts = 0;
    this.verifiedDelivered = false;
    this.connect(false);
  }

  /** Closes the stream and cancels any pending reconnect. Safe to call when not running. */
  public Stop(): void {
    this.generation++;
    this.sessionId = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private connect(isReconnect: boolean): void {
    const sessionId = this.sessionId;
    if (sessionId === null) {
      return;
    }
    const generation = this.generation;
    const openedAt = Date.now();
    this.subscription?.unsubscribe();
    try {
      this.subscription = this.source.SubscribeToSessionEvents(sessionId).subscribe({
        next: (event) => this.onEvent(generation, event),
        error: (error: unknown) => {
          console.warn('[RealtimeSession] The session event stream failed:', error);
          this.onStreamEnded(generation, openedAt);
        },
        complete: () => this.onStreamEnded(generation, openedAt)
      });
    } catch (error) {
      console.warn('[RealtimeSession] Could not open the session event stream:', error);
      this.onStreamEnded(generation, openedAt);
      return;
    }
    if (isReconnect) {
      void this.recoverMissedVerification(generation, sessionId);
    }
  }

  private onEvent(generation: number, event: RealtimeSessionStreamEvent): void {
    if (generation !== this.generation) {
      return;
    }
    if (event.Type === 'identity.verified') {
      this.verifiedDelivered = true;
    }
    this.deliver(event);
  }

  private onStreamEnded(generation: number, openedAt: number): void {
    if (generation !== this.generation || this.sessionId === null) {
      return;
    }
    if (Date.now() - openedAt >= this.options.StableAfterMs) {
      this.attempts = 0;
    }
    this.attempts++;
    if (this.attempts > this.options.MaxReconnectAttempts) {
      console.error(
        `[RealtimeSession] The session event stream for ${this.sessionId} kept ending; giving up after ${this.options.MaxReconnectAttempts} attempts. ` +
          'Session events (such as identity verification) will not arrive until the next session.'
      );
      this.sessionId = null;
      this.subscription = null;
      return;
    }
    const delay = Math.min(this.options.BaseBackoffMs * 2 ** (this.attempts - 1), this.options.MaxBackoffMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (generation === this.generation) {
        this.connect(true);
      }
    }, delay);
  }

  /** Reads the verification status once and delivers the `identity.verified` event the hub missed, if any. */
  private async recoverMissedVerification(generation: number, sessionId: string): Promise<void> {
    if (this.verifiedDelivered) {
      return;
    }
    let status: RealtimeSessionVerificationSnapshot;
    try {
      status = await this.source.GetVerificationStatus(sessionId);
    } catch (error) {
      console.warn('[RealtimeSession] Could not read the verification status after reconnecting:', error);
      return;
    }
    if (generation !== this.generation || this.verifiedDelivered) {
      return; // stopped, restarted, or the live event arrived while the status was in flight
    }
    if (status.VerificationState !== 'verified' || !status.VerifiedEmail || !status.VerifiedAt) {
      return;
    }
    this.verifiedDelivered = true;
    this.deliver({
      Type: 'identity.verified',
      AgentSessionID: sessionId,
      OccurredAt: status.VerifiedAt,
      Payload: {
        VerifiedEmail: status.VerifiedEmail,
        VerifiedName: '',
        VerifiedAt: status.VerifiedAt,
        Method: 'link',
        ...(status.MaxSessionDeadlineIso ? { MaxSessionDeadlineIso: status.MaxSessionDeadlineIso } : {}),
        Recovered: true
      }
    });
  }
}

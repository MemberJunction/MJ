import { BehaviorSubject, Observable, Subscription, exhaustMap, from, timer } from 'rxjs';
import type { LiveKitRoomTurnState, LiveKitRoomTurnStateResult } from '@memberjunction/graphql-dataprovider';

/** How often the room's turn-taking state is refreshed by default. */
export const TURN_POLL_DEFAULT_INTERVAL_MS = 1000;

/** The fastest the poller will run — a guard against a tiny configured interval hammering the server. */
export const TURN_POLL_MIN_INTERVAL_MS = 250;

/** Fetches a room's turn-taking state (in the app: `GraphQLLiveKitClient.GetRoomTurnState`). */
export type TurnStateFetcher = (roomName: string) => Promise<LiveKitRoomTurnStateResult>;

/**
 * Keeps one room's live turn-taking state fresh by polling. A new request is only issued once the previous one
 * has settled (so a slow server is never piled onto), a failed poll keeps the last good state and records the
 * error, and `Stop` cancels anything in flight so a late reply can never resurrect a closed panel.
 *
 * Polling — not a subscription — because the state is read-only and the transport-layer pattern for a
 * server-to-client signal this small is a typed query. See `GraphQLLiveKitClient.GetRoomTurnState`.
 */
export class TurnStatePoller {
  private readonly state$ = new BehaviorSubject<LiveKitRoomTurnState | null>(null);
  private subscription: Subscription | null = null;
  private roomName: string | null = null;
  private readonly error$ = new BehaviorSubject<string | null>(null);
  private readonly intervalMs: number;

  /**
   * @param fetcher Loads one snapshot of a room's turn-taking state.
   * @param intervalMs The gap between polls. Clamped to {@link TURN_POLL_MIN_INTERVAL_MS}.
   */
  constructor(
    private readonly fetcher: TurnStateFetcher,
    intervalMs: number = TURN_POLL_DEFAULT_INTERVAL_MS,
  ) {
    this.intervalMs = Number.isFinite(intervalMs) ? Math.max(TURN_POLL_MIN_INTERVAL_MS, intervalMs) : TURN_POLL_DEFAULT_INTERVAL_MS;
  }

  /** The latest state; emits the current value on subscribe. `null` until a room with agents has answered. */
  public get State$(): Observable<LiveKitRoomTurnState | null> {
    return this.state$.asObservable();
  }

  /** The latest state, synchronously. */
  public get State(): LiveKitRoomTurnState | null {
    return this.state$.value;
  }

  /** The most recent poll error (`null` when the last poll succeeded); emits the current value on subscribe. */
  public get Error$(): Observable<string | null> {
    return this.error$.asObservable();
  }

  /** The most recent poll error, or `null` when the last poll succeeded. */
  public get LastError(): string | null {
    return this.error$.value;
  }

  /** Whether the poller is running. */
  public get IsRunning(): boolean {
    return this.subscription !== null;
  }

  /** The room being polled, or `null` when stopped. */
  public get RoomName(): string | null {
    return this.roomName;
  }

  /**
   * Starts polling a room (immediately, then on the interval). Idempotent for the room already being polled;
   * switching rooms restarts and clears the previous room's state.
   *
   * @param roomName The room to poll.
   */
  public Start(roomName: string): void {
    if (this.subscription && this.roomName === roomName) {
      return;
    }
    this.Stop();
    this.roomName = roomName;
    this.subscription = timer(0, this.intervalMs)
      .pipe(exhaustMap(() => from(this.fetchOnce(roomName))))
      .subscribe(result => this.apply(result));
  }

  /** Stops polling, cancels any request in flight and clears the state. Safe to call when already stopped. */
  public Stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.roomName = null;
    this.setError(null);
    if (this.state$.value !== null) {
      this.state$.next(null);
    }
  }

  /** Stops and releases the stream. */
  public Dispose(): void {
    this.Stop();
    this.state$.complete();
    this.error$.complete();
  }

  /** One fetch that can never reject — a thrown fetcher becomes a failed result carrying its message. */
  private async fetchOnce(roomName: string): Promise<LiveKitRoomTurnStateResult> {
    try {
      return await this.fetcher(roomName);
    } catch (err) {
      return { Success: false, ErrorMessage: err instanceof Error ? err.message : String(err), State: null };
    }
  }

  private apply(result: LiveKitRoomTurnStateResult): void {
    if (!result.Success) {
      this.setError(result.ErrorMessage ?? 'Could not read the room\'s turn-taking state.');
      return; // keep the last good state on screen rather than blanking it on a blip
    }
    this.setError(null);
    this.state$.next(result.State);
  }

  private setError(message: string | null): void {
    if (this.error$.value !== message) {
      this.error$.next(message);
    }
  }
}

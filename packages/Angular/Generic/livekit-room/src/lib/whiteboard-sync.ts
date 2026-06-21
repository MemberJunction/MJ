import { Subject, Subscription, debounceTime, type Observable } from 'rxjs';

/**
 * The minimal board surface {@link WhiteboardSyncCoordinator} needs — satisfied by `WhiteboardState` from
 * `@memberjunction/ng-whiteboard`, but declared structurally here so the coordinator stays pure (no
 * Angular / whiteboard import) and unit-testable with a fake board.
 */
export interface SyncableBoard {
  /** Serializes the board to a JSON snapshot. */
  ToJSON(): string;
  /** Rehydrates the board from a JSON snapshot in place. */
  LoadFromJSON(json: string): boolean;
  /** Emits whenever the board changes (the trigger to broadcast). */
  readonly Changed$: Observable<unknown>;
}

/**
 * Coordinates collaborative whiteboard sync over a transport (the LiveKit data channel): debounces local
 * change bursts into one outbound snapshot, and applies inbound snapshots while **suppressing the echo**
 * that the load itself would otherwise trigger. Pure and transport-agnostic — the surface component owns
 * the actual `SendData`/`dataReceived` wiring.
 */
export class WhiteboardSyncCoordinator {
  private readonly outgoing = new Subject<void>();
  private sub: Subscription | null = null;
  private applyingRemote = false;

  /**
   * @param board The board to sync (e.g. a `WhiteboardState`).
   * @param debounceMs Debounce before broadcasting after local changes.
   * @param onSnapshot Invoked with a JSON snapshot to broadcast.
   */
  constructor(
    private readonly board: SyncableBoard,
    private readonly debounceMs: number,
    private readonly onSnapshot: (json: string) => void,
  ) {}

  /** Starts listening for local board changes and emitting debounced snapshots. */
  public Start(): void {
    if (this.sub) {
      return;
    }
    this.sub = this.board.Changed$.subscribe(() => {
      if (!this.applyingRemote) {
        this.outgoing.next();
      }
    });
    this.sub.add(this.outgoing.pipe(debounceTime(this.debounceMs)).subscribe(() => this.onSnapshot(this.board.ToJSON())));
  }

  /**
   * Applies a remote board snapshot, suppressing the echo the load triggers on {@link SyncableBoard.Changed$}.
   *
   * @param json The JSON snapshot from another participant.
   */
  public ApplyRemote(json: string): void {
    if (!json) {
      return;
    }
    this.applyingRemote = true;
    try {
      this.board.LoadFromJSON(json);
    } finally {
      // Release on the next microtask so the synchronous Changed$ emissions from the load are ignored.
      queueMicrotask(() => {
        this.applyingRemote = false;
      });
    }
  }

  /** Tears down subscriptions. */
  public Dispose(): void {
    this.sub?.unsubscribe();
    this.sub = null;
    this.outgoing.complete();
  }
}

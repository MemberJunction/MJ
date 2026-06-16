import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { RealtimeWhiteboardHostComponent, WhiteboardState } from '@memberjunction/ng-whiteboard';

/**
 * `mj-livekit-whiteboard-surface` — hosts the reusable `@memberjunction/ng-whiteboard` board inside the
 * LiveKit room and syncs it across participants over the room's **data channel** (last-writer-wins board
 * snapshots, debounced). The same board model (`WhiteboardState`) and agent tool API the conversations
 * realtime stack uses — so improvements to the whiteboard benefit both surfaces, and an agent in a LiveKit
 * realtime session can co-author the board (its tool calls are applied server-side and broadcast here).
 *
 * The component owns the `WhiteboardState` and is transport-agnostic: it emits {@link BoardChanged} (a JSON
 * snapshot) when the local board changes, and the host wires that to `controller.SendData(..., topic)`;
 * inbound snapshots arrive via {@link ApplyRemote}. Echo is suppressed while a remote snapshot is applied.
 */
@Component({
  selector: 'mj-livekit-whiteboard-surface',
  standalone: true,
  imports: [RealtimeWhiteboardHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-realtime-whiteboard-host
      class="lk-wb"
      [State]="State"
      [AgentName]="AgentName"
      [BoardTitle]="BoardTitle"
      (SceneDelta)="SceneDelta.emit($event)"
    ></mj-realtime-whiteboard-host>
  `,
  styles: [
    `
      :host,
      .lk-wb {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class LiveKitWhiteboardSurfaceComponent implements OnInit, OnDestroy {
  /** The shared board state engine. One per surface instance. */
  public readonly State = new WhiteboardState();
  private readonly outgoing = new Subject<void>();
  private sub: Subscription | null = null;
  private applyingRemote = false;

  /** The agent's display name (legend / chips / agent toast on the board). */
  @Input() public AgentName = 'Agent';
  /** The board title shown in the whiteboard header. */
  @Input() public BoardTitle = 'Whiteboard';
  /** Debounce (ms) before broadcasting a board snapshot after local changes. */
  @Input() public SyncDebounceMs = 350;

  /** Emits a JSON board snapshot to broadcast when the local board changes. */
  @Output() public BoardChanged = new EventEmitter<string>();
  /** Forwards the whiteboard's debounced scene-delta (agent-perception feed). */
  @Output() public SceneDelta = new EventEmitter<string>();

  public ngOnInit(): void {
    // Coalesce local change bursts, then broadcast one snapshot (skipping changes we just applied remotely).
    this.sub = this.State.Changed$.subscribe(() => {
      if (!this.applyingRemote) {
        this.outgoing.next();
      }
    });
    this.sub.add(
      this.outgoing.pipe(debounceTime(this.SyncDebounceMs)).subscribe(() => {
        this.BoardChanged.emit(this.State.ToJSON());
      }),
    );
  }

  public ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.outgoing.complete();
  }

  /**
   * Applies a remote board snapshot received over the data channel, suppressing the echo that would
   * otherwise re-broadcast it.
   *
   * @param json The JSON board snapshot from another participant.
   */
  public ApplyRemote(json: string): void {
    if (!json) {
      return;
    }
    this.applyingRemote = true;
    try {
      this.State.LoadFromJSON(json);
    } finally {
      // Release on the next microtask so the synchronous Changed$ emissions from the load are ignored.
      queueMicrotask(() => {
        this.applyingRemote = false;
      });
    }
  }
}

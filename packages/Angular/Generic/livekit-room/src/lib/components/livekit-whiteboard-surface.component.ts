import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { RealtimeWhiteboardHostComponent, WhiteboardState } from '@memberjunction/ng-whiteboard';
import { WhiteboardSyncCoordinator } from '../whiteboard-sync';

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
  private sync: WhiteboardSyncCoordinator | null = null;

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
    this.sync = new WhiteboardSyncCoordinator(this.State, this.SyncDebounceMs, (json) => this.BoardChanged.emit(json));
    this.sync.Start();
  }

  public ngOnDestroy(): void {
    this.sync?.Dispose();
  }

  /**
   * Applies a remote board snapshot received over the data channel, suppressing the echo that would
   * otherwise re-broadcast it.
   *
   * @param json The JSON board snapshot from another participant.
   */
  public ApplyRemote(json: string): void {
    this.sync?.ApplyRemote(json);
  }
}

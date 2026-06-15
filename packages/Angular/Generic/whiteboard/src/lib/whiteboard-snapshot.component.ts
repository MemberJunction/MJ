import { Component, Input } from '@angular/core';
import { RealtimeWhiteboardBoardComponent } from './whiteboard-board.component';
import { WhiteboardState } from './whiteboard-state';

/**
 * Parse a persisted whiteboard payload ({@link WhiteboardState.ToJSON} output) into a
 * rehydrated engine instance. PURE + TOLERANT: any malformed input (empty, non-JSON,
 * JSON of the wrong shape) returns `null` instead of throwing — callers render an
 * empty state rather than breaking the surface they're embedded in.
 */
export function ParseBoardStateJson(json: string | null | undefined): WhiteboardState | null {
  if (!json || json.trim().length === 0) {
    return null;
  }
  try {
    return WhiteboardState.FromJSON(json);
  } catch {
    return null;
  }
}

/**
 * READ-ONLY SNAPSHOT of a whiteboard — renders a persisted board payload (the
 * session-channel artifact JSON) through the real board component in `ReadOnly` mode,
 * so a saved board looks exactly like the live one: same chips, shapes, ink and
 * connectors, with pan + zoom still available for navigation but every mutating
 * interaction disabled. Used by the whiteboard artifact viewer plugin and any
 * session-review surface that wants to show a board without an engine wired to tools.
 */
@Component({
  standalone: true,
  selector: 'mj-whiteboard-snapshot',
  imports: [RealtimeWhiteboardBoardComponent],
  template: `
    @if (State) {
      <div class="wb-snapshot-board">
        <mj-realtime-whiteboard [State]="State" [AgentName]="AgentName" [ReadOnly]="true" [Tool]="'pan'" />
      </div>
    } @else {
      <div class="wb-snapshot-empty">
        <i class="fa-solid fa-chalkboard" aria-hidden="true"></i>
        <span>No board content</span>
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      min-height: 320px;
    }
    /* the board component positions itself absolute, so give it a relative frame */
    .wb-snapshot-board {
      position: relative;
      flex: 1;
      min-height: 0;
    }
    .wb-snapshot-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--mj-text-muted);
      background: var(--mj-bg-surface-sunken);
      border-radius: var(--mj-radius-md, 6px);
      font-size: 13px;
    }
    .wb-snapshot-empty i {
      font-size: 22px;
      color: var(--mj-text-disabled);
    }
  `]
})
export class WhiteboardSnapshotComponent {
  private _stateJson = '';

  /** Rehydrated board engine (null when the payload is empty/malformed). */
  public State: WhiteboardState | null = null;

  /** Persisted board payload — setter-driven so a new artifact version re-parses. */
  @Input()
  set StateJson(value: string) {
    if (value !== this._stateJson) {
      this._stateJson = value;
      this.State = ParseBoardStateJson(value);
    }
  }
  get StateJson(): string {
    return this._stateJson;
  }

  /** Display name of the session's agent — ownership chips on the rendered board. */
  @Input() AgentName = 'Agent';
}

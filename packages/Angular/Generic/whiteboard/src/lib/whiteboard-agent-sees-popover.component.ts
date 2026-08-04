import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The "What [Agent] sees" perception popover: shows the most recent coalesced scene
 * delta JSON (syntax-tinted) plus the perception-feed stats footer (debounce, element
 * count, last-delta age, state of record). Anchored under the header button by the host;
 * visibility is the host's concern.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-whiteboard-agent-sees-popover',
  imports: [CommonModule],
  templateUrl: './whiteboard-agent-sees-popover.component.html',
  styleUrl: './whiteboard-agent-sees-popover.component.css'
})
export class RealtimeWhiteboardAgentSeesPopoverComponent {
  /** Display name of the session's agent. */
  @Input() AgentName = 'Agent';
  /** Perception debounce, in ms (the host's SceneDelta debounce). */
  @Input() DebounceMs = 750;
  /** Current element count on the board. */
  @Input() ElementCount = 0;
  /** Friendly age of the last emitted delta ("2 s ago" / "—"). */
  @Input() LastDeltaLabel = '—';

  /** The latest scene-delta JSON (pretty-printed). Setter pre-tints for display. */
  @Input()
  set DeltaJson(value: string) {
    if (value !== this._deltaJson) {
      this._deltaJson = value;
      this.TintedHtml = RealtimeWhiteboardAgentSeesPopoverComponent.tint(value);
    }
  }
  get DeltaJson(): string {
    return this._deltaJson;
  }

  private _deltaJson = '';

  /** HTML-escaped JSON wrapped in token-tint spans (keys/strings/numbers/comments). */
  public TintedHtml = '';

  /**
   * Minimal JSON syntax tinting matching the mockup's `.codeblock` token classes.
   * Input is fully HTML-escaped first, so the produced markup contains only our spans.
   */
  private static tint(json: string): string {
    const escaped = json
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped
      .replace(/"([^"]+)"(\s*):/g, '<span class="ck">"$1"</span>$2:')
      .replace(/:(\s*)"([^"]*)"/g, ':$1<span class="cs">"$2"</span>')
      .replace(/:(\s*)(-?\d+(?:\.\d+)?)/g, ':$1<span class="cn">$2</span>')
      .replace(/(\[\s*)"([^"]*)"/g, '$1<span class="cs">"$2"</span>')
      .replace(/(,\s*)"([^"]*)"(\s*[,\]])/g, '$1<span class="cs">"$2"</span>$3');
  }
}

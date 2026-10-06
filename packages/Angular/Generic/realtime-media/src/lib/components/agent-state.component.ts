import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { MediaAgentState } from '@memberjunction/ai-realtime-client/media';

const STATE_LABELS: Record<MediaAgentState, string> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking…',
  speaking: 'speaking',
};

/** The words for an agent state, as the indicator's label shows them. */
export function MediaAgentStateLabel(state: MediaAgentState): string {
  return STATE_LABELS[state] ?? STATE_LABELS.idle;
}

/**
 * `mj-agent-state`: an orb and a label showing what the agent is doing (idle, listening, thinking,
 * speaking). The host feeds {@link State}, from speaking activity or the provider's own signal.
 */
@Component({
  selector: 'mj-agent-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="agent agent--{{ State }}">
      <div class="agent__orb">
        <span class="agent__ring"></span>
        <i class="fa-solid" [class.fa-robot]="State !== 'thinking'" [class.fa-spinner]="State === 'thinking'" [class.fa-spin]="State === 'thinking'" aria-hidden="true"></i>
      </div>
      @if (ShowLabel) {
        <span class="agent__label">{{ AgentName }} · {{ LabelText }}</span>
      }
    </div>
  `,
  styleUrls: ['./agent-state.component.css'],
})
export class MediaAgentStateComponent {
  /** The agent's current conversational state. */
  @Input() public State: MediaAgentState = 'idle';
  /** The agent's display name. */
  @Input() public AgentName = 'Agent';
  /** Show the text label next to the orb. */
  @Input() public ShowLabel = true;

  /** The label for the current state. */
  public get LabelText(): string {
    return MediaAgentStateLabel(this.State);
  }
}

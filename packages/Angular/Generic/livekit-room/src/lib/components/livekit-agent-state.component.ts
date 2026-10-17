import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MediaAgentStateComponent, MediaAgentStateLabel } from '@memberjunction/ng-realtime-media';
import type { MediaAgentState } from '@memberjunction/ai-realtime-client/media';

/** The conversational state of the agent, surfaced as a visual indicator. */
export type LiveKitAgentVisualState = MediaAgentState;

/**
 * `mj-livekit-agent-state`: the agent-state orb and label.
 *
 * @deprecated Use `mj-agent-state` (`MediaAgentStateComponent`) from `@memberjunction/ng-realtime-media`, which this
 * renders with the same inputs.
 */
@Component({
  selector: 'mj-livekit-agent-state',
  standalone: true,
  imports: [MediaAgentStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<mj-agent-state [State]="State" [AgentName]="AgentName" [ShowLabel]="ShowLabel"></mj-agent-state>`,
  styles: [':host { display: inline-flex; }'],
})
export class LiveKitAgentStateComponent {
  /** The agent's current conversational state. */
  @Input() public State: LiveKitAgentVisualState = 'idle';
  /** The agent's display name. */
  @Input() public AgentName = 'Agent';
  /** Show the text label next to the orb. */
  @Input() public ShowLabel = true;

  /** @deprecated Use {@link MediaAgentStateLabel}. */
  public get labelText(): string {
    return MediaAgentStateLabel(this.State);
  }
}

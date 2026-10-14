import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { RealtimeConnectionState } from '@memberjunction/realtime-runtime';

/** The agent's turn, as the orb shows it. */
export type RealtimeAgentOrbState = 'speaking' | 'listening' | 'thinking';

/** The orb's state for a call's state: speaking and thinking show as such; everything else as listening. */
export function AgentOrbStateFor(state: RealtimeConnectionState | null | undefined): RealtimeAgentOrbState {
  switch (state) {
    case 'speaking':
      return 'speaking';
    case 'thinking':
      return 'thinking';
    default:
      return 'listening';
  }
}

/**
 * `mj-realtime-agent-orb`: the call's orb, the agent's presence when there is no video to show. It breathes with the
 * agent's turn ({@link State}) inside expanding sound-wave rings. Inside the call overlay it also reacts to the live audio
 * the overlay meters: the overlay's `data-audio-live` and `data-voice-dir` attributes and its `--voice-out` level.
 *
 * Sized by `--mj-realtime-orb-size`, the orb's diameter (120px by default); its stage, with the rings, is about 1.83
 * times that. Decorative: it carries no text, so the host says what the agent is doing.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-agent-orb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="orb-stage" aria-hidden="true">
      <span class="orb-ring"></span>
      <span class="orb-ring orb-ring--2"></span>
      <span class="orb-ring orb-ring--3"></span>
      <div class="orb" [attr.data-state]="State"></div>
    </div>
  `,
  styleUrls: ['./realtime-agent-orb.component.css'],
})
export class RealtimeAgentOrbComponent {
  /** The agent's turn. */
  @Input() public State: RealtimeAgentOrbState = 'listening';
}

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VoiceConnectionState } from '../../services/voice-session.service';

/**
 * Identity header for the live call overlay (mirrors `.call-header` in live-session.html):
 * the glowing agent orb whose motion reflects the current turn-state, the agent name +
 * "Co-Agent" badge, a "Speaking as <agent>" subline, and a state pill that swaps between a
 * waveform (speaking/listening) and a spinner (connecting/thinking).
 *
 * Pure presentational — turn-state arrives via {@link State}; the agent name via {@link AgentName}.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-agent-banner',
  imports: [CommonModule],
  templateUrl: './realtime-agent-banner.component.html',
  styleUrl: './realtime-agent-banner.component.css'
})
export class RealtimeAgentBannerComponent {
  /** Current connection / turn state — drives the orb animation + state label. */
  @Input({ required: true }) State!: VoiceConnectionState;

  /** Display name of the agent the voice session fronts (e.g. "Sage"). */
  @Input() AgentName = 'the agent';

  /** Maps the realtime state to the orb's `data-state` (the orb only models active turn-states). */
  public OrbState(state: VoiceConnectionState): 'speaking' | 'listening' | 'thinking' {
    switch (state) {
      case 'speaking': return 'speaking';
      case 'thinking': return 'thinking';
      default: return 'listening';
    }
  }

  /** Human-readable state label, agent-aware where it reads better. */
  public StateLabel(state: VoiceConnectionState): string {
    switch (state) {
      case 'connecting': return 'Connecting…';
      case 'listening': return 'Listening';
      case 'speaking': return `${this.AgentName} is speaking…`;
      case 'thinking': return 'Working on it…';
      case 'error': return 'Connection error';
      case 'closed': return 'Call ended';
      default: return '';
    }
  }

  /** True while the state pill should show a spinner instead of the waveform. */
  public IsBusy(state: VoiceConnectionState): boolean {
    return state === 'connecting' || state === 'thinking';
  }
}

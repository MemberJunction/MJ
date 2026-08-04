import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** The conversational state of the agent, surfaced as a visual indicator. */
export type LiveKitAgentVisualState = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * `mj-livekit-agent-state` — an animated orb + label reflecting the agent's conversational state
 * (idle / listening / thinking / speaking). MJ is agent-centric, so this gives a clear "what is the
 * agent doing right now" affordance that LiveKit's generic components don't ship. The host feeds
 * {@link State} (derived from speaking activity and/or a `lk-agent-state` data-channel signal).
 */
@Component({
  selector: 'mj-livekit-agent-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lk-agent lk-agent--{{ State }}">
      <div class="lk-agent__orb">
        <span class="lk-agent__ring"></span>
        <i class="fa-solid" [class.fa-robot]="State !== 'thinking'" [class.fa-spinner]="State === 'thinking'" [class.fa-spin]="State === 'thinking'"></i>
      </div>
      @if (ShowLabel) {
        <span class="lk-agent__label">{{ AgentName }} · {{ labelText }}</span>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .lk-agent {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      .lk-agent__orb {
        position: relative;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: var(--mj-text-inverse, #fff);
        background: var(--mj-brand-primary, #0076b6);
      }
      .lk-agent__ring {
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        border: 2px solid var(--mj-brand-primary, #0076b6);
        opacity: 0;
      }
      .lk-agent--speaking .lk-agent__ring {
        animation: lk-agent-pulse 1.1s ease-out infinite;
      }
      .lk-agent--listening .lk-agent__orb {
        background: var(--mj-status-success, #22c55e);
      }
      .lk-agent--thinking .lk-agent__orb {
        background: var(--mj-status-warning, #f59e0b);
      }
      .lk-agent--idle .lk-agent__orb {
        background: var(--mj-text-muted, #64748b);
      }
      .lk-agent__label {
        font-size: 0.82rem;
        color: var(--mj-text-secondary, #475569);
      }
      @keyframes lk-agent-pulse {
        0% {
          opacity: 0.7;
          transform: scale(1);
        }
        100% {
          opacity: 0;
          transform: scale(1.5);
        }
      }
    `,
  ],
})
export class LiveKitAgentStateComponent {
  /** The agent's current conversational state. */
  @Input() public State: LiveKitAgentVisualState = 'idle';
  /** The agent's display name. */
  @Input() public AgentName = 'Agent';
  /** Show the text label next to the orb. */
  @Input() public ShowLabel = true;

  /** The human-readable label for the current state. */
  public get labelText(): string {
    switch (this.State) {
      case 'listening':
        return 'listening';
      case 'thinking':
        return 'thinking…';
      case 'speaking':
        return 'speaking';
      default:
        return 'idle';
    }
  }
}

import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { CollaboratorPresence } from '../../services/document-collaboration.service';
import { FormatAgentBaseName, FormatAgentCoordinateLabel } from './artifact-agent-presence-bar.component';

/**
 * In-canvas floating/anchored region badge highlighting the structural block,
 * slide, or range currently being edited by an AI agent — distinctly styled as
 * an agent activity chip rather than a human mouse pointer arrow.
 */
@Component({
  selector: 'mj-artifact-agent-region-indicator',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (Agent && Agent.AgentPhase !== 'exit') {
      <div
        class="mj-agent-region-badge"
        [class.compact]="Compact"
        [class.is-working]="IsWorking"
        [class.is-settled]="Agent.AgentPhase === 'settled'"
        [style.--mj-agent-accent]="Agent.Color || 'var(--mj-brand-primary)'"
        data-testid="artifact-agent-region-indicator"
        role="status"
        (click)="JumpToAgent.emit(Agent)"
      >
        <span class="mj-agent-region-badge__icon" aria-hidden="true">
          <i class="fa-solid fa-robot"></i>
        </span>
        <span class="mj-agent-region-badge__name">{{ AgentDisplayName }}</span>
        @if (Agent.ActingForUserName) {
          <span class="mj-agent-region-badge__actor">for {{ Agent.ActingForUserName }}</span>
        }
        @if (Agent.ActionSummary && !Compact) {
          <span class="mj-agent-region-badge__summary">{{ Agent.ActionSummary }}</span>
        }
        @if (CoordinateLabel) {
          <span class="mj-agent-region-badge__coord">{{ CoordinateLabel }}</span>
        }
      </div>
    }
  `,
  styles: [
    `
      .mj-agent-region-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 8px;
        border: 1px solid color-mix(in srgb, var(--mj-agent-accent, var(--mj-brand-primary)) 55%, var(--mj-border-default));
        border-left-width: 3px;
        border-left-color: var(--mj-agent-accent, var(--mj-brand-primary));
        background: color-mix(in srgb, var(--mj-agent-accent, var(--mj-brand-primary)) 12%, var(--mj-bg-surface));
        color: var(--mj-text-primary);
        font-size: 12px;
        line-height: 1.25;
        cursor: pointer;
        box-shadow: 0 2px 8px color-mix(in srgb, var(--mj-text-primary) 8%, transparent);
        transition: opacity 0.2s ease, transform 0.15s ease;
      }
      .mj-agent-region-badge.compact {
        padding: 2px 8px;
        font-size: 11px;
      }
      .mj-agent-region-badge.is-settled {
        opacity: 0.72;
      }
      .mj-agent-region-badge__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--mj-agent-accent, var(--mj-brand-primary));
        color: var(--mj-text-inverse);
        font-size: 10px;
        flex-shrink: 0;
      }
      .mj-agent-region-badge.is-working .mj-agent-region-badge__icon {
        animation: mj-agent-region-glow 1.4s ease-in-out infinite alternate;
      }
      @keyframes mj-agent-region-glow {
        from {
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--mj-agent-accent, var(--mj-brand-primary)) 45%, transparent);
        }
        to {
          box-shadow: 0 0 0 5px color-mix(in srgb, var(--mj-agent-accent, var(--mj-brand-primary)) 0%, transparent);
        }
      }
      .mj-agent-region-badge__name {
        font-weight: 600;
      }
      .mj-agent-region-badge__actor {
        color: var(--mj-text-secondary);
        font-size: 11px;
      }
      .mj-agent-region-badge__summary {
        color: var(--mj-text-secondary);
        font-size: 11px;
      }
      .mj-agent-region-badge__summary::before {
        content: '· ';
        color: var(--mj-text-muted);
      }
      .mj-agent-region-badge__coord {
        padding: 1px 5px;
        border-radius: 4px;
        background: var(--mj-bg-surface-sunken);
        font-family: monospace;
        font-size: 11px;
      }
    `,
  ],
})
export class ArtifactAgentRegionIndicatorComponent {
  @Input() public Agent: CollaboratorPresence | null = null;
  @Input() public Compact = false;
  @Output() public JumpToAgent = new EventEmitter<CollaboratorPresence>();

  public get IsWorking(): boolean {
    return (
      !this.Agent?.AgentPhase ||
      this.Agent.AgentPhase === 'working' ||
      this.Agent.AgentPhase === 'enter'
    );
  }

  public get AgentDisplayName(): string {
    return this.Agent ? FormatAgentBaseName(this.Agent) : '';
  }

  public get CoordinateLabel(): string {
    return this.Agent ? FormatAgentCoordinateLabel(this.Agent) : '';
  }
}

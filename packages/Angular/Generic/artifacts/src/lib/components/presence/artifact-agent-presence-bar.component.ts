import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type {
  CollaboratorAgentLocation,
  CollaboratorPresence,
} from '../../services/document-collaboration.service';

/**
 * Format a compact structural coordinate string for an agent presence entry.
 */
export function FormatAgentCoordinateLabel(agent: CollaboratorPresence): string {
  const loc = agent.AgentLocation;
  if (loc) {
    if (loc.Domain === 'spreadsheet') {
      const sheet = loc.SheetName || loc.SheetID;
      if (sheet && loc.Range) {
        return `${sheet}!${loc.Range}`;
      }
      if (loc.Range) {
        return loc.Range;
      }
      if (sheet) {
        return sheet;
      }
    } else if (loc.Domain === 'slides') {
      if (typeof loc.SlideNumber === 'number' && loc.SlideNumber > 0) {
        return loc.ElementID ? `Slide ${loc.SlideNumber} · ${loc.ElementID}` : `Slide ${loc.SlideNumber}`;
      }
      if (loc.SlideID) {
        return loc.SlideID;
      }
    } else if (loc.Domain === 'document') {
      if (loc.SectionHeading) {
        return loc.SectionHeading;
      }
      if (typeof loc.StartLine === 'number' && loc.StartLine > 0) {
        return typeof loc.EndLine === 'number' && loc.EndLine > loc.StartLine
          ? `L${loc.StartLine}-${loc.EndLine}`
          : `L${loc.StartLine}`;
      }
      if (loc.BlockID) {
        return loc.BlockID;
      }
    } else if (loc.Domain === 'whiteboard' && loc.ElementID) {
      return loc.ElementID;
    }
  }
  return agent.ActiveBlockID?.trim() || '';
}

/**
 * Strip duplicate "(for <User>)" suffix when ActingForUserName is displayed separately.
 */
export function FormatAgentBaseName(agent: CollaboratorPresence): string {
  const explicit = agent.AgentName?.trim();
  if (explicit) {
    return explicit;
  }
  const raw = agent.Name?.trim() || 'AI Agent';
  if (agent.ActingForUserName) {
    const suffix = ` (for ${agent.ActingForUserName})`;
    if (raw.endsWith(suffix)) {
      return raw.slice(0, -suffix.length);
    }
  }
  return raw;
}

/**
 * Cross-device live agent presence bar displayed in Docs, Slides, and Sheets headers.
 * Never renders a mouse cursor arrow pointer; instead renders an agent pill with
 * acting-for attribution, phase pulse, action summary, and clickable coordinate jump.
 */
@Component({
  selector: 'mj-artifact-agent-presence-bar',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (AgentCollaborators.length > 0) {
      <div
        class="mj-agent-presence-bar"
        [attr.data-domain]="ActiveDomain"
        data-testid="artifact-agent-presence-bar"
        role="region"
        aria-label="Active AI agents editing this artifact"
      >
        @for (agent of AgentCollaborators; track agent.ClientID) {
          <button
            type="button"
            class="mj-agent-pill"
            [class.is-working]="IsAgentWorking(agent)"
            [class.is-settled]="agent.AgentPhase === 'settled'"
            [style.--mj-agent-accent]="agent.Color || 'var(--mj-brand-primary)'"
            [title]="BuildTooltip(agent)"
            [attr.data-testid]="'agent-presence-pill-' + agent.ClientID"
            (click)="OnSelectAgent(agent)"
          >
            <span class="mj-agent-pill__glyph" aria-hidden="true">
              <i class="fa-solid fa-robot"></i>
              <span class="mj-agent-pill__pulse"></span>
            </span>
            <span class="mj-agent-pill__identity">
              <span class="mj-agent-pill__name">{{ FormatName(agent) }}</span>
              @if (agent.ActingForUserName) {
                <span class="mj-agent-pill__actor">for {{ agent.ActingForUserName }}</span>
              }
            </span>
            @if (agent.ActionSummary) {
              <span class="mj-agent-pill__action">{{ agent.ActionSummary }}</span>
            }
            @if (FormatCoordinate(agent); as coord) {
              <span class="mj-agent-pill__coord">{{ coord }}</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: [
    `
      .mj-agent-presence-bar {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }
      .mj-agent-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px 4px 7px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--mj-agent-accent, var(--mj-brand-primary)) 45%, var(--mj-border-default));
        background: color-mix(in srgb, var(--mj-agent-accent, var(--mj-brand-primary)) 10%, var(--mj-bg-surface));
        color: var(--mj-text-primary);
        font-size: 12px;
        line-height: 1.2;
        cursor: pointer;
        transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.2s ease;
        max-width: 100%;
      }
      .mj-agent-pill:hover {
        background: color-mix(in srgb, var(--mj-agent-accent, var(--mj-brand-primary)) 18%, var(--mj-bg-surface-hover));
        border-color: var(--mj-agent-accent, var(--mj-brand-primary));
      }
      .mj-agent-pill.is-settled {
        opacity: 0.78;
      }
      .mj-agent-pill__glyph {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--mj-agent-accent, var(--mj-brand-primary));
        color: var(--mj-text-inverse);
        font-size: 10px;
        flex-shrink: 0;
      }
      .mj-agent-pill__pulse {
        position: absolute;
        inset: -2px;
        border-radius: 50%;
        border: 2px solid var(--mj-agent-accent, var(--mj-brand-primary));
        opacity: 0;
        pointer-events: none;
      }
      .mj-agent-pill.is-working .mj-agent-pill__pulse {
        animation: mj-agent-ring 1.6s ease-out infinite;
      }
      @keyframes mj-agent-ring {
        0% {
          transform: scale(0.95);
          opacity: 0.75;
        }
        100% {
          transform: scale(1.45);
          opacity: 0;
        }
      }
      .mj-agent-pill__identity {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        white-space: nowrap;
      }
      .mj-agent-pill__name {
        font-weight: 600;
        color: var(--mj-text-primary);
      }
      .mj-agent-pill__actor {
        font-weight: 500;
        color: var(--mj-text-secondary);
        font-size: 11px;
      }
      .mj-agent-pill__action {
        color: var(--mj-text-secondary);
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
      }
      .mj-agent-pill__action::before {
        content: '· ';
        color: var(--mj-text-muted);
      }
      .mj-agent-pill__coord {
        padding: 1px 6px;
        border-radius: 6px;
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-subtle);
        color: var(--mj-text-primary);
        font-family: monospace;
        font-size: 11px;
        white-space: nowrap;
      }
    `,
  ],
})
export class ArtifactAgentPresenceBarComponent {
  @Input() public Collaborators: CollaboratorPresence[] = [];
  @Input() public ActiveDomain: CollaboratorAgentLocation['Domain'] = 'generic';
  @Output() public JumpToAgentLocation = new EventEmitter<CollaboratorPresence>();

  public get AgentCollaborators(): CollaboratorPresence[] {
    return (this.Collaborators ?? []).filter(
      (c) => c.IsAgent === true && c.AgentPhase !== 'exit',
    );
  }

  public IsAgentWorking(agent: CollaboratorPresence): boolean {
    return agent.AgentPhase === 'working' || agent.AgentPhase === 'enter' || !agent.AgentPhase;
  }

  public FormatName(agent: CollaboratorPresence): string {
    return FormatAgentBaseName(agent);
  }

  public FormatCoordinate(agent: CollaboratorPresence): string {
    return FormatAgentCoordinateLabel(agent);
  }

  public BuildTooltip(agent: CollaboratorPresence): string {
    const parts = [FormatAgentBaseName(agent)];
    if (agent.ActingForUserName) {
      parts.push(`Acting for ${agent.ActingForUserName}`);
    }
    if (agent.ActionSummary) {
      parts.push(agent.ActionSummary);
    }
    const coord = FormatAgentCoordinateLabel(agent);
    if (coord) {
      parts.push(`Location: ${coord}`);
    }
    return parts.join(' · ');
  }

  public OnSelectAgent(agent: CollaboratorPresence): void {
    this.JumpToAgentLocation.emit(agent);
  }
}

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NormalizeUUID } from '@memberjunction/global';

/**
 * Six semantic agent accent families in `_tokens.scss` used for deterministic agent accents.
 */
export const AGENT_ACCENT_FAMILIES = [
  'brand',
  'accent',
  'indigo',
  'violet',
  'tertiary',
  'info',
] as const;

export type AgentAccentFamily = (typeof AGENT_ACCENT_FAMILIES)[number];

/**
 * Deterministically maps a non-empty `agentId` to one of the six semantic agent accent tokens in
 * `_tokens.scss`, returning `var(--mj-agent-accent-<family>)`. With no ID, returns
 * `var(--mj-brand-primary)`.
 */
export function AgentAccentVar(agentId?: string | null): string {
  const normalized = agentId ? NormalizeUUID(agentId.trim()) : '';
  if (!normalized) {
    return 'var(--mj-brand-primary)';
  }
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = (hash >>> 0) % AGENT_ACCENT_FAMILIES.length;
  const family = AGENT_ACCENT_FAMILIES[index];
  return `var(--mj-agent-accent-${family})`;
}

/**
 * Status of an agent-to-agent conversation handoff.
 */
export type AgentHandoffStatus = 'Transferring' | 'Transferred' | 'Failed';

/**
 * Refusal codes produced by `ResolveHandoffTarget` on a failed `Handoff` step.
 */
export type HandoffRefusalReason =
  | 'NoRunPermission'
  | 'NotDiscoverable'
  | 'NotAllowedHere'
  | 'HopLimit'
  | 'AlreadyInThisTurn'
  | 'NotFound';

/**
 * Identity summary for an agent participating in a handoff.
 */
export interface AgentHandoffParticipant {
  ID?: string | null;
  Name: string;
  AvatarUrl?: string | null;
  IconClass?: string | null;
}

/**
 * Handoff card model attached to the source agent's message row.
 */
export interface MessageHandoffInfo {
  SourceAgent: AgentHandoffParticipant;
  TargetAgent: AgentHandoffParticipant;
  PresetName?: string | null;
  Brief?: string | null;
  Reason?: string | null;
  Status: AgentHandoffStatus;
  FailureReason?: string | null;
  HopChain?: readonly (AgentHandoffParticipant | string)[] | null;
  TargetDetailId?: string | null;
}

/**
 * Target-row provenance attached to the receiving agent's message row.
 */
export interface MessageHandedOffFromInfo {
  SourceAgent: AgentHandoffParticipant;
  TargetAgent: AgentHandoffParticipant;
  PresetName?: string | null;
  Brief?: string | null;
  Reason?: string | null;
  HopChain?: readonly (AgentHandoffParticipant | string)[] | null;
  SourceDetailId?: string | null;
}

export interface FailureCopy {
  ReasonText: string;
  NextStepText: string;
}

/**
 * Maps a `RefusalReason` code (or fallback message) to user-facing explanation + next-step copy.
 */
export function MapHandoffFailureCopy(
  failureReason: string | null | undefined,
  targetName: string,
  sourceName: string
): FailureCopy {
  const code = (failureReason || '').trim();
  switch (code) {
    case 'NoRunPermission':
      return {
        ReasonText: `You don't have access to ${targetName}. ${sourceName} will continue.`,
        NextStepText: `Ask an admin for access to ${targetName}`,
      };
    case 'NotDiscoverable':
      return {
        ReasonText: `${targetName} isn't available for direct transfers. ${sourceName} will continue.`,
        NextStepText: `Continue with ${sourceName} or mention another agent`,
      };
    case 'NotAllowedHere':
      return {
        ReasonText: `${targetName} is not available in this app. ${sourceName} will continue.`,
        NextStepText: `Open a full workspace to use ${targetName}`,
      };
    case 'HopLimit':
      return {
        ReasonText: `Maximum transfer limit reached for this turn. ${sourceName} will continue.`,
        NextStepText: 'Send a follow-up message to continue',
      };
    case 'AlreadyInThisTurn':
      return {
        ReasonText: `${targetName} already participated in this turn. ${sourceName} will continue.`,
        NextStepText: `Mention @${targetName} in your next message`,
      };
    case 'NotFound':
      return {
        ReasonText: `Couldn't find an active agent named ${targetName}. ${sourceName} will continue.`,
        NextStepText: 'Check the agent name or pick another agent',
      };
    default:
      return {
        ReasonText: code
          ? `${code}. ${sourceName} will continue.`
          : `Couldn't transfer to ${targetName}. ${sourceName} will continue.`,
        NextStepText: `Continue with ${sourceName}`,
      };
  }
}

function normalizeParticipant(
  value: AgentHandoffParticipant | string | null | undefined,
  fallbackName: string
): AgentHandoffParticipant {
  if (!value) {
    return { Name: fallbackName };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return { Name: trimmed || fallbackName };
  }
  return {
    ID: value.ID ?? null,
    Name: value.Name?.trim() || fallbackName,
    AvatarUrl: value.AvatarUrl ?? null,
    IconClass: value.IconClass ?? null,
  };
}

/**
 * Inline baton card rendered under the source agent's farewell message when a conversation
 * handoff occurs (`MJ: AI Agent Run Steps` with `StepType = 'Handoff'`).
 */
@Component({
  standalone: true,
  selector: 'mj-agent-handoff-card',
  templateUrl: './agent-handoff-card.component.html',
  styleUrls: ['./agent-handoff-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentHandoffCardComponent {
  @Input() SourceAgent: AgentHandoffParticipant | string | null = null;
  @Input() TargetAgent: AgentHandoffParticipant | string | null = null;
  @Input() PresetName: string | null = null;
  @Input() Brief: string | null = null;
  @Input() Reason: string | null = null;
  @Input() Status: AgentHandoffStatus = 'Transferred';
  @Input() FailureReason: string | null = null;
  @Input() HopChain: readonly (AgentHandoffParticipant | string)[] | null = null;

  @Input()
  public set Handoff(value: MessageHandoffInfo | null | undefined) {
    if (!value) {
      return;
    }
    this.SourceAgent = value.SourceAgent;
    this.TargetAgent = value.TargetAgent;
    this.PresetName = value.PresetName ?? null;
    this.Brief = value.Brief ?? null;
    this.Reason = value.Reason ?? null;
    this.Status = value.Status;
    this.FailureReason = value.FailureReason ?? null;
    this.HopChain = value.HopChain ?? null;
  }

  public get ResolvedSource(): AgentHandoffParticipant {
    return normalizeParticipant(this.SourceAgent, 'Sage');
  }

  public get ResolvedTarget(): AgentHandoffParticipant {
    return normalizeParticipant(this.TargetAgent, 'Agent');
  }

  public get SourceAgentName(): string {
    return this.ResolvedSource.Name;
  }

  public get TargetAgentName(): string {
    return this.ResolvedTarget.Name;
  }

  public get SourceAvatarUrl(): string | null {
    return this.ResolvedSource.AvatarUrl || null;
  }

  public get TargetAvatarUrl(): string | null {
    return this.ResolvedTarget.AvatarUrl || null;
  }

  public get SourceIconClass(): string | null {
    return this.ResolvedSource.IconClass || null;
  }

  public get TargetIconClass(): string | null {
    return this.ResolvedTarget.IconClass || null;
  }

  public get SourceInitial(): string {
    return this.SourceAgentName.charAt(0).toUpperCase() || 'S';
  }

  public get TargetInitial(): string {
    return this.TargetAgentName.charAt(0).toUpperCase() || 'A';
  }

  public get SourceAccentVar(): string {
    return AgentAccentVar(this.ResolvedSource.ID);
  }

  public get TargetAccentVar(): string {
    return AgentAccentVar(this.ResolvedTarget.ID);
  }

  public get FailureCopy(): FailureCopy {
    return MapHandoffFailureCopy(this.FailureReason, this.TargetAgentName, this.SourceAgentName);
  }

  public get FailureReasonText(): string {
    return this.FailureCopy.ReasonText;
  }

  public get FailureNextStepText(): string {
    return this.FailureCopy.NextStepText;
  }

  public get NormalizedHopNames(): string[] {
    if (!this.HopChain || this.HopChain.length === 0) {
      return [];
    }
    return this.HopChain.map((entry, idx) =>
      normalizeParticipant(entry, `Hop ${idx + 1}`).Name
    );
  }

  public get HasMultiHopChain(): boolean {
    return this.NormalizedHopNames.length > 2;
  }

  public get LastTwoHopsLabel(): string {
    const names = this.NormalizedHopNames;
    if (names.length < 2) {
      return names.join(' → ');
    }
    return `${names[names.length - 2]} → ${names[names.length - 1]}`;
  }

  public get ExtraHopCount(): number {
    return Math.max(0, this.NormalizedHopNames.length - 2);
  }

  public get FullHopChainTitle(): string {
    return this.NormalizedHopNames.join(' → ');
  }

  public get AnnouncedTitle(): string {
    const target = this.TargetAgentName;
    if (this.Status === 'Transferring') {
      return `Transferring to ${target}`;
    }
    if (this.Status === 'Failed') {
      return `Couldn't transfer to ${target}`;
    }
    return `Transferred to ${target}`;
  }
}

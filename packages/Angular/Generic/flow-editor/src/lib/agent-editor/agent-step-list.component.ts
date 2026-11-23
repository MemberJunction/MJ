import { Component, Input, Output, EventEmitter, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { ReadFlowDecisionStepConfiguration } from '@memberjunction/ai-core-plus';
import { WaitingStepSubtitle, IsWaitingStepType } from './waiting-step-config';

/**
 * Synchronized Playbook Outline view of workflow steps and outgoing paths.
 * Renders as a numbered SOP document (Relay-style) with step squircles, loop indicators,
 * and branch path pills — staying 1:1 synchronized with the spatial canvas.
 */
@Component({
  standalone: false,
  selector: 'mj-agent-step-list',
  template: `
    <div class="mj-step-list">
      <div class="mj-step-list-section">
        <div class="mj-step-list-section-header">
          <h4><i class="fa-solid fa-list-ol"></i> Playbook Steps ({{ Steps.length }})</h4>
          <span class="mj-step-list-summary">{{ Paths.length }} {{ Paths.length === 1 ? 'path' : 'paths' }}</span>
        </div>

        @if (OrderedSteps.length > 0) {
          <div class="mj-playbook-cards">
            @for (step of OrderedSteps; track step.ID; let i = $index) {
              <div
                class="mj-playbook-card"
                [class.mj-playbook-card--selected]="IsStepSelected(step)"
                [class.mj-playbook-card--loop]="step.StepType === 'ForEach' || step.StepType === 'While'"
                [class.mj-playbook-card--disabled]="step.Status === 'Disabled'"
                (click)="StepClicked.emit(step)">
                <div class="mj-playbook-num">{{ i + 1 }}</div>
                <div class="mj-playbook-sq" [style.color]="GetStepColor(step)" [style.background]="'color-mix(in srgb, ' + GetStepColor(step) + ' 14%, transparent)'">
                  <i class="fa-solid" [ngClass]="GetStepIcon(step)" aria-hidden="true"></i>
                </div>
                <div class="mj-playbook-main">
                  <div class="mj-playbook-title-row">
                    <span class="mj-playbook-name">{{ step.Name }}</span>
                    @if (step.StartingStep) {
                      <span class="mj-playbook-pill mj-playbook-pill--start">Start</span>
                    }
                    <span class="mj-playbook-pill" [style.color]="GetStepColor(step)">{{ GetStepTypeLabel(step) }}</span>
                    @if (step.Status !== 'Active') {
                      <span class="mj-playbook-status" [attr.data-status]="step.Status">{{ step.Status }}</span>
                    }
                  </div>
                  <div class="mj-playbook-sub">{{ GetConfiguredItem(step) }}</div>
                  @if (step.Description) {
                    <div class="mj-playbook-desc">{{ step.Description }}</div>
                  }
                  @let outPaths = GetOutgoingPaths(step);
                  @if (outPaths.length > 0) {
                    <div class="mj-playbook-branches">
                      @for (path of outPaths; track path.ID) {
                        <span class="mj-playbook-branch" [class.mj-playbook-branch--cond]="!!path.Condition?.trim()">
                          <i class="fa-solid" [class.fa-code-branch]="!!path.Condition?.trim()" [class.fa-arrow-right]="!path.Condition?.trim()" aria-hidden="true"></i>
                          @if (path.Condition?.trim()) {
                            <span class="mj-playbook-branch-cond">{{ path.Condition }}</span>
                            <span>→</span>
                          }
                          <span>{{ ResolveStepName(path.DestinationStepID, path.DestinationStep) }}</span>
                        </span>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          <mj-empty-state class="mj-step-list-empty" Size="compact" Icon="fa-solid fa-list-ol" Title="No steps defined yet" />
        }
      </div>
    </div>
    `,
  styles: [`
    .mj-step-list {
      padding: var(--mj-space-3-5, 14px);
      overflow-y: auto;
      height: 100%;
      background: var(--mj-bg-surface);
    }

    .mj-step-list-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--mj-space-3);
    }

    .mj-step-list-section-header h4 {
      font-size: var(--mj-text-xs);
      font-weight: var(--mj-font-bold);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mj-text-muted);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .mj-step-list-summary {
      font-size: 11px;
      color: var(--mj-text-muted);
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-full);
      padding: 2px 8px;
    }

    .mj-playbook-cards {
      display: flex;
      flex-direction: column;
      gap: var(--mj-space-2);
    }

    .mj-playbook-card {
      display: flex;
      align-items: flex-start;
      gap: var(--mj-space-2-5);
      padding: 10px 12px;
      border-radius: var(--mj-radius-md);
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-card);
      cursor: pointer;
      transition: border-color var(--mj-transition-fast), background-color var(--mj-transition-fast), box-shadow var(--mj-transition-fast);
    }

    .mj-playbook-card:hover {
      border-color: var(--mj-brand-primary-light);
      background: var(--mj-bg-surface-hover);
    }

    .mj-playbook-card--selected {
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface));
      box-shadow: var(--mj-shadow-sm);
    }

    .mj-playbook-card--loop {
      border-left: 3px solid var(--mj-brand-tertiary);
    }

    .mj-playbook-card--disabled {
      opacity: 0.55;
    }

    .mj-playbook-num {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      color: var(--mj-text-secondary);
      font-family: var(--mj-font-family-mono);
      font-size: 11px;
      font-weight: var(--mj-font-bold);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .mj-playbook-sq {
      width: 28px;
      height: 28px;
      border-radius: var(--mj-radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
    }

    .mj-playbook-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .mj-playbook-title-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .mj-playbook-name {
      font-size: var(--mj-text-xs);
      font-weight: var(--mj-font-semibold);
      color: var(--mj-text-primary);
    }

    .mj-playbook-pill {
      font-size: 10px;
      font-weight: var(--mj-font-semibold);
      padding: 1px 6px;
      border-radius: var(--mj-radius-sm);
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
    }

    .mj-playbook-pill--start {
      background: var(--mj-status-success-bg);
      border-color: color-mix(in srgb, var(--mj-status-success-border) 45%, transparent);
      color: var(--mj-status-success-text);
    }

    .mj-playbook-status {
      font-size: 10px;
      font-weight: var(--mj-font-semibold);
      color: var(--mj-text-muted);
    }

    .mj-playbook-status[data-status="Pending"] { color: var(--mj-status-warning-text); }

    .mj-playbook-sub {
      font-size: 11px;
      color: var(--mj-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mj-playbook-desc {
      font-size: 11px;
      color: var(--mj-text-muted);
      line-height: 1.4;
    }

    .mj-playbook-branches {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }

    .mj-playbook-branch {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: var(--mj-radius-sm);
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      color: var(--mj-text-secondary);
      max-width: 100%;
    }

    .mj-playbook-branch--cond {
      border-style: dashed;
      border-color: var(--mj-status-warning-border);
      background: var(--mj-status-warning-bg);
      color: var(--mj-status-warning-text);
    }

    .mj-playbook-branch-cond {
      font-family: var(--mj-font-family-mono);
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mj-step-list-empty {
      padding: 24px;
      text-align: center;
    }
  `],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentStepListComponent {
  @Input() Steps: MJAIAgentStepEntity[] = [];
  @Input() Paths: MJAIAgentStepPathEntity[] = [];
  @Input() SelectedStepID: string | null = null;

  @Output() StepClicked = new EventEmitter<MJAIAgentStepEntity>();

  /** Steps ordered from StartingStep through connected paths (BFS) so the Playbook reads top-to-bottom. */
  public get OrderedSteps(): MJAIAgentStepEntity[] {
    if (this.Steps.length <= 1) return this.Steps;
    const ordered: MJAIAgentStepEntity[] = [];
    const visited = new Set<string>();
    const roots = this.Steps.filter(s => s.StartingStep);
    const queue = roots.length > 0 ? [...roots] : [this.Steps[0]];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const key = curr.ID.toLowerCase();
      if (visited.has(key)) continue;
      visited.add(key);
      ordered.push(curr);

      const nextPaths = this.GetOutgoingPaths(curr);
      for (const path of nextPaths) {
        const dest = this.Steps.find(s => UUIDsEqual(s.ID, path.DestinationStepID));
        if (dest && !visited.has(dest.ID.toLowerCase())) {
          queue.push(dest);
        }
      }
    }

    for (const s of this.Steps) {
      if (!visited.has(s.ID.toLowerCase())) {
        ordered.push(s);
      }
    }
    return ordered;
  }

  public IsStepSelected(step: MJAIAgentStepEntity): boolean {
    return UUIDsEqual(this.SelectedStepID, step.ID);
  }

  public GetOutgoingPaths(step: MJAIAgentStepEntity): MJAIAgentStepPathEntity[] {
    return this.Paths.filter(p => UUIDsEqual(p.OriginStepID, step.ID));
  }

  public ResolveStepName(stepId: string, fallback?: string | null): string {
    const match = this.Steps.find(s => UUIDsEqual(s.ID, stepId));
    return match?.Name ?? fallback ?? 'Next step';
  }

  public GetStepTypeLabel(step: MJAIAgentStepEntity): string {
    switch (step.StepType) {
      case 'Human': return 'Person';
      case 'ForEach': return 'For Each';
      case 'External': return 'External';
      default: return step.StepType;
    }
  }

  public GetStepIcon(step: MJAIAgentStepEntity): string {
    switch (step.StepType) {
      case 'Action': return 'fa-bolt';
      case 'Prompt': return 'fa-comment-dots';
      case 'Decision': return 'fa-scale-balanced';
      case 'Sub-Agent': return 'fa-robot';
      case 'Human': return 'fa-user-check';
      case 'External': return 'fa-arrow-up-right-from-square';
      case 'Wait': return 'fa-hourglass-half';
      case 'ForEach': return 'fa-repeat';
      case 'While': return 'fa-rotate';
      default: return 'fa-circle-nodes';
    }
  }

  public GetStepColor(step: MJAIAgentStepEntity): string {
    switch (step.StepType) {
      case 'Action': return '#3B82F6';
      case 'Prompt': return '#8B5CF6';
      case 'Decision': return '#0891B2';
      case 'Sub-Agent': return '#10B981';
      case 'Human': return '#7B1FA2';
      case 'External': return '#0891B2';
      case 'Wait': return '#64748B';
      case 'ForEach': return '#F59E0B';
      case 'While': return '#F97316';
      default: return '#64748B';
    }
  }

  public GetConfiguredItem(step: MJAIAgentStepEntity): string {
    switch (step.StepType) {
      case 'Action': return step.Action || 'No action selected';
      case 'Prompt': return step.Prompt || 'No prompt selected';
      case 'Sub-Agent': return step.SubAgent || 'No sub-agent selected';
      case 'ForEach':
      case 'While': return `${step.LoopBodyType ?? 'Action'} loop`;
      case 'Decision': {
        const read = ReadFlowDecisionStepConfiguration(step.Configuration);
        if ('Config' in read) {
          const count = Object.keys(read.Config.questions || {}).length;
          return `${read.Config.key} · ${count} ${count === 1 ? 'question' : 'questions'}`;
        }
        return 'Unconfigured';
      }
      default:
        if (IsWaitingStepType(step.StepType)) {
          return WaitingStepSubtitle(step.StepType, step.Configuration);
        }
        return '—';
    }
  }

  /** @deprecated Use {@link GetConfiguredItem}. */
  getConfiguredItem(step: MJAIAgentStepEntity): string {
    return this.GetConfiguredItem(step);
  }
}

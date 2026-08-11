import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MJAIAgentRunStepEntity_AgentSkillInvocation } from '@memberjunction/core-entities';
import { TimelineItem } from './ai-agent-run-timeline.component';

@Component({
  standalone: false,
  selector: 'mj-ai-agent-run-step-node',
  templateUrl: './ai-agent-run-step-node.component.html',
  styleUrls: ['./ai-agent-run-step-node.component.css']
})
export class AIAgentRunStepNodeComponent {
  @Input() item!: TimelineItem;
  @Input() isSelected = false;
  @Output() itemClick = new EventEmitter<TimelineItem>();
  @Output() expandToggle = new EventEmitter<Event>();
  @Output() navigateToEntity = new EventEmitter<{ entityName: string; recordId: string }>();

  get hasChildren(): boolean {
    return !!this.item.children && this.item.children.length > 0;
  }

  get isSubAgent(): boolean {
    // A TaskGraph step expands too: it stands in for a whole graph of Task rows, and without the
    // affordance the run stops at "Task Graph: X" with no way to see what actually ran.
    return this.item.type === 'subrun' ||
      (this.item.type === 'step' && (this.item.data?.StepType === 'Sub-Agent' || this.item.data?.StepType === 'TaskGraph'));
  }

  get isParentStep(): boolean {
    // STRUCTURAL, not type-gated. Anything holding children can be opened — a loop's iterations, a
    // workflow's steps, a nested run. The old test required `type === 'step'`, so a ForEach that
    // came from a task graph rendered its children into the model and then offered no way to reach
    // them: the work existed, was loaded, and was unreachable.
    return !this.isSubAgent && this.hasChildren;
  }

  get canExpand(): boolean {
    // Can expand if it's a sub-agent OR if it's a parent step with children
    return this.isSubAgent || this.isParentStep;
  }

  get canNavigateToEntity(): boolean {
    // For steps, check if it's a type that has a target and if TargetLogID exists
    if (this.item.type === 'step' && this.item.data) {
      const stepType = this.item.data.StepType;
      return (stepType === 'Actions' || stepType === 'Prompt' || stepType === 'Sub-Agent') 
        && !!this.item.data.TargetLogID;
    }
    return false;
  }

  get entityNavigationText(): string {
    // For step types, check the StepType
    if (this.item.type === 'step' && this.item.data) {
      const stepType = this.item.data.StepType;
      switch (stepType.trim().toLowerCase()) {
        case 'actions':
          return 'View Action Log';
        case 'prompt':
          return 'View Prompt Run';
        case 'sub-agent':
          return 'View Agent Run';
        case 'taskgraph':
          return 'View Workflow Run';
        default:
          return 'View Details';
      }
    }

    return "";
  }

  getStatusIcon(status: string): string {
    const iconMap: Record<string, string> = {
      'Running': 'fa-circle-notch fa-spin',
      'Completed': 'fa-check-circle',
      'Failed': 'fa-times-circle',
      'Cancelled': 'fa-ban',
      'Paused': 'fa-pause-circle'
    };
    return iconMap[status] || 'fa-question-circle';
  }

  handleClick() {
    this.itemClick.emit(this.item);
  }

  handleExpandToggle(event: Event) {
    if (this.canExpand) {
      this.expandToggle.emit(event);
    }
  }

  navigateToRecord(event: Event) {
    event.stopPropagation();
    
    if (!this.canNavigateToEntity) return;

    let entityName = '';
    let recordId = '';

    // For step types, use TargetLogID and determine entity based on StepType
    if (this.item.type === 'step' && this.item.data) {
      recordId = this.item.data.TargetLogID;
      const stepType = this.item.data.StepType;
      
      switch (stepType.trim().toLowerCase()) {
        case 'actions':
          entityName = 'MJ: Action Execution Logs';
          break;
        case 'prompt':
          entityName = 'MJ: AI Prompt Runs';
          break;
        case 'sub-agent':
          entityName = 'MJ: AI Agent Runs';
          break;
      }
    } else {
      // For direct types, use the item ID
      recordId = this.item.id;
      
      switch (this.item.type.trim().toLowerCase()) {
        case 'actions':
          entityName = 'MJ: Action Execution Logs';
          break;
        case 'prompt':
          entityName = 'MJ: AI Prompt Runs';
          break;
        case 'sub-agent':
          entityName = 'MJ: AI Agent Runs';
          break;
      }
    }

    if (entityName && recordId) {
      this.navigateToEntity.emit({ entityName, recordId });
    }
  }

  /**
   * Skill-invocation records associated with this step (parsed from `AIAgentRunStep.Skills`).
   * Non-empty on Skill steps (the activation performed), Prompt steps (skills in effect for
   * the turn), and Actions/Sub-Agent steps whose tool was granted by a skill rather than a
   * native agent grant.
   */
  get SkillInvocations(): MJAIAgentRunStepEntity_AgentSkillInvocation[] {
    const raw = this.item.type === 'step' ? this.item.data?.Skills : null;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Tooltip summarizing an invocation's provenance for the badge hover. */
  public GetSkillChipTooltip(inv: MJAIAgentRunStepEntity_AgentSkillInvocation): string {
    const who = inv.ActivationType === 'requested' ? 'requested by the user (/skill mention)' : 'self-activated by the agent';
    const reason = inv.Reason ? ` — ${inv.Reason}` : '';
    return `${inv.SkillName}: ${who}${reason}`;
  }

  getAdditionalInfo(): string {
    if (this.item.type === 'step' && this.item.data) {
      const step = this.item.data;
      const parts = [];

      if (step.TargetActionName) {
        parts.push(`Action: ${step.TargetActionName}`);
      }
      if (step.Error) {
        parts.push('Error occurred');
      }

      return parts.join(' • ');
    }

    if (this.item.type === 'action' && this.item.data) {
      const log = this.item.data;
      if (log.Message) {
        return log.Message.substring(0, 100) + (log.Message.length > 100 ? '...' : '');
      }
    }

    return '';
  }

  onLogoError(event: Event): void {
    // Hide the broken image and show the icon instead by clearing logoUrl
    const imgElement = event.target as HTMLImageElement;
    imgElement.style.display = 'none';
    this.item.logoUrl = undefined;
  }
}
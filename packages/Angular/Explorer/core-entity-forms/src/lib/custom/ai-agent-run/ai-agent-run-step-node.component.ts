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
  @Input() Item!: TimelineItem;

  /** @deprecated Use {@link Item}. */
  @Input() set item(value: TimelineItem) {
    this.Item = value;
  }
  /** @deprecated Use {@link Item}. */
  get item(): TimelineItem {
    return this.Item;
  }
  @Input() IsSelected = false;

  /** @deprecated Use {@link IsSelected}. */
  @Input() set isSelected(value: AIAgentRunStepNodeComponent['IsSelected']) {
    this.IsSelected = value;
  }
  /** @deprecated Use {@link IsSelected}. */
  get isSelected(): AIAgentRunStepNodeComponent['IsSelected'] {
    return this.IsSelected;
  }
  @Output() ItemClick = new EventEmitter<TimelineItem>();

  /**
   * @deprecated Use {@link ItemClick}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (itemClick) keeps working. Must stay AFTER ItemClick: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() itemClick = this.ItemClick;
  @Output() ExpandToggle = new EventEmitter<Event>();

  /**
   * @deprecated Use {@link ExpandToggle}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (expandToggle) keeps working. Must stay AFTER ExpandToggle: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() expandToggle = this.ExpandToggle;
  @Output() NavigateToEntity = new EventEmitter<{ entityName: string; recordId: string }>();

  /**
   * @deprecated Use {@link NavigateToEntity}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (navigateToEntity) keeps working. Must stay AFTER NavigateToEntity: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() navigateToEntity = this.NavigateToEntity;

  get HasChildren(): boolean {
    return !!this.Item.children && this.Item.children.length > 0;
  }

  /** @deprecated Use {@link HasChildren}. */
  get hasChildren(): boolean {
    return this.HasChildren;
  }

  get IsSubAgent(): boolean {
    // A TaskGraph step expands too: it stands in for a whole graph of Task rows, and without the
    // affordance the run stops at "Task Graph: X" with no way to see what actually ran.
    return this.Item.type === 'subrun' ||
      (this.Item.type === 'step' && (this.Item.data?.StepType === 'Sub-Agent' || this.Item.data?.StepType === 'TaskGraph'));
  }

  /** @deprecated Use {@link IsSubAgent}. */
  get isSubAgent(): boolean {
    return this.IsSubAgent;
  }

  get IsParentStep(): boolean {
    // STRUCTURAL, not type-gated. Anything holding children can be opened — a loop's iterations, a
    // workflow's steps, a nested run. The old test required `type === 'step'`, so a ForEach that
    // came from a task graph rendered its children into the model and then offered no way to reach
    // them: the work existed, was loaded, and was unreachable.
    return !this.IsSubAgent && this.HasChildren;
  }

  /** @deprecated Use {@link IsParentStep}. */
  get isParentStep(): boolean {
    return this.IsParentStep;
  }

  get CanExpand(): boolean {
    // Can expand if it's a sub-agent OR if it's a parent step with children
    return this.IsSubAgent || this.IsParentStep;
  }

  /** @deprecated Use {@link CanExpand}. */
  get canExpand(): boolean {
    return this.CanExpand;
  }

  get CanNavigateToEntity(): boolean {
    // For steps, check if it's a type that has a target and if TargetLogID exists
    if (this.Item.type === 'step' && this.Item.data) {
      const stepType = this.Item.data.StepType;
      return (stepType === 'Actions' || stepType === 'Prompt' || stepType === 'Sub-Agent') 
        && !!this.Item.data.TargetLogID;
    }
    return false;
  }

  /** @deprecated Use {@link CanNavigateToEntity}. */
  get canNavigateToEntity(): boolean {
    return this.CanNavigateToEntity;
  }

  get EntityNavigationText(): string {
    // For step types, check the StepType
    if (this.Item.type === 'step' && this.Item.data) {
      const stepType = this.Item.data.StepType;
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

  /** @deprecated Use {@link EntityNavigationText}. */
  get entityNavigationText(): string {
    return this.EntityNavigationText;
  }

  /**
   * The glyph beside a row's status word.
   *
   * Covers BOTH status vocabularies' worth of meaning, because this list used to know only what an
   * `AIAgentRunStep` can be — `Running / Completed / Failed / Cancelled / Paused`. A workflow step is
   * `Pending`, `Skipped` or `Blocked` (and says `Complete`, not `Completed`), so every row belonging
   * to a task graph fell through to the unknown glyph and rendered a question mark. The projection
   * now normalizes the two vocabularies into one; these are the values it can produce.
   */
  GetStatusIcon(status: string): string {
    const iconMap: Record<string, string> = {
      'Running': 'fa-circle-notch fa-spin',
      'Completed': 'fa-check-circle',
      'Failed': 'fa-times-circle',
      'Cancelled': 'fa-ban',
      'Paused': 'fa-pause-circle',
      // A branch the workflow did not take. Not a failure and not a pause — deliberately its own
      // glyph, because reading it as either sends someone hunting for a problem that never happened.
      'Skipped': 'fa-diamond-turn-right',
      'Pending': 'fa-hourglass-half',
      // Failure-driven unsatisfiability: something upstream broke and this can no longer run.
      'Blocked': 'fa-circle-exclamation',
      'Waiting': 'fa-user-clock'
    };
    return iconMap[status] || 'fa-question-circle';
  }

  /** @deprecated Use {@link GetStatusIcon}. */
  getStatusIcon(status: string): string {
    return this.GetStatusIcon(status);
  }

  HandleClick() {
    this.ItemClick.emit(this.Item);
  }

  /** @deprecated Use {@link HandleClick}. */
  handleClick() {
    return this.HandleClick();
  }

  HandleExpandToggle(event: Event) {
    if (this.CanExpand) {
      this.ExpandToggle.emit(event);
    }
  }

  /** @deprecated Use {@link HandleExpandToggle}. */
  handleExpandToggle(event: Event) {
    return this.HandleExpandToggle(event);
  }

  NavigateToRecord(event: Event) {
    event.stopPropagation();
    
    if (!this.CanNavigateToEntity) return;

    let entityName = '';
    let recordId = '';

    // For step types, use TargetLogID and determine entity based on StepType
    if (this.Item.type === 'step' && this.Item.data) {
      recordId = this.Item.data.TargetLogID;
      const stepType = this.Item.data.StepType;
      
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
      recordId = this.Item.id;
      
      switch (this.Item.type.trim().toLowerCase()) {
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
      this.NavigateToEntity.emit({ entityName, recordId });
    }
  }

  /** @deprecated Use {@link NavigateToRecord}. */
  navigateToRecord(event: Event) {
    return this.NavigateToRecord(event);
  }

  /**
   * Skill-invocation records associated with this step (parsed from `AIAgentRunStep.Skills`).
   * Non-empty on Skill steps (the activation performed), Prompt steps (skills in effect for
   * the turn), and Actions/Sub-Agent steps whose tool was granted by a skill rather than a
   * native agent grant.
   */
  get SkillInvocations(): MJAIAgentRunStepEntity_AgentSkillInvocation[] {
    const raw = this.Item.type === 'step' ? this.Item.data?.Skills : null;
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

  GetAdditionalInfo(): string {
    if (this.Item.type === 'step' && this.Item.data) {
      const step = this.Item.data;
      const parts = [];

      if (step.TargetActionName) {
        parts.push(`Action: ${step.TargetActionName}`);
      }
      if (step.Error) {
        parts.push('Error occurred');
      }

      return parts.join(' • ');
    }

    if (this.Item.type === 'action' && this.Item.data) {
      const log = this.Item.data;
      if (log.Message) {
        return log.Message.substring(0, 100) + (log.Message.length > 100 ? '...' : '');
      }
    }

    return '';
  }

  /** @deprecated Use {@link GetAdditionalInfo}. */
  getAdditionalInfo(): string {
    return this.GetAdditionalInfo();
  }

  OnLogoError(event: Event): void {
    // Hide the broken image and show the icon instead by clearing logoUrl
    const imgElement = event.target as HTMLImageElement;
    imgElement.style.display = 'none';
    this.Item.logoUrl = undefined;
  }

  /** @deprecated Use {@link OnLogoError}. */
  onLogoError(event: Event): void {
    return this.OnLogoError(event);
  }
}
import { Component, Input, Output, EventEmitter, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { FlowConnection } from '../interfaces/flow-types';

/** Step type accent color mapping */
const STEP_TYPE_COLORS: Record<string, string> = {
  Action: '#3b82f6',
  Prompt: '#8b5cf6',
  'Sub-Agent': '#10b981',
  ForEach: '#f59e0b',
  While: '#f59e0b'
};

/** Step type icon mapping */
const STEP_TYPE_ICONS: Record<string, string> = {
  Action: 'fa-bolt',
  Prompt: 'fa-comment-dots',
  'Sub-Agent': 'fa-robot',
  ForEach: 'fa-arrows-spin',
  While: 'fa-rotate'
};

/**
 * Properties panel for editing AI Agent step and path configurations.
 * Shows context-aware sections based on the selected step type.
 */
@Component({
  standalone: false,
  selector: 'mj-agent-properties-panel',
  templateUrl: './agent-properties-panel.component.html',
  styleUrls: ['./agent-properties-panel.component.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Default
})
export class AgentPropertiesPanelComponent {
  // ── Inputs ──────────────────────────────────────────────────
  @Input() Step: AIAgentStepEntity | null = null;
  @Input() SelectedConnection: FlowConnection | null = null;
  @Input() PathEntity: AIAgentStepPathEntity | null = null;
  @Input() ReadOnly = false;
  @Input() Actions: Array<{ ID: string; Name: string; IconClass?: string | null }> = [];
  @Input() Prompts: Array<{ ID: string; Name: string }> = [];
  @Input() Agents: Array<{ ID: string; Name: string; IconClass?: string | null; LogoURL?: string | null }> = [];
  @Input() AllSteps: AIAgentStepEntity[] = [];

  // ── Outputs ─────────────────────────────────────────────────
  @Output() StepChanged = new EventEmitter<AIAgentStepEntity>();
  @Output() PathChanged = new EventEmitter<AIAgentStepPathEntity>();
  @Output() DeleteStepRequested = new EventEmitter<AIAgentStepEntity>();
  @Output() DeletePathRequested = new EventEmitter<AIAgentStepPathEntity>();
  @Output() CloseRequested = new EventEmitter<void>();

  // ── Collapsible section state ─────────────────────────────
  protected collapsedSections: Record<string, boolean> = {};

  // ── Computed Properties ─────────────────────────────────────

  get isStepSelected(): boolean {
    return this.Step != null;
  }

  get isConnectionSelected(): boolean {
    return this.SelectedConnection != null && this.PathEntity != null;
  }

  get showActionPicker(): boolean {
    return this.Step?.StepType === 'Action' ||
           ((this.Step?.StepType === 'ForEach' || this.Step?.StepType === 'While') && this.Step?.LoopBodyType === 'Action');
  }

  get showPromptPicker(): boolean {
    return this.Step?.StepType === 'Prompt' ||
           ((this.Step?.StepType === 'ForEach' || this.Step?.StepType === 'While') && this.Step?.LoopBodyType === 'Prompt');
  }

  get showAgentPicker(): boolean {
    return this.Step?.StepType === 'Sub-Agent' ||
           ((this.Step?.StepType === 'ForEach' || this.Step?.StepType === 'While') && this.Step?.LoopBodyType === 'Sub-Agent');
  }

  get showLoopConfig(): boolean {
    return this.Step?.StepType === 'ForEach' || this.Step?.StepType === 'While';
  }

  get stepTypeLabel(): string {
    switch (this.Step?.StepType) {
      case 'Action': return 'Action';
      case 'Prompt': return 'Prompt';
      case 'Sub-Agent': return 'Sub-Agent';
      case 'ForEach': return 'For Each Loop';
      case 'While': return 'While Loop';
      default: return 'Step';
    }
  }

  get stepTypeColor(): string {
    return STEP_TYPE_COLORS[this.Step?.StepType ?? ''] ?? '#64748b';
  }

  get stepTypeIcon(): string {
    return STEP_TYPE_ICONS[this.Step?.StepType ?? ''] ?? 'fa-circle-nodes';
  }

  get statusColor(): string {
    switch (this.Step?.Status) {
      case 'Active': return '#10b981';
      case 'Disabled': return '#94a3b8';
      case 'Pending': return '#f59e0b';
      default: return '#94a3b8';
    }
  }

  /** Path: origin step name */
  get originStepName(): string {
    if (!this.PathEntity) return '';
    const step = this.AllSteps.find(s => s.ID === this.PathEntity!.OriginStepID);
    return step?.Name ?? 'Unknown Step';
  }

  /** Path: destination step name */
  get destinationStepName(): string {
    if (!this.PathEntity) return '';
    const step = this.AllSteps.find(s => s.ID === this.PathEntity!.DestinationStepID);
    return step?.Name ?? 'Unknown Step';
  }

  /** Path: whether a condition is set */
  get isConditionalPath(): boolean {
    return this.PathEntity?.Condition != null && this.PathEntity.Condition.trim().length > 0;
  }

  /** Path accent color */
  get pathAccentColor(): string {
    return this.isConditionalPath ? '#f59e0b' : '#94a3b8';
  }

  /** Resolved action name for display */
  get selectedActionName(): string {
    if (!this.Step?.ActionID) return 'None selected';
    return this.Actions.find(a => a.ID === this.Step!.ActionID)?.Name ?? 'Unknown';
  }

  /** Resolved prompt name for display */
  get selectedPromptName(): string {
    if (!this.Step?.PromptID) return 'None selected';
    return this.Prompts.find(p => p.ID === this.Step!.PromptID)?.Name ?? 'Unknown';
  }

  /** Resolved agent name for display */
  get selectedAgentName(): string {
    if (!this.Step?.SubAgentID) return 'None selected';
    return this.Agents.find(a => a.ID === this.Step!.SubAgentID)?.Name ?? 'Unknown';
  }

  // ── Section Collapse ──────────────────────────────────────

  ToggleSection(sectionId: string): void {
    this.collapsedSections[sectionId] = !this.collapsedSections[sectionId];
  }

  IsSectionCollapsed(sectionId: string): boolean {
    return this.collapsedSections[sectionId] === true;
  }

  // ── Step Event Handlers ─────────────────────────────────────

  OnNameChange(value: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.Name = value;
    this.StepChanged.emit(this.Step);
  }

  OnDescriptionChange(value: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.Description = value;
    this.StepChanged.emit(this.Step);
  }

  OnStatusChange(value: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.Status = value as 'Active' | 'Disabled' | 'Pending';
    this.StepChanged.emit(this.Step);
  }

  OnStartingStepChange(checked: boolean): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.StartingStep = checked;
    this.StepChanged.emit(this.Step);
  }

  OnActionChange(actionId: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.ActionID = actionId || null;
    this.StepChanged.emit(this.Step);
  }

  OnPromptChange(promptId: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.PromptID = promptId || null;
    this.StepChanged.emit(this.Step);
  }

  OnSubAgentChange(agentId: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.SubAgentID = agentId || null;
    this.StepChanged.emit(this.Step);
  }

  OnLoopBodyTypeChange(value: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.LoopBodyType = value as 'Action' | 'Prompt' | 'Sub-Agent';
    this.StepChanged.emit(this.Step);
  }

  OnInputMappingChange(value: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.ActionInputMapping = value || null;
    this.StepChanged.emit(this.Step);
  }

  OnOutputMappingChange(value: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.ActionOutputMapping = value || null;
    this.StepChanged.emit(this.Step);
  }

  OnErrorBehaviorChange(value: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.OnErrorBehavior = value as 'fail' | 'continue' | 'retry';
    this.StepChanged.emit(this.Step);
  }

  OnRetryCountChange(value: number): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.RetryCount = value;
    this.StepChanged.emit(this.Step);
  }

  OnTimeoutChange(value: number): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.TimeoutSeconds = value;
    this.StepChanged.emit(this.Step);
  }

  OnConfigurationChange(value: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.Configuration = value || null;
    this.StepChanged.emit(this.Step);
  }

  // ── Path Event Handlers ─────────────────────────────────────

  OnPathDescriptionChange(value: string): void {
    if (!this.PathEntity || this.ReadOnly) return;
    this.PathEntity.Description = value;
    this.PathChanged.emit(this.PathEntity);
  }

  OnPathConditionChange(value: string): void {
    if (!this.PathEntity || this.ReadOnly) return;
    this.PathEntity.Condition = value || null;
    this.PathChanged.emit(this.PathEntity);
  }

  OnPathPriorityChange(value: number): void {
    if (!this.PathEntity || this.ReadOnly) return;
    this.PathEntity.Priority = value;
    this.PathChanged.emit(this.PathEntity);
  }

  OnDeleteStep(): void {
    if (this.Step) {
      this.DeleteStepRequested.emit(this.Step);
    }
  }

  OnDeletePath(): void {
    if (this.PathEntity) {
      this.DeletePathRequested.emit(this.PathEntity);
    }
  }

  // ── Template Helpers ──────────────────────────────────────

  /** Safely extract string value from an input/textarea/select change event */
  protected InputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** Safely extract checked state from a checkbox change event */
  protected CheckedValue(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** Safely extract numeric value from a number input event */
  protected NumericValue(event: Event): number {
    return +(event.target as HTMLInputElement).value;
  }

  /** Format JSON for display */
  protected FormatJsonDisplay(value: string | null | undefined): string {
    if (!value) return '';
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
}

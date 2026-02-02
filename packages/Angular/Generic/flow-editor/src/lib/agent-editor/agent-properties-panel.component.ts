import { Component, Input, Output, EventEmitter, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { AIAgentStepEntity, AIAgentStepPathEntity } from '@memberjunction/core-entities';
import { FlowConnection } from '../interfaces/flow-types';

/**
 * Properties panel for editing AI Agent step and path configurations.
 * Shows context-aware sections based on the selected step type.
 */
@Component({
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
  @Input() Actions: Array<{ ID: string; Name: string }> = [];
  @Input() Prompts: Array<{ ID: string; Name: string }> = [];
  @Input() Agents: Array<{ ID: string; Name: string }> = [];

  // ── Outputs ─────────────────────────────────────────────────
  @Output() StepChanged = new EventEmitter<AIAgentStepEntity>();
  @Output() PathChanged = new EventEmitter<AIAgentStepPathEntity>();
  @Output() DeleteStepRequested = new EventEmitter<AIAgentStepEntity>();
  @Output() CloseRequested = new EventEmitter<void>();

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
}

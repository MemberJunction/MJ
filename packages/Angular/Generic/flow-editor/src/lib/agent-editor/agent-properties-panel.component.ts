import { Component, Input, Output, EventEmitter, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';
import { FlowConnection, PromptOption } from '../interfaces/flow-types';
import { UUIDsEqual } from '@memberjunction/global';
import {
  FLOW_DECISION_KEY_PATTERN,
  FlowDecisionStepConfiguration,
  ReadFlowDecisionStepConfiguration,
  RewriteDecisionReferences,
  DecisionChoiceTestOf,
  IsDecisionPrompt
} from '@memberjunction/ai-core-plus';
import type { TaskGraphDecisionQuestion } from '@memberjunction/ai-core-plus';

/** Step type accent color mapping */
const STEP_TYPE_COLORS: Record<string, string> = {
  Action: '#3b82f6',
  Prompt: '#8b5cf6',
  Decision: '#0891b2',
  'Sub-Agent': '#10b981',
  ForEach: '#f59e0b',
  While: '#f59e0b'
};

/** Step type icon mapping */
const STEP_TYPE_ICONS: Record<string, string> = {
  Action: 'fa-bolt',
  Prompt: 'fa-comment-dots',
  Decision: 'fa-scale-balanced',
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
  @Input() Step: MJAIAgentStepEntity | null = null;
  @Input() SelectedConnection: FlowConnection | null = null;
  @Input() PathEntity: MJAIAgentStepPathEntity | null = null;
  @Input() ReadOnly = false;
  @Input() Actions: Array<{ ID: string; Name: string; IconClass?: string | null }> = [];
  @Input() Prompts: PromptOption[] = [];
  @Input() DecisionModelTypeID: string | null = null;
  @Input() Agents: Array<{ ID: string; Name: string; IconClass?: string | null; LogoURL?: string | null }> = [];
  @Input() AllSteps: MJAIAgentStepEntity[] = [];
  @Input() AllPaths: MJAIAgentStepPathEntity[] = [];

  // ── Outputs ─────────────────────────────────────────────────
  @Output() StepChanged = new EventEmitter<MJAIAgentStepEntity>();
  @Output() PathChanged = new EventEmitter<MJAIAgentStepPathEntity>();
  @Output() DeleteStepRequested = new EventEmitter<MJAIAgentStepEntity>();
  @Output() DeletePathRequested = new EventEmitter<MJAIAgentStepPathEntity>();
  @Output() CloseRequested = new EventEmitter<void>();

  // ── Collapsible section state ─────────────────────────────
  protected collapsedSections: Record<string, boolean> = {};

  // ── Computed Properties ─────────────────────────────────────

  get IsStepSelected(): boolean {
    return this.Step != null;
  }

  /** @deprecated Use {@link IsStepSelected}. */
  get isStepSelected(): boolean {
    return this.IsStepSelected;
  }

  get IsConnectionSelected(): boolean {
    return this.SelectedConnection != null && this.PathEntity != null;
  }

  /** @deprecated Use {@link IsConnectionSelected}. */
  get isConnectionSelected(): boolean {
    return this.IsConnectionSelected;
  }

  get ShowActionPicker(): boolean {
    return this.Step?.StepType === 'Action' ||
           ((this.Step?.StepType === 'ForEach' || this.Step?.StepType === 'While') && this.Step?.LoopBodyType === 'Action');
  }

  /** @deprecated Use {@link ShowActionPicker}. */
  get showActionPicker(): boolean {
    return this.ShowActionPicker;
  }

  get ShowPromptPicker(): boolean {
    return this.Step?.StepType === 'Prompt' ||
           ((this.Step?.StepType === 'ForEach' || this.Step?.StepType === 'While') && this.Step?.LoopBodyType === 'Prompt');
  }

  /** @deprecated Use {@link ShowPromptPicker}. */
  get showPromptPicker(): boolean {
    return this.ShowPromptPicker;
  }

  get ShowAgentPicker(): boolean {
    return this.Step?.StepType === 'Sub-Agent' ||
           ((this.Step?.StepType === 'ForEach' || this.Step?.StepType === 'While') && this.Step?.LoopBodyType === 'Sub-Agent');
  }

  /** @deprecated Use {@link ShowAgentPicker}. */
  get showAgentPicker(): boolean {
    return this.ShowAgentPicker;
  }

  get ShowLoopConfig(): boolean {
    return this.Step?.StepType === 'ForEach' || this.Step?.StepType === 'While';
  }

  /** @deprecated Use {@link ShowLoopConfig}. */
  get showLoopConfig(): boolean {
    return this.ShowLoopConfig;
  }

  get StepTypeLabel(): string {
    switch (this.Step?.StepType) {
      case 'Action': return 'Action';
      case 'Prompt': return 'Prompt';
      case 'Decision': return 'Decision';
      case 'Sub-Agent': return 'Sub-Agent';
      case 'ForEach': return 'For Each Loop';
      case 'While': return 'While Loop';
      default: return 'Step';
    }
  }

  /** @deprecated Use {@link StepTypeLabel}. */
  get stepTypeLabel(): string {
    return this.StepTypeLabel;
  }

  get StepTypeColor(): string {
    return STEP_TYPE_COLORS[this.Step?.StepType ?? ''] ?? '#64748b';
  }

  /** @deprecated Use {@link StepTypeColor}. */
  get stepTypeColor(): string {
    return this.StepTypeColor;
  }

  get StepTypeIcon(): string {
    return STEP_TYPE_ICONS[this.Step?.StepType ?? ''] ?? 'fa-circle-nodes';
  }

  /** @deprecated Use {@link StepTypeIcon}. */
  get stepTypeIcon(): string {
    return this.StepTypeIcon;
  }

  get StatusColor(): string {
    switch (this.Step?.Status) {
      case 'Active': return '#10b981';
      case 'Disabled': return '#94a3b8';
      case 'Pending': return '#f59e0b';
      default: return '#94a3b8';
    }
  }

  /** @deprecated Use {@link StatusColor}. */
  get statusColor(): string {
    return this.StatusColor;
  }

  /** Path: origin step name */
  get OriginStepName(): string {
    if (!this.PathEntity) return '';
    const step = this.AllSteps.find(s => UUIDsEqual(s.ID, this.PathEntity!.OriginStepID));
    return step?.Name ?? 'Unknown Step';
  }

  /** @deprecated Use {@link OriginStepName}. */
  get originStepName(): string {
    return this.OriginStepName;
  }

  /** Path: destination step name */
  get DestinationStepName(): string {
    if (!this.PathEntity) return '';
    const step = this.AllSteps.find(s => UUIDsEqual(s.ID, this.PathEntity!.DestinationStepID));
    return step?.Name ?? 'Unknown Step';
  }

  /** @deprecated Use {@link DestinationStepName}. */
  get destinationStepName(): string {
    return this.DestinationStepName;
  }

  /** Path: whether a condition is set */
  get IsConditionalPath(): boolean {
    return this.PathEntity?.Condition != null && this.PathEntity.Condition.trim().length > 0;
  }

  /** @deprecated Use {@link IsConditionalPath}. */
  get isConditionalPath(): boolean {
    return this.IsConditionalPath;
  }

  /** Path accent color */
  get PathAccentColor(): string {
    return this.IsConditionalPath ? '#f59e0b' : '#94a3b8';
  }

  /** @deprecated Use {@link PathAccentColor}. */
  get pathAccentColor(): string {
    return this.PathAccentColor;
  }

  /** Resolved action name for display */
  get SelectedActionName(): string {
    if (!this.Step?.ActionID) return 'None selected';
    return this.Actions.find(a => UUIDsEqual(a.ID, this.Step!.ActionID))?.Name ?? 'Unknown';
  }

  /** @deprecated Use {@link SelectedActionName}. */
  get selectedActionName(): string {
    return this.SelectedActionName;
  }

  /** Resolved prompt name for display */
  get SelectedPromptName(): string {
    if (!this.Step?.PromptID) return 'None selected';
    return this.Prompts.find(p => UUIDsEqual(p.ID, this.Step!.PromptID))?.Name ?? 'Unknown';
  }

  /** @deprecated Use {@link SelectedPromptName}. */
  get selectedPromptName(): string {
    return this.SelectedPromptName;
  }

  /** Resolved agent name for display */
  get SelectedAgentName(): string {
    if (!this.Step?.SubAgentID) return 'None selected';
    return this.Agents.find(a => UUIDsEqual(a.ID, this.Step!.SubAgentID))?.Name ?? 'Unknown';
  }

  /** @deprecated Use {@link SelectedAgentName}. */
  get selectedAgentName(): string {
    return this.SelectedAgentName;
  }

  // ── Decision Step Properties & Getters ────────────────────

  get ShowDecisionConfig(): boolean {
    return this.Step?.StepType === 'Decision';
  }

  /** @deprecated Use {@link ShowDecisionConfig}. */
  get showDecisionConfig(): boolean {
    return this.ShowDecisionConfig;
  }

  get DecisionPrompts(): PromptOption[] {
    return this.Prompts.filter(p => IsDecisionPrompt(p, this.DecisionModelTypeID));
  }

  get SelectedDecisionPromptName(): string {
    if (!this.Step?.PromptID) return 'Default Decision (system default)';
    return this.Prompts.find(p => UUIDsEqual(p.ID, this.Step!.PromptID))?.Name ?? 'Unknown Prompt';
  }

  get DecisionConfig(): FlowDecisionStepConfiguration {
    if (!this.Step?.Configuration) {
      return { key: 'decision', state: 'payload', questions: {} };
    }
    const read = ReadFlowDecisionStepConfiguration(this.Step.Configuration);
    if ('Config' in read) {
      return read.Config;
    }
    try {
      const parsed = JSON.parse(this.Step.Configuration);
      if (parsed && typeof parsed === 'object') {
        return {
          key: typeof parsed.key === 'string' ? parsed.key : 'decision',
          state: typeof parsed.state === 'string' ? parsed.state : 'payload',
          questions: parsed.questions && typeof parsed.questions === 'object' ? parsed.questions : {}
        };
      }
    } catch {
      // ignore
    }
    return { key: 'decision', state: 'payload', questions: {} };
  }

  get DecisionValidationError(): string | null {
    if (this.Step?.StepType !== 'Decision') return null;
    const read = ReadFlowDecisionStepConfiguration(this.Step?.Configuration);
    return 'Error' in read ? read.Error : null;
  }

  get DecisionKeyError(): string | null {
    if (this.Step?.StepType !== 'Decision') return null;
    const key = this.DecisionConfig.key;
    if (!key || !key.trim()) {
      return 'Key is required';
    }
    const trimmed = key.trim();
    if (!FLOW_DECISION_KEY_PATTERN.test(trimmed)) {
      return 'Key must start with a letter or underscore, and contain only letters, numbers, and underscores';
    }
    const duplicate = this.AllSteps.some(s => {
      if (UUIDsEqual(s.ID, this.Step?.ID) || s.StepType !== 'Decision' || !s.Configuration) return false;
      try {
        const parsed = JSON.parse(s.Configuration);
        return parsed && parsed.key === trimmed;
      } catch {
        return false;
      }
    });
    if (duplicate) {
      return `Key "${trimmed}" is already used by another Decision step`;
    }
    return null;
  }

  get DecisionStateError(): string | null {
    if (this.Step?.StepType !== 'Decision') return null;
    const state = this.DecisionConfig.state;
    if (state !== undefined && state !== null && state.trim().length > 0) {
      const trimmed = state.trim();
      if (trimmed !== 'payload' && !trimmed.startsWith('payload.')) {
        return 'State must be "payload" or start with "payload."';
      }
    }
    return null;
  }

  get DecisionQuestionsList(): Array<{ key: string; question: TaskGraphDecisionQuestion }> {
    const questions = this.DecisionConfig.questions || {};
    return Object.entries(questions).map(([key, question]) => ({ key, question }));
  }

  AsChoiceQuestion(question: TaskGraphDecisionQuestion): { kind: 'Choice'; instructions: string; options: Array<{ value: string; description: string }>; minConfidence?: number } {
    return question as { kind: 'Choice'; instructions: string; options: Array<{ value: string; description: string }>; minConfidence?: number };
  }

  AsScoreQuestion(question: TaskGraphDecisionQuestion): { kind: 'Score'; instructions: string; levels: string[]; minConfidence?: number } {
    return question as { kind: 'Score'; instructions: string; levels: string[]; minConfidence?: number };
  }

  // ── Decision Step Mutators ────────────────────────────────

  OnDecisionKeyChange(newKey: string): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const oldKey = currentConfig.key;
    const updated: FlowDecisionStepConfiguration = { ...currentConfig, key: newKey };
    this.updateDecisionConfig(updated);

    if (oldKey && newKey && oldKey !== newKey) {
      for (const path of this.AllPaths) {
        if (path.Condition) {
          const rewrite = RewriteDecisionReferences(path.Condition, k => k === oldKey ? newKey : undefined);
          if (rewrite.Expression !== path.Condition) {
            path.Condition = rewrite.Expression;
            this.PathChanged.emit(path);
          }
        }
      }
    }
  }

  OnDecisionPromptChange(promptId: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.Step.PromptID = promptId ? promptId : null;
    this.StepChanged.emit(this.Step);
  }

  OnDecisionStateChange(newState: string): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const updated: FlowDecisionStepConfiguration = {
      ...currentConfig,
      state: newState.trim().length > 0 ? newState.trim() : 'payload'
    };
    this.updateDecisionConfig(updated);
  }

  OnAddDecisionQuestion(): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    let counter = 1;
    while (questions[`question_${counter}`]) {
      counter++;
    }
    const newKey = `question_${counter}`;
    questions[newKey] = {
      kind: 'Likelihood',
      instructions: ''
    };
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnRemoveDecisionQuestion(key: string): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    delete questions[key];
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnDecisionQuestionKeyChange(oldKey: string, newKey: string): void {
    if (!this.Step || this.ReadOnly || oldKey === newKey) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    if (!questions[oldKey]) return;
    if (questions[newKey]) return;
    const question = questions[oldKey];
    delete questions[oldKey];
    questions[newKey] = question;
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnDecisionQuestionKindChange(key: string, kind: 'Likelihood' | 'Choice' | 'Score'): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    const existing = questions[key];
    if (!existing) return;

    if (kind === 'Likelihood') {
      questions[key] = {
        kind: 'Likelihood',
        instructions: existing.instructions,
        ...(existing.minConfidence !== undefined ? { minConfidence: existing.minConfidence } : {})
      };
    } else if (kind === 'Choice') {
      questions[key] = {
        kind: 'Choice',
        instructions: existing.instructions,
        options: [
          { value: 'option_1', description: 'First option' },
          { value: 'option_2', description: 'Second option' }
        ],
        ...(existing.minConfidence !== undefined ? { minConfidence: existing.minConfidence } : {})
      };
    } else if (kind === 'Score') {
      questions[key] = {
        kind: 'Score',
        instructions: existing.instructions,
        levels: ['Lowest / poor', 'Highest / good'],
        ...(existing.minConfidence !== undefined ? { minConfidence: existing.minConfidence } : {})
      };
    }
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnDecisionQuestionInstructionsChange(key: string, instructions: string): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    if (!questions[key]) return;
    questions[key] = { ...questions[key], instructions };
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnDecisionQuestionMinConfidenceChange(key: string, value: string): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    if (!questions[key]) return;
    const trimmed = value.trim();
    if (trimmed === '') {
      const q = { ...questions[key] };
      delete q.minConfidence;
      questions[key] = q;
    } else {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) {
        questions[key] = { ...questions[key], minConfidence: num };
      }
    }
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnAddChoiceOption(questionKey: string): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    const q = questions[questionKey];
    if (!q || q.kind !== 'Choice') return;
    const options = [...(q.options || [])];
    const newIdx = options.length + 1;
    options.push({ value: `option_${newIdx}`, description: '' });
    questions[questionKey] = { ...q, options };
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnRemoveChoiceOption(questionKey: string, index: number): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    const q = questions[questionKey];
    if (!q || q.kind !== 'Choice') return;
    const options = q.options.filter((_, i) => i !== index);
    questions[questionKey] = { ...q, options };
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnChoiceOptionChange(questionKey: string, index: number, field: 'value' | 'description', val: string): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    const q = questions[questionKey];
    if (!q || q.kind !== 'Choice') return;
    const options = q.options.map((opt, i) => i === index ? { ...opt, [field]: val } : opt);
    questions[questionKey] = { ...q, options };
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  GetChoiceCoverageHint(questionKey: string, options: Array<{ value: string; description: string }>): string {
    if (!this.Step) return '';
    return this.computeChoiceCoverageHint(this.Step.ID, this.DecisionConfig.key, questionKey, options);
  }

  OnAddScoreLevel(questionKey: string): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    const q = questions[questionKey];
    if (!q || q.kind !== 'Score') return;
    const levels = [...(q.levels || [])];
    levels.push('');
    questions[questionKey] = { ...q, levels };
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnRemoveScoreLevel(questionKey: string, index: number): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    const q = questions[questionKey];
    if (!q || q.kind !== 'Score') return;
    const levels = q.levels.filter((_, i) => i !== index);
    questions[questionKey] = { ...q, levels };
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnScoreLevelChange(questionKey: string, index: number, desc: string): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    const q = questions[questionKey];
    if (!q || q.kind !== 'Score') return;
    const levels = q.levels.map((lvl, i) => i === index ? desc : lvl);
    questions[questionKey] = { ...q, levels };
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  OnMoveScoreLevel(questionKey: string, index: number, direction: 'up' | 'down'): void {
    if (!this.Step || this.ReadOnly) return;
    const currentConfig = this.DecisionConfig;
    const questions = { ...currentConfig.questions };
    const q = questions[questionKey];
    if (!q || q.kind !== 'Score') return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= q.levels.length) return;
    const levels = [...q.levels];
    const temp = levels[index];
    levels[index] = levels[targetIndex];
    levels[targetIndex] = temp;
    questions[questionKey] = { ...q, levels };
    this.updateDecisionConfig({ ...currentConfig, questions });
  }

  private updateDecisionConfig(config: FlowDecisionStepConfiguration): void {
    if (!this.Step) return;
    this.Step.Configuration = JSON.stringify(config, null, 2);
    this.StepChanged.emit(this.Step);
  }

  // ── Route on Answer (Path Helper) ─────────────────────────

  protected routeQuestionKey: string = '';
  protected routeChoiceOption: string = '';
  protected routeLikelihoodThreshold: number = 0.8;
  protected routeScoreLevelIndex: number = 0;

  get OriginDecisionStep(): MJAIAgentStepEntity | null {
    if (!this.PathEntity?.OriginStepID) return null;
    const step = this.AllSteps.find(s => UUIDsEqual(s.ID, this.PathEntity!.OriginStepID));
    return step?.StepType === 'Decision' ? step : null;
  }

  get OriginDecisionConfig(): FlowDecisionStepConfiguration | null {
    const origin = this.OriginDecisionStep;
    if (!origin?.Configuration) return null;
    const read = ReadFlowDecisionStepConfiguration(origin.Configuration);
    if ('Config' in read) return read.Config;
    try {
      const parsed = JSON.parse(origin.Configuration);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // ignore
    }
    return null;
  }

  get OriginDecisionQuestions(): Array<{ key: string; question: TaskGraphDecisionQuestion }> {
    const config = this.OriginDecisionConfig;
    if (!config?.questions) return [];
    return Object.entries(config.questions).map(([key, question]) => ({ key, question }));
  }

  get SelectedRouteQuestionKey(): string {
    const list = this.OriginDecisionQuestions;
    if (list.length === 0) return '';
    if (this.routeQuestionKey && list.some(q => q.key === this.routeQuestionKey)) {
      return this.routeQuestionKey;
    }
    return list[0].key;
  }

  get RouteSelectedQuestion(): TaskGraphDecisionQuestion | null {
    const key = this.SelectedRouteQuestionKey;
    if (!key) return null;
    const config = this.OriginDecisionConfig;
    return config?.questions?.[key] ?? null;
  }

  get RouteChoiceOptions(): Array<{ value: string; description: string }> {
    const q = this.RouteSelectedQuestion;
    if (q && q.kind === 'Choice' && Array.isArray(q.options)) {
      return q.options;
    }
    return [];
  }

  get SelectedRouteChoiceOption(): string {
    const options = this.RouteChoiceOptions;
    if (options.length === 0) return '';
    if (this.routeChoiceOption && options.some(o => o.value === this.routeChoiceOption)) {
      return this.routeChoiceOption;
    }
    return options[0].value;
  }

  get RouteScoreLevels(): string[] {
    const q = this.RouteSelectedQuestion;
    if (q && q.kind === 'Score' && Array.isArray(q.levels)) {
      return q.levels;
    }
    return [];
  }

  get RouteChoiceCoverageHint(): string {
    const origin = this.OriginDecisionStep;
    const config = this.OriginDecisionConfig;
    const qKey = this.SelectedRouteQuestionKey;
    const q = this.RouteSelectedQuestion;
    if (!origin || !config || !qKey || !q || q.kind !== 'Choice') return '';
    return this.computeChoiceCoverageHint(origin.ID, config.key, qKey, q.options || []);
  }

  OnRouteQuestionChange(key: string): void {
    this.routeQuestionKey = key;
    this.routeChoiceOption = '';
    this.routeScoreLevelIndex = 0;
  }

  OnRouteChoiceOptionChange(option: string): void {
    this.routeChoiceOption = option;
  }

  OnRouteLikelihoodThresholdChange(threshold: number): void {
    this.routeLikelihoodThreshold = threshold;
  }

  OnRouteScoreLevelChange(index: number): void {
    this.routeScoreLevelIndex = index;
  }

  GetGeneratedRouteCondition(): string {
    const config = this.OriginDecisionConfig;
    const qKey = this.SelectedRouteQuestionKey;
    const q = this.RouteSelectedQuestion;
    if (!config || !qKey || !q) return '';

    if (q.kind === 'Choice') {
      const opt = this.SelectedRouteChoiceOption;
      return `decisions.${config.key}.${qKey}.value === '${opt}'`;
    }
    if (q.kind === 'Likelihood') {
      const prob = this.routeLikelihoodThreshold ?? 0.8;
      return `decisions.${config.key}.${qKey}.probability >= ${prob}`;
    }
    if (q.kind === 'Score') {
      const idx = this.routeScoreLevelIndex ?? 0;
      return `decisions.${config.key}.${qKey}.value >= ${idx}`;
    }
    return '';
  }

  ApplyRouteCondition(): void {
    if (!this.PathEntity || this.ReadOnly) return;
    const cond = this.GetGeneratedRouteCondition();
    if (cond) {
      this.PathEntity.Condition = cond;
      this.PathChanged.emit(this.PathEntity);
    }
  }

  private computeChoiceCoverageHint(
    stepId: string,
    stepKey: string,
    questionKey: string,
    options: Array<{ value: string; description: string }>
  ): string {
    if (!options || options.length === 0) return '';
    const outgoingPaths = this.AllPaths.filter(p => UUIDsEqual(p.OriginStepID, stepId));
    const coveredValues = new Set<string>();
    for (const p of outgoingPaths) {
      if (!p.Condition) continue;
      const test = DecisionChoiceTestOf(p.Condition);
      if (test && test.NodeId === stepKey && test.QuestionKey === questionKey) {
        for (const v of test.Values) {
          coveredValues.add(v);
        }
      }
    }
    const allValues = options.map(o => o.value);
    const missing = allValues.filter(v => !coveredValues.has(v));
    const coveredCount = allValues.length - missing.length;
    if (missing.length === 0) {
      return `Paths cover all ${allValues.length} options`;
    }
    return `Paths cover ${coveredCount} of ${allValues.length} options (missing: ${missing.join(', ')})`;
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

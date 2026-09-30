import { Component, Input, Output, EventEmitter, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';
import { FlowConnection, PromptOption } from '../interfaces/flow-types';
import { UUIDsEqual } from '@memberjunction/global';
import {
  FlowDecisionKeyProblem,
  FlowDecisionStepConfiguration,
  ReadFlowDecisionStepConfiguration,
  RewriteDecisionReferences,
  DecisionChoiceTestOf,
  DecisionConditionLiteral,
  DecisionReferenceText,
  IsDecisionPrompt
} from '@memberjunction/ai-core-plus';
import type { TaskGraphDecisionQuestion } from '@memberjunction/ai-core-plus';
import { DECISION_QUESTION_KEY_PATTERN, ReadDecisionStepKey, ReadEditableDecisionConfig } from './decision-step-config';

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

/** What a Decision question asks for. */
type DecisionQuestionKind = TaskGraphDecisionQuestion['kind'];

/** One option of a Choice question. */
type ChoiceOption = Extract<TaskGraphDecisionQuestion, { kind: 'Choice' }>['options'][number];

/** The kinds the question editor offers, in the order it lists them. */
const DECISION_QUESTION_KINDS: readonly DecisionQuestionKind[] = ['Likelihood', 'Choice', 'Score'];

/** A runtime problem phrase ("its key ... cannot be named ...") as a sentence on its own. */
function capitalize(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

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
  /** The selected step. Selecting a different one drops whatever was typed but not committed for the last. */
  @Input()
  set Step(value: MJAIAgentStepEntity | null) {
    if (!UUIDsEqual(value?.ID, this._step?.ID)) {
      this.clearDecisionDrafts();
    }
    this._step = value;
  }
  get Step(): MJAIAgentStepEntity | null {
    return this._step;
  }
  private _step: MJAIAgentStepEntity | null = null;

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

  get DecisionPrompts(): PromptOption[] {
    return this.Prompts.filter(p => IsDecisionPrompt(p, this.DecisionModelTypeID));
  }

  get SelectedDecisionPromptName(): string {
    if (!this.Step?.PromptID) return 'Default Decision (system default)';
    return this.Prompts.find(p => UUIDsEqual(p.ID, this.Step!.PromptID))?.Name ?? 'Unknown Prompt';
  }

  /**
   * The step's configuration as the runtime reads it or, while the runtime still refuses it, the parts
   * that parse — so an unfinished step can be shown and finished. Whether it can run is
   * {@link DecisionValidationError}'s answer, which is the runtime's.
   */
  get DecisionConfig(): FlowDecisionStepConfiguration {
    return ReadEditableDecisionConfig(this.Step?.Configuration) ?? { key: '', questions: {} };
  }

  get DecisionValidationError(): string | null {
    if (this.Step?.StepType !== 'Decision') return null;
    const read = ReadFlowDecisionStepConfiguration(this.Step?.Configuration);
    return 'Error' in read ? read.Error : null;
  }

  /** The key field's text: what the author is typing, until it is committed; the stored key otherwise. */
  get DecisionKeyText(): string {
    return this.keyDraftFor(this.Step) ?? this.DecisionConfig.key;
  }

  /**
   * Why the key in the field cannot be committed, or `null`. Judged as it is typed, so the author sees
   * the problem before committing, with the runtime's own wording for a key a condition cannot name.
   */
  get DecisionKeyError(): string | null {
    if (!this.ShowDecisionConfig) return null;
    return this.decisionKeyProblem(this.DecisionKeyText.trim());
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

  /** A Choice question's options; empty for any other kind, or a Choice stored without them. */
  ChoiceOptionsOf(question: TaskGraphDecisionQuestion): ChoiceOption[] {
    return question.kind === 'Choice' && Array.isArray(question.options) ? question.options : [];
  }

  /** A Score question's levels, lowest first; empty for any other kind, or a Score stored without them. */
  ScoreLevelsOf(question: TaskGraphDecisionQuestion): string[] {
    return question.kind === 'Score' && Array.isArray(question.levels) ? question.levels : [];
  }

  /**
   * What is wrong with question `questionKey`'s key: why the last rename of it was refused, or — for a
   * key stored before the editor held keys to a shape — that a condition cannot name it with dots.
   */
  QuestionKeyError(questionKey: string): string | null {
    const refused = this.questionKeyErrors.get(questionKey);
    if (refused) return refused;
    return DECISION_QUESTION_KEY_PATTERN.test(questionKey)
      ? null
      : `Question key "${questionKey}" cannot be named in a path condition with dots; rename it using letters, digits and underscores, not starting with a digit`;
  }

  // ── Decision Step Mutators ────────────────────────────────

  /**
   * The key field's `input` event: records what the author typed, and nothing else.
   *
   * The key is not stored, and no path condition is touched, until the author commits it
   * ({@link OnDecisionKeyCommit}). Renaming on every keystroke passed each in-between value through
   * the flow's conditions: typing through another step's key merged the two steps' references, and
   * clearing the field on the way to a new key stranded them on a fragment of the old one.
   */
  OnDecisionKeyChange(value: string): void {
    if (!this.Step || this.ReadOnly) return;
    this.keyDraft = { StepID: this.Step.ID, Value: value };
  }

  /** The key field's `change` event and Enter: commits what was typed. Refused keys stay in the field with their error. */
  OnDecisionKeyCommit(): void {
    const typed = this.keyDraftFor(this.Step);
    if (typed !== null) {
      this.RenameDecisionKey(typed);
    }
  }

  /**
   * Renames this Decision step's key and, in the same change, every path condition that names the step
   * by it.
   *
   * Refused — nothing stored, nothing rewritten — when the key is one a condition cannot name or another
   * Decision step already uses. Conditions follow only a key that named this step alone: when another
   * step shares the old key, nothing says which of the two a condition meant, so they are left for the
   * flow check to report rather than guessed at.
   *
   * @param newKey the key to give the step; surrounding whitespace is dropped
   * @returns why the key was refused, or `null` when it was stored (or unchanged)
   */
  RenameDecisionKey(newKey: string): string | null {
    if (!this.Step || this.ReadOnly || !this.ShowDecisionConfig) return null;
    const key = newKey.trim();
    const config = this.DecisionConfig;
    const previous = config.key;
    if (key === previous) {
      this.keyDraft = null;
      return null;
    }
    const problem = this.decisionKeyProblem(key);
    if (problem) {
      this.keyDraft = { StepID: this.Step.ID, Value: newKey };
      return problem;
    }

    this.keyDraft = null;
    this.updateDecisionConfig({ ...config, key });
    if (previous && !this.decisionStepUsingKey(previous)) {
      this.rewritePathConditions(condition =>
        RewriteDecisionReferences(condition, k => (k === previous ? key : undefined)).Expression);
    }
    return null;
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

  /**
   * The question key field's `change` event: renames the question, keeping its place in the list.
   *
   * Refused — nothing stored — when the key is empty, is not the identifier shape a step key has, or is
   * another question's key. A refused key stays in the field with {@link QuestionKeyError} beneath it.
   *
   * @returns why the key was refused, or `null`
   */
  OnDecisionQuestionKeyChange(oldKey: string, newKey: string): string | null {
    if (!this.Step || this.ReadOnly) return null;
    const config = this.DecisionConfig;
    if (!Object.prototype.hasOwnProperty.call(config.questions, oldKey)) return null;
    const key = newKey.trim();
    const problem = key === oldKey ? null : this.questionKeyProblem(key, config);
    if (problem) {
      this.questionKeyErrors.set(oldKey, problem);
      return problem;
    }
    this.questionKeyErrors.delete(oldKey);
    if (key === oldKey) return null;

    const questions = Object.fromEntries(
      Object.entries(config.questions).map(([k, question]) => [k === oldKey ? key : k, question])
    );
    this.updateDecisionConfig({ ...config, questions });
    return null;
  }

  /** The kind select's `change` event. A value the editor does not offer is ignored. */
  OnDecisionQuestionKindSelect(key: string, value: string): void {
    const kind = DECISION_QUESTION_KINDS.find(k => k === value);
    if (kind) {
      this.OnDecisionQuestionKindChange(key, kind);
    }
  }

  OnDecisionQuestionKindChange(key: string, kind: DecisionQuestionKind): void {
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
    let newIdx = options.length + 1;
    while (options.some(o => o.value === `option_${newIdx}`)) {
      newIdx++;
    }
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

  // ── Decision step: uncommitted edits and the flow's conditions ───────

  /** The key the author is typing into a Decision step's key field, before it is committed. */
  private keyDraft: { StepID: string; Value: string } | null = null;

  /** The typed, uncommitted key for `step`, or `null` when nothing is being typed for it. */
  private keyDraftFor(step: MJAIAgentStepEntity | null): string | null {
    return step && this.keyDraft && UUIDsEqual(this.keyDraft.StepID, step.ID) ? this.keyDraft.Value : null;
  }

  /** Why the last rename of each question was refused, by the question's current key. */
  private questionKeyErrors = new Map<string, string>();

  /** Forgets everything typed but not committed. */
  private clearDecisionDrafts(): void {
    this.keyDraft = null;
    this.questionKeyErrors.clear();
  }

  /** Why `key` cannot be a question key on this step, or `null`. */
  private questionKeyProblem(key: string, config: FlowDecisionStepConfiguration): string | null {
    if (!key) {
      return 'A question needs a key; path conditions read its answer by it';
    }
    if (!DECISION_QUESTION_KEY_PATTERN.test(key)) {
      return `Question key "${key}" cannot be named in a path condition; use letters, digits and underscores, not starting with a digit`;
    }
    return Object.prototype.hasOwnProperty.call(config.questions, key)
      ? `This step already asks a question keyed "${key}"`
      : null;
  }

  /** Why `key` cannot be this step's key, or `null`. The shape is the runtime's rule and wording. */
  private decisionKeyProblem(key: string): string | null {
    const problem = FlowDecisionKeyProblem(key);
    if (problem) return capitalize(problem);
    const owner = this.decisionStepUsingKey(key);
    return owner
      ? `Decision step "${owner.Name}" already uses the key "${key}"; each Decision step needs its own, so a path condition can say which one it reads`
      : null;
  }

  /**
   * Another Decision step whose configuration stores `key`, whether or not the runtime can read the rest
   * of it — a step still being written keeps its key, and sharing it would merge the two steps'
   * conditions once both run.
   */
  private decisionStepUsingKey(key: string): MJAIAgentStepEntity | null {
    return this.AllSteps.find(s =>
      s.StepType === 'Decision' && !UUIDsEqual(s.ID, this.Step?.ID) && ReadDecisionStepKey(s.Configuration) === key
    ) ?? null;
  }

  /** Applies `rewrite` to every path condition in the flow, and reports each path it changes. */
  private rewritePathConditions(rewrite: (condition: string) => string): void {
    for (const path of this.AllPaths) {
      if (!path.Condition) continue;
      const rewritten = rewrite(path.Condition);
      if (rewritten !== path.Condition) {
        path.Condition = rewritten;
        this.PathChanged.emit(path);
      }
    }
  }

  // ── Route on Answer (Path Helper) ─────────────────────────

  private routeQuestionKey = '';
  private routeChoiceOption = '';
  private routeThresholdText = '0.8';
  private routeScoreLevelIndex = 0;

  get OriginDecisionStep(): MJAIAgentStepEntity | null {
    if (!this.PathEntity?.OriginStepID) return null;
    const step = this.AllSteps.find(s => UUIDsEqual(s.ID, this.PathEntity!.OriginStepID));
    return step?.StepType === 'Decision' ? step : null;
  }

  get OriginDecisionConfig(): FlowDecisionStepConfiguration | null {
    return ReadEditableDecisionConfig(this.OriginDecisionStep?.Configuration);
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

  get RouteChoiceOptions(): ChoiceOption[] {
    const q = this.RouteSelectedQuestion;
    return q ? this.ChoiceOptionsOf(q) : [];
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
    return q ? this.ScoreLevelsOf(q) : [];
  }

  /** The threshold field's text, as typed — kept as text so an unfinished entry is not rewritten under the author. */
  get RouteThresholdText(): string {
    return this.routeThresholdText;
  }

  /** The chosen minimum Score level. */
  get RouteScoreLevelIndex(): number {
    return this.routeScoreLevelIndex;
  }

  /**
   * The Likelihood threshold typed, or `null` when there is none to use: an empty field is no threshold,
   * not zero (`probability >= 0` would take the path on every answer), and a probability outside 0..1
   * could never, or would always, be met.
   */
  get RouteLikelihoodThreshold(): number | null {
    const text = this.routeThresholdText.trim();
    const threshold = text === '' ? NaN : Number(text);
    return Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : null;
  }

  get RouteChoiceCoverageHint(): string {
    const origin = this.OriginDecisionStep;
    const config = this.OriginDecisionConfig;
    const qKey = this.SelectedRouteQuestionKey;
    const q = this.RouteSelectedQuestion;
    if (!origin || !config || !qKey || !q || q.kind !== 'Choice') return '';
    return this.computeChoiceCoverageHint(origin.ID, config.key, qKey, q.options || []);
  }

  /**
   * Why the helper cannot write a condition for the current choices, or `null` when it can (or there is
   * nothing to route on yet).
   */
  get RouteConditionProblem(): string | null {
    return this.buildRouteCondition().Problem;
  }

  OnRouteQuestionChange(key: string): void {
    this.routeQuestionKey = key;
    this.routeChoiceOption = '';
    this.routeScoreLevelIndex = 0;
  }

  OnRouteChoiceOptionChange(option: string): void {
    this.routeChoiceOption = option;
  }

  /** The threshold field's `input` event, with the text as typed. */
  OnRouteLikelihoodThresholdChange(text: string): void {
    this.routeThresholdText = text;
  }

  OnRouteScoreLevelChange(index: number): void {
    this.routeScoreLevelIndex = index;
  }

  /** The condition the helper would write, or `''` when it cannot write one ({@link RouteConditionProblem} says why). */
  GetGeneratedRouteCondition(): string {
    return this.buildRouteCondition().Condition;
  }

  ApplyRouteCondition(): void {
    if (!this.PathEntity || this.ReadOnly) return;
    const cond = this.GetGeneratedRouteCondition();
    if (cond) {
      this.PathEntity.Condition = cond;
      this.PathChanged.emit(this.PathEntity);
    }
  }

  /**
   * The condition for the current choices, written with the runtime's own writers so the runtime reads
   * back exactly the step, question and option chosen: a name that cannot follow a dot is bracketed,
   * and an option is quoted with a quote it does not contain.
   */
  private buildRouteCondition(): { Condition: string; Problem: string | null } {
    const none = (problem: string | null = null): { Condition: string; Problem: string | null } => ({ Condition: '', Problem: problem });
    const config = this.OriginDecisionConfig;
    const qKey = this.SelectedRouteQuestionKey;
    const q = this.RouteSelectedQuestion;
    if (!config || !qKey || !q) return none();
    if (!config.key) return none('This Decision step has no key yet; give it one before routing on its answers');

    const field = q.kind === 'Likelihood' ? 'probability' : 'value';
    const reference = DecisionReferenceText(config.key, qKey, field);
    if (!reference) {
      return none(`The key "${config.key}" or question "${qKey}" cannot be written in a condition; rename it using letters, digits and underscores`);
    }
    switch (q.kind) {
      case 'Choice': return this.choiceRouteCondition(reference);
      case 'Likelihood': {
        const threshold = this.RouteLikelihoodThreshold;
        return threshold === null
          ? none('Enter a probability threshold from 0 to 1')
          : { Condition: `${reference} >= ${threshold}`, Problem: null };
      }
      case 'Score': {
        const index = this.routeScoreLevelIndex;
        return index >= 0 && index < this.RouteScoreLevels.length
          ? { Condition: `${reference} >= ${index}`, Problem: null }
          : none('Choose the lowest level this path takes');
      }
      default:
        return none();
    }
  }

  private choiceRouteCondition(reference: string): { Condition: string; Problem: string | null } {
    const option = this.SelectedRouteChoiceOption;
    if (!option) return { Condition: '', Problem: 'This question has no options to route on yet' };
    const literal = DecisionConditionLiteral(option);
    return literal
      ? { Condition: `${reference} === ${literal}`, Problem: null }
      : { Condition: '', Problem: `The option "${option}" cannot be written in a condition: it holds a backslash, a line break, or both kinds of quote. Rename the option to route on it` };
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

  /** Blurs the event's target, so Enter commits a field the way leaving it does. */
  protected BlurTarget(event: Event): void {
    (event.target as HTMLElement).blur();
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

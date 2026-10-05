import { MJGlobal } from '@memberjunction/global';
import { AgentRubricEvaluator } from './AgentRubricEvaluator.js';
import { DecisionRubricEvaluator } from './DecisionRubricEvaluator.js';
import { DeterministicRubricEvaluator } from './DeterministicRubricEvaluator.js';
import { HumanRubricEvaluator } from './HumanRubricEvaluator.js';
import { LLMRubricEvaluator } from './LLMRubricEvaluator.js';
import { BaseRubricEvaluator } from './RubricEvaluator.js';
import type { RubricEvaluatorSettings, RubricEvaluatorType, RubricJsonValue, RubricModelSelection, RubricPromptMode } from './evaluatorServices.js';

/**
 * The built-in evaluators. Naming the classes keeps their modules, and so their `@RegisterClass`
 * registrations, in every bundle that imports the registry.
 */
export const BUILT_IN_RUBRIC_EVALUATORS = [
    LLMRubricEvaluator, DecisionRubricEvaluator, AgentRubricEvaluator, DeterministicRubricEvaluator, HumanRubricEvaluator,
] as const;

/** The evaluator that runs when nothing names one. */
export const DEFAULT_RUBRIC_EVALUATOR = 'LLM';

/**
 * Names that resolve to a registered evaluator. `AI` was the engine's word for the Agent
 * evaluator; `AIPrompt` is the EvaluatorType an LLM evaluation is stored with.
 */
const ALIASES: Record<string, string> = { ai: 'Agent', aiprompt: 'LLM' };

/** One registered evaluator, as {@link ListRubricEvaluators} reports it. */
export interface RubricEvaluatorInfo {
    Name: string;
    Type: RubricEvaluatorType;
    IsAutomated: boolean;
}

/** The registered name for an evaluator name or alias, trimmed. Does not check that it is registered. */
export function NormalizeRubricEvaluatorName(name: string): string {
    const trimmed = name.trim();
    return ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Creates the evaluator registered under a name or alias. The highest-priority registration wins,
 * so a host can replace a built-in by registering its own class under the same name.
 * Throws, listing the registered names, when nothing is registered under it.
 */
export function CreateRubricEvaluator(name: string): BaseRubricEvaluator {
    if (!name || !name.trim()) throw new Error('An evaluator name is required.');
    const key = NormalizeRubricEvaluatorName(name);
    const factory = MJGlobal.Instance.ClassFactory;
    if (!factory.GetRegistration(BaseRubricEvaluator, key)) {
        throw new Error(`No rubric evaluator is registered as "${name}". Registered: ${ListRubricEvaluators().map(item => item.Name).join(', ')}.`);
    }
    const evaluator = factory.CreateInstance<BaseRubricEvaluator>(BaseRubricEvaluator, key);
    if (!evaluator) throw new Error(`The rubric evaluator "${name}" could not be created.`);
    return evaluator;
}

/** Every registered evaluator, one entry per name, sorted by name. */
export function ListRubricEvaluators(): RubricEvaluatorInfo[] {
    const names = new Map<string, string>();
    for (const registration of MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseRubricEvaluator)) {
        const key = registration.Key?.trim();
        if (key && !names.has(key.toLowerCase())) names.set(key.toLowerCase(), key);
    }
    const infos: RubricEvaluatorInfo[] = [];
    for (const name of names.values()) {
        const evaluator = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRubricEvaluator>(BaseRubricEvaluator, name);
        if (evaluator) infos.push({ Name: name, Type: evaluator.EvaluatorType, IsAutomated: evaluator.IsAutomated });
    }
    return infos.sort((left, right) => left.Name.localeCompare(right.Name));
}

/** The evaluator name and settings an evaluator selection resolves to. */
export interface RubricEvaluatorChoice {
    Name: string;
    Settings: RubricEvaluatorSettings;
}

/**
 * Resolves an evaluator selection, the `AIAgentRubric.EvaluatorConfig` shape, to a registered name
 * and its settings. Accepts the parsed object or its JSON text. EvaluatorName wins; otherwise
 * EvaluatorType picks the built-in: AIPrompt is LLM, Agent is Agent, Deterministic is Deterministic.
 * An empty selection is {@link DEFAULT_RUBRIC_EVALUATOR}.
 *
 * Human, Self, and External with no EvaluatorName throw: a person or another system produces those
 * evaluations, so there is nothing for the engine to run.
 */
export function ResolveRubricEvaluatorSelection(selection: unknown): RubricEvaluatorChoice {
    const record = selectionRecord(selection);
    const name = textField(record, 'EvaluatorName') ?? nameForType(textField(record, 'EvaluatorType'));
    return { Name: NormalizeRubricEvaluatorName(name), Settings: settingsFrom(record) };
}

function selectionRecord(selection: unknown): Record<string, unknown> {
    if (selection === undefined || selection === null || selection === '') return {};
    if (typeof selection === 'string') {
        let parsed: unknown;
        try {
            parsed = JSON.parse(selection) as unknown;
        } catch (error) {
            throw new Error(`The evaluator config is not valid JSON. ${error instanceof Error ? error.message : String(error)}`);
        }
        return selectionRecord(parsed);
    }
    if (typeof selection !== 'object' || Array.isArray(selection)) throw new Error('The evaluator config must be a JSON object.');
    return selection as Record<string, unknown>;
}

function nameForType(type: string | undefined): string {
    if (type === undefined || type === 'AIPrompt') return DEFAULT_RUBRIC_EVALUATOR;
    if (type === 'Agent' || type === 'Deterministic') return type;
    const article = /^[AEIOU]/i.test(type) ? 'An' : 'A';
    throw new Error(`${article} ${type} evaluation is not run by the engine. Name a registered evaluator in EvaluatorName to run one.`);
}

function settingsFrom(record: Record<string, unknown>): RubricEvaluatorSettings {
    const settings: RubricEvaluatorSettings = {};
    for (const field of TEXT_SETTINGS) {
        const value = textField(record, field);
        if (value) settings[field] = value;
    }
    const selection = textField(record, 'ModelSelection');
    if (selection !== undefined) settings.ModelSelection = modelSelection(selection);
    const mode = textField(record, 'Mode');
    if (mode !== undefined) settings.Mode = promptMode(mode);
    if (typeof record.Samples === 'number' && Number.isFinite(record.Samples)) settings.Samples = record.Samples;
    if (record.Extensions && typeof record.Extensions === 'object' && !Array.isArray(record.Extensions)) {
        settings.Extensions = record.Extensions as Record<string, RubricJsonValue>;
    }
    return settings;
}

/** The settings copied as trimmed text when present. */
const TEXT_SETTINGS = [
    'PromptID', 'PromptName', 'SystemPromptID', 'SystemPromptName', 'CriterionPromptID', 'CriterionPromptName', 'ModelID', 'AgentID',
] as const;

function modelSelection(value: string): RubricModelSelection {
    if (value === 'System' || value === 'Judge') return value;
    throw new Error(`ModelSelection must be System or Judge, not ${value}.`);
}

function promptMode(value: string): RubricPromptMode {
    if (value === 'SinglePass' || value === 'PerCriterion') return value;
    throw new Error(`Mode must be SinglePass or PerCriterion, not ${value}.`);
}

function textField(record: Record<string, unknown>, field: string): string | undefined {
    const value = record[field];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

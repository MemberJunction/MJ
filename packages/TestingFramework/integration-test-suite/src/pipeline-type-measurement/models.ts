/**
 * models.ts — which model each arm was meant to measure, which models actually answered, and the
 * warnings when they differ.
 *
 * Pure. The rig does not pin a model: each prompt's own bindings choose, exactly as in production, and
 * that includes skipping a model with no API key and failing over. So "the Decision arm" is Jev only
 * while Jev answers. Without an OpenRouter key, or after a failover, `Default Decision` is answered by
 * LLM Decision instead. Each answer's model is read from its prompt run (`Model`, which a failover moves
 * to the model that answered), and compared with the model the arm is meant to measure: the
 * `--llm-model` / `--decision-model` flag, or else the prompt's first-choice binding.
 */
import type { MJAIPromptModelEntity } from '@memberjunction/core-entities';
import { MEASURED_PIPELINE_TYPES } from './types';
import type { ArmPrompt, ExpectedModel, MeasuredPipelineType, MeasurementOptions, PromptRunCost, RecordPrediction } from './types';

/** The prompt-model binding columns {@link FirstChoiceModel} reads. */
export type PromptModelBinding = Pick<MJAIPromptModelEntity, 'Model' | 'Priority' | 'Status' | 'ConfigurationID'>;

/** The binding statuses the prompt runner selects from. */
const SELECTABLE_BINDING_STATUSES: ReadonlyArray<PromptModelBinding['Status']> = ['Active', 'Preview'];

/** How many answers one model gave. */
export interface ModelCount {
    Model: string;
    Answers: number;
}

/** One arm's models: the one it was meant to measure, and the ones that answered. */
export interface ArmModelSummary {
    Expected: ExpectedModel;
    /** Each model that answered, most answers first. */
    Answered: ModelCount[];
    /** Answers that have a prompt run. */
    AnswersWithRun: number;
    /** Answers whose prompt run names a model other than the expected one. */
    UnexpectedAnswers: number;
    /** Answers whose prompt run's model could not be read (its row was not found). */
    UnknownModelAnswers: number;
}

/** The flag that names each arm's model. */
const MODEL_FLAGS: Record<MeasuredPipelineType, string> = { LLM: '--llm-model', Decision: '--decision-model' };

/**
 * The model the runner tries first for a prompt run with no configuration: the highest-priority
 * binding that has no configuration and is Active or Preview. Null when there is none.
 */
export function FirstChoiceModel(bindings: readonly PromptModelBinding[]): string | null {
    const selectable = bindings.filter((b) => b.ConfigurationID === null && SELECTABLE_BINDING_STATUSES.includes(b.Status));
    const first = [...selectable].sort((a, b) => (b.Priority || 0) - (a.Priority || 0))[0];
    return first?.Model || null;
}

/** Whether two model names are the same model (trimmed, case-insensitive). */
export function SameModel(a: string | null | undefined, b: string | null | undefined): boolean {
    return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Each arm's expected model: its flag when given, otherwise its prompt's first-choice model. */
export function ResolveExpectedModels(options: MeasurementOptions, prompts: Record<MeasuredPipelineType, ArmPrompt>): Record<MeasuredPipelineType, ExpectedModel> {
    const resolve = (type: MeasuredPipelineType, flagValue: string | null, promptName: string): ExpectedModel => {
        if (flagValue) {
            return { Model: flagValue, Source: 'flag', From: MODEL_FLAGS[type] };
        }
        const firstChoice = prompts[type].FirstChoiceModel;
        return firstChoice
            ? { Model: firstChoice, Source: 'prompt binding', From: `prompt '${promptName}'` }
            : { Model: null, Source: 'none', From: `prompt '${promptName}'` };
    };
    return {
        LLM: resolve('LLM', options.LLMModelName, options.LLMPromptName),
        Decision: resolve('Decision', options.DecisionModelName, options.DecisionPromptName),
    };
}

/**
 * Refuses `--require-model` when an arm has no model to require.
 * @throws Error naming each such arm and how to give it one.
 */
export function AssertModelsToRequire(expected: Record<MeasuredPipelineType, ExpectedModel>): void {
    const missing = MEASURED_PIPELINE_TYPES.filter((type) => !expected[type].Model);
    if (missing.length > 0) {
        const fixes = missing.map((type) => `pass ${MODEL_FLAGS[type]} for the ${type} arm (${expected[type].From} has no model bound)`);
        throw new Error(`--require-model needs a model for every arm: ${fixes.join('; ')}.`);
    }
}

/** One arm's answering models against its expected one. `predictions` are that arm's answers. */
export function SummarizeArmModels(predictions: readonly RecordPrediction[], costs: ReadonlyMap<string, PromptRunCost>, expected: ExpectedModel): ArmModelSummary {
    const counts = new Map<string, number>();
    let withRun = 0;
    let unknown = 0;
    for (const prediction of predictions) {
        if (!prediction.PromptRunID) {
            continue;
        }
        withRun += 1;
        const model = costs.get(prediction.PromptRunID)?.Model;
        if (!model) {
            unknown += 1;
            continue;
        }
        counts.set(model, (counts.get(model) ?? 0) + 1);
    }
    const answered = [...counts.entries()].map(([model, answers]) => ({ Model: model, Answers: answers })).sort((a, b) => b.Answers - a.Answers || a.Model.localeCompare(b.Model));
    const unexpected = expected.Model ? answered.filter((c) => !SameModel(c.Model, expected.Model)).reduce((sum, c) => sum + c.Answers, 0) : 0;
    return { Expected: expected, Answered: answered, AnswersWithRun: withRun, UnexpectedAnswers: unexpected, UnknownModelAnswers: unknown };
}

/** Models and their answer counts: `Jev (234)`, or `LLM Decision (200), Jev (34)`; `none read` when empty. */
export function FormatModelCounts(counts: readonly ModelCount[]): string {
    return counts.length === 0 ? 'none read' : counts.map((c) => `${c.Model} (${c.Answers})`).join(', ');
}

/** The expected model as the report states it: `Jev (--decision-model)`, or `none`. */
export function FormatExpectedModel(expected: ExpectedModel): string {
    return expected.Model ? `${expected.Model} (from ${expected.From})` : `none (${expected.From} has no model bound)`;
}

/** Why an arm's numbers are not its expected model's; null when they are. */
export function ModelMismatch(type: MeasuredPipelineType, summary: ArmModelSummary): string | null {
    const expected = summary.Expected.Model;
    if (!expected || summary.UnexpectedAnswers === 0) {
        return null;
    }
    const others = summary.Answered.filter((c) => !SameModel(c.Model, expected));
    return `The ${type} arm was meant to measure ${expected} (from ${summary.Expected.From}), but ${summary.UnexpectedAnswers} of its ` +
        `${summary.AnswersWithRun} answers came from another model: ${FormatModelCounts(others)}. Read the ${type} column as ` +
        `${others.length === 1 ? 'that model\'s' : 'those models\''} results, not ${expected}'s.`;
}

/** The warnings a report leads with: an arm answered by another model, or by more than one. */
export function ModelWarnings(summaries: Record<MeasuredPipelineType, ArmModelSummary>): string[] {
    return MEASURED_PIPELINE_TYPES.flatMap((type) => {
        const summary = summaries[type];
        const mismatch = ModelMismatch(type, summary);
        if (mismatch) {
            return [mismatch];
        }
        if (!summary.Expected.Model && summary.Answered.length > 1) {
            return [`The ${type} arm's answers came from more than one model: ${FormatModelCounts(summary.Answered)}.`];
        }
        return [];
    });
}

/** The notes on each arm's models: how they are read, and any answers whose model is unknown. */
export function ModelNotes(summaries: Record<MeasuredPipelineType, ArmModelSummary>): string[] {
    const unknown = MEASURED_PIPELINE_TYPES
        .filter((type) => summaries[type].UnknownModelAnswers > 0)
        .map((type) => `${type}: ${summaries[type].UnknownModelAnswers} answer(s) have a prompt run whose model could not be read, so which model gave them is unknown.`);
    return [
        'Each answer\'s model is its prompt run\'s Model (after a failover, the model it failed over to). The rig does not pin models: each prompt\'s bindings choose, as in production, so a model with no API key is skipped and a failing one can fail over. An arm is checked against --llm-model / --decision-model, or else its prompt\'s first-choice model.',
        ...unknown,
    ];
}

/** Each arm's model summary over all its answers. */
export function SummarizeModels(
    predictions: readonly RecordPrediction[],
    costs: ReadonlyMap<string, PromptRunCost>,
    expected: Record<MeasuredPipelineType, ExpectedModel>
): Record<MeasuredPipelineType, ArmModelSummary> {
    const summarize = (type: MeasuredPipelineType): ArmModelSummary => SummarizeArmModels(predictions.filter((p) => p.Type === type), costs, expected[type]);
    return { LLM: summarize('LLM'), Decision: summarize('Decision') };
}

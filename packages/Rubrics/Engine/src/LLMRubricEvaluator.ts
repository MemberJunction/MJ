import type { ChatMessageContent } from '@memberjunction/ai';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { CleanAndParseJSON, RegisterClass } from '@memberjunction/global';
import type { RubricSubjectContent } from './content.js';
import { BaseRubricEvaluator, type EvidenceRef } from './RubricEvaluator.js';
import type {
    RubricEvaluatorContext, RubricEvaluatorRun, RubricEvaluatorType, RubricJsonValue, RubricPromptMode, RubricPromptRef,
} from './evaluatorServices.js';
import {
    BuildCriteriaPromptData, BuildRubricVersionPromptData, BuildSubjectContent, LeafNodes,
    type RubricCriterionPromptData, type RubricPromptData,
} from './promptData.js';

/** The parent evaluator prompt when the settings name none. It owns the reply contract the engine parses. */
export const RUBRIC_EVALUATOR_PROMPT = 'Rubric Evaluator';

/** The judge prompt rendered into the evaluator prompt's `judgePrompt` slot when the settings name none. */
export const DEFAULT_RUBRIC_JUDGE_PROMPT = 'Rubric Evaluator - Default Judge';

/** The prompt that renders one criterion, for the LLM and Decision evaluators, when the settings name none. */
export const RUBRIC_CRITERION_PROMPT = 'Rubric Criterion';

/** The placeholder in the evaluator prompt's template that receives the rendered judge prompt. */
export const RUBRIC_JUDGE_PLACEHOLDER = 'judgePrompt';

/** The most times one evaluation may run the rubric when Samples is set. */
export const MAX_RUBRIC_SAMPLES = 9;

/** One call's input: the template data the prompts render, and the subject as its own user message. */
export interface RubricRunnerRequest {
    Data: RubricPromptData;
    /** The subject message: delimited text, then any frames as image blocks. */
    Subject: ChatMessageContent;
}

/** Runs one evaluator prompt call. Tests return JSON. Production goes through the prompt service. */
export interface RubricPromptRunner {
    run(request: RubricRunnerRequest): Promise<string>;
}

export interface LLMDecision {
    key?: string;
    level?: string;
    value?: number;
    notApplicable?: boolean;
    rationale?: string;
    /** A verbatim quote from the subject text, or the label of an attached frame. */
    evidence?: { quote?: string; frame?: string }[];
    /** SinglePass only. PerCriterion ignores this and uses the chosen level's probability. */
    confidence?: number;
    chosen?: string;
    probabilities?: Record<string, number>;
}

export interface LLMRubricResult extends RubricEvaluatorRun {
    droppedUnknownKeys: number;
    droppedQuotes: number;
    /** Set when Samples ran the rubric more than once. Distinct levels chosen for that criterion. */
    sampleSpread?: { key: string; levels: string[]; median: string }[];
}

/** The prompt a reference and its fallback name point at: the ID when set, else the name. */
export function PromptRef(id: string | undefined, name: string | undefined, fallbackName: string): RubricPromptRef {
    return id ? { ID: id } : { Name: name ?? fallbackName };
}

/**
 * Scores a rubric with a chat model, through prompts stored as metadata. Nothing here writes prompt
 * text: the engine builds template data and the prompts render it.
 *
 * - **Criterion prompt** (`Rubric Criterion`): renders each leaf into `Criterion.Text`. The Decision
 *   evaluator uses the same text, so both describe a criterion identically.
 * - **Evaluator prompt** (`Rubric Evaluator`, the parent): the rubric, the reply contract the engine
 *   parses, and a `judgePrompt` slot. Swap it only with a prompt that returns the same JSON.
 * - **Judge prompt** (`Rubric Evaluator - Default Judge`, the child): how to judge. This is the one a
 *   link swaps with PromptID or PromptName, for example a judge written for one agent.
 *
 * The parent and judge render into one system message, the way a loop agent's system prompt and
 * agent prompt do, in one model call with one prompt run. The subject is a separate user message
 * inside a nonce delimiter, so it never passes through a template.
 *
 * SinglePass asks once for the whole rubric. PerCriterion asks once per leaf, and confidence is the
 * probability of the chosen level. Samples runs the rubric several times and keeps each criterion's
 * median level. Unknown keys are dropped and counted. Levels map by label. A numeric value outside
 * the scale throws before scoring. A quote that is not in the subject text, or a frame that was not
 * attached, is dropped.
 */
@RegisterClass(BaseRubricEvaluator, 'LLM')
export class LLMRubricEvaluator extends BaseRubricEvaluator {
    public get EvaluatorName(): string {
        return 'LLM';
    }

    public get EvaluatorType(): RubricEvaluatorType {
        return 'AIPrompt';
    }

    /** The class factory passes no runner. {@link EvaluateRubric} builds one from the prompt service. */
    public constructor(
        private readonly runner?: RubricPromptRunner,
        private readonly mode: RubricPromptMode = 'SinglePass',
    ) {
        super();
    }

    /** Renders the criteria, runs the evaluator prompt with its judge, and records each prompt run. */
    public async EvaluateRubric(context: RubricEvaluatorContext): Promise<RubricEvaluatorRun> {
        const prompts = context.Services.Prompts;
        if (!prompts) throw new Error('An LLM evaluation requires a prompt service.');
        const settings = context.Settings;
        const system = PromptRef(settings.SystemPromptID, settings.SystemPromptName, RUBRIC_EVALUATOR_PROMPT);
        const judge = PromptRef(settings.PromptID, settings.PromptName, DEFAULT_RUBRIC_JUDGE_PROMPT);
        const criterionPrompt = PromptRef(settings.CriterionPromptID, settings.CriterionPromptName, RUBRIC_CRITERION_PROMPT);
        const criteria = await RenderCriteriaText(context.Version, prompts, criterionPrompt);
        const promptRunIds: string[] = [];
        const runner: RubricPromptRunner = {
            async run(request) {
                const output = await prompts.Run({
                    Prompt: system, Judge: judge, Data: request.Data, Subject: request.Subject,
                    ModelID: settings.ModelID, ModelSelection: settings.ModelSelection,
                });
                if (output.PromptRunID) promptRunIds.push(output.PromptRunID);
                return output.Text;
            },
        };
        const mode = settings.Mode ?? this.mode;
        const samples = SampleCount(settings.Samples);
        const evaluator = new LLMRubricEvaluator(runner, mode);
        const result = samples > 1
            ? await evaluator.EvaluateSamples(context.Version, context.Content, samples, criteria, context.Subject)
            : await evaluator.EvaluateContent(context.Version, context.Content, criteria, context.Subject);
        const metadata: Record<string, RubricJsonValue> = {
            SystemPrompt: system.ID ?? system.Name ?? null,
            JudgePrompt: judge.ID ?? judge.Name ?? null,
            CriterionPrompt: criterionPrompt.ID ?? criterionPrompt.Name ?? null,
            Mode: mode,
            Samples: samples,
            PromptRunIDs: promptRunIds,
            DroppedUnknownKeys: result.droppedUnknownKeys,
            DroppedQuotes: result.droppedQuotes,
        };
        if (settings.ModelID) metadata.ModelID = settings.ModelID;
        if (settings.ModelSelection) metadata.ModelSelection = settings.ModelSelection;
        return { ...result, aiPromptRunId: promptRunIds.length === 1 ? promptRunIds[0] : null, metadata };
    }

    private get promptRunner(): RubricPromptRunner {
        if (!this.runner) throw new Error('An LLM evaluation requires a prompt runner.');
        return this.runner;
    }

    /**
     * Runs the prompt and scores the accepted answers with RubricScoring. `criteria` is the template
     * data, already carrying each criterion's rendered Text; it defaults to data with no Text.
     */
    public async EvaluateContent(
        version: RubricVersionSnapshot,
        content: RubricSubjectContent,
        criteria: RubricCriterionPromptData[] = BuildCriteriaPromptData(version),
        subject: { entityName: string; recordId: string } = { entityName: '', recordId: '' },
    ): Promise<LLMRubricResult> {
        const text = content.text ?? '';
        const frames = new Set((content.images ?? []).map(image => image.label));
        const decisions = this.mode === 'SinglePass'
            ? await this.singlePass(version, content, criteria, subject)
            : await this.perCriterion(version, content, criteria, subject);
        let droppedUnknownKeys = 0;
        let droppedQuotes = 0;
        const byKey = new Map(LeafNodes(version).map(node => [node.key, node]));
        const candidates = [];
        for (const decision of decisions) {
            const node = decision.key ? byKey.get(decision.key) : undefined;
            if (!node) {
                droppedUnknownKeys += 1;
                continue;
            }
            const scale = version.scales.find(item => item.id === node.scaleId);
            if (decision.value !== undefined && decision.value !== null) {
                assertInScale(node.key, scale, decision.value);
            }
            const evidence: EvidenceRef[] = [];
            for (const item of decision.evidence ?? []) {
                if (item.frame !== undefined) {
                    if (frames.has(item.frame)) evidence.push({ ref: `frame:${item.frame}` });
                    else droppedQuotes += 1;
                    continue;
                }
                if (!item.quote || !text.includes(item.quote)) {
                    droppedQuotes += 1;
                    continue;
                }
                evidence.push({ ref: item.quote, quote: item.quote });
            }
            const levelLabel = this.mode === 'PerCriterion' ? decision.chosen ?? decision.level : decision.level;
            const level = levelLabel ? scale?.levels.find(item => item.label === levelLabel) : undefined;
            if (levelLabel && !level) throw new Error(`Unknown level "${levelLabel}" for ${node.key}.`);
            const confidence = this.mode === 'PerCriterion'
                ? perCriterionConfidence(decision, levelLabel)
                : decision.confidence ?? null;
            candidates.push({
                criterionId: node.id,
                scaleLevelId: level?.id ?? null,
                rawValue: decision.value ?? null,
                isNotApplicable: decision.notApplicable,
                rationale: decision.rationale ?? '',
                evidence,
                confidence,
            });
        }
        const scored = this.Evaluate(version, candidates);
        return { ...scored, droppedUnknownKeys, droppedQuotes };
    }

    /**
     * Runs the rubric n times. Each criterion keeps the median level by normalized
     * value, and the result records every level that appeared. Scoring runs once,
     * on those median answers.
     */
    public async EvaluateSamples(
        version: RubricVersionSnapshot,
        content: RubricSubjectContent,
        samples: number,
        criteria: RubricCriterionPromptData[] = BuildCriteriaPromptData(version),
        subject: { entityName: string; recordId: string } = { entityName: '', recordId: '' },
    ): Promise<LLMRubricResult> {
        const runs: LLMDecision[][] = [];
        for (let i = 0; i < samples; i++) {
            runs.push(this.mode === 'SinglePass'
                ? await this.singlePass(version, content, criteria, subject)
                : await this.perCriterion(version, content, criteria, subject));
        }
        const leaves = LeafNodes(version);
        const known = new Set(leaves.map(node => node.key));
        let droppedUnknownKeys = 0;
        for (const run of runs) {
            for (const decision of run) {
                if (!decision.key || !known.has(decision.key)) droppedUnknownKeys += 1;
            }
        }
        const chosen: LLMDecision[] = [];
        const sampleSpread: { key: string; levels: string[]; median: string }[] = [];
        for (const node of leaves) {
            const samples = runs
                .map(run => run.find(item => item.key === node.key))
                .filter((item): item is LLMDecision => !!item);
            const levels: string[] = [];
            for (const decision of samples) {
                if (decision.notApplicable) continue;
                const label = labelOf(this.mode, decision);
                if (label) levels.push(label);
            }
            if (levels.length > 0) {
                const median = medianLevel(version, node.scaleId, levels);
                sampleSpread.push({ key: node.key, levels, median });
                const sample = samples.find(item => labelOf(this.mode, item) === median);
                if (!sample) continue;
                const probability = sample.probabilities?.[median];
                chosen.push({
                    ...sample,
                    key: node.key,
                    level: median,
                    chosen: median,
                    confidence: probability ?? sample.confidence,
                });
                continue;
            }
            const notApplicable = samples.filter(item => item.notApplicable);
            if (notApplicable.length > 0) {
                sampleSpread.push({ key: node.key, levels: ['N/A'], median: 'N/A' });
                chosen.push({ ...notApplicable[0], key: node.key, notApplicable: true });
                continue;
            }
            const numeric = samples.filter(item => item.value != null);
            if (numeric.length === 0) continue;
            const values = numeric.map(item => item.value as number).sort((left, right) => left - right);
            const medianValue = values[Math.floor((values.length - 1) / 2)];
            const sample = numeric.find(item => item.value === medianValue) ?? numeric[0];
            sampleSpread.push({ key: node.key, levels: values.map(String), median: String(medianValue) });
            chosen.push({ ...sample, key: node.key, value: medianValue });
        }
        const once = new LLMRubricEvaluator({ async run() { return JSON.stringify({ decisions: chosen }); } }, 'SinglePass');
        const scored = await once.EvaluateContent(version, content, criteria, subject);
        return { ...scored, droppedUnknownKeys: scored.droppedUnknownKeys + droppedUnknownKeys, sampleSpread };
    }

    private async singlePass(
        version: RubricVersionSnapshot, content: RubricSubjectContent, criteria: RubricCriterionPromptData[], subject: { entityName: string; recordId: string },
    ): Promise<LLMDecision[]> {
        const raw = await this.promptRunner.run({ Data: PromptData(version, 'SinglePass', criteria, subject), Subject: BuildSubjectContent(content) });
        const parsed = CleanAndParseJSON<{ decisions?: LLMDecision[] } | LLMDecision[]>(raw);
        if (!parsed) return [];
        return Array.isArray(parsed) ? parsed : parsed.decisions ?? [];
    }

    private async perCriterion(
        version: RubricVersionSnapshot, content: RubricSubjectContent, criteria: RubricCriterionPromptData[], subject: { entityName: string; recordId: string },
    ): Promise<LLMDecision[]> {
        const decisions: LLMDecision[] = [];
        for (const criterion of criteria) {
            const raw = await this.promptRunner.run({ Data: PromptData(version, 'PerCriterion', [criterion], subject), Subject: BuildSubjectContent(content) });
            const parsed = CleanAndParseJSON<LLMDecision>(raw);
            decisions.push({ ...(parsed ?? {}), key: criterion.Key });
        }
        return decisions;
    }
}

/** The evaluator prompt's template data for one call. */
export function PromptData(
    version: RubricVersionSnapshot, mode: RubricPromptMode, criteria: RubricCriterionPromptData[], subject: { entityName: string; recordId: string },
): RubricPromptData {
    return {
        Rubric: BuildRubricVersionPromptData(version),
        Mode: mode,
        Criteria: criteria,
        Subject: { EntityName: subject.entityName, RecordID: subject.recordId },
    };
}

/**
 * Every leaf's template data with `Text` filled in by the criterion prompt, rendered in one batch.
 * Throws when the prompt returns a different number of texts than criteria.
 */
export async function RenderCriteriaText(
    version: RubricVersionSnapshot,
    prompts: { RenderCriteria(input: { Prompt: RubricPromptRef; Items: { Rubric: RubricPromptData['Rubric']; Criterion: RubricCriterionPromptData }[] }): Promise<string[]> },
    prompt: RubricPromptRef,
): Promise<RubricCriterionPromptData[]> {
    const rubric = BuildRubricVersionPromptData(version);
    const criteria = BuildCriteriaPromptData(version);
    const texts = await prompts.RenderCriteria({ Prompt: prompt, Items: criteria.map(criterion => ({ Rubric: rubric, Criterion: criterion })) });
    if (texts.length !== criteria.length) throw new Error(`The criterion prompt rendered ${texts.length} texts for ${criteria.length} criteria.`);
    return criteria.map((criterion, index) => ({ ...criterion, Text: texts[index] }));
}

/** Samples as a whole number of runs, at least one and at most {@link MAX_RUBRIC_SAMPLES}. */
function SampleCount(samples: number | undefined): number {
    if (samples === undefined || samples === null || !Number.isFinite(samples)) return 1;
    return Math.min(MAX_RUBRIC_SAMPLES, Math.max(1, Math.floor(samples)));
}

function perCriterionConfidence(decision: LLMDecision, chosen: string | undefined): number | null {
    if (!chosen || !decision.probabilities) return null;
    const probability = decision.probabilities[chosen];
    return probability === undefined ? null : probability;
}

function labelOf(mode: RubricPromptMode, decision: LLMDecision | undefined): string | undefined {
    if (!decision?.key) return undefined;
    return mode === 'PerCriterion' ? decision.chosen ?? decision.level : decision.level;
}

function medianLevel(version: RubricVersionSnapshot, scaleId: string | null | undefined, labels: string[]): string {
    const scale = version.scales.find(item => item.id === scaleId);
    const ranked = labels
        .map(label => ({ label, value: scale?.levels.find(level => level.label === label)?.normalizedValue ?? 0 }))
        .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
    return ranked[Math.floor((ranked.length - 1) / 2)].label;
}

function assertInScale(key: string, scale: RubricVersionSnapshot['scales'][number] | undefined, value: number): void {
    if (!scale || scale.scaleType !== 'Numeric' || scale.minValue == null || scale.maxValue == null) return;
    if (value < scale.minValue || value > scale.maxValue) {
        throw new Error(`${key} is outside ${scale.minValue}..${scale.maxValue}.`);
    }
}

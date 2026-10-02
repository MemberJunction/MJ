import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ScoreAnswer, ScoreQuestion } from '@memberjunction/ai';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { CleanAndParseJSON, RegisterClass } from '@memberjunction/global';
import type { RubricSubjectContent } from './content.js';
import { BaseRubricEvaluator, type EvidenceRef, type RubricEvaluatorOutput } from './RubricEvaluator.js';

export type RubricPromptMode = 'SinglePass' | 'PerCriterion';

/** The rubric, and the subject in a separate user message. */
export interface RubricEvaluatorMessages {
    system: string;
    user: string;
}

/** A prompt already split. Tests return JSON. Production calls the model. */
export interface RubricPromptRunner {
    run(prompt: RubricEvaluatorMessages): Promise<string>;
}

/** One ScoreQuestion about the subject. PerCriterion uses this instead of the whole-rubric prompt. */
export interface RubricDecisionRunner {
    score(key: string, question: ScoreQuestion, state: string): Promise<ScoreAnswer>;
}

/** Ordered levels, lowest to highest, for one criterion. Null when the scale has fewer than two labels. */
export function ScoreQuestionForCriterion(version: RubricVersionSnapshot, node: RubricNodeSnapshot): ScoreQuestion | null {
    const scale = version.scales.find(item => item.id === node.scaleId);
    const levels = [...(scale?.levels ?? [])].sort((left, right) => left.normalizedValue - right.normalizedValue || left.sequence - right.sequence);
    if (levels.length < 2) return null;
    return {
        Kind: 'Score',
        Instructions: renderCriterion(version, node),
        Levels: levels.map(level => level.label),
    };
}

export interface LLMDecision {
    key?: string;
    level?: string;
    value?: number;
    notApplicable?: boolean;
    rationale?: string;
    evidence?: { quote?: string }[];
    /** SinglePass only. PerCriterion ignores this and uses the chosen level's probability. */
    confidence?: number;
    chosen?: string;
    probabilities?: Record<string, number>;
}

export interface LLMRubricResult extends RubricEvaluatorOutput {
    droppedUnknownKeys: number;
    droppedQuotes: number;
    /** Set when Samples ran the rubric more than once. Distinct levels chosen for that criterion. */
    sampleSpread?: { key: string; levels: string[]; median: string }[];
}

/**
 * Renders the Rubric Evaluator prompt and runs it. SinglePass is one call for
 * the whole rubric. PerCriterion is one call per leaf, and confidence is the
 * probability of the chosen level. Unknown keys are dropped and counted.
 * Levels map by label. A numeric value outside the scale throws before
 * scoring. A quote that is not in the subject text is dropped.
 */
@RegisterClass(BaseRubricEvaluator, 'LLM')
export class LLMRubricEvaluator extends BaseRubricEvaluator {
    public get EvaluatorName(): string {
        return 'LLM';
    }
    public constructor(
        private readonly runner: RubricPromptRunner,
        private readonly mode: RubricPromptMode = 'SinglePass',
        private readonly decision?: RubricDecisionRunner,
    ) {
        super();
    }

    /**
     * Renders the prompt, runs it, and scores the accepted answers with RubricScoring.
     */
    public async EvaluateContent(version: RubricVersionSnapshot, content: RubricSubjectContent): Promise<LLMRubricResult> {
        const text = content.text ?? '';
        const decisions = this.mode === 'SinglePass'
            ? await this.singlePass(version, content)
            : await this.perCriterion(version, content);
        let droppedUnknownKeys = 0;
        let droppedQuotes = 0;
        const byKey = new Map(version.nodes.filter(node => node.nodeType === 'Criterion').map(node => [node.key, node]));
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
    public async EvaluateSamples(version: RubricVersionSnapshot, content: RubricSubjectContent, samples: number): Promise<LLMRubricResult> {
        const runs: LLMDecision[][] = [];
        for (let i = 0; i < samples; i++) {
            runs.push(this.mode === 'SinglePass' ? await this.singlePass(version, content) : await this.perCriterion(version, content));
        }
        const leaves = version.nodes.filter(node => node.nodeType === 'Criterion');
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
        const scored = await once.EvaluateContent(version, content);
        return { ...scored, droppedUnknownKeys: scored.droppedUnknownKeys + droppedUnknownKeys, sampleSpread };
    }

        private async singlePass(version: RubricVersionSnapshot, content: RubricSubjectContent): Promise<LLMDecision[]> {
        const raw = await this.runner.run(BuildRubricEvaluatorMessages(version, content, 'SinglePass'));
        const parsed = CleanAndParseJSON<{ decisions?: LLMDecision[] } | LLMDecision[]>(raw);
        if (!parsed) return [];
        return Array.isArray(parsed) ? parsed : parsed.decisions ?? [];
    }

    private async perCriterion(version: RubricVersionSnapshot, content: RubricSubjectContent): Promise<LLMDecision[]> {
        const decisions: LLMDecision[] = [];
        const state = SubjectBody(content);
        for (const node of version.nodes.filter(item => item.nodeType === 'Criterion')) {
            const question = ScoreQuestionForCriterion(version, node);
            if (question && this.decision) {
                const answer = await this.decision.score(node.key, question, state);
                const index = Math.min(question.Levels.length - 1, Math.max(0, Math.round(answer.Value)));
                const level = question.Levels[index];
                decisions.push({
                    key: node.key,
                    chosen: level,
                    level,
                    probabilities: answer.Probabilities,
                    confidence: answer.Probabilities?.[level] ?? answer.Confidence,
                    rationale: '',
                    evidence: [],
                });
                continue;
            }
            const raw = await this.runner.run(BuildRubricEvaluatorMessages(version, content, 'PerCriterion', node));
            const parsed = CleanAndParseJSON<LLMDecision>(raw);
            decisions.push({ ...(parsed ?? {}), key: node.key });
        }
        return decisions;
    }
}

/** Shipped next to src and dist, so an installed package does not read the MJ repo. Read once, not on every render. */
const TEMPLATE_URL = new URL('../templates/rubric-evaluator.md', import.meta.url);
const TEMPLATE_TEXT = readFileSync(TEMPLATE_URL, 'utf8');

/** The rendered prompt, system plus user, stays within this many characters. The subject is what gets cut. */
export const RUBRIC_PROMPT_BUDGET = 24_000;

const SUBJECT_HEADING = '## Subject content';

/** System message is the rubric. User message is the subject inside a nonce the subject cannot close. */
export function BuildRubricEvaluatorMessages(
    version: RubricVersionSnapshot,
    content: RubricSubjectContent,
    mode: RubricPromptMode,
    only?: RubricNodeSnapshot,
): RubricEvaluatorMessages {
    const body = SubjectBody(content);
    const nonce = UniqueNonce(body);
    const filled = FillRubricEvaluatorTemplate(TEMPLATE_TEXT, version, content, mode, only, nonce);
    const cut = filled.indexOf(SUBJECT_HEADING);
    if (cut < 0) {
        return { system: filled, user: DelimitSubject(body, nonce) };
    }
    return { system: filled.slice(0, cut).trimEnd(), user: filled.slice(cut).trim() };
}

/** The Rubric Evaluator template file, with its three tokens filled. */
export function RenderRubricEvaluatorPrompt(
    version: RubricVersionSnapshot,
    content: RubricSubjectContent,
    mode: RubricPromptMode,
    only?: RubricNodeSnapshot,
): string {
    return FillRubricEvaluatorTemplate(TEMPLATE_TEXT, version, content, mode, only);
}

/** Fills {{instructions}}, {{criteria}}, and {{content}} in one pass. The subject is inside a nonce delimiter. */
export function FillRubricEvaluatorTemplate(
    template: string,
    version: RubricVersionSnapshot,
    content: RubricSubjectContent,
    mode: RubricPromptMode,
    only?: RubricNodeSnapshot,
    nonce?: string,
): string {
    const nodes = only ? [only] : version.nodes.filter(node => node.nodeType === 'Criterion');
    const criteria = nodes.map(node => renderCriterion(version, node)).join('\n\n');
    const ask = mode === 'SinglePass'
        ? 'Return JSON {"decisions":[{"key","level","value","notApplicable","rationale","evidence":[{"quote"}],"confidence"}]} for every criterion.'
        : `Return JSON {"chosen","probabilities","rationale","evidence":[{"quote"}]} for ${only?.key}. confidence is probabilities[chosen].`;
    const reserved = ask.length + criteria.length + (version.instructions ?? '').length;
    const body = fitBudget(SubjectBody(content), Math.max(0, RUBRIC_PROMPT_BUDGET - reserved));
    const token = nonce ?? UniqueNonce(body);
    const values: Record<string, string> = {
        '{{instructions}}': [ask, version.instructions ?? ''].filter(part => part.length > 0).join('\n\n'),
        '{{criteria}}': criteria,
        '{{content}}': DelimitSubject(body, token),
    };
    return template.replace(/\{\{(?:instructions|criteria|content)\}\}/g, tokenName => values[tokenName] ?? tokenName);
}

function fitBudget(text: string, room: number): string {
    if (text.length <= room) return text;
    const note = '\n[truncated to the prompt budget]';
    const keep = Math.max(0, room - note.length);
    return text.slice(0, keep) + note;
}

function SubjectBody(content: RubricSubjectContent): string {
    const text = content.text ?? '';
    const data = content.data && Object.keys(content.data).length > 0 ? JSON.stringify(content.data) : '';
    return [text, data].filter(part => part.length > 0).join('\n');
}

function DelimitSubject(body: string, nonce: string): string {
    return `<rubric-subject ${nonce}>\n${body}\n</rubric-subject ${nonce}>`;
}

function UniqueNonce(body: string): string {
    for (let attempt = 0; attempt < 8; attempt++) {
        const nonce = randomBytes(16).toString('hex');
        if (!body.includes(nonce)) return nonce;
    }
    throw new Error('Could not delimit the subject.');
}

function perCriterionConfidence(decision: LLMDecision, chosen: string | undefined): number | null {
    if (!chosen || !decision.probabilities) return null;
    const probability = decision.probabilities[chosen];
    return probability === undefined ? null : probability;
}

function notApplicableLine(version: RubricVersionSnapshot, node: RubricNodeSnapshot): string {
    const policy = node.notApplicablePolicy ?? version.notApplicablePolicy ?? 'NotAllowed';
    if (policy === 'ExcludeAndRedistribute') return 'Not applicable is allowed. Exclude this criterion and redistribute its weight.';
    if (policy === 'CountAsZero') return 'Not applicable is allowed and counts as zero.';
    if (policy === 'FailEvaluation') return 'Not applicable fails the evaluation.';
    return 'Not applicable is not allowed. Choose a level.';
}

function renderCriterion(version: RubricVersionSnapshot, node: RubricNodeSnapshot): string {
    const scale = version.scales.find(item => item.id === node.scaleId);
    const anchors = new Map((node.anchors ?? []).map(anchor => [anchor.scaleLevelId ?? '', anchor.descriptor]));
    const levels = (scale?.levels ?? []).map(level => `- ${level.label} (${level.normalizedValue}): ${anchors.get(level.id) ?? ''}`).join('\n');
    const numeric = scale?.scaleType === 'Numeric'
        ? `Numeric ${scale.minValue}..${scale.maxValue}, step ${scale.step ?? 'any'}, higher is better: ${scale.higherIsBetter}`
        : levels;
    const ai = aiConfig(node);
    return [
        `### ${node.name} (${node.key})`,
        node.description ? `Description: ${node.description}` : '',
        `Guidance: ${node.guidance ?? ''}`,
        ai?.Hints ? `Hints: ${ai.Hints}` : '',
        ai?.RequireQuote ? 'A quote from the subject is required.' : '',
        `Not applicable: ${notApplicableLine(version, node)}`,
        numeric,
    ].filter(part => part.length > 0).join('\n\n');
}

function aiConfig(node: RubricNodeSnapshot): { Hints?: string; RequireQuote?: boolean } | undefined {
    const config = node.evaluatorConfig;
    if (!config || typeof config !== 'object') return undefined;
    const ai = (config as { AI?: { Hints?: string; RequireQuote?: boolean } }).AI;
    return ai && typeof ai === 'object' ? ai : undefined;
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

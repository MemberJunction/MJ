import { readFileSync } from 'node:fs';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { RubricSubjectContent } from './content.js';
import { RubricEvaluator, type EvidenceRef, type RubricEvaluatorOutput } from './RubricEvaluator.js';

export type RubricPromptMode = 'SinglePass' | 'PerCriterion';

/** A prompt already rendered. Tests return JSON. Production calls the model. */
export interface RubricPromptRunner {
    run(prompt: string): Promise<string>;
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
export class LLMRubricEvaluator extends RubricEvaluator {
    public constructor(private readonly runner: RubricPromptRunner, private readonly mode: RubricPromptMode = 'SinglePass') {
        super();
    }

    /**
     * Renders the prompt, runs it, and scores the accepted answers with RubricScoring.
     */
    public async evaluateContent(version: RubricVersionSnapshot, content: RubricSubjectContent): Promise<LLMRubricResult> {
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
        const scored = this.evaluate(version, candidates);
        return { ...scored, droppedUnknownKeys, droppedQuotes };
    }

    /**
     * Runs the rubric n times. Each criterion keeps the median level by normalized
     * value, and the result records every level that appeared. Scoring runs once,
     * on those median answers.
     */
    public async evaluateSamples(version: RubricVersionSnapshot, content: RubricSubjectContent, samples: number): Promise<LLMRubricResult> {
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
            const levels: string[] = [];
            for (const run of runs) {
                const decision = run.find(item => item.key === node.key);
                const label = labelOf(this.mode, decision);
                if (label) levels.push(label);
            }
            if (levels.length === 0) continue;
            const median = medianLevel(version, node.scaleId, levels);
            sampleSpread.push({ key: node.key, levels, median });
            const sample = runs.map(run => run.find(item => item.key === node.key)).find(item => labelOf(this.mode, item) === median);
            if (!sample) continue;
            const probability = sample.probabilities?.[median];
            chosen.push({
                ...sample,
                key: node.key,
                level: median,
                chosen: median,
                confidence: probability ?? sample.confidence,
            });
        }
        const once = new LLMRubricEvaluator({ async run() { return JSON.stringify({ decisions: chosen }); } }, 'SinglePass');
        const scored = await once.evaluateContent(version, content);
        return { ...scored, droppedUnknownKeys: scored.droppedUnknownKeys + droppedUnknownKeys, sampleSpread };
    }

    private async singlePass(version: RubricVersionSnapshot, content: RubricSubjectContent): Promise<LLMDecision[]> {
        const raw = await this.runner.run(renderRubricEvaluatorPrompt(version, content, 'SinglePass'));
        const parsed = JSON.parse(raw) as { decisions?: LLMDecision[] } | LLMDecision[];
        return Array.isArray(parsed) ? parsed : parsed.decisions ?? [];
    }

    private async perCriterion(version: RubricVersionSnapshot, content: RubricSubjectContent): Promise<LLMDecision[]> {
        const decisions: LLMDecision[] = [];
        for (const node of version.nodes.filter(item => item.nodeType === 'Criterion')) {
            const raw = await this.runner.run(renderRubricEvaluatorPrompt(version, content, 'PerCriterion', node));
            const parsed = JSON.parse(raw) as LLMDecision;
            decisions.push({ ...parsed, key: node.key });
        }
        return decisions;
    }
}

/** Shipped next to src and dist, so an installed package does not read the MJ repo. */
const TEMPLATE_URL = new URL('../templates/rubric-evaluator.md', import.meta.url);

/** The Rubric Evaluator template file, with its three tokens filled. */
export function renderRubricEvaluatorPrompt(
    version: RubricVersionSnapshot,
    content: RubricSubjectContent,
    mode: RubricPromptMode,
    only?: RubricNodeSnapshot,
): string {
    return fillRubricEvaluatorTemplate(readFileSync(TEMPLATE_URL, 'utf8'), version, content, mode, only);
}

/** Fills {{instructions}}, {{criteria}}, and {{content}} in the template text. */
export function fillRubricEvaluatorTemplate(
    template: string,
    version: RubricVersionSnapshot,
    content: RubricSubjectContent,
    mode: RubricPromptMode,
    only?: RubricNodeSnapshot,
): string {
    const nodes = only ? [only] : version.nodes.filter(node => node.nodeType === 'Criterion');
    const criteria = nodes.map(node => renderCriterion(version, node)).join('\n\n');
    const body = content.text ?? JSON.stringify(content.data ?? {});
    const ask = mode === 'SinglePass'
        ? 'Return JSON {"decisions":[{"key","level","value","notApplicable","rationale","evidence":[{"quote"}],"confidence"}]} for every criterion.'
        : `Return JSON {"chosen","probabilities","rationale","evidence":[{"quote"}]} for ${only?.key}. confidence is probabilities[chosen].`;
    return template
        .replaceAll('{{instructions}}', [ask, version.instructions ?? ''].filter(part => part.length > 0).join('\n\n'))
        .replaceAll('{{criteria}}', criteria)
        .replaceAll('{{content}}', body);
}

function perCriterionConfidence(decision: LLMDecision, chosen: string | undefined): number | null {
    if (!chosen || !decision.probabilities) return null;
    const probability = decision.probabilities[chosen];
    return probability === undefined ? null : probability;
}

function renderCriterion(version: RubricVersionSnapshot, node: RubricNodeSnapshot): string {
    const scale = version.scales.find(item => item.id === node.scaleId);
    const anchors = new Map((node.anchors ?? []).map(anchor => [anchor.scaleLevelId ?? '', anchor.descriptor]));
    const levels = (scale?.levels ?? []).map(level => `- ${level.label} (${level.normalizedValue}): ${anchors.get(level.id) ?? ''}`).join('\n');
    const numeric = scale?.scaleType === 'Numeric'
        ? `Numeric ${scale.minValue}..${scale.maxValue}, step ${scale.step ?? 'any'}, higher is better: ${scale.higherIsBetter}`
        : levels;
    return `### ${node.name} (${node.key})\n\nGuidance: ${node.guidance ?? ''}\n\n${numeric}`;
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

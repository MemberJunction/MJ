import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RubricEvaluator, type RubricEvaluatorOutput, type RubricEvaluatorRequest } from './RubricEvaluator.js';

/** Per-criterion settings stored on the criterion as EvaluatorConfig. */
export interface RubricEvaluatorConfig {
    AI?: { Hints?: string; RequireQuote?: boolean };
}

export interface AgentCriterionResult {
    level?: string;
    value?: number;
    notApplicable?: boolean;
    rationale: string;
    evidence: { ref: string; quote?: string }[];
    confidence?: number;
}

/**
 * One model call, already run. Tests pass a fake. Production wraps an AI agent.
 * There is no network inside this class.
 */
export interface AgentScaleView {
    scaleType: 'Levels' | 'Numeric';
    levels: { label: string; normalizedValue: number }[];
    minValue?: number | null;
    maxValue?: number | null;
    step?: number | null;
    higherIsBetter: boolean;
}

export interface RubricAgent {
    /**
     * One leaf. The scale lists the labels the agent may return. Subject and
     * content are the record being scored. Config is that leaf's evaluator
     * config, with a caller map overriding the node's own config.
     */
    run(input: {
        criterionKey: string;
        criterionName: string;
        guidance?: string | null;
        scale: AgentScaleView | null;
        subject: { entityName: string; recordId: string };
        content: { text?: string; data?: Record<string, unknown> };
        hints?: string;
        config?: RubricEvaluatorConfig;
    }): Promise<AgentCriterionResult>;
}

/**
 * Asks the agent once per leaf, using that leaf's {@link RubricEvaluatorConfig}.
 * Maps a returned level label onto the criterion's scale, then scores the
 * answers with {@link RubricEvaluator}, which calls RubricScoring. An unknown
 * level label is refused. Groups are not sent to the agent.
 */
export class AIRubricEvaluator extends RubricEvaluator {
    public constructor(private readonly agent: RubricAgent) {
        super();
    }

    /**
     * Runs one agent call per criterion and returns the scored evaluation.
     * Does not call a model itself.
     */
    public async evaluateVersion(request: RubricEvaluatorRequest, configs: Map<string, RubricEvaluatorConfig> = new Map()): Promise<RubricEvaluatorOutput> {
        const leaves = request.version.nodes.filter(node => node.nodeType === 'Criterion');
        const candidates = [];
        for (const leaf of leaves) {
            const config = configs.get(leaf.id) ?? configs.get(leaf.key) ?? asConfig(leaf.evaluatorConfig);
            const raw = await this.agent.run({
                criterionKey: leaf.key,
                criterionName: leaf.name,
                guidance: leaf.guidance,
                scale: scaleView(request.version, leaf.scaleId),
                subject: request.subject,
                content: { text: request.content.text, data: request.content.data },
                hints: config?.AI?.Hints,
                config,
            });
            if (config?.AI?.RequireQuote && raw.evidence.some(item => !item.quote)) {
                throw new Error(`Evidence for ${leaf.key} must include a quote.`);
            }
            if (config?.AI?.RequireQuote && raw.evidence.length === 0) {
                throw new Error(`Evidence for ${leaf.key} must include a quote.`);
            }
            candidates.push({
                criterionId: leaf.id,
                scaleLevelId: raw.level ? levelId(request.version, leaf.scaleId, raw.level, leaf.key) : null,
                rawValue: raw.value ?? null,
                isNotApplicable: raw.notApplicable,
                rationale: raw.rationale,
                evidence: raw.evidence,
                confidence: raw.confidence ?? null,
            });
        }
        return this.evaluate(request.version, candidates);
    }
}

function asConfig(value: unknown): RubricEvaluatorConfig | undefined {
    if (!value || typeof value !== 'object') return undefined;
    return value as RubricEvaluatorConfig;
}

function scaleView(version: RubricVersionSnapshot, scaleId: string | null | undefined): AgentScaleView | null {
    const scale = version.scales.find(item => item.id === scaleId);
    if (!scale) return null;
    return {
        scaleType: scale.scaleType,
        levels: scale.levels.map(level => ({ label: level.label, normalizedValue: level.normalizedValue })),
        minValue: scale.minValue,
        maxValue: scale.maxValue,
        step: scale.step,
        higherIsBetter: scale.higherIsBetter,
    };
}

function levelId(version: RubricVersionSnapshot, scaleId: string | null | undefined, label: string, key: string): string {
    const scale = version.scales.find(item => item.id === scaleId);
    const level = scale?.levels.find(item => item.label === label);
    if (!level) throw new Error(`Agent returned an unknown level "${label}" for ${key}.`);
    return level.id;
}

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
export interface RubricAgent {
    run(input: { criterionKey: string; hints?: string; content: string; config?: RubricEvaluatorConfig }): Promise<AgentCriterionResult>;
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
            const config = configs.get(leaf.id) ?? configs.get(leaf.key);
            const raw = await this.agent.run({
                criterionKey: leaf.key,
                hints: config?.AI?.Hints,
                content: request.content,
                config,
            });
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

function levelId(version: RubricVersionSnapshot, scaleId: string | null | undefined, label: string, key: string): string {
    const scale = version.scales.find(item => item.id === scaleId);
    const level = scale?.levels.find(item => item.label === label);
    if (!level) throw new Error(`Agent returned an unknown level "${label}" for ${key}.`);
    return level.id;
}

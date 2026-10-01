import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RubricEvaluator, type RubricCandidate, type RubricEvaluatorOutput } from './RubricEvaluator.js';
import type { RubricSubjectContent } from './content.js';

/**
 * A leaf rule stored at EvaluatorConfig.Deterministic. It reads one path in
 * the subject JSON. A leaf with no rule is left unanswered. There is no model call.
 */
export interface DeterministicRule {
    path: string;
    equals?: unknown;
    level?: string;
    value?: number;
    notApplicable?: boolean;
}

/**
 * Applies each leaf's deterministic rule to content.data. Unanswered leaves
 * are omitted, so RubricScoring treats them as silence. The score still comes
 * only from RubricScoring.
 */
export class DeterministicRubricEvaluator extends RubricEvaluator {
    /**
     * Scores the subject JSON. Does not call an agent or a model.
     */
    public EvaluateData(version: RubricVersionSnapshot, content: RubricSubjectContent): RubricEvaluatorOutput {
        const candidates: RubricCandidate[] = [];
        for (const node of version.nodes) {
            if (node.nodeType !== 'Criterion') continue;
            const rule = ruleOf(node.evaluatorConfig);
            if (!rule) continue;
            const actual = readPath(content.data ?? {}, rule.path);
            if (rule.equals !== undefined && actual !== rule.equals) continue;
            const scale = version.scales.find(item => item.id === node.scaleId);
            const level = rule.level ? scale?.levels.find(item => item.label === rule.level) : undefined;
            candidates.push({
                criterionId: node.id,
                scaleLevelId: level?.id ?? null,
                rawValue: rule.value ?? null,
                isNotApplicable: rule.notApplicable,
                rationale: `Deterministic ${rule.path}`,
                evidence: [],
            });
        }
        return this.evaluate(version, candidates);
    }

    /** @deprecated Use {@link EvaluateData}. */
    public evaluateData(version: RubricVersionSnapshot, content: RubricSubjectContent): RubricEvaluatorOutput {
        return this.EvaluateData(version, content);
    }
}

function ruleOf(value: unknown): DeterministicRule | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const rule = (value as { Deterministic?: DeterministicRule }).Deterministic;
    if (!rule || typeof rule.path !== 'string') return undefined;
    return rule;
}

function readPath(data: Record<string, unknown>, path: string): unknown {
    let current: unknown = data;
    for (const part of path.split('.')) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

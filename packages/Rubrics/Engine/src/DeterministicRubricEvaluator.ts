import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseRubricEvaluator, type RubricCandidate, type RubricEvaluatorOutput } from './RubricEvaluator.js';
import type { RubricSubjectContent } from './content.js';
import type { RubricEvaluatorContext, RubricEvaluatorRun, RubricEvaluatorType } from './evaluatorServices.js';

/**
 * A leaf rule stored at EvaluatorConfig.Deterministic. It reads one path in
 * the subject JSON. A leaf with no rule, or a rule with no operator, is left
 * unanswered. There is no model call.
 *
 * The stored shape is Path, Operator, Values, LevelWhenTrue, LevelWhenFalse,
 * and NotApplicableWhenMissing. The older path/equals/level fields still work.
 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface DeterministicRule {
    Path?: string;
    path?: string;
    Operator?: 'equals' | 'notEquals' | 'in' | 'notIn' | 'contains' | 'exists' | 'between' | 'gte' | 'lte' | 'matches';
    Values?: JsonValue[];
    LevelWhenTrue?: string;
    LevelWhenFalse?: string;
    NotApplicableWhenMissing?: boolean;
    /** Older shape. Treated as Operator equals and Values of one entry. */
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
@RegisterClass(BaseRubricEvaluator, 'Deterministic')
export class DeterministicRubricEvaluator extends BaseRubricEvaluator {
    public get EvaluatorName(): string {
        return 'Deterministic';
    }

    public get EvaluatorType(): RubricEvaluatorType {
        return 'Deterministic';
    }

    /** Applies the rules. Needs no service. */
    public async EvaluateRubric(context: RubricEvaluatorContext): Promise<RubricEvaluatorRun> {
        return this.EvaluateData(context.Version, context.Content);
    }
    /**
     * Scores the subject JSON. Does not call an agent or a model.
     */
    public EvaluateData(version: RubricVersionSnapshot, content: RubricSubjectContent): RubricEvaluatorOutput {
        const candidates: RubricCandidate[] = [];
        for (const node of version.nodes) {
            if (node.nodeType !== 'Criterion') continue;
            const rule = normalizeRule(ruleOf(node.evaluatorConfig));
            if (!rule) continue;
            const actual = readPath(content.data ?? {}, rule.path);
            const missing = actual === undefined;
            if (missing && rule.notApplicableWhenMissing) {
                candidates.push({
                    criterionId: node.id,
                    scaleLevelId: null,
                    rawValue: null,
                    isNotApplicable: true,
                    rationale: `Deterministic ${rule.path} is missing`,
                    evidence: [],
                });
                continue;
            }
            if (!rule.operator) continue;
            const matched = matches(rule.operator, actual, rule.values);
            const label = matched ? rule.levelWhenTrue : rule.levelWhenFalse;
            if (!label && !(matched && rule.rawValue != null)) continue;
            const scale = version.scales.find(item => item.id === node.scaleId);
            const level = label ? scale?.levels.find(item => item.label === label) : undefined;
            const numeric = !level && label != null && label.trim() !== '' && Number.isFinite(Number(label)) ? Number(label) : null;
            candidates.push({
                criterionId: node.id,
                scaleLevelId: level?.id ?? null,
                rawValue: numeric ?? (matched ? rule.rawValue ?? null : null),
                isNotApplicable: false,
                rationale: `Deterministic ${rule.path}`,
                evidence: [],
            });
        }
        return this.Evaluate(version, candidates);
    }

    }

interface NormalizedRule {
    path: string;
    operator?: DeterministicRule['Operator'];
    values: unknown[];
    levelWhenTrue?: string;
    levelWhenFalse?: string;
    notApplicableWhenMissing: boolean;
    rawValue?: number;
}

function ruleOf(value: unknown): DeterministicRule | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const rule = (value as { Deterministic?: DeterministicRule }).Deterministic;
    if (!rule || typeof rule !== 'object') return undefined;
    return rule;
}

function normalizeRule(rule: DeterministicRule | undefined): NormalizedRule | undefined {
    if (!rule) return undefined;
    const path = typeof rule.Path === 'string' ? rule.Path : rule.path;
    if (typeof path !== 'string' || path.length === 0) return undefined;
    const operator = rule.Operator ?? (rule.equals !== undefined ? 'equals' : undefined);
    const values = Array.isArray(rule.Values) ? rule.Values : (rule.equals !== undefined ? [rule.equals] : []);
    return {
        path,
        operator,
        values,
        levelWhenTrue: rule.LevelWhenTrue ?? rule.level,
        levelWhenFalse: rule.LevelWhenFalse,
        notApplicableWhenMissing: rule.NotApplicableWhenMissing === true,
        rawValue: typeof rule.value === 'number' ? rule.value : undefined,
    };
}

function matches(operator: NonNullable<DeterministicRule['Operator']>, actual: unknown, values: unknown[]): boolean {
    const first = values[0];
    const second = values[1];
    if (operator === 'exists') return actual !== undefined && actual !== null;
    if (operator === 'equals') return actual === first;
    if (operator === 'notEquals') return actual !== first;
    if (operator === 'in') return values.includes(actual);
    if (operator === 'notIn') return !values.includes(actual);
    if (operator === 'contains') {
        if (typeof actual === 'string' && typeof first === 'string') return actual.includes(first);
        return Array.isArray(actual) && actual.includes(first);
    }
    if (operator === 'matches') {
        if (typeof first !== 'string' || typeof actual !== 'string') return false;
        try {
            return new RegExp(first).test(actual);
        } catch {
            return false;
        }
    }
    const number = typeof actual === 'number' ? actual : Number(actual);
    const low = typeof first === 'number' ? first : Number(first);
    const high = typeof second === 'number' ? second : Number(second);
    if (!Number.isFinite(number) || !Number.isFinite(low)) return false;
    if (operator === 'gte') return number >= low;
    if (operator === 'lte') return number <= low;
    if (operator === 'between') return Number.isFinite(high) && number >= low && number <= high;
    return false;
}

function readPath(data: Record<string, unknown>, path: string): unknown {
    let current: unknown = data;
    for (const part of path.split('.')) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

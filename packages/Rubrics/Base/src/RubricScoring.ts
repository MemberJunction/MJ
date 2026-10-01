import type {
    NotApplicablePolicy,
    RollupMethod,
    RubricAnswer,
    RubricNodeSnapshot,
    RubricScaleSnapshot,
    RubricScoreInput,
    RubricScoreResult,
    RubricVersionSnapshot,
    ScoredNode,
} from './types.js';

export const SCORING_ENGINE_VERSION = '1.0' as const;

/** Submit is refused. The message names the criterion when one answer is illegal. */
export class RubricValidationError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'RubricValidationError';
    }
}

interface Calc {
    node: RubricNodeSnapshot;
    children: Calc[];
    score: number | null;
    included: boolean;
    applicable: boolean;
    scored: boolean;
    unanswered: boolean;
    naFailure: boolean;
    isNotApplicable: boolean;
    gateFailed: boolean;
    effectiveWeight: number | null;
    overallContribution: number | null;
    method: RollupMethod | null;
    confidence: number | null;
}

/**
 * Pure §6 scoring. No database. Scores are on a closed 0..1 scale.
 *
 * A levels answer scores the chosen level's NormalizedValue. A numeric answer scores
 * (value − min) / (max − min), inverted when HigherIsBetter is false. A value outside
 * the range or off Step is refused, not clamped.
 *
 * The not-applicable policy (the criterion's, otherwise the version's) changes weight:
 * ExcludeAndRedistribute drops the node and the siblings' weights renormalize, and the
 * node is not applicable. CountAsZero scores 0 and keeps the weight. FailEvaluation
 * drops the node and raises NotApplicableFailure. NotAllowed refuses the submit and
 * names the criterion.
 *
 * An unanswered applicable node is dropped from the math the same way, and it lowers
 * completeness. Advisory nodes are stored when they have a score and never enter a
 * rollup, a gate, completeness, or the verdict.
 *
 * Outcome, first match: Incomplete when the overall score is null or completeness is
 * below the minimum; then NotApplicableFailure; then GateFailed; then BelowThreshold
 * or Passed when a threshold applies; otherwise Scored. Passed is true only for
 * Passed. It is null for Scored, and for Incomplete when the version has no threshold
 * and no gate. Otherwise it is false.
 *
 * Stored decimals are rounded to 6 places after the arithmetic.
 */
export class RubricScoring {
    public static compute(input: RubricScoreInput): RubricScoreResult {
        const version = input.version;
        const answers = new Map(input.answers.map(answer => [answer.criterionId, answer]));
        const scales = new Map(version.scales.map(scale => [scale.id, scale]));
        const byParent = new Map<string | null, RubricNodeSnapshot[]>();
        for (const node of version.nodes) {
            const parentId = node.parentId ?? null;
            const list = byParent.get(parentId) ?? [];
            list.push(node);
            byParent.set(parentId, list);
        }
        const roots = (byParent.get(null) ?? []).map(node => RubricScoring.scoreNode(node, byParent, answers, version, scales));
        RubricScoring.rollupWeights(roots, 'WeightedMean');
        RubricScoring.assignContributions(roots, 1, false);

        const includedRoots = roots.filter(root => root.included && root.score !== null);
        const overall = RubricScoring.combine(includedRoots, 'WeightedMean');
        const leaves = RubricScoring.flatten(roots).filter(calc => calc.node.nodeType === 'Criterion');
        const applicable = leaves.filter(leaf => leaf.applicable).length;
        const scored = leaves.filter(leaf => leaf.applicable && leaf.scored).length;
        const completeness = applicable === 0 ? 1 : scored / applicable;
        const naFailure = RubricScoring.flatten(roots).some(calc => calc.naFailure);
        const gateFailed = RubricScoring.flatten(roots).some(calc => calc.gateFailed);
        const hasGate = version.nodes.some(node => node.isGate);
        const threshold = input.passThresholdOverride !== undefined && input.passThresholdOverride !== null
            ? input.passThresholdOverride
            : version.passThreshold ?? null;
        const minimum = version.minimumCompleteness ?? null;
        const outcome = RubricScoring.outcome(overall, completeness, minimum, naFailure, gateFailed, threshold);
        const passed = RubricScoring.passed(outcome, threshold, hasGate);
        const bandId = overall === null ? null : RubricScoring.bandId(version, overall);
        const confidence = RubricScoring.confidence(leaves);

        return {
            normalizedScore: overall === null ? null : round6(overall),
            completeness: round6(completeness),
            outcome,
            passed,
            gateFailed,
            passThresholdApplied: threshold === null ? null : round6(threshold),
            bandId,
            confidence,
            nodes: RubricScoring.flatten(roots).map(RubricScoring.toStored),
            scoringEngineVersion: SCORING_ENGINE_VERSION,
        };
    }

    private static scoreNode(
        node: RubricNodeSnapshot,
        byParent: Map<string | null, RubricNodeSnapshot[]>,
        answers: Map<string, RubricAnswer>,
        version: RubricVersionSnapshot,
        scales: Map<string, RubricScaleSnapshot>,
    ): Calc {
        if (node.nodeType === 'Criterion') {
            return RubricScoring.scoreLeaf(node, answers.get(node.id), version, scales);
        }
        const children = (byParent.get(node.id) ?? []).map(child =>
            RubricScoring.scoreNode(child, byParent, answers, version, scales));
        const included = children.filter(child => child.included && child.score !== null);
        const score = included.length === 0 ? null : RubricScoring.combine(included, node.rollupMethod ?? 'WeightedMean');
        const unansweredLeaves = RubricScoring.flatten(children).filter(calc => calc.unanswered).length;
        const calc: Calc = {
            node,
            children,
            score,
            included: !node.isAdvisory && score !== null,
            applicable: false,
            scored: false,
            unanswered: false,
            naFailure: children.some(child => child.naFailure),
            isNotApplicable: false,
            gateFailed: false,
            effectiveWeight: null,
            overallContribution: null,
            method: node.rollupMethod ?? 'WeightedMean',
            confidence: null,
        };
        if (node.isGate && !node.isAdvisory) {
            if (score !== null && score < (node.gateMinimumScore ?? 0)) calc.gateFailed = true;
            if (score === null && unansweredLeaves > 0) calc.gateFailed = true;
        }
        return calc;
    }

    private static scoreLeaf(
        node: RubricNodeSnapshot,
        answer: RubricAnswer | undefined,
        version: RubricVersionSnapshot,
        scales: Map<string, RubricScaleSnapshot>,
    ): Calc {
        const policy: NotApplicablePolicy = node.notApplicablePolicy ?? version.notApplicablePolicy;
        const base: Calc = {
            node,
            children: [],
            score: null,
            included: false,
            applicable: false,
            scored: false,
            unanswered: false,
            naFailure: false,
            isNotApplicable: false,
            gateFailed: false,
            effectiveWeight: null,
            overallContribution: null,
            method: null,
            confidence: answer?.confidence ?? null,
        };
        if (answer?.isNotApplicable) {
            base.isNotApplicable = true;
            if (policy === 'NotAllowed') {
                throw new RubricValidationError(`Not applicable is not allowed for ${node.name}.`);
            }
            if (node.isAdvisory) return base;
            if (policy === 'CountAsZero') {
                base.score = 0;
                base.included = true;
                base.applicable = true;
                base.scored = true;
            } else if (policy === 'FailEvaluation') {
                base.naFailure = true;
            }
            RubricScoring.applyGate(base);
            return base;
        }
        if (!answer || !RubricScoring.hasValue(answer)) {
            if (!node.isAdvisory) {
                base.applicable = true;
                base.unanswered = true;
            }
            RubricScoring.applyGate(base);
            return base;
        }
        base.score = RubricScoring.normalize(node, answer, scales);
        if (!node.isAdvisory) {
            base.included = true;
            base.applicable = true;
            base.scored = true;
        }
        RubricScoring.applyGate(base);
        return base;
    }

    private static applyGate(calc: Calc): void {
        const node = calc.node;
        if (!node.isGate || node.isAdvisory) return;
        if (calc.unanswered) calc.gateFailed = true;
        if (calc.score !== null && calc.score < (node.gateMinimumScore ?? 0)) calc.gateFailed = true;
    }

    private static hasValue(answer: RubricAnswer): boolean {
        return (answer.scaleLevelId !== undefined && answer.scaleLevelId !== null)
            || (answer.rawValue !== undefined && answer.rawValue !== null);
    }

    private static normalize(
        node: RubricNodeSnapshot,
        answer: RubricAnswer,
        scales: Map<string, RubricScaleSnapshot>,
    ): number {
        const scale = node.scaleId ? scales.get(node.scaleId) : undefined;
        if (!scale) {
            throw new RubricValidationError(`${node.name} has no scale.`);
        }
        if (scale.scaleType === 'Levels') {
            const level = scale.levels.find(item => item.id === answer.scaleLevelId);
            if (!level) {
                throw new RubricValidationError(`${node.name} is not on a level of its scale.`);
            }
            return level.normalizedValue;
        }
        const raw = answer.rawValue;
        const min = scale.minValue ?? null;
        const max = scale.maxValue ?? null;
        if (raw === undefined || raw === null || min === null || max === null || max === min) {
            throw new RubricValidationError(`${node.name} needs a numeric value inside its scale.`);
        }
        if (raw < min || raw > max) {
            throw new RubricValidationError(`${node.name} is outside ${min}..${max}.`);
        }
        if (scale.step !== undefined && scale.step !== null && scale.step > 0) {
            const steps = (raw - min) / scale.step;
            if (Math.abs(steps - Math.round(steps)) > 1e-8) {
                throw new RubricValidationError(`${node.name} is not on a step of ${scale.step}.`);
            }
        }
        const span = (raw - min) / (max - min);
        return scale.higherIsBetter ? span : 1 - span;
    }

    private static combine(included: Calc[], method: RollupMethod): number {
        if (method === 'Minimum') return Math.min(...included.map(calc => calc.score as number));
        if (method === 'Maximum') return Math.max(...included.map(calc => calc.score as number));
        const sumWeight = included.reduce((sum, calc) => sum + calc.node.weight, 0);
        if (sumWeight === 0) {
            return included.reduce((sum, calc) => sum + (calc.score as number), 0) / included.length;
        }
        return included.reduce((sum, calc) => sum + calc.node.weight * (calc.score as number), 0) / sumWeight;
    }

    /** Sets each included sibling's share of the parent. All-zero weights share equally. */
    private static rollupWeights(children: Calc[], method: RollupMethod): void {
        const included = children.filter(child => child.included && child.score !== null);
        const sumWeight = included.reduce((sum, child) => sum + child.node.weight, 0);
        for (const child of children) {
            if (!child.included || child.score === null) {
                child.effectiveWeight = null;
            } else if (sumWeight === 0) {
                child.effectiveWeight = 1 / included.length;
            } else {
                child.effectiveWeight = child.node.weight / sumWeight;
            }
            if (child.children.length > 0) {
                RubricScoring.rollupWeights(child.children, child.method ?? method);
            }
        }
    }

    private static assignContributions(children: Calc[], ancestorProduct: number, blocked: boolean): void {
        for (const child of children) {
            if (child.effectiveWeight === null || child.score === null) {
                child.overallContribution = null;
                RubricScoring.assignContributions(child.children, 0, true);
                continue;
            }
            const product = ancestorProduct * child.effectiveWeight;
            child.overallContribution = blocked ? null : child.score * product;
            const childBlocked = blocked || child.method === 'Minimum' || child.method === 'Maximum';
            RubricScoring.assignContributions(child.children, blocked ? 0 : product, childBlocked);
        }
    }

    private static outcome(
        score: number | null,
        completeness: number,
        minimum: number | null,
        naFailure: boolean,
        gateFailed: boolean,
        threshold: number | null,
    ): RubricScoreResult['outcome'] {
        if (score === null || (minimum !== null && completeness < minimum)) return 'Incomplete';
        if (naFailure) return 'NotApplicableFailure';
        if (gateFailed) return 'GateFailed';
        if (threshold !== null) return score >= threshold ? 'Passed' : 'BelowThreshold';
        return 'Scored';
    }

    private static passed(
        outcome: RubricScoreResult['outcome'],
        threshold: number | null,
        hasGate: boolean,
    ): boolean | null {
        if (outcome === 'Passed') return true;
        if (outcome === 'Scored') return null;
        if (outcome === 'Incomplete' && threshold === null && !hasGate) return null;
        return false;
    }

    /** Half-open ranges. The band whose max is 1 also contains 1. */
    private static bandId(version: RubricVersionSnapshot, score: number): string | null {
        const bands = [...version.bands].sort((a, b) => a.minScore - b.minScore || a.maxScore - b.maxScore);
        for (const band of bands) {
            const top = band.maxScore === 1 && score === 1;
            if (score >= band.minScore && (score < band.maxScore || top)) return band.id;
        }
        return null;
    }

    private static confidence(leaves: Calc[]): number | null {
        const weighted = leaves.filter(leaf =>
            leaf.node.nodeType === 'Criterion'
            && leaf.overallContribution !== null
            && RubricScoring.leafConfidence(leaf) !== null);
        const sumWeight = weighted.reduce((sum, leaf) => sum + Math.abs(leaf.overallContribution as number), 0);
        if (sumWeight === 0) return null;
        const mean = weighted.reduce((sum, leaf) =>
            sum + (RubricScoring.leafConfidence(leaf) as number) * Math.abs(leaf.overallContribution as number), 0) / sumWeight;
        return round6(mean);
    }

    private static leafConfidence(leaf: Calc): number | null {
        return leaf.confidence;
    }

    private static flatten(calcs: Calc[]): Calc[] {
        const out: Calc[] = [];
        const walk = (calc: Calc): void => {
            out.push(calc);
            calc.children.forEach(walk);
        };
        calcs.forEach(walk);
        return out;
    }

    private static toStored(calc: Calc): ScoredNode {
        return {
            id: calc.node.id,
            key: calc.node.key,
            normalizedScore: calc.score === null ? null : round6(calc.score),
            effectiveWeight: calc.effectiveWeight === null ? null : round6(calc.effectiveWeight),
            overallContribution: calc.overallContribution === null ? null : round6(calc.overallContribution),
            gateFailed: calc.gateFailed,
            isNotApplicable: calc.isNotApplicable,
            isAdvisory: calc.node.isAdvisory,
        };
    }
}

function round6(value: number): number {
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

import { RubricScoring, type RubricAnswer, type RubricScoreResult, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { RubricSubjectContent } from './content.js';
import type { RubricEvaluatorContext, RubricEvaluatorRun, RubricEvaluatorType } from './evaluatorServices.js';

export interface EvidenceRef {
    ref: string;
    quote?: string;
}

/** One leaf the evaluator chose, before the shared scorer turns it into a 0..1 result. */
export interface RubricCandidate {
    criterionId: string;
    scaleLevelId?: string | null;
    rawValue?: number | null;
    isNotApplicable?: boolean;
    rationale: string;
    evidence: EvidenceRef[];
    confidence?: number | null;
}

export interface RubricEvaluatorRequest {
    version: RubricVersionSnapshot;
    subject: { entityName: string; recordId: string };
    content: RubricSubjectContent;
}

export interface RubricEvaluatorOutput {
    /** 0..1 overall score from RubricScoring. Null when nothing applicable was scored. */
    normalizedScore: number | null;
    rationale: string;
    evidence: EvidenceRef[];
    result: RubricScoreResult;
    answers: RubricAnswer[];
}

/**
 * Turns selected leaf candidates into a scored evaluation.
 *
 * The normalized score, outcome, and per-node contributions come only from
 * {@link RubricScoring.Compute}. This class does not reimplement the math.
 * The rationale is the candidates' rationales joined in tree order. Evidence
 * refs are the candidates' refs, in that same order, with duplicates kept
 * because each one is tied to a criterion.
 */
export class RubricEvaluator {
    /**
     * Scores the candidates against the version and returns the normalized
     * score, the combined rationale, and the evidence refs.
     */
    public Evaluate(version: RubricVersionSnapshot, candidates: RubricCandidate[]): RubricEvaluatorOutput {
        const answers: RubricAnswer[] = candidates.map(candidate => ({
            criterionId: candidate.criterionId,
            scaleLevelId: candidate.scaleLevelId,
            rawValue: candidate.rawValue,
            isNotApplicable: candidate.isNotApplicable,
            confidence: candidate.confidence,
            rationale: candidate.rationale || undefined,
            evidence: candidate.evidence.length > 0 ? candidate.evidence : undefined,
        }));
        const result = RubricScoring.Compute({ version, answers });
        return {
            normalizedScore: result.normalizedScore,
            rationale: candidates.map(candidate => candidate.rationale).filter(text => text.length > 0).join('\n'),
            evidence: candidates.flatMap(candidate => candidate.evidence),
            result,
            answers,
        };
    }

    }

/**
 * The ClassFactory root for rubric evaluators, and the contract a plugin implements.
 *
 * Register a subclass with `@RegisterClass(BaseRubricEvaluator, '<Name>')` and the engine can run it
 * by that name, from a caller, an agent-rubric link's EvaluatorConfig, a test, the CLI, or the
 * Evaluate Record Against Rubric action. The built-ins register as LLM, Decision, Agent,
 * Deterministic, and Human.
 *
 * The class factory constructs evaluators with no arguments, so everything a run needs arrives
 * in the {@link RubricEvaluatorContext}. Score the chosen answers with {@link RubricEvaluator.Evaluate},
 * which calls RubricScoring. An evaluator never computes a score itself.
 */
export abstract class BaseRubricEvaluator extends RubricEvaluator {
    /** The registered name. Stored on the evaluation as EvaluatorName. */
    public abstract get EvaluatorName(): string;

    /** Stored on the evaluation as EvaluatorType. A custom evaluator that is not an AI prompt or agent is External. */
    public abstract get EvaluatorType(): RubricEvaluatorType;

    /** False for an evaluator a person completes, such as Human. The engine does not run those. */
    public get IsAutomated(): boolean {
        return true;
    }

    /** Scores one subject. Throw to fail the evaluation; the message is stored on it. */
    public abstract EvaluateRubric(context: RubricEvaluatorContext): Promise<RubricEvaluatorRun>;
}

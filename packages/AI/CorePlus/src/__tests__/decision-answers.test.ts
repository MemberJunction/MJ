/**
 * The answer rules both engines route by (moved here from `@memberjunction/task-graph`).
 *
 * The dispatcher and the Flow agent's in-run walker store Decision answers differently, but they
 * must agree on which ones a condition may act on, on why the rest may not, and on holding every
 * condition that reads one of the rest. Those rules are pinned here, once, for both.
 */
import { describe, it, expect } from 'vitest';
import type { DecisionAnswer } from '@memberjunction/ai';
import {
    DecisionAnswerConfidence,
    DecisionHoldReason,
    NO_DECISIONS,
    ResolveDecisionStepAnswers,
    SummarizeDecisionAnswers,
    type GraphDecisions,
} from '../task-graph/decision-answers';
import { DECISION_ANSWER_FIELDS, type TaskGraphDecisionQuestion } from '../task-graph/task-graph-spec';

const QUESTIONS: Record<string, TaskGraphDecisionQuestion> = {
    intent: {
        kind: 'Choice',
        instructions: 'Which team should handle this ticket?',
        options: [
            { value: 'billing', description: 'A question about an invoice or a charge.' },
            { value: 'refund', description: 'A request for money back.' },
        ],
        minConfidence: 0.7,
    },
    urgent: { kind: 'Likelihood', instructions: 'The customer cannot work until this is fixed.', minConfidence: 0.8 },
    tone: { kind: 'Likelihood', instructions: 'The customer is angry.' },
};

const run = (Status: string, ErrorMessage: string | null = null) => ({ Name: 'Triage', Status, ErrorMessage });

describe('ResolveDecisionStepAnswers', () => {
    it('uses an answer at or above its minConfidence, and one with no minConfidence as given', () => {
        const resolved = ResolveDecisionStepAnswers(run('Complete'), QUESTIONS, {
            intent: { value: 'billing', confidence: 0.7 },
            urgent: { probability: 0.9 },
            tone: { probability: 0.51 },
        });
        expect(resolved.Answers).toEqual({
            intent: { value: 'billing', confidence: 0.7 },
            urgent: { probability: 0.9 },
            tone: { probability: 0.51 },
        });
        expect(resolved.Unresolved).toEqual({});
    });

    it('does not use an answer below its minConfidence, and says which, how sure, and the bar', () => {
        const resolved = ResolveDecisionStepAnswers(run('Complete'), QUESTIONS, {
            intent: { value: 'billing', confidence: 0.55 },
            urgent: { probability: 0.6 },
            tone: { probability: 0.9 },
        });
        expect(resolved.Answers).toEqual({ tone: { probability: 0.9 } });
        expect(resolved.Unresolved.intent).toBe('the decision "Triage" answered "intent" with confidence 0.55, below its minConfidence of 0.7');
        expect(resolved.Unresolved.urgent).toMatch(/confidence 0.6, below its minConfidence of 0.8/);
    });

    it('does not trust a completed step that left a question unanswered', () => {
        const resolved = ResolveDecisionStepAnswers(run('Complete'), QUESTIONS, { intent: { value: 'billing', confidence: 0.9 } });
        expect(resolved.Unresolved.urgent).toBe('the decision "Triage" completed without an answer to "urgent"');
    });

    it('uses nothing from a failed step, and carries the failure as every question\'s reason', () => {
        const resolved = ResolveDecisionStepAnswers(run('Failed', 'the model timed out'), QUESTIONS, {});
        expect(resolved.Answers).toEqual({});
        expect(Object.values(resolved.Unresolved)).toEqual([
            'the decision "Triage" failed: the model timed out',
            'the decision "Triage" failed: the model timed out',
            'the decision "Triage" failed: the model timed out',
        ]);
    });

    it('uses nothing from a step that was not asked, and says it has not answered', () => {
        const resolved = ResolveDecisionStepAnswers(run('Skipped'), QUESTIONS, { intent: { value: 'billing', confidence: 0.9 } });
        expect(resolved.Answers).toEqual({});
        expect(resolved.Unresolved.intent).toBe('the decision "Triage" has not answered (it is Skipped)');
    });
});

describe('DecisionAnswerConfidence', () => {
    it('reads a Choice or Score by its stated confidence', () => {
        expect(DecisionAnswerConfidence({ value: 'billing', confidence: 0.62 })).toBe(0.62);
    });

    it('measures a Likelihood by its distance from an even call — a confident no is as sure as a yes', () => {
        expect(DecisionAnswerConfidence({ probability: 0.05 })).toBeCloseTo(0.95);
        expect(DecisionAnswerConfidence({ probability: 0.95 })).toBeCloseTo(0.95);
        expect(DecisionAnswerConfidence({ probability: 0.5 })).toBe(0.5);
    });
});

describe('DecisionHoldReason', () => {
    const decisions: GraphDecisions = {
        Answers: { triage: { intent: { value: 'billing', confidence: 0.9 } } },
        Unresolved: { triage: { urgent: 'the decision "Triage" answered "urgent" with confidence 0.6, below its minConfidence of 0.8' } },
    };

    it('lets a condition that reads only usable answers be evaluated', () => {
        expect(DecisionHoldReason("decisions.triage.intent.value === 'billing'", decisions)).toBeNull();
        expect(DecisionHoldReason('payload.ok === true', NO_DECISIONS)).toBeNull();
    });

    it('holds on an unusable answer, giving the reason the answer is unusable', () => {
        expect(DecisionHoldReason('decisions.triage.urgent.probability >= 0.8', decisions)).toMatch(/below its minConfidence of 0.8/);
    });

    it('holds on a step or question nobody answered', () => {
        expect(DecisionHoldReason("decisions.other.intent.value === 'x'", decisions)).toBe('no Decision step "other" has answered "intent"');
    });

    it('holds on a use of decisions that names no step and question', () => {
        expect(DecisionHoldReason('decisions.triage', decisions)).toMatch(/without naming a step and a question/);
    });

    it('ignores the word inside a string literal', () => {
        expect(DecisionHoldReason("payload.note === 'see decisions.other.intent'", decisions)).toBeNull();
    });
});

describe('SummarizeDecisionAnswers', () => {
    const typed: Record<string, DecisionAnswer> = {
        urgent: { Kind: 'Likelihood', Probability: 0.81 },
        intent: { Kind: 'Choice', Value: 'refund', Confidence: 0.77, Probabilities: { billing: 0.2, refund: 0.77, other: 0.03 } },
        severity: { Kind: 'Score', Value: 1.4, Confidence: 0.6, Probabilities: { minor: 0.1, major: 0.4, critical: 0.5 } },
    };

    it('keeps the full distribution in the shape conditions read', () => {
        expect(SummarizeDecisionAnswers(typed)).toEqual({
            urgent: { probability: 0.81 },
            intent: { value: 'refund', confidence: 0.77, probabilities: { billing: 0.2, refund: 0.77, other: 0.03 } },
            severity: { value: 1.4, confidence: 0.6, probabilities: { minor: 0.1, major: 0.4, critical: 0.5 } },
        });
    });

    it('produces exactly the fields the validator lets a condition read, for every kind', () => {
        const summary = SummarizeDecisionAnswers(typed);
        expect(Object.keys(summary.urgent).sort()).toEqual([...DECISION_ANSWER_FIELDS.Likelihood].sort());
        expect(Object.keys(summary.intent).sort()).toEqual([...DECISION_ANSWER_FIELDS.Choice].sort());
        expect(Object.keys(summary.severity).sort()).toEqual([...DECISION_ANSWER_FIELDS.Score].sort());
    });
});

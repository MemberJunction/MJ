/** An Active SelfCheck link. Attempts default to 1 when the link does not set a maximum. */
export interface SelfCheckLink {
    Purpose: string;
    Status: string;
    MaxAttempts?: number | null;
}

export interface SelfCheckFailure {
    Key: string;
    Rationale?: string;
}

export interface SelfCheckDecision {
    Action: 'skip' | 'accept' | 'retry' | 'fail';
    Attempt: number;
    Message?: string;
}

/**
 * Decides what a self-check does with a candidate final output.
 * No Active SelfCheck link skips. A passing score is accepted.
 * A loop agent retries while attempts remain. A flow agent, or a loop
 * that has used its attempts, fails and the message is kept.
 */
export function DecideSelfCheck(input: {
    agentKind: 'loop' | 'flow';
    link: SelfCheckLink | null;
    attempt: number;
    passed: boolean;
    failedCriteria?: SelfCheckFailure[];
}): SelfCheckDecision {
    if (!input.link || input.link.Purpose !== 'SelfCheck' || input.link.Status !== 'Active') {
        return { Action: 'skip', Attempt: input.attempt };
    }
    if (input.passed) return { Action: 'accept', Attempt: input.attempt };
    const message = (input.failedCriteria ?? [])
        .map(item => item.Rationale ? `${item.Key}: ${item.Rationale}` : item.Key)
        .join('\n');
    const maxAttempts = input.link.MaxAttempts ?? 1;
    if (input.agentKind === 'loop' && input.attempt < maxAttempts) {
        return { Action: 'retry', Attempt: input.attempt, Message: message };
    }
    return { Action: 'fail', Attempt: input.attempt, Message: message || 'Self-check failed.' };
}

/** @deprecated Use {@link DecideSelfCheck}. */
export function decideSelfCheck(input: {
    agentKind: 'loop' | 'flow';
    link: SelfCheckLink | null;
    attempt: number;
    passed: boolean;
    failedCriteria?: SelfCheckFailure[];
}): SelfCheckDecision {
    return DecideSelfCheck(input);
}

export interface SelfCheckEngine {
    EvaluateRecord(input: {
        rubricId: string;
        subjectEntityName: string;
        subjectRecordId: string;
        evaluator: 'LLM';
        passThreshold?: number | null;
    }): Promise<{
        evaluationId: string;
        outcome: string | null;
        criteria: { key: string; rationale?: string }[];
    }>;
}

export interface SelfCheckValidation {
    StepType: 'Validation';
    EvaluationId: string;
    Passed: boolean;
    Message: string;
}

/**
 * Runs one self-check evaluation and records a Validation step linked to it.
 * The subject is the current agent run. The evaluator is the LLM rubric evaluator.
 * The threshold is the link override when set, otherwise the version's threshold.
 */
export async function ExecuteSelfCheck(input: {
    engine: SelfCheckEngine;
    link: SelfCheckLink & { rubricId: string; passThreshold?: number | null };
    runId: string;
    agentKind: 'loop' | 'flow';
    attempt: number;
    record: (step: SelfCheckValidation) => void | Promise<void>;
}): Promise<{ decision: SelfCheckDecision; step: 'Success' | 'Failed' | 'Retry'; evaluationId: string }> {
    const result = await input.engine.EvaluateRecord({
        rubricId: input.link.rubricId,
        subjectEntityName: 'MJ: AI Agent Runs',
        subjectRecordId: input.runId,
        evaluator: 'LLM',
        passThreshold: input.link.passThreshold ?? null,
    });
    const passed = result.outcome === 'Passed' || result.outcome === 'Scored';
    const failedCriteria = passed ? [] : result.criteria.map(item => ({ Key: item.key, Rationale: item.rationale }));
    const decision = DecideSelfCheck({
        agentKind: input.agentKind,
        link: input.link,
        attempt: input.attempt,
        passed,
        failedCriteria,
    });
    await input.record({
        StepType: 'Validation',
        EvaluationId: result.evaluationId,
        Passed: passed,
        Message: decision.Message ?? '',
    });
    const step = decision.Action === 'retry' ? 'Retry' : decision.Action === 'fail' ? 'Failed' : 'Success';
    return { decision, step, evaluationId: result.evaluationId };
}

/** @deprecated Use {@link ExecuteSelfCheck}. */
export async function executeSelfCheck(input: {
    engine: SelfCheckEngine;
    link: SelfCheckLink & { rubricId: string; passThreshold?: number | null };
    runId: string;
    agentKind: 'loop' | 'flow';
    attempt: number;
    record: (step: SelfCheckValidation) => void | Promise<void>;
}): Promise<{ decision: SelfCheckDecision; step: 'Success' | 'Failed' | 'Retry'; evaluationId: string }> {
    return ExecuteSelfCheck(input);
}

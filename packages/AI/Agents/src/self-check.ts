/** An Active SelfCheck link. Attempts default to 1 when the link does not set a maximum. */
export interface SelfCheckLink {
    purpose: string;
    status: string;
    maxAttempts?: number | null;
}

export interface SelfCheckFailure {
    key: string;
    rationale?: string;
}

export interface SelfCheckDecision {
    action: 'skip' | 'accept' | 'retry' | 'fail';
    attempt: number;
    message?: string;
}

/**
 * Decides what a self-check does with a candidate final output.
 * No Active SelfCheck link skips. A passing score is accepted.
 * A loop agent retries while attempts remain. A flow agent, or a loop
 * that has used its attempts, fails and the message is kept.
 */
export function decideSelfCheck(input: {
    agentKind: 'loop' | 'flow';
    link: SelfCheckLink | null;
    attempt: number;
    passed: boolean;
    failedCriteria?: SelfCheckFailure[];
}): SelfCheckDecision {
    if (!input.link || input.link.purpose !== 'SelfCheck' || input.link.status !== 'Active') {
        return { action: 'skip', attempt: input.attempt };
    }
    if (input.passed) return { action: 'accept', attempt: input.attempt };
    const message = (input.failedCriteria ?? [])
        .map(item => item.rationale ? `${item.key}: ${item.rationale}` : item.key)
        .join('\n');
    const maxAttempts = input.link.maxAttempts ?? 1;
    if (input.agentKind === 'loop' && input.attempt < maxAttempts) {
        return { action: 'retry', attempt: input.attempt, message };
    }
    return { action: 'fail', attempt: input.attempt, message: message || 'Self-check failed.' };
}

export interface SelfCheckEngine {
    evaluateRecord(input: {
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
    stepType: 'Validation';
    evaluationId: string;
    passed: boolean;
    message: string;
}

/**
 * Runs one self-check evaluation and records a Validation step linked to it.
 * The subject is the current agent run. The evaluator is the LLM rubric evaluator.
 * The threshold is the link override when set, otherwise the version's threshold.
 */
export async function executeSelfCheck(input: {
    engine: SelfCheckEngine;
    link: SelfCheckLink & { rubricId: string; passThreshold?: number | null };
    runId: string;
    agentKind: 'loop' | 'flow';
    attempt: number;
    record: (step: SelfCheckValidation) => void | Promise<void>;
}): Promise<{ decision: SelfCheckDecision; step: 'Success' | 'Failed' | 'Retry'; evaluationId: string }> {
    const result = await input.engine.evaluateRecord({
        rubricId: input.link.rubricId,
        subjectEntityName: 'MJ: AI Agent Runs',
        subjectRecordId: input.runId,
        evaluator: 'LLM',
        passThreshold: input.link.passThreshold ?? null,
    });
    const passed = result.outcome === 'Passed' || result.outcome === 'Scored';
    const failedCriteria = passed ? [] : result.criteria.map(item => ({ key: item.key, rationale: item.rationale }));
    const decision = decideSelfCheck({
        agentKind: input.agentKind,
        link: input.link,
        attempt: input.attempt,
        passed,
        failedCriteria,
    });
    await input.record({
        stepType: 'Validation',
        evaluationId: result.evaluationId,
        passed,
        message: decision.message ?? '',
    });
    const step = decision.action === 'retry' ? 'Retry' : decision.action === 'fail' ? 'Failed' : 'Success';
    return { decision, step, evaluationId: result.evaluationId };
}

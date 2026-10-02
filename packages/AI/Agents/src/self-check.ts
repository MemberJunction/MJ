/** An Active SelfCheck link. Attempts default to 1 when the link does not set a maximum. */
export interface SelfCheckLink {
    Purpose: string;
    Status: string;
    MaxAttempts?: number | null;
}

/** One agent-rubric row the self-check lookup can see. */
export interface SelfCheckLinkRow {
    ID?: string;
    Purpose?: string;
    Status?: string;
    RubricID?: string;
    MaxSelfCheckAttempts?: number | null;
    PassThreshold?: number | null;
}

/**
 * Picks one Active SelfCheck link. The lowest id wins, so two Active links
 * do not depend on which row the database returned first.
 */
export function PickSelfCheckLink(rows: SelfCheckLinkRow[]): SelfCheckLinkRow | undefined {
    return [...rows]
        .filter(row => row.Status === 'Active' && row.Purpose === 'SelfCheck' && !!row.RubricID)
        .sort((left, right) => String(left.ID ?? '').localeCompare(String(right.ID ?? '')))[0];
}

export interface SelfCheckFailure {
    Key: string;
    Rationale?: string;
}

export interface SelfCheckDecision {
    Action: 'skip' | 'accept' | 'retry' | 'fail' | 'record';
    Attempt: number;
    Message?: string;
}

/**
 * Decides what a self-check does with a candidate final output.
 * No Active SelfCheck link skips. A passing score is accepted.
 * A loop agent retries while the attempt is still within MaxAttempts, so
 * MaxAttempts 1 allows the first failure to retry. A flow agent records the
 * result and leaves the run successful. A loop that has used its attempts fails.
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
    if (input.agentKind === 'loop' && input.attempt <= maxAttempts) {
        return { Action: 'retry', Attempt: input.attempt, Message: message };
    }
    if (input.agentKind === 'flow') {
        return { Action: 'record', Attempt: input.attempt, Message: message };
    }
    return { Action: 'fail', Attempt: input.attempt, Message: message || 'Self-check failed.' };
}

/** The candidate still in memory. FinalPayload is written only after the run finishes. */
export interface SelfCheckCandidate {
    message?: string;
    payload?: unknown;
}

export interface SelfCheckEngine {
    EvaluateRecord(input: {
        rubricId: string;
        subjectEntityName: string;
        subjectRecordId: string;
        evaluator: 'LLM';
        passThreshold?: number | null;
        content?: { text?: string; data?: Record<string, unknown> };
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
 * The subject pointer is the current agent run. The text the judge scores is the
 * in-memory message and payload, because the stored run does not have FinalPayload yet.
 * The evaluator is the LLM rubric evaluator. The threshold is the link override
 * when set, otherwise the version's threshold.
 */
export async function ExecuteSelfCheck(input: {
    engine: SelfCheckEngine;
    link: SelfCheckLink & { rubricId: string; passThreshold?: number | null };
    runId: string;
    agentKind: 'loop' | 'flow';
    attempt: number;
    candidate?: SelfCheckCandidate;
    record: (step: SelfCheckValidation) => void | Promise<void>;
}): Promise<{ decision: SelfCheckDecision; step: 'Success' | 'Failed' | 'Retry'; evaluationId: string }> {
    const result = await input.engine.EvaluateRecord({
        rubricId: input.link.rubricId,
        subjectEntityName: 'MJ: AI Agent Runs',
        subjectRecordId: input.runId,
        evaluator: 'LLM',
        passThreshold: input.link.passThreshold ?? null,
        ...(input.candidate ? {
            content: {
                text: input.candidate.message,
                data: { message: input.candidate.message, finalPayload: input.candidate.payload },
            },
        } : {}),
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


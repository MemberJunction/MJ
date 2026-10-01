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

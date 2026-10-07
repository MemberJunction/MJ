import { ComputeBackoffSeconds } from '../backoff';
import { FatalWorkError, TransientWorkError } from '../errors';
import { Outcome } from '../handler';
import type { WorkOutcome } from '../handler';
import type { SubscriptionPolicy } from '../policy';

export const MAX_ATTEMPTS_EXCEEDED_REASON = 'MaxAttemptsExceeded';
/** Matches WorkQueueDelivery.DeadLetterReason nvarchar(100). */
export const MAX_DEAD_LETTER_REASON_LENGTH = 100;

const INVALID_RETURN_TEXT = 'Handler returned no valid outcome';
const DEFAULT_RETRY_ERROR = 'Retry requested by handler';

export interface HandlerResult {
    Outcome: WorkOutcome;
    ErrorText: string | null;
}

export type SettleAction =
    | { Kind: 'Complete' }
    | { Kind: 'Retry'; DelaySeconds: number; Error: string }
    | { Kind: 'DeadLetter'; Reason: string; Error: string | null };

export function IsWorkOutcome(value: unknown): value is WorkOutcome {
    if (typeof value !== 'object' || value === null || !('Kind' in value)) {
        return false;
    }
    if (value.Kind === 'Complete') {
        return true;
    }
    if (value.Kind === 'Retry') {
        return !('DelaySeconds' in value) || value.DelaySeconds === undefined || typeof value.DelaySeconds === 'number';
    }
    return value.Kind === 'DeadLetter' && 'Reason' in value && typeof value.Reason === 'string';
}

export function MapHandlerReturn(value: unknown): HandlerResult {
    if (IsWorkOutcome(value)) {
        return { Outcome: value, ErrorText: null };
    }
    return { Outcome: Outcome.Retry(INVALID_RETURN_TEXT), ErrorText: INVALID_RETURN_TEXT };
}

export function MapThrownError(error: unknown): HandlerResult {
    if (error instanceof FatalWorkError) {
        return { Outcome: Outcome.DeadLetter(error.message), ErrorText: DescribeError(error) };
    }
    if (error instanceof TransientWorkError) {
        return { Outcome: Outcome.Retry(error.message, error.RetryAfterSeconds), ErrorText: DescribeError(error) };
    }
    return { Outcome: Outcome.Retry(ErrorMessageOf(error)), ErrorText: DescribeError(error) };
}

/** "Name: message" followed by stack frames when available. */
export function DescribeError(error: unknown): string {
    if (!(error instanceof Error)) {
        return String(error);
    }
    const header = `${error.name}: ${error.message}`;
    const frames = (error.stack ?? '').split('\n').slice(1).join('\n');
    return frames.length > 0 ? `${header}\n${frames}` : header;
}

export function ErrorMessageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function ResolveSettleAction(
    result: HandlerResult,
    attempt: number,
    policy: SubscriptionPolicy,
    random?: () => number,
): SettleAction {
    const outcome = result.Outcome;
    if (outcome.Kind === 'Complete') {
        return { Kind: 'Complete' };
    }
    if (outcome.Kind === 'DeadLetter') {
        return { Kind: 'DeadLetter', Reason: truncate(outcome.Reason, MAX_DEAD_LETTER_REASON_LENGTH), Error: result.ErrorText };
    }
    const error = result.ErrorText ?? outcome.Reason ?? DEFAULT_RETRY_ERROR;
    if (attempt >= policy.MaxAttempts) {
        return { Kind: 'DeadLetter', Reason: MAX_ATTEMPTS_EXCEEDED_REASON, Error: error };
    }
    return { Kind: 'Retry', DelaySeconds: ComputeBackoffSeconds(policy, attempt, outcome.DelaySeconds, random), Error: error };
}

function truncate(text: string, maxLength: number): string {
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

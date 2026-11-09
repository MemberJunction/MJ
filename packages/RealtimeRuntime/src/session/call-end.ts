import { REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE, type RealtimeClientError } from '@memberjunction/ai-realtime-client';

/** How a host words why a call ended: a short status label, and a sentence for a screen or a notice. */
export interface RealtimeCallEndDescription {
    /** A short status label, such as a call bar's state chip shows. */
    Label: string;
    /** A sentence saying what happened and what to do next. */
    Message: string;
}

/**
 * What a call says when it ended because its session reached its time limit (MJAPI's relay ends a relayed call at
 * 30 minutes, or sooner when the session has a shorter cap), in place of a connection error.
 */
export const REALTIME_CALL_TIME_LIMIT_END: Readonly<RealtimeCallEndDescription> = Object.freeze({
    Label: 'Time limit reached',
    Message: 'This call reached its time limit. Start a new call to keep talking.',
});

/**
 * Why a call ended, in words a host can show, when the call's client said why (`RealtimeSessionRuntime.LastSessionError`);
 * `null` when it ended for a reason with no words of its own, such as a dropped connection, which a host words itself.
 *
 * @param error The call's fatal client error, or `null` when it reported none.
 */
export function DescribeCallEnd(error: RealtimeClientError | null): Readonly<RealtimeCallEndDescription> | null {
    return error?.Code === REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE ? REALTIME_CALL_TIME_LIMIT_END : null;
}

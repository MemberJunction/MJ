import type { RealtimeClientError } from '@memberjunction/ai-realtime-client';
import { DescribeCallEnd } from '@memberjunction/realtime-runtime';

/**
 * The sentence a host shows when a voice call ends over a failure (`SessionEnded$` reason `'error'`).
 *
 * The runtime ends such a call itself, so the call surface closes with it; without this notice the user
 * sees the call vanish with no word of why. A call that said why it ended (a time limit) gets its own
 * words; a start that failed and a call that dropped get one sentence each.
 *
 * @param lastStartError The runtime's `LastStartError`: set only when the start itself failed.
 * @param lastSessionError The runtime's `LastSessionError`: the client's fatal error, when it reported one.
 */
export function DescribeCallFailureNotice(lastStartError: Error | null, lastSessionError: RealtimeClientError | null): string {
    const described = DescribeCallEnd(lastSessionError);
    if (described) {
        return described.Message;
    }
    return lastStartError
        ? 'The voice call could not start. Please try again.'
        : 'The voice call was disconnected. Start a new call to keep talking.';
}

import { describe, it, expect } from 'vitest';
import { REALTIME_CALL_TIME_LIMIT_END } from '@memberjunction/realtime-runtime';
import { REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE } from '@memberjunction/ai-realtime-client';
import { DescribeCallFailureNotice } from '../lib/components/realtime/realtime-call-failure-notice';

describe('DescribeCallFailureNotice — what Explorer tells the user when a voice call ends over a failure', () => {
    it('says the call reached its time limit when the client ended it for that reason', () => {
        const notice = DescribeCallFailureNotice(null, { Message: 'closed 1000', Code: REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE, Fatal: true });
        expect(notice).toBe(REALTIME_CALL_TIME_LIMIT_END.Message);
    });

    it('says the call was disconnected when the provider failed after the call went live', () => {
        const notice = DescribeCallFailureNotice(null, { Message: 'Gemini Live connection closed (1011)', Fatal: true });
        expect(notice).toBe('The voice call was disconnected. Start a new call to keep talking.');
    });

    it('says the call could not start when the start itself failed', () => {
        const notice = DescribeCallFailureNotice(new Error('Gemini Live closed during setup (code 1008)'), null);
        expect(notice).toBe('The voice call could not start. Please try again.');
    });
});

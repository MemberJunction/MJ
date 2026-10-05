import { describe, it, expect } from 'vitest';
import { USER_CANCEL_ABORT_REASON, EXTERNAL_CANCEL_ABORT_REASON, AGENT_TIMEOUT_ABORT_REASON } from '../agent-run-abort-reasons';

describe('abort reasons', () => {
    it('are distinct, so a reader can never confuse a stop, an external cancel and a timeout', () => {
        expect(new Set([USER_CANCEL_ABORT_REASON, EXTERNAL_CANCEL_ABORT_REASON, AGENT_TIMEOUT_ABORT_REASON]).size).toBe(3);
    });
});

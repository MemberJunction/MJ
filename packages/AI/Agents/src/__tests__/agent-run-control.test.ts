/**
 * The shared run-control vocabulary: the predecessor filter BaseAgent and the run resolver both
 * use to find "the run the user stopped", and the recognizer that reads the answer. Pinned here
 * so a change to either is a change to both.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildStoppedRunPredecessorFilter,
    IsUserStoppedRun,
    SETTLED_AGENT_RUN_STATUSES,
    CANCELLED_RUN_STATUS,
    USER_REQUEST_CANCELLATION_REASON,
    USER_CANCEL_ABORT_REASON,
    EXTERNAL_CANCEL_ABORT_REASON,
    AGENT_TIMEOUT_ABORT_REASON,
} from '../agent-run-control';

describe('BuildStoppedRunPredecessorFilter', () => {
    it('selects root runs of one agent in one conversation that settled or were stopped by the user', () => {
        const filter = BuildStoppedRunPredecessorFilter('conv-1', 'agent-1');
        expect(filter).toContain("ConversationID='conv-1'");
        expect(filter).toContain('ParentRunID IS NULL');
        expect(filter).toContain("AgentID='agent-1'");
        for (const status of SETTLED_AGENT_RUN_STATUSES) {
            expect(filter).toContain(`'${status}'`);
        }
        expect(filter).toContain(`Status='${CANCELLED_RUN_STATUS}' AND CancellationReason='${USER_REQUEST_CANCELLATION_REASON}'`);
    });
});

describe('IsUserStoppedRun', () => {
    it('is true only for Cancelled + User Request', () => {
        expect(IsUserStoppedRun({ Status: 'Cancelled', CancellationReason: 'User Request' })).toBe(true);
        expect(IsUserStoppedRun({ Status: 'Cancelled', CancellationReason: 'Timeout' })).toBe(false);
        expect(IsUserStoppedRun({ Status: 'Cancelled', CancellationReason: null })).toBe(false);
        expect(IsUserStoppedRun({ Status: 'AwaitingFeedback', CancellationReason: 'User Request' })).toBe(false);
        expect(IsUserStoppedRun(undefined)).toBe(false);
        expect(IsUserStoppedRun(null)).toBe(false);
    });
});

describe('abort reasons', () => {
    it('are distinct, so a reader can never confuse a stop, an external cancel and a timeout', () => {
        expect(new Set([USER_CANCEL_ABORT_REASON, EXTERNAL_CANCEL_ABORT_REASON, AGENT_TIMEOUT_ABORT_REASON]).size).toBe(3);
    });
});

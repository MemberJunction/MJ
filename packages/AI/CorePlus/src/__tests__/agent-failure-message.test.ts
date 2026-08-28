import { describe, expect, it } from 'vitest';
import {
    agentFailureMessage,
    isDisconnectWhileAgentMayStillBeRunning,
} from '../agent-failure-message';

describe('agentFailureMessage', () => {
    it('prefers agentRun.ErrorMessage over transport errorMessage', () => {
        expect(agentFailureMessage({
            errorMessage: 'transport',
            agentRun: { ErrorMessage: 'run failed' },
        })).toBe('run failed');
    });

    it('falls back to transport errorMessage when the run has none', () => {
        expect(agentFailureMessage({
            errorMessage: 'Lost connection to the server. The agent may still be running.',
            agentRun: undefined,
        })).toBe('Lost connection to the server. The agent may still be running.');
    });

    it('does not return empty or Unknown error when a real message exists', () => {
        expect(agentFailureMessage({ errorMessage: 'timeout' })).toBe('timeout');
        expect(agentFailureMessage(null)).toBe('The agent failed without an error message.');
        expect(agentFailureMessage({ errorMessage: '  ' })).toBe('The agent failed without an error message.');
    });
});

describe('isDisconnectWhileAgentMayStillBeRunning', () => {
    it('recognizes the GraphQLAIClient lost-connection copy', () => {
        expect(isDisconnectWhileAgentMayStillBeRunning(
            'Lost connection to the server. The agent may still be running. Please refresh to check the latest status.'
        )).toBe(true);
    });

    it('is false for a genuine pipeline failure', () => {
        expect(isDisconnectWhileAgentMayStillBeRunning(
            "Pipeline failed at step 'Execute Sub-Agent: Skip: Data Expert'"
        )).toBe(false);
    });
});

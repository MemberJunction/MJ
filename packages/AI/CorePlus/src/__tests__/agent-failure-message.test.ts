import { describe, expect, it } from 'vitest';
import {
    agentFailureDisposition,
    AgentFailureMessage,
    CoerceFailedExecuteAgentResult,
    IsDisconnectWhileAgentMayStillBeRunning,
} from '../agent-failure-message';

describe('agentFailureMessage', () => {
    it('prefers agentRun.ErrorMessage over transport errorMessage', () => {
        expect(AgentFailureMessage({
            errorMessage: 'transport',
            agentRun: { ErrorMessage: 'run failed' },
        })).toBe('run failed');
    });

    it('falls back to transport errorMessage when the run has none', () => {
        expect(AgentFailureMessage({
            errorMessage: 'Lost connection to the server. The agent may still be running.',
            agentRun: undefined,
        })).toBe('Lost connection to the server. The agent may still be running.');
    });

    it('does not return empty or Unknown error when a real message exists', () => {
        expect(AgentFailureMessage({ errorMessage: 'timeout' })).toBe('timeout');
        expect(AgentFailureMessage(null)).toBe('The agent failed without an error message.');
        expect(AgentFailureMessage({ errorMessage: '  ' })).toBe('The agent failed without an error message.');
    });
});

describe('isDisconnectWhileAgentMayStillBeRunning', () => {
    it('recognizes the GraphQLAIClient lost-connection copy', () => {
        expect(IsDisconnectWhileAgentMayStillBeRunning(
            'Lost connection to the server. The agent may still be running. Please refresh to check the latest status.'
        )).toBe(true);
    });

    it('is false for a genuine pipeline failure', () => {
        expect(IsDisconnectWhileAgentMayStillBeRunning(
            "Pipeline failed at step 'Execute Sub-Agent: Specialist'"
        )).toBe(false);
    });

    it('does not treat raw Failed to fetch as in-flight (request may never have left the browser)', () => {
        expect(IsDisconnectWhileAgentMayStillBeRunning('Failed to fetch')).toBe(false);
        expect(IsDisconnectWhileAgentMayStillBeRunning('NetworkError when attempting to fetch resource.')).toBe(false);
    });

    it('is false when the transport knows the request was never acknowledged', () => {
        expect(IsDisconnectWhileAgentMayStillBeRunning(
            'Lost connection to the server. The agent may still be running. Please refresh to check the latest status.',
            { requestAcknowledged: false }
        )).toBe(false);
    });
});

describe('agentFailureDisposition', () => {
    it('keeps In-Progress for a post-ACK disconnect so a later server Complete is not stomped', () => {
        expect(agentFailureDisposition({
            errorMessage: 'Lost connection to the server. The agent may still be running. Please refresh to check the latest status.',
            requestAcknowledged: true,
        })).toEqual({
            status: 'In-Progress',
            message: 'Lost connection to the server. The agent may still be running. Please refresh to check the latest status.',
        });
    });

    it('paints Error when the request never left the browser', () => {
        expect(agentFailureDisposition({
            errorMessage: 'Failed to fetch',
            requestAcknowledged: false,
        }).status).toBe('Error');
    });

    it('paints Error for a real agent failure', () => {
        expect(agentFailureDisposition({
            errorMessage: "Pipeline failed at step 'Execute Sub-Agent: Specialist'",
        })).toEqual({
            status: 'Error',
            message: "Pipeline failed at step 'Execute Sub-Agent: Specialist'",
        });
    });
});

describe('coerceFailedExecuteAgentResult', () => {
    it('copies the source and forces success false without mutating the caller', () => {
        const source = { success: true, errorMessage: 'from result', payload: { a: 1 } };
        const failed = CoerceFailedExecuteAgentResult(source, 'fallback');
        expect(failed).toEqual({ success: false, errorMessage: 'from result', payload: { a: 1 } });
        expect(source.success).toBe(true);
    });

    it('uses the fallback when the result has no error text', () => {
        const failed = CoerceFailedExecuteAgentResult({ success: true, payload: { x: 1 } }, 'envelope failed');
        expect(failed.success).toBe(false);
        expect(failed.errorMessage).toBe('envelope failed');
        expect(failed.payload).toEqual({ x: 1 });
    });
});

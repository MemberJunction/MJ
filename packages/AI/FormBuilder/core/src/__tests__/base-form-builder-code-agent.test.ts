import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/ai-agents', () => ({
    BaseAgent: class BaseAgent {},
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (_target: unknown) => _target,
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn(),
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

import { BaseFormBuilderCodeAgent } from '../agents/base-form-builder-code-agent.js';

class TestableAgent extends BaseFormBuilderCodeAgent {
    publicBuildCodeSuccess<P>(payload: P, reasoning: string) {
        return this.buildCodeSuccess(payload, reasoning);
    }
    publicBuildCodeFailure<P>(reasoning: string, payload?: P) {
        return this.buildCodeFailure(reasoning, payload);
    }
}

describe('BaseFormBuilderCodeAgent', () => {
    const agent = new TestableAgent();

    describe('buildCodeSuccess', () => {
        it('returns terminate=true + step=Success + stepCount=1', () => {
            const result = agent.publicBuildCodeSuccess({ foo: 'bar' }, 'done');
            expect(result.stepCount).toBe(1);
            expect(result.finalStep.terminate).toBe(true);
            expect(result.finalStep.step).toBe('Success');
            expect(result.finalStep.reasoning).toBe('done');
            expect(result.finalStep.newPayload).toEqual({ foo: 'bar' });
        });

        it('preserves the payload as-is', () => {
            const payload = { nested: { value: 42 } };
            const result = agent.publicBuildCodeSuccess(payload, 'ok');
            expect(result.finalStep.newPayload).toBe(payload);
        });
    });

    describe('buildCodeFailure', () => {
        it('returns terminate=true + step=Failed + stepCount=1', () => {
            const result = agent.publicBuildCodeFailure('boom');
            expect(result.stepCount).toBe(1);
            expect(result.finalStep.terminate).toBe(true);
            expect(result.finalStep.step).toBe('Failed');
        });

        it('populates reasoning, message, AND errorMessage from the same string', () => {
            // Critical contract: every consumer (logs, UI, framework error
            // handling) should see the same reason without coalescing logic.
            const result = agent.publicBuildCodeFailure('boom');
            expect(result.finalStep.reasoning).toBe('boom');
            expect(result.finalStep.message).toBe('boom');
            expect(result.finalStep.errorMessage).toBe('boom');
        });

        it('preserves optional payload when supplied', () => {
            const payload = { partial: true };
            const result = agent.publicBuildCodeFailure('boom', payload);
            expect(result.finalStep.newPayload).toBe(payload);
        });

        it('leaves newPayload undefined when not supplied', () => {
            const result = agent.publicBuildCodeFailure('boom');
            expect(result.finalStep.newPayload).toBeUndefined();
        });
    });
});

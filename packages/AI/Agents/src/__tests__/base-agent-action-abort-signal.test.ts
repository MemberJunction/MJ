/**
 * Verifies that `BaseAgent.ExecuteSingleAction` forwards `params.cancellationToken`
 * as `AbortSignal` on the `RunActionParams` dispatched to `ActionEngineServer.Instance.RunAction`,
 * so cancelling an agent run immediately propagates into in-flight Actions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { ActionResult, MJActionEntityExtended, RunActionParams } from '@memberjunction/actions-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

const runActionMock = vi.fn<(params: RunActionParams) => Promise<ActionResult>>();

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        get Instance() {
            return {
                RunAction: runActionMock,
                Actions: [],
                ActionParams: [],
            };
        },
    },
}));

class StubAgentEntity extends MJAIAgentEntityExtended {
    constructor() {
        super(new EntityInfo({ Name: 'MJ: AI Agents', Fields: [] }));
    }
    override get ID(): string {
        return 'aaaaaaaa-0000-4000-8000-000000000001';
    }
    override get Name(): string {
        return 'Abort Signal Test Agent';
    }
}

class StubActionEntity extends MJActionEntityExtended {
    constructor() {
        super(new EntityInfo({ Name: 'MJ: Actions', Fields: [] }));
    }
    override get ID(): string {
        return 'aaaaaaaa-0000-4000-8000-000000000002';
    }
    override get Name(): string {
        return 'Long Running Test Action';
    }
    override get Status(): 'Pending' | 'Active' | 'Disabled' {
        return 'Active';
    }
    override get Config_Object(): null {
        return null;
    }
}

function makeSuccessResult(runParams: RunActionParams): ActionResult {
    const result = new ActionResult();
    result.Success = true;
    result.Message = 'Completed';
    result.RunParams = runParams;
    return result;
}

describe('BaseAgent.ExecuteSingleAction AbortSignal forwarding', () => {
    beforeEach(() => {
        runActionMock.mockReset();
    });

    it('forwards params.cancellationToken as AbortSignal to ActionEngineServer.Instance.RunAction', async () => {
        const controller = new AbortController();
        let observedSignal: AbortSignal | undefined;
        let abortListenerFired = false;

        runActionMock.mockImplementation(async (dispatched: RunActionParams): Promise<ActionResult> => {
            observedSignal = dispatched.AbortSignal;
            dispatched.AbortSignal?.addEventListener('abort', () => {
                abortListenerFired = true;
            }, { once: true });
            controller.abort('User requested cancellation');
            return makeSuccessResult(dispatched);
        });

        const agent = new BaseAgent();
        const params: ExecuteAgentParams = {
            agent: new StubAgentEntity(),
            conversationMessages: [],
            cancellationToken: controller.signal,
        };

        await agent.ExecuteSingleAction(
            params,
            { name: 'Long Running Test Action', params: { input: 'value' } },
            new StubActionEntity()
        );

        expect(runActionMock).toHaveBeenCalledTimes(1);
        expect(observedSignal).toBe(controller.signal);
        expect(abortListenerFired).toBe(true);
        expect(observedSignal?.aborted).toBe(true);
        expect(observedSignal?.reason).toBe('User requested cancellation');
    });

    it('passes AbortSignal as undefined when params.cancellationToken is not set', async () => {
        let observedSignal: AbortSignal | undefined;
        runActionMock.mockImplementation(async (dispatched: RunActionParams): Promise<ActionResult> => {
            observedSignal = dispatched.AbortSignal;
            return makeSuccessResult(dispatched);
        });

        const agent = new BaseAgent();
        const params: ExecuteAgentParams = {
            agent: new StubAgentEntity(),
            conversationMessages: [],
        };

        await agent.ExecuteSingleAction(
            params,
            { name: 'Long Running Test Action', params: {} },
            new StubActionEntity()
        );

        expect(runActionMock).toHaveBeenCalledTimes(1);
        expect(observedSignal).toBeUndefined();
    });
});

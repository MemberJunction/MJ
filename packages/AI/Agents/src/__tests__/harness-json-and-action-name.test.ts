import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { BaseAgent } from '../base-agent';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import type {
    AgentAction,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

class TestLoopAgentType extends LoopAgentType {
    public ParseJson<T>(promptResult: AIPromptRunResult): T | null {
        return this.parseJSONResponse<T>(promptResult);
    }
}

class TestActionValidationAgent extends BaseAgent {
    public SetEffectiveActions(actions: MJActionEntityExtended[]): void {
        this._effectiveActions = actions;
        this._effectiveCatalogComputed = true;
    }

    public ValidateActions<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>> {
        return this.validateActionsNextStep(params, nextStep, {} as P, agentRun, currentStep);
    }
}

function makePromptResult(rawText: string): AIPromptRunResult {
    return {
        success: true,
        result: rawText,
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

function makeMinimalExecuteParams(agentName: string = 'Factory Builder'): ExecuteAgentParams {
    const agent = {
        ID: '11111111-1111-4111-8111-111111111111',
        Name: agentName,
    } as MJAIAgentEntityExtended;
    return {
        agent,
        conversationMessages: [],
    } as ExecuteAgentParams;
}

function makeMinimalActionEntity(id: string, name: string): MJActionEntityExtended {
    return {
        ID: id,
        Name: name,
        Status: 'Active',
        Params: [],
    } as MJActionEntityExtended;
}

describe('BaseAgentType multi-JSON / trailing text decision envelope extraction', () => {
    let agentType: TestLoopAgentType;
    const params = makeMinimalExecuteParams('Factory Builder');

    beforeEach(() => {
        agentType = new TestLoopAgentType();
    });

    it('parses a valid decision envelope when followed by trailing text/newlines', async () => {
        const raw =
            '{"taskComplete":true,"message":"Pushed PR changes and verified tests."}\nCompleted turn cleanly.';
        const step = await agentType.DetermineNextStep(makePromptResult(raw), params, {}, {});
        expect(step.step).toBe('Success');
        expect(step.terminate).toBe(true);
        expect(step.message).toBe('Pushed PR changes and verified tests.');
    });

    it('extracts the LAST valid decision envelope when multiple JSON objects appear on separate lines', async () => {
        const first = JSON.stringify({
            taskComplete: false,
            nextStep: { type: 'Actions', actions: [{ name: 'Push Worktree Branch', params: {} }] },
        });
        const final = JSON.stringify({
            taskComplete: true,
            message: 'Final buildResult emitted',
            payloadChangeRequest: { replaceElements: { buildResult: { headSha: 'abc1234' } } },
        });
        const raw = `${first}\n${final}`;

        const step = await agentType.DetermineNextStep(makePromptResult(raw), params, {}, {});
        expect(step.step).toBe('Success');
        expect(step.terminate).toBe(true);
        expect(step.message).toBe('Final buildResult emitted');
    });

    it('ignores trailing non-decision CLI metadata JSON and returns the decision envelope', async () => {
        const decision = JSON.stringify({
            taskComplete: true,
            message: 'Finished build',
        });
        const cliFooter = JSON.stringify({ usage: { inputTokens: 1000, outputTokens: 200 } });
        const raw = `${decision}\n${cliFooter}`;

        const step = await agentType.DetermineNextStep(makePromptResult(raw), params, {}, {});
        expect(step.step).toBe('Success');
        expect(step.message).toBe('Finished build');
    });

    it('handles braces and escaped quotes inside string values when trailing characters follow JSON', async () => {
        const decision = JSON.stringify({
            taskComplete: true,
            message: 'Updated handler: if (ok) { return "{\\"status\\":\\"ok\\"}"; }',
        });
        const raw = `Summary before JSON:\n${decision}\nTrailing status line.`;

        const step = await agentType.DetermineNextStep(makePromptResult(raw), params, {}, {});
        expect(step.step).toBe('Success');
        expect(step.message).toContain('return "{\\"status\\":\\"ok\\"}"');
    });

    it('returns Retry for non-decision JSON with trailing text or pure prose', async () => {
        const nonDecision = '{"status":"running"}\nextra text';
        const stepNonDecision = await agentType.DetermineNextStep(
            makePromptResult(nonDecision),
            params,
            {},
            {},
        );
        expect(stepNonDecision.step).toBe('Retry');

        const truncated = '{"taskComplete": true, "message": "cut off';
        const stepTruncated = await agentType.DetermineNextStep(
            makePromptResult(truncated),
            params,
            {},
            {},
        );
        expect(stepTruncated.step).toBe('Retry');
    });

    it('still strips unsafe prototype keys from fallback-extracted JSON objects', () => {
        const raw = '{"taskComplete":true,"message":"ok","__proto__":{"polluted":true}}\ntrailing';
        const parsed = agentType.ParseJson<{ taskComplete: boolean; message: string }>(
            makePromptResult(raw),
        );
        expect(parsed).not.toBeNull();
        expect(parsed?.taskComplete).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    });
});

describe('BaseAgent.validateActionsNextStep null-safe actionName handling', () => {
    let agent: TestActionValidationAgent;
    const params = makeMinimalExecuteParams('Factory Builder');
    const agentRun = { ID: '22222222-2222-4222-8222-222222222222' } as MJAIAgentRunEntityExtended;
    const runStep = { ID: '33333333-3333-4333-8333-333333333333' } as MJAIAgentRunStepEntityExtended;

    beforeEach(() => {
        vi.spyOn(AIEngine.Instance, 'AgentActions', 'get').mockReturnValue([]);
        vi.spyOn(ActionEngineServer.Instance, 'Actions', 'get').mockReturnValue([]);
        agent = new TestActionValidationAgent();
        agent.SetEffectiveActions([
            makeMinimalActionEntity('44444444-4444-4444-8444-444444444441', 'Push Worktree Branch'),
            makeMinimalActionEntity('44444444-4444-4444-8444-444444444442', 'Get Approved Factory Plan'),
        ]);
    });

    it('returns a clean Retry validation message instead of throwing when an action object has undefined name', async () => {
        const malformedAction = { params: { BranchName: 'factory/demo' } } as AgentAction;
        const nextStep: BaseAgentNextStep = {
            step: 'Actions',
            terminate: false,
            actions: [malformedAction],
        };

        const validated = await agent.ValidateActions(params, nextStep, agentRun, runStep);
        expect(validated.step).toBe('Retry');
        expect(validated.terminate).toBe(false);
        expect(validated.errorMessage).toContain('<missing action name>');
        expect(validated.errorMessage).toContain('Push Worktree Branch');
    });

    it('returns a clean Retry validation message when an action object has an empty whitespace name', async () => {
        const emptyNameAction: AgentAction = { name: '   ', params: {} };
        const nextStep: BaseAgentNextStep = {
            step: 'Actions',
            terminate: false,
            actions: [emptyNameAction],
        };

        const validated = await agent.ValidateActions(params, nextStep, agentRun, runStep);
        expect(validated.step).toBe('Retry');
        expect(validated.errorMessage).toContain('<missing action name>');
    });

    it('accepts valid actions cleanly when action names are properly provided', async () => {
        const validAction: AgentAction = { name: 'Push Worktree Branch', params: {} };
        const nextStep: BaseAgentNextStep = {
            step: 'Actions',
            terminate: false,
            actions: [validAction],
        };

        const validated = await agent.ValidateActions(params, nextStep, agentRun, runStep);
        expect(validated.step).toBe('Actions');
        expect(validated.actions).toHaveLength(1);
    });
});

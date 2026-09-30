import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo, LogStatus, type IMetadataProvider } from '@memberjunction/core';
import { ActionResult, type MJActionEntityExtended } from '@memberjunction/actions-base';
import { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import {
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AgentDecisionService, AgentDecisionAskParams } from '../AgentDecisionService';
import { BaseAgent } from '../base-agent';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import {
    DEFAULT_LOOP_AGENT_PROMPT_PARAMS,
} from '../agent-types/loop-agent-prompt-params';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

/** A step entity that records what the agent writes to it. */
class MockStepEntity implements Partial<MJAIAgentRunStepEntityExtended> {
    public ID: string;
    public StepType?: MJAIAgentRunStepEntityExtended['StepType'];
    public StepName?: string;
    public Status?: MJAIAgentRunStepEntityExtended['Status'];
    public StartedAt = new Date();
    public CompletedAt?: Date;
    public Success?: boolean;
    public ErrorMessage?: string;
    public InputData?: string;
    public OutputData?: string;
    public ParentID?: string;
    public TargetLogID?: string | null;
    public PromptRun?: MJAIPromptRunEntity;
    constructor(id: string) {
        this.ID = id;
    }
    public NewRecord(): boolean {
        return true;
    }
    public async Save(): Promise<boolean> {
        return true;
    }
}

class MockAgentRun implements Partial<MJAIAgentRunEntityExtended> {
    public ID = 'run-1';
    public AgentID = 'agent-1';
    public Steps: MJAIAgentRunStepEntityExtended[] = [];
}

class MockMetadataProvider implements Partial<IMetadataProvider> {
    constructor(public readonly GetEntityObject: (entityName: string) => Promise<MJAIAgentRunStepEntityExtended>) {}
}

class TestAgent extends BaseAgent {
    public SetDecisionService(service: AgentDecisionService): void {
        this._agentDecisionService = service;
    }
    public TestApplyResponseTypeAutoAlignment(params: Record<string, unknown>, explicit?: Record<string, unknown>): void {
        this.applyResponseTypeAutoAlignment(params, explicit);
    }
    public TestExecuteNextStep(params: ExecuteAgentParams, decision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        return this.executeNextStep(params, { success: true }, decision, 1);
    }
    public override validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return super.validateSuccessNextStep(params, nextStep, currentPayload, agentRun, currentStep);
    }
    public override finalizeStepEntity(
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: Record<string, unknown>
    ): Promise<void> {
        return super.finalizeStepEntity(stepEntity, success, errorMessage, outputData);
    }
}

const actionResult = (fields: Partial<ActionResult>): ActionResult => Object.assign(new ActionResult(), fields);

const FINISH_IF = { questions: ['The results show the task was created.'], message: 'Done. I added the task.' };

function likelihoods(...probabilities: number[]): AIDecisionRunResult {
    const Answers: AIDecisionRunResult['Answers'] = {};
    probabilities.forEach((p, i) => {
        Answers[`q${i + 1}`] = { Kind: 'Likelihood', Probability: p };
    });
    return { success: true, Answers };
}

function makeParams(): ExecuteAgentParams {
    return {
        contextUser: { ID: 'user-1' } as UserInfo,
        conversationMessages: [],
        agent: { ID: 'agent-1', Name: 'TestAgent' } as MJAIAgentEntityExtended,
    };
}

function actionsDecision(finishIf = FINISH_IF): BaseAgentNextStep {
    return { step: 'Actions', terminate: false, actions: [{ name: 'Create Record', params: {} }], finishIf };
}

function subAgentDecision(): BaseAgentNextStep {
    return { step: 'Sub-Agent', terminate: false, subAgent: { name: 'Worker', message: 'Do it', terminateAfter: false }, finishIf: FINISH_IF };
}

describe('finishIf', () => {
    let agent: TestAgent;
    let decisions: AgentDecisionService;
    let finishChecks: Array<Record<string, unknown>>;

    beforeEach(() => {
        vi.restoreAllMocks();
        agent = new TestAgent();
        agent['_agentTypeInstance'] = new LoopAgentType();
        agent['_effectiveActions'] = [{ ID: '11111111-1111-1111-1111-111111111111', Name: 'Create Record' }] as MJActionEntityExtended[];
        agent['_activeProvider'] = new MockMetadataProvider(async () => new MockStepEntity('step-1') as MJAIAgentRunStepEntityExtended) as IMetadataProvider;
        agent['_agentRun'] = new MockAgentRun() as MJAIAgentRunEntityExtended;
        // These tests exercise a live gate; gates are opt-in (finishIfMode defaults to 'off').
        agent['_agentTypePromptParams'] = { finishIfMode: 'on' };
        decisions = new AgentDecisionService();
        agent.SetDecisionService(decisions);
        vi.spyOn(agent, 'validateSuccessNextStep').mockImplementation(async (_params, nextStep) => nextStep);
        finishChecks = [];
        const finalize = agent.finalizeStepEntity.bind(agent);
        vi.spyOn(agent, 'finalizeStepEntity').mockImplementation(async (step, success, error, output) => {
            if (output && 'passed' in output) {
                finishChecks.push(output);
            }
            return finalize(step, success, error, output);
        });
    });

    /** executeActionsStep is private on BaseAgent, so it is reached through bracket access. */
    function executeActions(params: ExecuteAgentParams, decision: BaseAgentNextStep, addConversationMessage = true): Promise<BaseAgentNextStep> {
        return agent['executeActionsStep'](params, decision, undefined, addConversationMessage, 1);
    }

    function actionSucceeds(params: ActionResult['Params'] = []): void {
        vi.spyOn(agent, 'ExecuteSingleAction').mockResolvedValueOnce(actionResult({ Success: true, Message: 'Created', Params: params }));
    }

    describe('prompt params', () => {
        it('is off by default (opt-in per agent), with a 0.9 threshold for agents that turn it on', () => {
            expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.finishIfMode).toBe('off');
            expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.finishIfThreshold).toBe(0.9);
        });

        it('with finishIfMode unset or off, the docs and the field are off', () => {
            for (const params of [{}, { finishIfMode: 'off' }, { finishIfMode: 'bogus' }, { finishIfMode: 'off', includeFinishIfDocs: true }] as Record<string, unknown>[]) {
                agent.TestApplyResponseTypeAutoAlignment(params);
                expect(params.includeFinishIfDocs).toBe(false);
                expect((params.includeResponseTypeDefinition as Record<string, unknown>).finishIf).toBe(false);
            }
        });

        it.each(['shadow', 'on'])('with finishIfMode %s, the docs and the field are on', (mode) => {
            const params: Record<string, unknown> = { finishIfMode: mode };
            agent.TestApplyResponseTypeAutoAlignment(params);
            expect(params.includeFinishIfDocs).not.toBe(false);
            expect((params.includeResponseTypeDefinition as Record<string, unknown>).finishIf).toBe(true);
        });

        it('includeFinishIfDocs: false turns the field off, unless it is set explicitly', () => {
            const off: Record<string, unknown> = { finishIfMode: 'on', includeFinishIfDocs: false };
            agent.TestApplyResponseTypeAutoAlignment(off);
            expect((off.includeResponseTypeDefinition as Record<string, unknown>).finishIf).toBe(false);

            const explicit: Record<string, unknown> = { finishIfMode: 'on', includeFinishIfDocs: false, includeResponseTypeDefinition: { finishIf: true } };
            agent.TestApplyResponseTypeAutoAlignment(explicit, { finishIf: true });
            expect((explicit.includeResponseTypeDefinition as Record<string, unknown>).finishIf).toBe(true);
        });
    });

    describe('LoopAgentType carries finishIf', () => {
        const loop = new LoopAgentType();
        const determine = (response: Record<string, unknown>): Promise<BaseAgentNextStep> =>
            loop.DetermineNextStep(
                Object.assign({} as AIPromptRunResult, { success: true, result: JSON.stringify(response) }),
                makeParams(),
                {},
                {}
            );

        it('carries a valid finishIf on Actions and Sub-Agent steps', async () => {
            const actions = await determine({ taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'Create Record' }], finishIf: FINISH_IF } });
            expect(actions.finishIf).toEqual(FINISH_IF);
            const subAgent = await determine({ taskComplete: false, nextStep: { type: 'Sub-Agent', subAgent: { name: 'Worker', message: 'Go' }, finishIf: FINISH_IF } });
            expect(subAgent.finishIf).toEqual(FINISH_IF);
        });

        it.each([
            ['four questions', { questions: ['a', 'b', 'c', 'd'], message: 'Done' }],
            ['no questions', { questions: [], message: 'Done' }],
            ['a blank question', { questions: ['  '], message: 'Done' }],
            ['an empty message', { questions: ['Created?'], message: ' ' }],
        ])('drops a finishIf with %s', async (_label, finishIf) => {
            const step = await determine({ taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'Create Record' }], finishIf } });
            expect(step.step).toBe('Actions');
            expect(step.finishIf).toBeUndefined();
        });

        it('with taskComplete and a finishIf, runs the actions so the gate decides', async () => {
            const step = await determine({ taskComplete: true, message: 'All done', nextStep: { type: 'Actions', actions: [{ name: 'Create Record' }], finishIf: FINISH_IF } });
            expect(step.step).toBe('Actions');
            expect(step.finishIf).toEqual(FINISH_IF);
        });

        it('with taskComplete and no finishIf, completes as today', async () => {
            const step = await determine({ taskComplete: true, message: 'All done', nextStep: { type: 'Actions', actions: [{ name: 'Create Record' }] } });
            expect(step.step).toBe('Success');
        });

        it('a Chat step carrying stray actions and a finishIf behaves exactly as it would without them', async () => {
            const chat = { taskComplete: true, message: 'All done', nextStep: { type: 'Chat' } };
            const withStray = await determine({ ...chat, nextStep: { type: 'Chat', actions: [{ name: 'Create Record' }], finishIf: FINISH_IF } });
            const without = await determine(chat);
            expect(withStray.step).toBe(without.step);
            expect(withStray.terminate).toBe(without.terminate);
            expect(withStray.finishIf).toBeUndefined();
        });
    });

    describe('after actions', () => {
        it('ends the run with the message when every question passes', async () => {
            actionSucceeds([{ Name: 'RecordID', Type: 'Output', Value: 'T-42' }]);
            const ask = vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.95));

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result).toMatchObject({ step: 'Success', terminate: true, message: FINISH_IF.message });
            const asked: AgentDecisionAskParams = ask.mock.calls[0][0];
            expect(asked.Questions).toEqual({ q1: { Kind: 'Likelihood', Instructions: FINISH_IF.questions[0] } });
            expect(asked.PromptName).toBe('Default Decision');
            expect(asked.State).toContain('Action: Create Record');
            expect(asked.State).toContain('Output RecordID: T-42');
            expect(finishChecks).toEqual([expect.objectContaining({ passed: true, probabilities: { q1: 0.95 }, threshold: 0.9 })]);
        });

        it('records a passing gate in shadow mode, and continues as it would have without the gate', async () => {
            agent['_agentTypePromptParams'] = { finishIfMode: 'shadow' };
            actionSucceeds();
            const ask = vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.95));

            const result = await executeActions(makeParams(), actionsDecision());

            expect(ask).toHaveBeenCalledTimes(1);
            expect(result).toMatchObject({ step: 'Retry', terminate: false });
            expect(finishChecks).toEqual([expect.objectContaining({ passed: true, mode: 'shadow', endedRun: false })]);
        });

        it('records that the gate ended the run in on mode', async () => {
            actionSucceeds();
            vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.95));

            await executeActions(makeParams(), actionsDecision());

            expect(finishChecks).toEqual([expect.objectContaining({ passed: true, mode: 'on', endedRun: true })]);
        });

        it.each([
            ['unset', undefined],
            ['off', { finishIfMode: 'off' }],
        ])('never asks, and records nothing, with finishIfMode %s', async (_label, promptParams) => {
            agent['_agentTypePromptParams'] = promptParams;
            actionSucceeds();
            const ask = vi.spyOn(decisions, 'Ask');

            const result = await executeActions(makeParams(), actionsDecision());

            expect(ask).not.toHaveBeenCalled();
            expect(result).toMatchObject({ step: 'Retry', terminate: false });
            expect(finishChecks).toEqual([]);
        });

        it('continues as today when a probability is below the threshold', async () => {
            actionSucceeds();
            vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.85));

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result).toMatchObject({ step: 'Retry', terminate: false });
            expect(finishChecks[0]).toMatchObject({ passed: false });
        });

        it('never asks when an action returned Success: false without throwing', async () => {
            vi.spyOn(agent, 'ExecuteSingleAction').mockResolvedValueOnce(actionResult({ Success: false, Message: 'Denied', Params: [] }));
            const ask = vi.spyOn(decisions, 'Ask');

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result.step).toBe('Retry');
            expect(ask).not.toHaveBeenCalled();
        });

        it.each([
            ['the decision call fails', async () => ({ success: false, errorMessage: 'No decision model', Answers: {} })],
            ['the decision call throws', async () => { throw new Error('network down'); }],
            ['an answer is missing', async () => ({ success: true, Answers: {} })],
            ['a probability is not a number', async () => likelihoods(Number.NaN)],
        ])('continues as today, and logs why, when %s', async (_label, answer) => {
            actionSucceeds();
            vi.spyOn(decisions, 'Ask').mockImplementationOnce(answer as () => Promise<AIDecisionRunResult>);

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result).toMatchObject({ step: 'Retry', terminate: false });
            expect(finishChecks).toHaveLength(1);
            expect(finishChecks[0]).toMatchObject({ passed: false });
            expect(String(finishChecks[0].reason).length).toBeGreaterThan(0);
        });

        it('does not pass when Success validation would refuse, and never counts as a validation retry', async () => {
            actionSucceeds();
            vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.99));
            agent['_generalValidationRetryCount'] = 1;
            agent['_validationRetryCount'] = 2;
            vi.mocked(agent.validateSuccessNextStep).mockImplementationOnce(async () => {
                // What the real validation does when it demotes Success to Retry.
                agent['_generalValidationRetryCount']++;
                agent['_validationRetryCount']++;
                return { step: 'Retry', terminate: false, errorMessage: 'Minimum execution requirements not met' };
            });

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result.step).toBe('Retry');
            expect(finishChecks[0]).toMatchObject({ passed: false, reason: 'Minimum execution requirements not met' });
            expect(agent['_generalValidationRetryCount']).toBe(1);
            expect(agent['_validationRetryCount']).toBe(2);
        });

        it('is never evaluated inside ForEach or While iterations', async () => {
            actionSucceeds();
            const ask = vi.spyOn(decisions, 'Ask');

            const result = await executeActions(makeParams(), actionsDecision(), false);

            expect(result.step).toBe('Retry');
            expect(ask).not.toHaveBeenCalled();
        });

        it('is never evaluated when includeResponseTypeDefinition.finishIf is false', async () => {
            agent['_agentTypePromptParams'] = { finishIfMode: 'on', includeResponseTypeDefinition: { finishIf: false } };
            actionSucceeds();
            const ask = vi.spyOn(decisions, 'Ask');

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result.step).toBe('Retry');
            expect(ask).not.toHaveBeenCalled();
        });

        it('reads the threshold and the decision prompt from the merged prompt params', async () => {
            agent['_agentTypePromptParams'] = { finishIfMode: 'on', finishIfThreshold: 0.8, decisionPromptName: 'Custom Decision' };
            actionSucceeds();
            const ask = vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.85));

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result.step).toBe('Success');
            expect(ask.mock.calls[0][0].PromptName).toBe('Custom Decision');
        });
    });

    describe('after a sub-agent', () => {
        const subAgentSucceeded = (overrides: Partial<BaseAgentNextStep> & Record<string, unknown> = {}): void => {
            agent['processSubAgentStep'] = vi.fn().mockResolvedValueOnce({
                step: 'Success',
                terminate: false,
                newPayload: { merged: true },
                // The child and related paths spread the sub-agent's ExecuteAgentResult into the step.
                agentRun: { Message: 'I created task T-42.' } as MJAIAgentRunEntityExtended,
                payload: { taskId: 'T-42' },
                ...overrides,
            } as BaseAgentNextStep);
        };

        it("ends the run when the gate passes, asking about the sub-agent's reply and payload", async () => {
            subAgentSucceeded();
            const ask = vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.97));

            const result = await agent.TestExecuteNextStep(makeParams(), subAgentDecision());

            expect(result).toMatchObject({ step: 'Success', terminate: true, message: FINISH_IF.message });
            const state = ask.mock.calls[0][0].State as string;
            expect(state).toContain('Final message: I created task T-42.');
            expect(state).toContain('"taskId":"T-42"');
        });

        it('returns the sub-agent step unchanged when the gate does not pass', async () => {
            subAgentSucceeded();
            vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.4));

            const result = await agent.TestExecuteNextStep(makeParams(), subAgentDecision());

            expect(result).toMatchObject({ step: 'Success', terminate: false });
        });

        it('records a passing gate in shadow mode, and returns the sub-agent step unchanged, so the run continues', async () => {
            internals._agentTypePromptParams = { finishIfMode: 'shadow' };
            subAgentSucceeded();
            const ask = vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.97));

            const result = await agent.TestExecuteNextStep(makeParams(), subAgentDecision());

            expect(ask).toHaveBeenCalledTimes(1);
            // The Finish check step records what the mode allows; the step returned is what the loop acts on.
            expect(result).toMatchObject({ step: 'Success', terminate: false, newPayload: { merged: true } });
            expect(result.message).not.toBe(FINISH_IF.message);
            expect(finishChecks).toEqual([expect.objectContaining({ passed: true, mode: 'shadow', endedRun: false })]);
        });

        it('returns the sub-agent step unchanged, rather than throwing out of the loop, when the gate throws', async () => {
            subAgentSucceeded();
            vi.spyOn(decisions, 'Ask').mockRejectedValueOnce(new Error('network down'));

            const result = await agent.TestExecuteNextStep(makeParams(), subAgentDecision());

            expect(result).toMatchObject({ step: 'Success', terminate: false });
            expect(finishChecks).toEqual([expect.objectContaining({ passed: false, reason: 'network down' })]);
        });

        it.each([
            ['the sub-agent failed', { step: 'Failed' }],
            ['the step already terminates', { terminate: true }],
        ])('never asks when %s', async (_label, overrides) => {
            subAgentSucceeded(overrides as Partial<BaseAgentNextStep>);
            const ask = vi.spyOn(decisions, 'Ask');

            await agent.TestExecuteNextStep(makeParams(), subAgentDecision());

            expect(ask).not.toHaveBeenCalled();
        });
    });

    describe("the gate's guarantees", () => {
        /** An ActionResult as the action engine returns it. */
        const actionResult = (fields: Partial<ActionResult>): ActionResult => Object.assign(new ActionResult(), fields);

        function twoActionsDecision(): BaseAgentNextStep {
            return {
                step: 'Actions',
                terminate: false,
                actions: [{ name: 'Create Record', params: {} }, { name: 'Create Record', params: { Name: 'Second' } }],
                finishIf: FINISH_IF,
            };
        }

        it.each([
            ['returns Success: false', (): Promise<ActionResult> => Promise.resolve(actionResult({ Success: false, Message: 'Denied', Params: [] }))],
            ['throws', (): Promise<ActionResult> => Promise.reject(new Error('Action timed out'))],
        ])('never asks when one of two actions %s, so one success cannot end the run', async (_label, second) => {
            vi.spyOn(agent, 'ExecuteSingleAction')
                .mockResolvedValueOnce(actionResult({ Success: true, Message: 'Created', Params: [] }))
                .mockImplementationOnce(second);
            const ask = vi.spyOn(decisions, 'Ask').mockResolvedValue(likelihoods(0.99));

            const result = await executeActions(makeParams(), twoActionsDecision());

            expect(result).toMatchObject({ step: 'Retry', terminate: false });
            expect(ask).not.toHaveBeenCalled();
        });

        it('ends the run when both of two actions succeed', async () => {
            vi.spyOn(agent, 'ExecuteSingleAction')
                .mockResolvedValueOnce(actionResult({ Success: true, Message: 'Created', Params: [] }))
                .mockResolvedValueOnce(actionResult({ Success: true, Message: 'Created', Params: [] }));
            vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.99));

            const result = await executeActions(makeParams(), twoActionsDecision());

            expect(result).toMatchObject({ step: 'Success', terminate: true, message: FINISH_IF.message });
        });

        it.each([
            ['the default threshold', undefined, 0.9],
            ['a configured threshold', 0.8, 0.8],
        ])('passes a probability exactly at %s', async (_label, configured, probability) => {
            agent['_agentTypePromptParams'] = configured === undefined ? { finishIfMode: 'on' } : { finishIfMode: 'on', finishIfThreshold: configured };
            actionSucceeds();
            vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(probability));

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result).toMatchObject({ step: 'Success', terminate: true });
            expect(finishChecks[0]).toMatchObject({ passed: true, threshold: probability });
        });

        it.each([
            ['a numeric string', '0.5'],
            ['NaN', Number.NaN],
            ['zero', 0],
            ['a negative number', -0.2],
            ['a number above 1', 1.5],
        ])('falls back to the 0.9 threshold when finishIfThreshold is %s', async (_label, threshold) => {
            agent['_agentTypePromptParams'] = { finishIfMode: 'on', finishIfThreshold: threshold };
            actionSucceeds();
            vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.85));

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result).toMatchObject({ step: 'Retry', terminate: false });
            expect(finishChecks[0]).toMatchObject({ passed: false, threshold: 0.9 });
        });

        it('does not end the run when checking Success validation throws', async () => {
            actionSucceeds();
            vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.99));
            vi.mocked(agent.validateSuccessNextStep).mockRejectedValueOnce(new Error('validator crashed'));

            const result = await executeActions(makeParams(), actionsDecision());

            expect(result).toMatchObject({ step: 'Retry', terminate: false });
            expect(result.errorMessage).toBeUndefined();
            expect(finishChecks).toEqual([expect.objectContaining({ passed: false, reason: 'validator crashed' })]);
        });

        it('skips the gate, and logs why, when an action returned AIDirectives the model must read', async () => {
            vi.mocked(LogStatus).mockClear();
            vi.spyOn(agent, 'ExecuteSingleAction').mockResolvedValueOnce(actionResult({
                Success: true,
                Message: 'Found a stored query',
                Params: [],
                AIDirectives: [{ Message: 'Call "Run Stored Query" with QueryID abc-123', Type: 'instruction', Priority: 'high' }],
            }));
            const ask = vi.spyOn(decisions, 'Ask').mockResolvedValue(likelihoods(0.99));
            const params = makeParams();

            const result = await executeActions(params, actionsDecision());

            expect(result).toMatchObject({ step: 'Retry', terminate: false });
            expect(ask).not.toHaveBeenCalled();
            expect(params.conversationMessages.some(m => typeof m.content === 'string' && m.content.startsWith('IMPORTANT — Follow these directives'))).toBe(true);
            const logged = vi.mocked(LogStatus).mock.calls.map(([message]) => String(message));
            expect(logged.some(line => line.includes('Gate skipped') && line.includes('Create Record returned AIDirectives'))).toBe(true);
        });

        it("links the decision call's prompt run to the Finish check step, so the run counts its cost", async () => {
            const steps: MockStepEntity[] = [];
            agent['_activeProvider'] = new MockMetadataProvider(async () => {
                const step = new MockStepEntity(`step-${steps.length + 1}`);
                steps.push(step);
                return step as MJAIAgentRunStepEntityExtended;
            }) as IMetadataProvider;
            actionSucceeds();
            const promptRun = { ID: 'prun-gate' } satisfies Pick<MJAIPromptRunEntity, 'ID'>;
            vi.spyOn(decisions, 'Ask').mockResolvedValueOnce({ ...likelihoods(0.95), promptRun: promptRun as MJAIPromptRunEntity });

            await executeActions(makeParams(), actionsDecision());

            const finishCheck = steps.find(step => step.StepName?.includes('Finish check'));
            expect(finishCheck?.StepType).toBe('Decision');
            expect(finishCheck?.TargetLogID).toBe('prun-gate');
            expect(finishCheck?.PromptRun?.ID).toBe('prun-gate');
        });
    });
});

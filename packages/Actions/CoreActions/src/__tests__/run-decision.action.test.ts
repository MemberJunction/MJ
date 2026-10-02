import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { MJAIPromptEntityExtended, UserInfo } from '@memberjunction/ai-core-plus';
import type { DecisionQuestion, DecisionAnswer } from '@memberjunction/ai';
import { AIDecisionRunner, type AIDecisionRunResult, type AIDecisionParams } from '@memberjunction/ai-prompts';

const { promptsMock } = vi.hoisted(() => ({
    promptsMock: [] as unknown[],
}));

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        AIEngine: {
            Instance: {
                Config: vi.fn().mockResolvedValue(undefined),
                get Prompts() {
                    return promptsMock;
                },
            },
        },
    };
});

import { RunDecisionAction, RunDecisionResultCodes } from '../custom/ai/run-decision.action';

class TestRunDecisionAction extends RunDecisionAction {
    public executeInternal(params: RunActionParams) {
        return this.InternalRunAction(params);
    }
}

interface TestInput {
    Name: string;
    Value: unknown;
    Type?: 'Input' | 'Output' | 'Both';
}

const mockUser: UserInfo = {
    ID: 'user-test-1',
    Name: 'Test User',
    Email: 'test@example.com',
} as unknown as UserInfo;

const makeParams = (inputs: TestInput[], abortSignal?: AbortSignal): RunActionParams =>
    ({
        Params: inputs.map((p) => ({ Name: p.Name, Type: p.Type ?? 'Input', Value: p.Value })),
        ContextUser: mockUser,
        AbortSignal: abortSignal,
    }) as unknown as RunActionParams;

const findOutput = (list: ActionParam[] | undefined, name: string): ActionParam | undefined =>
    list?.find((p) => p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Output');

const standardQuestions: Record<string, DecisionQuestion> = {
    refund: {
        Kind: 'Likelihood',
        Instructions: 'Should this customer get a refund?',
    },
    route: {
        Kind: 'Choice',
        Instructions: 'Which department should handle this?',
        Options: [
            { Value: 'billing', Description: 'Billing issues' },
            { Value: 'technical', Description: 'Technical support' },
        ],
    },
    urgency: {
        Kind: 'Score',
        Instructions: 'Rate the urgency of this ticket',
        Levels: ['Low', 'Medium', 'High'],
    },
};

const standardAnswers: Record<string, DecisionAnswer> = {
    refund: {
        Kind: 'Likelihood',
        Probability: 0.15,
    },
    route: {
        Kind: 'Choice',
        Value: 'technical',
        Confidence: 0.92,
        Probabilities: { billing: 0.08, technical: 0.92 },
    },
    urgency: {
        Kind: 'Score',
        Value: 1.8,
        Confidence: 0.85,
        Probabilities: { Low: 0.1, Medium: 0.2, High: 0.7 },
    },
};

const mockDefaultPrompt = {
    ID: 'prompt-1',
    Name: 'Default Decision',
    Status: 'Active',
} as unknown as MJAIPromptEntityExtended;

const mockCustomPrompt = {
    ID: 'prompt-2',
    Name: 'Custom Decision',
    Status: 'Active',
} as unknown as MJAIPromptEntityExtended;

const mockSuccessRunResult: AIDecisionRunResult = {
    success: true,
    errorMessage: '',
    Answers: standardAnswers,
    modelInfo: { modelName: 'test-decision-model' } as unknown as AIDecisionRunResult['modelInfo'],
    DecisionResult: {
        ResolvedModel: 'test-decision-model-v1',
    } as unknown as AIDecisionRunResult['DecisionResult'],
    promptRun: { ID: 'run-123' } as unknown as AIDecisionRunResult['promptRun'],
    DriverClass: 'OpenRouterDecision',
    startTime: new Date(),
    endTime: new Date(),
};

describe('RunDecisionAction', () => {
    let action: TestRunDecisionAction;
    let executeDecisionSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        action = new TestRunDecisionAction();
        promptsMock.length = 0;
        executeDecisionSpy = vi.spyOn(AIDecisionRunner.prototype, 'ExecuteDecision');
        executeDecisionSpy.mockReset();
    });

    describe('1. Success', () => {
        it('passes State, Questions, and prompt to runner, pushes output params, and formats Message summary', async () => {
            promptsMock.splice(0, promptsMock.length, mockDefaultPrompt);
            executeDecisionSpy.mockResolvedValue(mockSuccessRunResult);

            const state = { customer: 'Alice', issue: 'Overcharged by $50' };
            const params = makeParams([
                { Name: 'State', Value: state },
                { Name: 'Questions', Value: standardQuestions },
            ]);

            const result = await action.executeInternal(params);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.SUCCESS);

            // Runner received correct arguments
            expect(executeDecisionSpy).toHaveBeenCalledTimes(1);
            const callArgs = executeDecisionSpy.mock.calls[0][0] as AIDecisionParams;
            expect(callArgs.prompt).toBe(mockDefaultPrompt);
            expect(callArgs.State).toEqual(state);
            expect(callArgs.Questions).toEqual(standardQuestions);
            expect(callArgs.contextUser).toBe(mockUser);

            // Output parameters were pushed
            const answersParam = findOutput(params.Params, 'Answers');
            expect(answersParam).toBeDefined();
            expect(answersParam!.Value).toEqual(standardAnswers);

            const modelNameParam = findOutput(params.Params, 'ModelName');
            expect(modelNameParam).toBeDefined();
            expect(modelNameParam!.Value).toBe('test-decision-model');

            const resolvedModelParam = findOutput(params.Params, 'ResolvedModel');
            expect(resolvedModelParam).toBeDefined();
            expect(resolvedModelParam!.Value).toBe('test-decision-model-v1');

            const promptRunIdParam = findOutput(params.Params, 'PromptRunID');
            expect(promptRunIdParam).toBeDefined();
            expect(promptRunIdParam!.Value).toBe('run-123');

            // Message contains short JSON summary for each question kind
            const summary = JSON.parse(result.Message ?? '{}') as Record<string, unknown>;
            expect(summary).toEqual({
                refund: 0.15,
                route: 'technical',
                urgency: 1.8,
            });
        });
    });

    describe('2. Questions as a JSON string', () => {
        it('accepts Questions serialized as a JSON string and invokes runner successfully', async () => {
            promptsMock.splice(0, promptsMock.length, mockDefaultPrompt);
            executeDecisionSpy.mockResolvedValue(mockSuccessRunResult);

            const params = makeParams([
                { Name: 'State', Value: 'Account in good standing' },
                { Name: 'Questions', Value: JSON.stringify(standardQuestions) },
            ]);

            const result = await action.executeInternal(params);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.SUCCESS);
            expect(executeDecisionSpy).toHaveBeenCalledTimes(1);
            const callArgs = executeDecisionSpy.mock.calls[0][0] as AIDecisionParams;
            expect(callArgs.Questions).toEqual(standardQuestions);
        });
    });

    describe('3. DecisionPromptName parameter', () => {
        it('looks up Default Decision when DecisionPromptName is omitted', async () => {
            promptsMock.splice(0, promptsMock.length, mockDefaultPrompt);
            executeDecisionSpy.mockResolvedValue(mockSuccessRunResult);

            const params = makeParams([
                { Name: 'State', Value: 'System status normal' },
                { Name: 'Questions', Value: standardQuestions },
            ]);

            const result = await action.executeInternal(params);

            expect(result.Success).toBe(true);
            expect((executeDecisionSpy.mock.calls[0][0] as AIDecisionParams).prompt).toBe(mockDefaultPrompt);
        });

        it('looks up custom prompt name when DecisionPromptName is provided', async () => {
            promptsMock.splice(0, promptsMock.length, mockCustomPrompt);
            executeDecisionSpy.mockResolvedValue(mockSuccessRunResult);

            const params = makeParams([
                { Name: 'State', Value: 'System status normal' },
                { Name: 'Questions', Value: standardQuestions },
                { Name: 'DecisionPromptName', Value: 'Custom Decision' },
            ]);

            const result = await action.executeInternal(params);

            expect(result.Success).toBe(true);
            expect((executeDecisionSpy.mock.calls[0][0] as AIDecisionParams).prompt).toBe(mockCustomPrompt);
        });
    });

    describe('4. Validation failures', () => {
        it('fails with MISSING_STATE when State parameter is omitted', async () => {
            const params = makeParams([{ Name: 'Questions', Value: standardQuestions }]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.MISSING_STATE);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with MISSING_STATE when State is an empty string', async () => {
            const params = makeParams([
                { Name: 'State', Value: '   ' },
                { Name: 'Questions', Value: standardQuestions },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.MISSING_STATE);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with MISSING_STATE when State is an empty object', async () => {
            const params = makeParams([
                { Name: 'State', Value: {} },
                { Name: 'Questions', Value: standardQuestions },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.MISSING_STATE);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when Questions parameter is omitted', async () => {
            const params = makeParams([{ Name: 'State', Value: 'Valid state' }]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when Questions is empty string', async () => {
            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: '' },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when Questions is invalid JSON string', async () => {
            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: '{ malformed json' },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when Questions has no entries', async () => {
            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: {} },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when question has unknown Kind', async () => {
            const invalidQuestions = {
                q1: { Kind: 'UnknownKind', Instructions: 'Test' },
            };
            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: invalidQuestions },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(result.Message).toMatch(/known Kind/);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when question lacks Instructions', async () => {
            const invalidQuestions = {
                q1: { Kind: 'Likelihood', Instructions: '  ' },
            };
            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: invalidQuestions },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(result.Message).toMatch(/Instructions/);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when Choice question lacks Options array', async () => {
            const invalidQuestions = {
                q1: { Kind: 'Choice', Instructions: 'Pick one', Options: null },
            };
            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: invalidQuestions },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(result.Message).toMatch(/Options array/);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when Choice option lacks Value or Description', async () => {
            const invalidQuestions = {
                q1: {
                    Kind: 'Choice',
                    Instructions: 'Pick one',
                    Options: [{ Value: 'only_value' }],
                },
            };
            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: invalidQuestions },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(result.Message).toMatch(/Value and Description/);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when Score question lacks Levels array', async () => {
            const invalidQuestions = {
                q1: { Kind: 'Score', Instructions: 'Rate it', Levels: 'not-an-array' },
            };
            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: invalidQuestions },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(result.Message).toMatch(/Levels array/);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('fails with INVALID_QUESTIONS when Score question has non-string Levels', async () => {
            const invalidQuestions = {
                q1: { Kind: 'Score', Instructions: 'Rate it', Levels: [1, 2, 3] },
            };
            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: invalidQuestions },
            ]);
            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.INVALID_QUESTIONS);
            expect(result.Message).toMatch(/array of strings/);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });
    });

    describe('5. Prompt not found or not active', () => {
        it('returns PROMPT_NOT_FOUND when no prompt has that name', async () => {
            promptsMock.splice(0, promptsMock.length);

            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: standardQuestions },
            ]);

            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.PROMPT_NOT_FOUND);
            expect(result.Message).toMatch(/not found/);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });

        it('returns PROMPT_NOT_ACTIVE when prompt row status is not Active', async () => {
            promptsMock.splice(0, promptsMock.length, { ...mockDefaultPrompt, Status: 'Draft' });

            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: standardQuestions },
            ]);

            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.PROMPT_NOT_ACTIVE);
            expect(result.Message).toMatch(/not active/);
            expect(executeDecisionSpy).not.toHaveBeenCalled();
        });
    });

    describe('6. Runner failure', () => {
        it('returns DECISION_FAILED carrying the runner errorMessage when success is false', async () => {
            promptsMock.splice(0, promptsMock.length, mockDefaultPrompt);
            executeDecisionSpy.mockResolvedValue({
                success: false,
                errorMessage: 'Rate limit exceeded on provider',
                Answers: {},
                startTime: new Date(),
                endTime: new Date(),
            } as AIDecisionRunResult);

            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: standardQuestions },
            ]);

            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.DECISION_FAILED);
            expect(result.Message).toBe('Rate limit exceeded on provider');
        });
    });

    describe('7. Runner throw', () => {
        it('returns EXECUTION_ERROR when runner throws an exception', async () => {
            promptsMock.splice(0, promptsMock.length, mockDefaultPrompt);
            executeDecisionSpy.mockRejectedValue(new Error('Underlying socket closed abruptly'));

            const params = makeParams([
                { Name: 'State', Value: 'Valid state' },
                { Name: 'Questions', Value: standardQuestions },
            ]);

            const result = await action.executeInternal(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(RunDecisionResultCodes.EXECUTION_ERROR);
            expect(result.Message).toBe('Underlying socket closed abruptly');
        });
    });
});

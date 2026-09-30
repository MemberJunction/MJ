import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { ActionResult, type ActionParam } from '@memberjunction/actions-base';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { AgentFinishIf, BaseAgentNextStep, MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentDecisionService, type AgentDecisionAskParams } from '../AgentDecisionService';
import { BaseAgent } from '../base-agent';
import {
    BuildFinishIfQuestions,
    CapFinishIfState,
    FINISH_IF_STATE_EXCERPT,
    FINISH_IF_STATE_MAX,
    FormatActionForFinishIf,
    FormatSubAgentForFinishIf,
    IsValidFinishIf,
    JudgeFinishIf,
} from '../finish-if-state';

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

// ─── Fixtures, and the text the gate must produce from them ────────────────────────────────────
// Every expected string is written out by hand. They were pinned against the formatters while
// they still lived inside base-agent.ts, before the move to finish-if-state.ts, so the move is
// proven to change nothing the decision model reads.

/** One action's result, as BaseAgent summarizes it. */
interface PinnedSummary {
    actionName: string;
    success: boolean;
    params: ActionParam[];
    resultCode: string;
    message: string;
}

const LONG_MESSAGE = 'm'.repeat(1500);
const LONG_VALUE = 'v'.repeat(2500);

function circularValue(): Record<string, unknown> {
    const value: Record<string, unknown> = { name: 'loop' };
    value.self = value;
    return value;
}

function output(name: string, value: ActionParam['Value']): ActionParam {
    return { Name: name, Type: 'Output', Value: value };
}

const CREATE_RECORD: PinnedSummary = {
    actionName: 'Create Record',
    success: true,
    resultCode: 'SUCCESS',
    message: 'Created',
    params: [
        output('RecordID', 'T-42'),
        output('Fields', { Name: 'Call Dana', Priority: 2 }),
        output('Count', 3),
        output('Missing', undefined),
        output('Nothing', null),
    ],
};

const CREATE_RECORD_TEXT = [
    'Action: Create Record',
    'Message: Created',
    'Output RecordID: T-42',
    'Output Fields: {"Name":"Call Dana","Priority":2}',
    'Output Count: 3',
    'Output Missing: ',
    'Output Nothing: null',
].join('\n');

const LONG_ONE: PinnedSummary = {
    actionName: 'Long One',
    success: true,
    resultCode: 'SUCCESS',
    message: LONG_MESSAGE,
    params: [output('Body', LONG_VALUE), output('Loop', circularValue())],
};

const LONG_ONE_TEXT = [
    'Action: Long One',
    `Message: ${'m'.repeat(1000)}`,
    `Output Body: ${'v'.repeat(2000)}`,
    'Output Loop: [object Object]',
].join('\n');

/** Ten actions, each about 2,050 characters, so the joined state runs past the 16,000 cap. */
function manyActions(): PinnedSummary[] {
    return Array.from({ length: 10 }, (_, i) => ({
        actionName: `Bulk ${i}`,
        success: true,
        resultCode: 'SUCCESS',
        message: `Row ${i}`,
        params: [output('Data', String(i).repeat(2500))],
    }));
}

function manyActionsText(): string {
    const full = Array.from({ length: 10 }, (_, i) =>
        [`Action: Bulk ${i}`, `Message: Row ${i}`, `Output Data: ${String(i).repeat(2000)}`].join('\n')
    ).join('\n\n');
    return full.slice(0, 16000);
}

const SUB_AGENT_REPLY = 'a'.repeat(5000);
const SUB_AGENT_PAYLOAD = { taskId: 'T-42', notes: 'p'.repeat(5000) };

const FINISH_IF: AgentFinishIf = {
    questions: ['The results show the task was created.', 'The task is due on Friday.', 'Nothing else was asked.'],
    message: 'Done.',
};

function likelihoods(...probabilities: number[]): AIDecisionRunResult {
    const Answers: AIDecisionRunResult['Answers'] = {};
    probabilities.forEach((p, i) => {
        Answers[`q${i + 1}`] = { Kind: 'Likelihood', Probability: p };
    });
    return { success: true, Answers };
}

// ─── The BaseAgent seam ─────────────────────────────────────────────────────────────────────────

/** A step entity that records what the agent writes to it. */
class MockStepEntity {
    public ID = 'step-1';
    public StartedAt = new Date();
    public TargetLogID?: string | null;
    public NewRecord(): void {}
    public async Save(): Promise<boolean> {
        return true;
    }
}

/** What the gate reads of the run's parameters. */
interface GateParams {
    contextUser: UserInfo;
    conversationMessages: [];
    agent: { ID: string; Name: string };
}

/** A sub-agent step's result, with the child's run and payload spread in. */
type PinnedSubAgentResult = BaseAgentNextStep & { agentRun?: { Message?: string }; payload?: unknown };

/** The BaseAgent members these tests reach. */
interface AgentInternals {
    _agentRun: { ID: string; AgentID: string; Steps: MockStepEntity[] };
    _agentTypePromptParams?: Record<string, unknown>;
    _activeProvider: { GetEntityObject: () => Promise<MockStepEntity> };
    finalizeStepEntity: (step: MockStepEntity, success: boolean, error?: string, output?: Record<string, unknown>) => Promise<void>;
    finishAfterActions: (
        params: GateParams,
        decision: BaseAgentNextStep,
        actionResults: Array<{ success: boolean; result?: ActionResult }>,
        actionSummaries: PinnedSummary[],
        payload: Record<string, unknown>,
        parentStepId: string | undefined,
        addConversationMessage: boolean
    ) => Promise<BaseAgentNextStep | undefined>;
    finishAfterSubAgent: (params: GateParams, decision: BaseAgentNextStep, result: PinnedSubAgentResult) => Promise<BaseAgentNextStep | undefined>;
}

class TestAgent extends BaseAgent {
    public SetDecisionService(service: AgentDecisionService): void {
        this._agentDecisionService = service;
    }
}

function makeParams(): GateParams {
    return { contextUser: { ID: 'user-1' } as UserInfo, conversationMessages: [], agent: { ID: 'agent-1', Name: 'TestAgent' } };
}

function succeeded(count: number): Array<{ success: boolean; result?: ActionResult }> {
    return Array.from({ length: count }, () => ({ success: true, result: Object.assign(new ActionResult(), { Success: true }) }));
}

describe('finishIf state and verdict, as BaseAgent produces them', () => {
    let internals: AgentInternals;
    let decisions: AgentDecisionService;
    let finishChecks: Array<Record<string, unknown>>;

    beforeEach(() => {
        vi.restoreAllMocks();
        const agent = new TestAgent();
        internals = agent as unknown as AgentInternals;
        internals._activeProvider = { GetEntityObject: vi.fn(async () => new MockStepEntity()) };
        internals._agentRun = { ID: 'run-1', AgentID: 'agent-1', Steps: [] };
        // The gate is evaluated only when finishIfMode is shadow or on (it defaults to off).
        internals._agentTypePromptParams = { finishIfMode: 'on' };
        decisions = new AgentDecisionService();
        agent.SetDecisionService(decisions);
        finishChecks = [];
        const finalize = internals.finalizeStepEntity.bind(agent);
        vi.spyOn(internals, 'finalizeStepEntity').mockImplementation(async (step, success, error, outputData) => {
            if (outputData && 'passed' in outputData) {
                finishChecks.push(outputData);
            }
            return finalize(step, success, error, outputData);
        });
    });

    /** Runs the gate after the given actions, answering every question with `answer`, and returns what it was asked. */
    async function askAfterActions(summaries: PinnedSummary[], answer: AIDecisionRunResult): Promise<AgentDecisionAskParams> {
        const ask = vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(answer);
        const decision: BaseAgentNextStep = { step: 'Actions', terminate: false, actions: [{ name: 'Create Record', params: {} }], finishIf: FINISH_IF };
        await internals.finishAfterActions(makeParams(), decision, succeeded(summaries.length), summaries, {}, undefined, true);
        expect(ask).toHaveBeenCalledTimes(1);
        return ask.mock.calls[0][0];
    }

    it('formats each action as its name, message and output params, joined by a blank line', async () => {
        const asked = await askAfterActions([CREATE_RECORD, LONG_ONE], likelihoods(0.1, 0.1, 0.1));
        expect(asked.State).toBe(`${CREATE_RECORD_TEXT}\n\n${LONG_ONE_TEXT}`);
    });

    it('caps the state at 16,000 characters', async () => {
        const asked = await askAfterActions(manyActions(), likelihoods(0.1, 0.1, 0.1));
        expect(asked.State).toBe(manyActionsText());
        expect(String(asked.State).length).toBe(16000);
    });

    it('asks each question as a Likelihood keyed q1, q2, q3', async () => {
        const asked = await askAfterActions([CREATE_RECORD], likelihoods(0.1, 0.1, 0.1));
        expect(asked.Questions).toEqual({
            q1: { Kind: 'Likelihood', Instructions: FINISH_IF.questions[0] },
            q2: { Kind: 'Likelihood', Instructions: FINISH_IF.questions[1] },
            q3: { Kind: 'Likelihood', Instructions: FINISH_IF.questions[2] },
        });
    });

    it('fails with every reason, keeping the numeric probabilities, when answers are low, missing or not numbers', async () => {
        const answer: AIDecisionRunResult = {
            success: true,
            Answers: { q1: { Kind: 'Likelihood', Probability: 0.95 }, q3: { Kind: 'Likelihood', Probability: Number.NaN } },
        };
        await askAfterActions([CREATE_RECORD], answer);
        expect(finishChecks).toHaveLength(1);
        expect(finishChecks[0].passed).toBe(false);
        expect(finishChecks[0].probabilities).toEqual({ q1: 0.95, q3: Number.NaN });
        expect(finishChecks[0].reason).toBe('Below the threshold of 0.9: q2 has no answer; q3 is NaN');
    });

    it('treats an answer of another kind as no answer', async () => {
        const answer: AIDecisionRunResult = {
            success: true,
            Answers: {
                q1: { Kind: 'Choice', Value: 'yes', Probabilities: { yes: 0.99, no: 0.01 }, Confidence: 0.99 },
                q2: { Kind: 'Likelihood', Probability: 0.2 },
                q3: { Kind: 'Likelihood', Probability: 0.9 },
            },
        };
        await askAfterActions([CREATE_RECORD], answer);
        expect(finishChecks[0].reason).toBe('Below the threshold of 0.9: q1 has no answer; q2 is 0.2');
        expect(finishChecks[0].probabilities).toEqual({ q2: 0.2, q3: 0.9 });
    });

    it('formats a sub-agent as its final message and payload, each capped at 4,000 characters', async () => {
        const ask = vi.spyOn(decisions, 'Ask').mockResolvedValueOnce(likelihoods(0.1, 0.1, 0.1));
        const decision: BaseAgentNextStep = { step: 'Sub-Agent', terminate: false, finishIf: FINISH_IF };
        const result: PinnedSubAgentResult = {
            step: 'Success',
            terminate: false,
            message: 'ignored while the run has a message',
            newPayload: { ignored: true },
            agentRun: { Message: SUB_AGENT_REPLY },
            payload: SUB_AGENT_PAYLOAD,
        };
        await internals.finishAfterSubAgent(makeParams(), decision, result);
        expect(ask.mock.calls[0][0].State).toBe(
            `Final message: ${'a'.repeat(4000)}\n\nPayload: ${JSON.stringify(SUB_AGENT_PAYLOAD).slice(0, 4000)}`
        );
    });

    it("falls back to the step's message and new payload, and omits an absent payload", async () => {
        const ask = vi.spyOn(decisions, 'Ask').mockResolvedValue(likelihoods(0.1, 0.1, 0.1));
        const decision: BaseAgentNextStep = { step: 'Sub-Agent', terminate: false, finishIf: FINISH_IF };
        await internals.finishAfterSubAgent(makeParams(), decision, { step: 'Success', terminate: false, message: 'Fallback', newPayload: { x: 1 } });
        await internals.finishAfterSubAgent(makeParams(), decision, { step: 'Success', terminate: false, message: 'Bare' });
        expect(ask.mock.calls[0][0].State).toBe('Final message: Fallback\n\nPayload: {"x":1}');
        expect(ask.mock.calls[1][0].State).toBe('Final message: Bare');
    });
});

describe('finish-if-state, called directly', () => {
    describe('the state formatters give the text pinned above', () => {
        it('FormatActionForFinishIf', () => {
            expect(FormatActionForFinishIf(CREATE_RECORD)).toBe(CREATE_RECORD_TEXT);
            expect(FormatActionForFinishIf(LONG_ONE)).toBe(LONG_ONE_TEXT);
        });

        it('CapFinishIfState', () => {
            expect(CapFinishIfState(manyActions().map(FormatActionForFinishIf).join('\n\n'))).toBe(manyActionsText());
            expect(CapFinishIfState('short')).toBe('short');
        });

        it('FormatSubAgentForFinishIf', () => {
            expect(FormatSubAgentForFinishIf({ step: 'Success', terminate: false, agentRun: { Message: SUB_AGENT_REPLY } as MJAIAgentRunEntityExtended, payload: SUB_AGENT_PAYLOAD }))
                .toBe(`Final message: ${'a'.repeat(4000)}\n\nPayload: ${JSON.stringify(SUB_AGENT_PAYLOAD).slice(0, 4000)}`);
            expect(FormatSubAgentForFinishIf({ step: 'Success', terminate: false, message: 'Fallback', newPayload: { x: 1 } })).toBe('Final message: Fallback\n\nPayload: {"x":1}');
            expect(FormatSubAgentForFinishIf({ step: 'Success', terminate: false, message: 'Bare' })).toBe('Final message: Bare');
        });

        it('keeps the caps it had inside BaseAgent', () => {
            expect(FINISH_IF_STATE_MAX).toBe(16000);
            expect(FINISH_IF_STATE_EXCERPT).toBe(2000);
        });
    });

    describe('BuildFinishIfQuestions', () => {
        it('keys the questions q1, q2, q3 as Likelihoods, in order', () => {
            expect(BuildFinishIfQuestions(FINISH_IF)).toEqual({
                q1: { Kind: 'Likelihood', Instructions: FINISH_IF.questions[0] },
                q2: { Kind: 'Likelihood', Instructions: FINISH_IF.questions[1] },
                q3: { Kind: 'Likelihood', Instructions: FINISH_IF.questions[2] },
            });
        });
    });

    describe('JudgeFinishIf', () => {
        const questions = BuildFinishIfQuestions(FINISH_IF);

        it('passes when every probability reaches the threshold, including exactly at it', () => {
            expect(JudgeFinishIf(likelihoods(0.9, 0.95, 1).Answers, questions, 0.9))
                .toEqual({ Passed: true, Probabilities: { q1: 0.9, q2: 0.95, q3: 1 }, Reason: 'Every question reached 0.9' });
        });

        it('fails when one probability is below it', () => {
            expect(JudgeFinishIf(likelihoods(0.99, 0.89, 0.99).Answers, questions, 0.9))
                .toEqual({ Passed: false, Probabilities: { q1: 0.99, q2: 0.89, q3: 0.99 }, Reason: 'Below the threshold of 0.9: q2 is 0.89' });
        });

        it('fails on a non-numeric probability, a missing answer, and an answer of another kind', () => {
            const answers: AIDecisionRunResult['Answers'] = {
                q1: { Kind: 'Choice', Value: 'yes', Probabilities: { yes: 1 }, Confidence: 1 },
                q3: { Kind: 'Likelihood', Probability: Number.NaN },
            };
            expect(JudgeFinishIf(answers, questions, 0.9)).toEqual({
                Passed: false,
                Probabilities: { q3: Number.NaN },
                Reason: 'Below the threshold of 0.9: q1 has no answer; q2 has no answer; q3 is NaN',
            });
        });

        it('judges only the questions asked', () => {
            const one = BuildFinishIfQuestions({ questions: ['Created?'] });
            expect(JudgeFinishIf(likelihoods(0.95, 0.1).Answers, one, 0.9).Passed).toBe(true);
        });
    });

    describe('IsValidFinishIf', () => {
        it.each([
            ['one question', { questions: ['Created?'], message: 'Done' }, true],
            ['three questions', { questions: ['a', 'b', 'c'], message: 'Done' }, true],
            ['four questions', { questions: ['a', 'b', 'c', 'd'], message: 'Done' }, false],
            ['no questions', { questions: [], message: 'Done' }, false],
            ['a blank question', { questions: ['  '], message: 'Done' }, false],
            ['a non-string question', { questions: [3], message: 'Done' }, false],
            ['an empty message', { questions: ['Created?'], message: ' ' }, false],
            ['no message', { questions: ['Created?'] }, false],
            ['null', null, false],
            ['a string', 'finish', false],
        ])('%s', (_label, candidate, valid) => {
            expect(IsValidFinishIf(candidate)).toBe(valid);
        });
    });
});

/**
 * The stopped-run carry-forward: when the user stopped the previous turn, the next turn gets
 * that run's completed action and tool results and is told to continue, not restart.
 *
 * Observed before this existed: a stopped Sage run had five weather lookups and fifteen web
 * searches completed; "keep going" redid every one of them. The settled-run carry-forward
 * skipped the stopped run (Cancelled is not a settled status) and it only ever carried inline
 * Tool steps, never Actions. This path is scoped to a user-stopped newest run and renders both.
 *
 * Pure renderer tests plus the BaseAgent wiring with RunView mocked, following
 * `prior-turn-tool-results.test.ts`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import { BaseAgent, StoppedRunStackStepRecord } from '../base-agent';
import { CarryForwardToolFamily, StoppedRunStepRecord } from '../tool-result-format';
import type { AgentChatMessage } from '@memberjunction/ai-core-plus';

const CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const AGENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STOPPED_RUN = '16787b44-29f6-44a5-8bd4-fc1538e79275';

function actionStep(n: number, name: string, params: unknown, outputs: Record<string, unknown>, message = 'ok', success = true): StoppedRunStackStepRecord {
    return {
        StepNumber: n,
        StepType: 'Actions',
        Status: 'Completed',
        Success: success,
        StepName: `Execute Action: ${name}`,
        InputData: JSON.stringify({ actionName: name, actionParams: params }),
        OutputData: JSON.stringify({
            actionResult: {
                success,
                resultCode: success ? 'SUCCESS' : 'FAILED',
                message,
                parameters: [
                    ...Object.entries(params as Record<string, unknown>).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
                    ...Object.entries(outputs).map(([Name, Value]) => ({ Name, Value, Type: 'Output' })),
                ],
            },
        }),
    };
}

function toolStep(n: number, tool: string, data: unknown): StoppedRunStackStepRecord {
    return {
        StepNumber: n,
        StepType: 'Tool',
        Status: 'Completed',
        Success: true,
        StepName: `Conversation Tool: ${tool}`,
        InputData: null,
        OutputData: JSON.stringify({ toolFamily: CarryForwardToolFamily.Conversation, tool, input: { sequence: 3 }, result: { success: true, data } }),
    };
}

interface Internals {
    _depth: number;
    injectStoppedRunResults(params: unknown): Promise<void>;
}
const internals = (a: BaseAgent) => a as unknown as Internals;

describe('BaseAgent.BuildStoppedRunResultsMessage', () => {
    it('renders an action call with its output parameters under the continue-not-restart header', () => {
        const body = BaseAgent.BuildStoppedRunResultsMessage(
            [actionStep(4, 'Get Weather', { Location: 'Sydney' }, { CurrentTemp: '57.7°F', Conditions: 'Overcast' })],
            100_000
        );
        expect(body).toContain('stopped by the user before it finished');
        expect(body).toContain('ALREADY EXECUTED');
        expect(body).toContain('do not invoke the action names below as tools');
        expect(body).toContain('### Already executed: action "Get Weather" with params {"Location":"Sydney"}');
        expect(body).toContain('"CurrentTemp": "57.7°F"');
        // Never the inline-tool heading shape — an agent shown `Name({...})` for an action tried to
        // call it as a conversation tool (observed: four "Unknown conversation tool" steps).
        expect(body).not.toMatch(/### \d+\. Get Weather\(/);
    });

    it('falls back to the action message when it produced no output parameters', () => {
        const body = BaseAgent.BuildStoppedRunResultsMessage(
            [actionStep(10, 'Web Search', { Query: 'q' }, {}, 'Google Custom Search returned 10 result(s)')],
            100_000
        );
        expect(body).toContain('Google Custom Search returned 10 result(s)');
    });

    it('renders Tool steps under the inline-tool contract alongside actions', () => {
        const body = BaseAgent.BuildStoppedRunResultsMessage(
            [actionStep(4, 'Get Weather', { Location: 'Perth' }, { CurrentTemp: '70°F' }), toolStep(5, 'getMessageBySequence', 'the brief')],
            100_000
        );
        expect(body).toContain('Already executed: action "Get Weather"');
        expect(body).toContain('getMessageBySequence({"sequence":3})'); // real inline tools keep their own contract
        expect(body).toContain('the brief');
    });

    it('skips failed, unparseable and non-action steps and returns null when nothing remains', () => {
        const failed = actionStep(1, 'Get Weather', { Location: 'X' }, {}, 'boom', false);
        const garbage: StoppedRunStepRecord = { StepNumber: 2, StepType: 'Actions', StepName: 'x', InputData: '{not json', OutputData: '{}' };
        const prompt: StoppedRunStepRecord = { StepNumber: 3, StepType: 'Prompt', StepName: 'Execute Agent Prompt', InputData: '{}', OutputData: '{}' };
        expect(BaseAgent.BuildStoppedRunResultsMessage([failed, garbage, prompt], 100_000)).toBeNull();
        expect(BaseAgent.BuildStoppedRunResultsMessage([], 100_000)).toBeNull();
    });

    it('caps each section at its share of the budget and the whole body at the budget, noting what was dropped', () => {
        const big = 'z'.repeat(5_000);
        const steps = [1, 2, 3, 4].map(n => actionStep(n, 'Web Search', { Query: `q${n}` }, { Results: big }));
        const body = BaseAgent.BuildStoppedRunResultsMessage(steps, 8_000)!;
        expect(body.length).toBeLessThan(8_000 + 400); // header + notes
        expect(body).toContain('[truncated]');
        expect(body).toMatch(/\[\d+ additional result\(s\) omitted for size/);
    });
});

describe('BaseAgent.injectStoppedRunResults', () => {
    afterEach(() => vi.restoreAllMocks());

    function paramsFor(messages: unknown[] = [], extra: Record<string, unknown> = {}) {
        return { conversationId: CONV_ID, contextUser: { ID: 'u1' }, agent: { ID: AGENT_A }, conversationMessages: messages, stopContinuationMode: 'summary', ...extra };
    }

    it('injects the stopped run\'s completed results when the newest run for this agent was stopped by the user', async () => {
        const runViewFn = vi.fn()
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: STOPPED_RUN, Status: 'Cancelled', CancellationReason: 'User Request' }] })
            .mockResolvedValueOnce({ Success: true, Results: [actionStep(4, 'Get Weather', { Location: 'Sydney' }, { CurrentTemp: '57.7°F' })] });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewFn } as unknown as RunView);

        const messages: Array<{ role: string; content: string }> = [];
        await internals(new BaseAgent()).injectStoppedRunResults(paramsFor(messages));

        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
        expect(messages[0].content).toContain('Get Weather');
        expect(messages[0].content).toContain('57.7°F');

        // The row it looks for was written by the Stop button moments ago, so the lookup reads the database.
        expect((runViewFn.mock.calls[0][0] as { BypassCache?: boolean }).BypassCache).toBe(true);
        const runFilter = (runViewFn.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
        expect(runFilter).toContain(`ConversationID='${CONV_ID}'`);
        expect(runFilter).toContain(`AgentID='${AGENT_A}'`);
        expect(runFilter).toContain('ParentRunID IS NULL');
        expect(runFilter).toContain(`Status='Cancelled' AND CancellationReason='User Request'`);
        const stepFilter = (runViewFn.mock.calls[1][0] as { ExtraFilter: string }).ExtraFilter;
        expect(stepFilter).toContain(`AgentRunID='${STOPPED_RUN}'`);
        expect(stepFilter).toContain(`StepType IN ('Actions', 'Tool')`);
        expect(stepFilter).toContain(`Status='Completed' AND Success=1`);
    });

    it('adds nothing when the newest run settled normally (the settled carry-forward owns that case)', async () => {
        const runViewFn = vi.fn().mockResolvedValueOnce({ Success: true, Results: [{ ID: 'r1', Status: 'AwaitingFeedback', CancellationReason: null }] });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewFn } as unknown as RunView);

        const messages: unknown[] = [];
        await internals(new BaseAgent()).injectStoppedRunResults(paramsFor(messages));

        expect(messages).toHaveLength(0);
        expect(runViewFn).toHaveBeenCalledTimes(1); // never loads steps
    });

    it('adds nothing for a run cancelled for any reason other than the user', async () => {
        const runViewFn = vi.fn().mockResolvedValueOnce({ Success: true, Results: [{ ID: 'r1', Status: 'Cancelled', CancellationReason: 'Timeout' }] });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewFn } as unknown as RunView);

        const messages: unknown[] = [];
        await internals(new BaseAgent()).injectStoppedRunResults(paramsFor(messages));
        expect(messages).toHaveLength(0);
    });

    it('is gated like its sibling: no conversation, a sub-agent, or a history floor means no lookup', async () => {
        const fromProvider = vi.spyOn(RunView, 'FromMetadataProvider');

        await internals(new BaseAgent()).injectStoppedRunResults(paramsFor([], { conversationId: undefined }));
        await internals(new BaseAgent()).injectStoppedRunResults(paramsFor([], { ConversationHistoryFrom: new Date() }));
        const sub = new BaseAgent();
        internals(sub)._depth = 1;
        await internals(sub).injectStoppedRunResults(paramsFor([]));

        expect(fromProvider).not.toHaveBeenCalled();
    });

    it('a lookup failure is contained and leaves the messages untouched', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: vi.fn().mockRejectedValue(new Error('db down')) } as unknown as RunView);
        const messages: unknown[] = [];
        await expect(internals(new BaseAgent()).injectStoppedRunResults(paramsFor(messages))).resolves.toBeUndefined();
        expect(messages).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------------------------
// Full-stack resume: the stopped run's own turns come back in the shape the loop wrote them.
// ---------------------------------------------------------------------------------------------

type Msg = AgentChatMessage;
interface ToolBlock { type: string; toolCallId: string; content: string; isError: boolean }

const ORIGINAL: Msg = { role: 'user', content: '@Sage weather for the five largest Australian cities' };
const INVOKED_SEARCH: Msg = { role: 'user', content: '[You invoked the **Web Search** action with parameters:\n• **Query**: largest cities\n]' };
const SEARCH_RESULTS: Msg = { role: 'user', content: 'Action results:\n## Web Search ✓\n**Result:** SUCCESS — Sydney, Melbourne, Brisbane, Perth, Adelaide' };
const RUNTIME_STATE: Msg = { role: 'user', content: '<mj-runtime-state>...</mj-runtime-state>', metadata: { turnAdded: 0, volatileState: true } };

function promptStep(n: number, stack: Msg[], decision: Record<string, unknown> | null, status: StoppedRunStackStepRecord['Status'] = 'Completed'): StoppedRunStackStepRecord {
    return {
        StepNumber: n,
        StepType: 'Prompt',
        StepName: 'Execute Agent Prompt',
        Status: status,
        Success: status === 'Completed',
        InputData: JSON.stringify({ promptId: 'p', conversationMessages: stack }),
        OutputData: decision ? JSON.stringify({ nextStep: decision }) : null,
    };
}

function weatherDecision(native: boolean): Record<string, unknown> {
    const actions = [
        { name: 'Get Weather', params: { Location: 'Sydney' }, ...(native ? { toolCallId: 'call_syd' } : {}) },
        { name: 'Get Weather', params: { Location: 'Perth' }, ...(native ? { toolCallId: 'call_per' } : {}) },
    ];
    return {
        step: 'Actions',
        actions,
        ...(native ? {
            nativeTurn: {
                content: '',
                sendResultsNatively: true,
                toolCalls: [
                    { id: 'call_syd', name: 'Get_Weather', arguments: { Location: 'Sydney' } },
                    { id: 'call_per', name: 'Get_Weather', arguments: { Location: 'Perth' } },
                ],
            },
        } : {}),
    };
}

/** A stopped Sage run: searched, then asked for two weather lookups; Sydney finished, Perth was stopped. */
function stoppedRunSteps(native: boolean): StoppedRunStackStepRecord[] {
    const perthCancelled: StoppedRunStackStepRecord = { ...actionStep(6, 'Get Weather', { Location: 'Perth' }, {}), Status: 'Cancelled', Success: false };
    return [
        promptStep(1, [ORIGINAL], { step: 'Actions', actions: [{ name: 'Web Search', params: { Query: 'largest cities' } }] }),
        actionStep(2, 'Web Search', { Query: 'largest cities' }, { Results: 'Sydney, Melbourne, Brisbane, Perth, Adelaide' }),
        promptStep(4, [ORIGINAL, INVOKED_SEARCH, SEARCH_RESULTS, RUNTIME_STATE], weatherDecision(native)),
        actionStep(5, 'Get Weather', { Location: 'Sydney' }, { CurrentTemp: '57.7°F' }),
        perthCancelled,
    ];
}

function mockStoppedRun(steps: StoppedRunStackStepRecord[]) {
    const runViewFn = vi.fn()
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: STOPPED_RUN, Status: 'Cancelled', CancellationReason: 'User Request' }] })
        .mockResolvedValueOnce({ Success: true, Results: steps });
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewFn } as unknown as RunView);
    return runViewFn;
}

function fullStackParams(messages: Msg[]) {
    return { conversationId: CONV_ID, contextUser: { ID: 'u1' }, agent: { ID: AGENT_A }, conversationMessages: messages };
}

describe('BaseAgent.ExtractStoppedRunLoopTurns', () => {
    it('returns the turns after the run\'s starting message, without runtime-state fragments', () => {
        const turns = BaseAgent.ExtractStoppedRunLoopTurns(
            [ORIGINAL],
            [ORIGINAL, INVOKED_SEARCH, SEARCH_RESULTS, RUNTIME_STATE]
        );
        expect(turns).toEqual([INVOKED_SEARCH, SEARCH_RESULTS]);
    });

    it('anchors on the starting message\'s own position, not an identical earlier one ("keep going" twice)', () => {
        const keepGoing: Msg = { role: 'user', content: 'keep going' };
        const earlier: Msg = { role: 'assistant', content: 'earlier reply' };
        const first = [keepGoing, earlier, keepGoing];
        const last = [keepGoing, earlier, keepGoing, INVOKED_SEARCH];
        expect(BaseAgent.ExtractStoppedRunLoopTurns(first, last)).toEqual([INVOKED_SEARCH]);
    });

    it('returns null when either stack is missing or the starting message is gone', () => {
        expect(BaseAgent.ExtractStoppedRunLoopTurns(null, [ORIGINAL])).toBeNull();
        expect(BaseAgent.ExtractStoppedRunLoopTurns([ORIGINAL], [INVOKED_SEARCH])).toBeNull();
    });
});

describe('BaseAgent.SpliceResumedTurns', () => {
    it('puts the resumed turns before the stopped run\'s reply and the notice right before the new message', () => {
        const stoppedReply: Msg = { role: 'assistant', content: '⏹️ Stopped by user' };
        const next: Msg = { role: 'user', content: 'keep going' };
        const messages: Msg[] = [ORIGINAL, stoppedReply, next];
        expect(BaseAgent.SpliceResumedTurns(messages, [INVOKED_SEARCH, SEARCH_RESULTS], next)).toBe(true);
        expect(messages.map(m => m.content)).toEqual([
            ORIGINAL.content, INVOKED_SEARCH.content, SEARCH_RESULTS.content, stoppedReply.content, BaseAgent.StoppedRunResumeNotice, 'keep going',
        ]);
    });

    it('without a stopped reply, the turns and the notice go straight before the new message', () => {
        const next: Msg = { role: 'user', content: 'keep going' };
        const messages: Msg[] = [ORIGINAL, next];
        BaseAgent.SpliceResumedTurns(messages, [SEARCH_RESULTS], next);
        expect(messages.map(m => m.content)).toEqual([ORIGINAL.content, SEARCH_RESULTS.content, BaseAgent.StoppedRunResumeNotice, 'keep going']);
    });

    it('changes nothing when the new message is not in the list or is not a user message', () => {
        const messages: Msg[] = [ORIGINAL];
        expect(BaseAgent.SpliceResumedTurns(messages, [SEARCH_RESULTS], { role: 'user', content: 'gone' } as Msg)).toBe(false);
        expect(BaseAgent.SpliceResumedTurns(messages, [SEARCH_RESULTS], undefined)).toBe(false);
        expect(messages).toEqual([ORIGINAL]);
    });
});

describe('BaseAgent full-stack resume of a stopped run', () => {
    afterEach(() => vi.restoreAllMocks());

    it('is the default, reading every step of the stopped run from the database', async () => {
        expect(BaseAgent.DefaultStopContinuationMode).toBe('full_stack');
        const runViewFn = mockStoppedRun(stoppedRunSteps(false));
        const next: Msg = { role: 'user', content: 'keep going' };
        await internals(new BaseAgent()).injectStoppedRunResults(fullStackParams([ORIGINAL, next]));

        const stepQuery = runViewFn.mock.calls[1][0] as { ExtraFilter: string; BypassCache?: boolean; Fields: string[] };
        expect(stepQuery.ExtraFilter).toBe(`AgentRunID='${STOPPED_RUN}'`);
        expect(stepQuery.BypassCache).toBe(true);
        expect(stepQuery.Fields).toEqual(expect.arrayContaining(['Status', 'Success', 'InputData', 'OutputData']));
    });

    it('resumes a JSON-loop run in the loop\'s own shape: earlier turns, the invocation, finished and unfinished results', async () => {
        mockStoppedRun(stoppedRunSteps(false));
        const stoppedReply: Msg = { role: 'assistant', content: '⏹️ Stopped by user' };
        const next: Msg = { role: 'user', content: 'keep going' };
        const messages: Msg[] = [ORIGINAL, stoppedReply, next];
        await internals(new BaseAgent()).injectStoppedRunResults(fullStackParams(messages));

        expect(messages.map(m => m.role)).toEqual(['user', 'user', 'user', 'user', 'user', 'assistant', 'user', 'user']);
        expect(messages[1]).toEqual(INVOKED_SEARCH); // the run's own turns, verbatim
        expect(messages[2]).toEqual(SEARCH_RESULTS);
        expect(messages.some(m => m.metadata?.volatileState)).toBe(false); // runtime state is the new run's to add
        expect(messages[3].content).toContain('[You invoked **2 actions** in parallel');
        const results = messages[4].content as string;
        expect(results).toContain('1 of 2 action(s) failed:');
        expect(results).toContain('## Get Weather ✓');
        expect(results).toContain('57.7°F');
        expect(results).toContain('NOT_EXECUTED — Not executed: the user stopped the run before this action finished.');
        expect(messages[5]).toBe(stoppedReply);
        expect(messages[6].content).toBe(BaseAgent.StoppedRunResumeNotice);
        expect(messages[7]).toBe(next);
    });

    it('resumes a native tool-calling run with the call turn and one paired result per call', async () => {
        mockStoppedRun(stoppedRunSteps(true));
        const next: Msg = { role: 'user', content: 'keep going' };
        const messages: Msg[] = [ORIGINAL, next];
        await internals(new BaseAgent()).injectStoppedRunResults(fullStackParams(messages));

        const callTurn = messages.find(m => m.role === 'assistant' && m.toolCalls?.length);
        expect(callTurn?.toolCalls?.map(c => c.id)).toEqual(['call_syd', 'call_per']);
        const toolTurn = messages.find(m => Array.isArray(m.content));
        const blocks = toolTurn!.content as ToolBlock[];
        expect(blocks.map(b => b.toolCallId)).toEqual(['call_syd', 'call_per']);
        expect(blocks[0].isError).toBe(false);
        expect(blocks[0].content).toContain('57.7°F');
        expect(blocks[1].isError).toBe(true);
        expect(blocks[1].content).toContain('Not executed');
        // Natively, the call turn IS the record: no user-role invocation line between the call and its results.
        expect(messages.some(m => typeof m.content === 'string' && m.content.startsWith('[You invoked') && m.content.includes('Get Weather'))).toBe(false);
        expect(messages[messages.length - 1]).toBe(next);
    });

    it('a run stopped during its prompt resumes up to that prompt, with no decision to rebuild', async () => {
        mockStoppedRun([
            promptStep(1, [ORIGINAL], { step: 'Actions', actions: [{ name: 'Web Search', params: { Query: 'largest cities' } }] }),
            actionStep(2, 'Web Search', { Query: 'largest cities' }, { Results: 'Sydney' }),
            promptStep(4, [ORIGINAL, INVOKED_SEARCH, SEARCH_RESULTS], null, 'Cancelled'),
        ]);
        const next: Msg = { role: 'user', content: 'keep going' };
        const messages: Msg[] = [ORIGINAL, next];
        await internals(new BaseAgent()).injectStoppedRunResults(fullStackParams(messages));
        expect(messages.map(m => m.content)).toEqual([ORIGINAL.content, INVOKED_SEARCH.content, SEARCH_RESULTS.content, BaseAgent.StoppedRunResumeNotice, 'keep going']);
    });

    it('re-dates resumed turns to this run so their expiry counts from now', async () => {
        const aged: Msg = { ...SEARCH_RESULTS, metadata: { turnAdded: 7, messageType: 'action-result', expirationTurns: 2 } };
        mockStoppedRun([promptStep(1, [ORIGINAL], null, 'Cancelled'), promptStep(9, [ORIGINAL, aged], null, 'Cancelled')]);
        const next: Msg = { role: 'user', content: 'keep going' };
        const messages: Msg[] = [ORIGINAL, next];
        await internals(new BaseAgent()).injectStoppedRunResults(fullStackParams(messages));
        expect(messages[1].metadata?.turnAdded).toBe(0);
        expect(messages[1].metadata?.expirationTurns).toBe(2);
    });

    it('falls back to the summary when the stopped run has no recorded prompt to resume from', async () => {
        mockStoppedRun([actionStep(4, 'Get Weather', { Location: 'Sydney' }, { CurrentTemp: '57.7°F' })]);
        const next: Msg = { role: 'user', content: 'keep going' };
        const messages: Msg[] = [ORIGINAL, next];
        await internals(new BaseAgent()).injectStoppedRunResults(fullStackParams(messages));
        expect(messages).toHaveLength(3);
        expect(messages[2].content).toContain('ALREADY EXECUTED');
        expect(messages[2].content).toContain('57.7°F');
    });
});

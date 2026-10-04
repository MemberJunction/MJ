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
import { BaseAgent } from '../base-agent';
import { CarryForwardToolFamily, StoppedRunStepRecord } from '../tool-result-format';

const CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const AGENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STOPPED_RUN = '16787b44-29f6-44a5-8bd4-fc1538e79275';

function actionStep(n: number, name: string, params: unknown, outputs: Record<string, unknown>, message = 'ok', success = true): StoppedRunStepRecord {
    return {
        StepNumber: n,
        StepType: 'Actions',
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

function toolStep(n: number, tool: string, data: unknown): StoppedRunStepRecord {
    return {
        StepNumber: n,
        StepType: 'Tool',
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
        expect(body).toContain('continue from where it left off');
        expect(body).toContain('### 4. Get Weather({"Location":"Sydney"})');
        expect(body).toContain('"CurrentTemp": "57.7°F"');
        expect(body).not.toContain('"Location": "Sydney"'); // inputs live in the heading, not the body
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
        expect(body).toContain('Get Weather');
        expect(body).toContain('getMessageBySequence({"sequence":3})');
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
        return { conversationId: CONV_ID, contextUser: { ID: 'u1' }, agent: { ID: AGENT_A }, conversationMessages: messages, ...extra };
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

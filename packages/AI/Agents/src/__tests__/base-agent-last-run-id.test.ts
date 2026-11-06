/**
 * `ExecuteAgentParams.lastRunId` is placed in `ExtraFilter` clauses by BaseAgent (the auto-populate
 * lookup, the run-chain walk and the Plan Mode gate). The value can come from a client: the
 * `lastRunId` argument of RunAIAgent, or the `pendingFeedbackRunID` a realtime session keeps in its
 * owner-writable `Config`. These tests drive the real `initializeAgentRun` and record every RunView
 * it issues.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

const runViewSpy = vi.fn(async (_params: RunViewParams): Promise<RunViewResult> => emptyResult());

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class RecordingRunView extends actual.RunView {
        public override async RunView<T = unknown>(params: RunViewParams, _contextUser?: UserInfo): Promise<RunViewResult<T>> {
            return (await runViewSpy(params)) as RunViewResult<T>;
        }
    }
    return {
        ...actual,
        RunView: RecordingRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
    };
});

import { BaseAgent } from '../base-agent';

const AGENT_ID = 'b1a5e000-0000-4000-8000-000000000001';
const PRIOR_RUN_ID = 'b1a5e000-0000-4000-8000-000000000002';
/** Harmless text that is not a UUID and would change the meaning of a quoted filter. */
const NOT_A_UUID = "x' OR '1'='1";

function emptyResult(): RunViewResult {
    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
}

/** The run row `initializeAgentRun` creates; a plain object is enough for the fields it sets. */
interface FakeRun {
    [key: string]: unknown;
    ID: string;
    Save: () => Promise<boolean>;
}

function makeProvider(): { provider: IMetadataProvider; getEntityObject: ReturnType<typeof vi.fn> } {
    const run: FakeRun = { ID: 'b1a5e000-0000-4000-8000-000000000003', Save: vi.fn(async () => true) };
    const getEntityObject = vi.fn(async () => run);
    return { provider: { GetEntityObject: getEntityObject } as unknown as IMetadataProvider, getEntityObject };
}

function makeParams(lastRunId: string, provider: IMetadataProvider): ExecuteAgentParams {
    return {
        agent: { ID: AGENT_ID, Name: 'Test Agent' } as unknown as MJAIAgentEntityExtended,
        conversationMessages: [],
        contextUser: { ID: 'b1a5e000-0000-4000-8000-000000000004', Email: 'tester@example.com' } as unknown as UserInfo,
        provider,
        lastRunId,
        autoPopulateLastRunPayload: true,
    };
}

/** Calls the private `initializeAgentRun` on a real BaseAgent. */
function initializeAgentRun(agent: BaseAgent, params: ExecuteAgentParams): Promise<void> {
    return (agent as unknown as { initializeAgentRun(p: ExecuteAgentParams): Promise<void> }).initializeAgentRun(params);
}

function issuedFilters(): string[] {
    return runViewSpy.mock.calls.map(([params]) => params.ExtraFilter ?? '');
}

beforeEach(() => {
    runViewSpy.mockReset();
    runViewSpy.mockImplementation(async () => emptyResult());
});

describe('BaseAgent.initializeAgentRun — lastRunId', () => {
    it('never places a lastRunId that is not a UUID into a RunView filter', async () => {
        const { provider } = makeProvider();

        await initializeAgentRun(new BaseAgent(), makeParams(NOT_A_UUID, provider)).catch(() => undefined);

        expect(issuedFilters().filter((f) => f.includes(NOT_A_UUID))).toEqual([]);
    });

    it('rejects a lastRunId that is not a UUID before it creates the run record', async () => {
        const { provider, getEntityObject } = makeProvider();

        await expect(initializeAgentRun(new BaseAgent(), makeParams(NOT_A_UUID, provider))).rejects.toThrow(/lastRunId/);
        expect(getEntityObject).not.toHaveBeenCalled();
        expect(runViewSpy).not.toHaveBeenCalled();
    });

    it('still looks up a lastRunId that is a UUID', async () => {
        const { provider } = makeProvider();

        await initializeAgentRun(new BaseAgent(), makeParams(PRIOR_RUN_ID, provider));

        expect(issuedFilters()).toContain(`ID='${PRIOR_RUN_ID}'`);
    });
});

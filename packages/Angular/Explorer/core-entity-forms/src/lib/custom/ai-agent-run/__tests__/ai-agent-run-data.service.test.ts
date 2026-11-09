/**
 * A step whose start payload equals an earlier step's end payload stores `PayloadAtStart = NULL` and
 * points at that step with `PayloadAtStartSourceStepID`. The data helper fills `PayloadAtStart` from
 * the source step on load, so the run and step-detail views read the start payload unchanged.
 */
import { describe, expect, it } from 'vitest';
import type { RunViewParams } from '@memberjunction/core';
import type { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import { AIAgentRunDataHelper } from '../ai-agent-run-data.service';

type StepRow = Pick<
    MJAIAgentRunStepEntity,
    | 'ID'
    | 'AgentRunID'
    | 'StepNumber'
    | 'StepType'
    | 'StepName'
    | 'Status'
    | 'StartedAt'
    | 'TargetLogID'
    | 'PayloadAtStart'
    | 'PayloadAtStartSourceStepID'
    | 'PayloadAtEnd'
>;

const RUN_ID = '6A1F0C2E-0B7D-4E39-9C51-1D2E3F4A5B60';
const SUB_RUN_ID = '7B2A1D3F-1C8E-4F4A-8D62-2E3F4A5B6C71';

/**
 * Three steps of one run: the first stores its start payload, the second points at the first
 * (in lower case, as another provider may return it), and the third has no start payload.
 */
function stepsOfRun(runId: string): StepRow[] {
    const firstStartedAt = new Date('2026-10-12T12:00:00.000Z').getTime();
    const step = (n: number, start: string | null, sourceId: string | null, end: string | null): StepRow => ({
        ID: `${runId.slice(0, 8)}-0000-4000-8000-00000000000${n}`,
        AgentRunID: runId,
        StepNumber: n,
        StepType: 'Prompt',
        StepName: `Step ${n}`,
        Status: 'Completed',
        StartedAt: new Date(firstStartedAt + n * 1000),
        TargetLogID: null,
        PayloadAtStart: start,
        PayloadAtStartSourceStepID: sourceId,
        PayloadAtEnd: end,
    });
    const first = step(1, '{"step":0}', null, '{"step":1}');
    const second = step(2, null, first.ID.toLowerCase(), '{"step":2}');
    const third = step(3, null, null, null);
    return [first, second, third];
}

/** A provider whose step views return the steps of the run named in the filter. */
function providerFor(...runIds: string[]) {
    const stepsByRun = new Map(runIds.map((id) => [id, stepsOfRun(id)] as const));
    return CreateFakeProvider<StepRow>({
        runViewResults: (params: RunViewParams) => {
            if (params.EntityName !== 'MJ: AI Agent Run Steps') {
                return [];
            }
            const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            return [...stepsByRun.entries()].find(([runId]) => filter.includes(runId))?.[1] ?? [];
        },
    });
}

describe('AIAgentRunDataHelper start payload', () => {
    it('fills a pointing step from its source step when the run loads', async () => {
        const helper = new AIAgentRunDataHelper();
        helper.Provider = providerFor(RUN_ID);

        await helper.LoadAgentRunData(RUN_ID);

        const starts = helper.GetCurrentData().steps.map((s) => s.PayloadAtStart);
        expect(starts).toEqual(['{"step":0}', '{"step":1}', null]);
    });

    it('fills a pointing step from its source step when a sub-agent run loads', async () => {
        const helper = new AIAgentRunDataHelper();
        helper.Provider = providerFor(RUN_ID, SUB_RUN_ID);

        const { steps } = await helper.LoadSubAgentData(SUB_RUN_ID);

        expect(steps.map((s) => s.AgentRunID)).toEqual([SUB_RUN_ID, SUB_RUN_ID, SUB_RUN_ID]);
        expect(steps.map((s) => s.PayloadAtStart)).toEqual(['{"step":0}', '{"step":1}', null]);
    });

    it('does not query the current run row redundantly when loading steps and sub-runs', async () => {
        const seenFilters: string[] = [];
        const steps = stepsOfRun(RUN_ID);
        const provider = CreateFakeProvider<StepRow>({
            runViewResults: (params: RunViewParams) => {
                const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                seenFilters.push(`${params.EntityName}:${filter}`);
                return params.EntityName === 'MJ: AI Agent Run Steps' ? steps : [];
            },
        });
        const helper = new AIAgentRunDataHelper();
        helper.Provider = provider;

        await helper.LoadAgentRunData(RUN_ID);

        expect(seenFilters).not.toContain(`MJ: AI Agent Runs:ID='${RUN_ID}'`);
        expect(seenFilters).toContain(`MJ: AI Agent Runs:ParentRunID='${RUN_ID}'`);
    });
});

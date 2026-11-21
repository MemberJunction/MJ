/**
 * Which graphs the dispatcher runs, and what a submitted graph records about itself.
 *
 * A graph is found through its steps (pending workflow-typed children) and counts only when its parent is a workflow:
 * a parentless task of the workflow type. The two other sweep arms prove most parents; one found only through its steps
 * (a step retried in a run that settled before the sweep window) is checked with one read, whatever its status or age.
 */
import { describe, it, expect, vi } from 'vitest';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload, ParseTaskGraphParentMetadata } from '../TaskGraphService';

const WORKFLOW_TYPE = '11111111-1111-4111-8111-111111111111';
const IN_PROGRESS_RUN = 'AAAAAAAA-0000-4000-8000-000000000001';
const LONG_SETTLED_RUN = 'AAAAAAAA-0000-4000-8000-000000000002';
const NOT_A_WORKFLOW = 'AAAAAAAA-0000-4000-8000-000000000003';

type Discovery = { findActiveGraphIDs(provider: IMetadataProvider): Promise<string[]> };

describe('TaskGraphDispatcher: finding the graphs to run', () => {
    it('runs a step retried in a run that settled before the sweep window, and nothing under a task that is not a workflow', async () => {
        const extraReads: string[] = [];
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunViews: async () => [
                // Pending workflow-typed steps, by parent.
                { Success: true, Results: [{ ParentID: IN_PROGRESS_RUN }, { ParentID: LONG_SETTLED_RUN }, { ParentID: NOT_A_WORKFLOW }] },
                // Workflows still in progress.
                { Success: true, Results: [{ ID: IN_PROGRESS_RUN }] },
                // Workflows that settled within the window.
                { Success: true, Results: [] },
            ],
            RunView: async (params: { ExtraFilter: string }) => {
                extraReads.push(params.ExtraFilter);
                return { Success: true, Results: [{ ID: LONG_SETTLED_RUN }] };
            },
        } as unknown as RunView);
        const dispatcher = Object.create(TaskGraphDispatcher.prototype) as Discovery;
        Object.assign(dispatcher, { cachedWorkflowTaskTypeID: WORKFLOW_TYPE, retryingSettlement: new Map(), contextUser: {} as UserInfo });

        const ids = await dispatcher.findActiveGraphIDs({} as IMetadataProvider);

        expect(new Set(ids)).toEqual(new Set([IN_PROGRESS_RUN, LONG_SETTLED_RUN]));
        expect(extraReads).toHaveLength(1);
        expect(extraReads[0]).toContain('ParentID IS NULL');
        expect(extraReads[0]).toContain(LONG_SETTLED_RUN);
        expect(extraReads[0]).not.toContain(IN_PROGRESS_RUN);
    });
});

describe('TaskGraphService: a submitted graph records that its steps record their taint', () => {
    it('stamps recordsTaint on every graph it builds, and a graph from before has none', () => {
        const bag = BuildTaskGraphParentInputPayload({
            continuation: 'none', reinvokeDepth: 0, failureSemantics: 'block', submittedByAgentRunID: null, submittedByUserID: null,
        });
        expect(ParseTaskGraphParentMetadata(JSON.stringify(bag)).recordsTaint).toBe(true);
        expect(ParseTaskGraphParentMetadata(JSON.stringify({ continuation: 'none', reinvokeDepth: 0 })).recordsTaint).toBeUndefined();
    });
});

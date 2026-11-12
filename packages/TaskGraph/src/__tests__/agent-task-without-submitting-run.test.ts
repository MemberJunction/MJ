/**
 * #4623: an Agent task whose graph parent records no submitting agent run.
 *
 * The task-graph agent runner then starts the agent with no `parentRun`, so a Flow agent in it
 * takes the top-level default and dispatches its own steps: the task completes when that graph is
 * scheduled, not when its work runs. Routing is unchanged; the dispatcher now says so in the log.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';

const { mockLogWarning } = vi.hoisted(() => ({ mockLogWarning: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogWarning: (...args: unknown[]) => mockLogWarning(...args),
}));

import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload } from '../TaskGraphService';

interface GraphContextResult {
    SubmittingAgentRunID: string | null;
}

interface TestableDispatcher {
    contextUser: UserInfo;
    graphContext(provider: IMetadataProvider, task: MJTaskEntity): Promise<GraphContextResult>;
}

function parentPayload(submittedByAgentRunID: string | null): string {
    return JSON.stringify(BuildTaskGraphParentInputPayload({
        continuation: 'message',
        reinvokeDepth: 0,
        failureSemantics: 'block',
        submittedByAgentRunID,
        submittedByUserID: null,
        invocation: null,
    }));
}

async function graphContextFor(stepType: string, parentAgentRunID: string | null): Promise<GraphContextResult> {
    const parentTask = {
        ID: 'parent-1',
        AgentRunID: parentAgentRunID,
        UserID: null,
        InputPayload: parentPayload(parentAgentRunID),
        Load: vi.fn(async () => true),
    };
    const provider = { GetEntityObject: vi.fn(async () => parentTask) } as unknown as IMetadataProvider;
    const dispatcher = Object.create(TaskGraphDispatcher.prototype) as TestableDispatcher;
    dispatcher.contextUser = { ID: 'user-1' } as unknown as UserInfo;
    const task = { ID: 'child-1', Name: 'Nested Flow', ParentID: 'parent-1', StepType: stepType, UserID: null } as unknown as MJTaskEntity;
    return dispatcher.graphContext(provider, task);
}

describe('TaskGraphDispatcher: Agent task with no submitting run (#4623)', () => {
    beforeEach(() => {
        mockLogWarning.mockClear();
    });

    it('warns when the graph parent has no AgentRunID', async () => {
        const context = await graphContextFor('Agent', null);

        expect(context.SubmittingAgentRunID).toBeNull();
        expect(mockLogWarning).toHaveBeenCalledTimes(1);
        const message = String(mockLogWarning.mock.calls[0][0]);
        expect(message).toContain('child-1');
        expect(message).toContain('no submitting agent run');
    });

    it('does not warn when the graph parent names its submitting run', async () => {
        const context = await graphContextFor('Agent', 'run-1');

        expect(context.SubmittingAgentRunID).toBe('run-1');
        expect(mockLogWarning).not.toHaveBeenCalled();
    });

    it('does not warn for a non-Agent task, which never starts an agent', async () => {
        await graphContextFor('Action', null);

        expect(mockLogWarning).not.toHaveBeenCalled();
    });
});

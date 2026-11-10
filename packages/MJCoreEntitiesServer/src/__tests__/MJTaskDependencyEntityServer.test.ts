/**
 * `MJTaskDependencyEntityServer`: a workflow's edges are the task-graph service's. An edge touching a workflow step
 * is created, changed or deleted only inside the dispatcher's runtime-security scope; edges between other tasks are
 * left alone. The base entity and the workflow lookups are stubbed, so only the guard runs.
 */
import { describe, it, expect, vi } from 'vitest';
import { ServerOperationScopeManager } from '@memberjunction/core';
import { TASK_GRAPH_RUNTIME_SECURITY_OPERATION } from '@memberjunction/ai-core-plus';

const STEP = '00000000-0000-4000-8000-0000000000a1';
const OTHER_STEP = '00000000-0000-4000-8000-0000000000a2';
const TODO = '00000000-0000-4000-8000-0000000000b1';
const OTHER_TODO = '00000000-0000-4000-8000-0000000000b2';
const USER = { ID: '00000000-0000-4000-8000-0000000000c1' };

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('../custom/MJTaskEntityServer.server', () => ({
    ResolveWorkflowTaskTypeID: async () => 'workflow-type',
    // IDs compare case-insensitively, as the database does.
    IsWorkflowStepTask: async (_provider: unknown, _user: unknown, taskID: string) => [STEP, OTHER_STEP].some((id) => id.toLowerCase() === taskID.toLowerCase()),
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    class MockMJTaskDependencyEntity {
        public TaskID: string | null = null;
        public DependsOnTaskID: string | null = null;
        public IsSaved = false;
        public ContextCurrentUser: { ID: string } | undefined = USER;
        public RunViewProviderToUse = {};
        public ResultHistory: Array<{ Message: string }> = [];
        public GetFieldByName(name: string): { Value: unknown; OldValue: unknown } {
            const value = (this as unknown as Record<string, unknown>)[name];
            return { Value: value, OldValue: value };
        }
        public async Save(): Promise<boolean> {
            return true;
        }
        public async Delete(): Promise<boolean> {
            return true;
        }
    }
    return { ...(await importOriginal<object>()), MJTaskDependencyEntity: MockMJTaskDependencyEntity };
});

import { MJTaskDependencyEntityServer } from '../custom/MJTaskDependencyEntityServer.server';

type Edge = MJTaskDependencyEntityServer & { IsSaved: boolean; ResultHistory: Array<{ Message: string }> };

function edge(taskID: string, dependsOn: string, saved = false): Edge {
    const e = new MJTaskDependencyEntityServer() as Edge;
    e.TaskID = taskID;
    e.DependsOnTaskID = dependsOn;
    e.IsSaved = saved;
    return e;
}

const asService = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunWithAuthority(
    { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Task Dependencies'], userId: USER.ID },
    fn,
);

describe("MJTaskDependencyEntityServer: a workflow's edges are the task-graph service's", () => {
    it('refuses adding, changing or deleting an edge that gates a workflow step, with the reason', async () => {
        const added = edge(STEP, OTHER_STEP);
        expect(await added.Save()).toBe(false);
        expect(added.ResultHistory.at(-1)?.Message).toContain('written only by the task-graph service');
        expect(await edge(STEP, TODO, true).Save()).toBe(false);
        expect(await edge(STEP, TODO, true).Delete()).toBe(false);
    });

    it('leaves an ordinary task waiting on a workflow step alone: the dispatcher never reads that edge', async () => {
        expect(await edge(TODO, STEP).Save()).toBe(true);
        expect(await edge(TODO, STEP, true).Delete()).toBe(true);
    });

    it('lets the task-graph service write them', async () => {
        expect(await asService(() => edge(STEP, OTHER_STEP).Save())).toBe(true);
        expect(await asService(() => edge(STEP, OTHER_STEP, true).Delete())).toBe(true);
    });

    it('leaves edges between ordinary tasks alone', async () => {
        expect(await edge(TODO, OTHER_TODO).Save()).toBe(true);
        expect(await edge(TODO, OTHER_TODO, true).Delete()).toBe(true);
    });
});

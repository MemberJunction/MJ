/**
 * A task graph's action nodes run under the scope of the agent run that submitted the graph (#5624).
 *
 * Inside a run, BaseAgent stamps the run's scope (`RunScope`) and active skills
 * (`Context.ActiveSkillIDs`) on every action call, and Scoped Search treats them as authoritative over
 * its model-written parameters. A graph's action nodes run outside the run, in the dispatcher, so the
 * submitting run's scope is written to the graph's parent row at submit and read back for every action
 * node. A graph no agent run submitted carries none and runs as before.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ActionRunScope } from '@memberjunction/actions-base';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import {
    BuildTaskGraphParentInputPayload,
    ParseTaskGraphParentMetadata,
    ParseTaskGraphRunScope,
    TaskGraphService,
} from '../TaskGraphService';
import { DurableTaskGraphSubmitter } from '../TaskGraphSubmitterImpl';
import type { TaskActionRunner, TaskActionRunParams } from '../types';
import type { TaskStepConfiguration } from '../decision-node';

const TENANT_SCOPE: ActionRunScope = {
    PrimaryScopeEntityName: 'Organizations',
    PrimaryScopeRecordID: 'TENANT-A',
    SecondaryScopes: { Region: 'EU', Teams: ['t1', 't2'] },
};
const UNSCOPED: ActionRunScope = { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null };

const base = {
    continuation: 'message' as const,
    reinvokeDepth: 0,
    failureSemantics: 'block' as const,
    submittedByAgentRunID: 'run-1',
    submittedByUserID: 'user-1',
};

function parentBag(extra: { runScope?: ActionRunScope; activeSkillIDs?: string[] } = {}): string {
    return JSON.stringify(BuildTaskGraphParentInputPayload({ ...base, ...extra }));
}

function providerWithParent(inputPayload: string): IMetadataProvider {
    const parent = { Load: vi.fn().mockResolvedValue(true), AgentRunID: 'run-1', InputPayload: inputPayload };
    return { GetEntityObject: vi.fn().mockResolvedValue(parent) } as unknown as IMetadataProvider;
}

type FakeDispatcher = {
    runTaskBody(task: MJTaskEntity, provider: IMetadataProvider, inputPayload: unknown, dependencyOutputs: Map<string, unknown>): Promise<{ Success: boolean }>;
    graphContext(
        provider: IMetadataProvider,
        task: MJTaskEntity,
        prehydrated?: { parentTask?: unknown; parentMetadata?: unknown },
    ): Promise<{ RunScope?: ActionRunScope; ActiveSkillIDs?: string[]; ParentAgentHierarchy?: string[] }>;
};

function dispatcherWith(actionRunner: TaskActionRunner): FakeDispatcher {
    const instance = Object.create(TaskGraphDispatcher.prototype) as unknown as { actionRunner: TaskActionRunner; contextUser: UserInfo };
    instance.actionRunner = actionRunner;
    instance.contextUser = { ID: 'user-1' } as UserInfo;
    return instance as unknown as FakeDispatcher;
}

function runnerStub(): TaskActionRunner & { RunActionForTask: ReturnType<typeof vi.fn> } {
    return { RunActionForTask: vi.fn().mockResolvedValue({ Success: true, Output: {} }) };
}

function actionCall(runner: ReturnType<typeof runnerStub>, index = 0): TaskActionRunParams {
    return runner.RunActionForTask.mock.calls[index][0] as TaskActionRunParams;
}

const actionTask = {
    ID: 'T-1',
    ParentID: 'P-1',
    ActionID: 'A-1',
    StepType: 'Action',
    ConfigurationObject: {},
} as unknown as MJTaskEntity;

describe('task graph parent metadata: run scope', () => {
    it('round-trips the submitting run scope and active skills', () => {
        const meta = ParseTaskGraphParentMetadata(parentBag({ runScope: TENANT_SCOPE, activeSkillIDs: ['SKILL-1'] }));
        expect(meta.runScope).toEqual(TENANT_SCOPE);
        expect(meta.activeSkillIDs).toEqual(['SKILL-1']);
    });

    it('writes no scope keys for a graph no agent run submitted', () => {
        const bag = BuildTaskGraphParentInputPayload(base);
        expect(bag.runScope).toBeUndefined();
        expect(bag.activeSkillIDs).toBeUndefined();
        const meta = ParseTaskGraphParentMetadata(JSON.stringify(bag));
        expect(meta.runScope).toBeUndefined();
        expect(meta.activeSkillIDs).toBeUndefined();
    });

    it('stores an empty skill list with a scope whose run had no active skill', () => {
        expect(ParseTaskGraphParentMetadata(parentBag({ runScope: UNSCOPED })).activeSkillIDs).toEqual([]);
    });

    it('reads a stored scope that is not an object as an unscoped run, not as no run', () => {
        expect(ParseTaskGraphParentMetadata(JSON.stringify({ runScope: 'TENANT-B' })).runScope).toEqual(UNSCOPED);
        expect(ParseTaskGraphRunScope(['TENANT-B'])).toEqual(UNSCOPED);
    });

    it('drops fields with the wrong type', () => {
        expect(ParseTaskGraphRunScope({
            PrimaryScopeEntityName: 7,
            PrimaryScopeRecordID: '  TENANT-A  ',
            SecondaryScopes: { Region: 'EU', Bad: { nested: true }, Mixed: ['a', 1] },
            SearchScopeIDs: ['S-1', 2, '  '],
        })).toEqual({
            PrimaryScopeEntityName: null,
            PrimaryScopeRecordID: 'TENANT-A',
            SecondaryScopes: { Region: 'EU' },
            SearchScopeIDs: ['S-1'],
        });
    });

    it('ignores active skills stored without a scope', () => {
        expect(ParseTaskGraphParentMetadata(JSON.stringify({ activeSkillIDs: ['SKILL-1'] })).activeSkillIDs).toBeUndefined();
    });

    it('DurableTaskGraphSubmitter forwards the run scope and active skills to the submit context', async () => {
        const submitSpy = vi.spyOn(TaskGraphService.prototype, 'Submit').mockResolvedValueOnce({ Success: true, ParentTaskID: 'P-1' } as never);
        try {
            await new DurableTaskGraphSubmitter().Submit({
                Spec: { workflowName: 'Scoped', tasks: [] },
                EnvironmentID: 'env-1',
                ContextUser: { ID: 'user-1' } as unknown as UserInfo,
                Provider: {} as unknown as IMetadataProvider,
                RunScope: TENANT_SCOPE,
                ActiveSkillIDs: ['SKILL-1'],
            });
            expect(submitSpy.mock.calls[0][1].RunScope).toEqual(TENANT_SCOPE);
            expect(submitSpy.mock.calls[0][1].ActiveSkillIDs).toEqual(['SKILL-1']);
        } finally {
            submitSpy.mockRestore();
        }
    });
});

describe('graphContext: run scope', () => {
    it('reads the scope from a parent row it loads', async () => {
        const ctx = await dispatcherWith(runnerStub()).graphContext(
            providerWithParent(parentBag({ runScope: TENANT_SCOPE, activeSkillIDs: ['SKILL-1'] })),
            actionTask,
        );
        expect(ctx.RunScope).toEqual(TENANT_SCOPE);
        expect(ctx.ActiveSkillIDs).toEqual(['SKILL-1']);
    });

    it('reads the scope and agent hierarchy from prehydrated parent metadata', async () => {
        const parentMetadata = ParseTaskGraphParentMetadata(JSON.stringify(BuildTaskGraphParentInputPayload({
            ...base,
            parentAgentHierarchy: ['Sage', 'Director'],
            runScope: TENANT_SCOPE,
            activeSkillIDs: ['SKILL-1'],
        })));
        const ctx = await dispatcherWith(runnerStub()).graphContext(
            {} as IMetadataProvider,
            actionTask,
            { parentTask: { AgentRunID: 'run-1' }, parentMetadata },
        );
        expect(ctx.RunScope).toEqual(TENANT_SCOPE);
        expect(ctx.ActiveSkillIDs).toEqual(['SKILL-1']);
        expect(ctx.ParentAgentHierarchy).toEqual(['Sage', 'Director']);
    });
});

describe('action nodes: run scope', () => {
    it("hands an action node the submitting run's scope and active skills", async () => {
        const runner = runnerStub();
        await dispatcherWith(runner).runTaskBody(
            actionTask,
            providerWithParent(parentBag({ runScope: TENANT_SCOPE, activeSkillIDs: ['SKILL-1'] })),
            { PrimaryScopeRecordID: 'TENANT-B' },
            new Map(),
        );
        expect(actionCall(runner).RunScope).toEqual(TENANT_SCOPE);
        expect(actionCall(runner).ActiveSkillIDs).toEqual(['SKILL-1']);
    });

    it('hands no scope to an action node of a graph no agent run submitted', async () => {
        const runner = runnerStub();
        await dispatcherWith(runner).runTaskBody(actionTask, providerWithParent(parentBag()), {}, new Map());
        expect(actionCall(runner).RunScope).toBeUndefined();
        expect(actionCall(runner).ActiveSkillIDs).toBeUndefined();
    });

    it('hands the scope to a ForEach body action', async () => {
        const runner = runnerStub();
        const loopTask = {
            ID: 'T-2',
            ParentID: 'P-1',
            ActionID: 'A-1',
            StepType: 'ForEach',
            ConfigurationObject: {
                forEach: { collectionPath: 'payload.items', itemVariable: 'item', action: { name: 'Scoped Search', params: { Query: 'payload.item' } } },
            },
        } as unknown as MJTaskEntity;
        await dispatcherWith(runner).runTaskBody(loopTask, providerWithParent(parentBag({ runScope: UNSCOPED })), { items: ['a'] }, new Map());
        expect(actionCall(runner).RunScope).toEqual(UNSCOPED);
        expect(actionCall(runner).ActiveSkillIDs).toEqual([]);
    });

    it('hands the scope to every step of a multi-step loop body', async () => {
        const runner = runnerStub();
        const config: TaskStepConfiguration = {
            stepActionIds: { 'Scoped Search': 'act-search', 'Summarize': 'act-sum' },
            forEach: {
                collectionPath: 'payload.items',
                itemVariable: 'item',
                steps: [
                    { id: 'search', name: 'Scoped Search', params: { Query: '{{item}}' } },
                    { id: 'sum', name: 'Summarize', params: { Text: 'static:x' } },
                ],
            },
        };
        const loopTask = {
            ID: 'T-3',
            Name: 'Search Each',
            ParentID: 'P-1',
            ActionID: 'act-search',
            StepType: 'ForEach',
            ConfigurationObject: config,
        } as unknown as MJTaskEntity;
        await dispatcherWith(runner).runTaskBody(
            loopTask,
            providerWithParent(parentBag({ runScope: TENANT_SCOPE, activeSkillIDs: ['SKILL-1'] })),
            { items: ['a'] },
            new Map(),
        );
        expect(runner.RunActionForTask).toHaveBeenCalledTimes(2);
        for (const index of [0, 1]) {
            expect(actionCall(runner, index).RunScope).toEqual(TENANT_SCOPE);
            expect(actionCall(runner, index).ActiveSkillIDs).toEqual(['SKILL-1']);
        }
    });
});

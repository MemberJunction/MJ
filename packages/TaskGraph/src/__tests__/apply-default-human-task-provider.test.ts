/**
 * The install's default human-task provider is stamped onto a workflow's Human steps when the
 * workflow is submitted, so each step records which provider it went to and changing the setting
 * later does not reroute workflows already running.
 */
import { describe, it, expect } from 'vitest';
import { TaskNode, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import { ApplyDefaultHumanTaskProvider, BuildStepConfiguration } from '../TaskGraphService';

const base = (tempId: string) => ({ tempId, name: tempId, description: 'd', dependsOn: [] as string[] });

function spec(...tasks: TaskGraphSpec['tasks']): TaskGraphSpec {
    return { workflowName: 'W', reasoning: 'r', tasks };
}

function providerOf(graph: TaskGraphSpec, tempId: string): string | undefined {
    const node = graph.tasks.find((t) => t.tempId === tempId);
    return node ? BuildStepConfiguration(node)?.human?.provider : undefined;
}

describe('ApplyDefaultHumanTaskProvider', () => {
    it('returns the spec unchanged when there is no default', () => {
        const graph = spec(TaskNode.Human(base('h'), { instructions: 'Approve' }));
        expect(ApplyDefaultHumanTaskProvider(graph, null)).toBe(graph);
    });

    it('sends a Human step that names no provider to the default, keeping its other settings', () => {
        const graph = spec(TaskNode.Human(base('h'), { instructions: 'Approve', expiresInHours: 24 }));
        const stamped = ApplyDefaultHumanTaskProvider(graph, 'BizAppsTasks');
        expect(providerOf(stamped, 'h')).toBe('BizAppsTasks');
        expect(BuildStepConfiguration(stamped.tasks[0])?.human).toMatchObject({ instructions: 'Approve', expiresInHours: 24 });
    });

    it('leaves a Human step that names a provider, the built-in AgentRequest included', () => {
        const graph = spec(
            TaskNode.Human(base('named'), { provider: 'Ticketing' }),
            TaskNode.Human(base('inbox'), { provider: 'AgentRequest' }),
        );
        const stamped = ApplyDefaultHumanTaskProvider(graph, 'BizAppsTasks');
        expect(stamped).toBe(graph);
        expect(providerOf(stamped, 'named')).toBe('Ticketing');
        expect(providerOf(stamped, 'inbox')).toBe('AgentRequest');
    });

    it('touches only Human steps, and does not mutate the submitted spec', () => {
        const graph = spec(
            TaskNode.Action(base('a'), { actionName: 'Do It' }),
            TaskNode.Human({ ...base('h'), dependsOn: ['a'] }, {}),
        );
        const before = JSON.stringify(graph);
        const stamped = ApplyDefaultHumanTaskProvider(graph, 'BizAppsTasks');
        expect(stamped.tasks[0]).toBe(graph.tasks[0]);
        expect(providerOf(stamped, 'h')).toBe('BizAppsTasks');
        expect(JSON.stringify(graph)).toBe(before);
    });
});

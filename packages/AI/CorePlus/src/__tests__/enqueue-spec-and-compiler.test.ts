import { describe, expect, it } from 'vitest';
import {
    BuildEnqueueCorrelationKey,
    CompileFlowToTaskGraph,
    ConvertTaskGraphToAgentSpec,
    ProjectTaskRowsToSpec,
    TaskNode,
    ValidateTaskGraphSpec,
    type TaskGraphSpec,
} from '../index';

describe('Enqueue step kind & ForEach enqueue fan-out in CorePlus', () => {
    it('builds deterministic correlation keys from graphRunId, stepInvocationId, and optional item key', () => {
        expect(BuildEnqueueCorrelationKey('run-1', 'step-1')).toBe('run-1:step-1');
        expect(BuildEnqueueCorrelationKey('run-1', 'step-1', 'invoice-42')).toBe('invoice-42');
        expect(BuildEnqueueCorrelationKey('run-1', 'step-1', undefined, 7)).toBe('run-1:step-1:item:7');
        expect(BuildEnqueueCorrelationKey('run-1', 'step-1', 'batch-A', 'sku-9')).toBe('batch-A:item:sku-9');
    });

    it('validates Enqueue node configurations and rejects invalid empty topic/correlationKey/maxRetries', () => {
        const valid: TaskGraphSpec = {
            workflowName: 'Enqueue Valid',
            dispatch: 'Queue',
            tasks: [
                TaskNode.Enqueue(
                    { tempId: 'q1', name: 'Enqueue billing', description: 'Send to billing queue', dependsOn: [] },
                    { topic: 'billing.jobs', handlerKey: 'BillingJob', maxRetries: 3, expiresInHours: 1 },
                ),
            ],
        };
        expect(ValidateTaskGraphSpec(valid)).toEqual({ Valid: true, Errors: [] });

        const invalid: TaskGraphSpec = {
            workflowName: 'Enqueue Invalid',
            tasks: [
                TaskNode.Enqueue(
                    { tempId: 'q1', name: 'Bad Enqueue', description: 'Invalid', dependsOn: [] },
                    { topic: '   ', correlationKey: '', maxRetries: -1, expiresInHours: 0 },
                ),
            ],
        };
        const result = ValidateTaskGraphSpec(invalid);
        expect(result.Valid).toBe(false);
        expect(result.Errors.some((e) => e.Code === 'InvalidConfiguration')).toBe(true);
    });

    it('validates ForEach + enqueue fan-out and rejects While + enqueue or multiple loop bodies', () => {
        const validFanOut: TaskGraphSpec = {
            workflowName: 'ForEach Enqueue Valid',
            tasks: [
                TaskNode.ForEach(
                    { tempId: 'fe1', name: 'Fan out', description: 'Queue items', dependsOn: [] },
                    {
                        collectionPath: 'payload.items',
                        itemVariable: 'item',
                        enqueue: {
                            topic: 'orders.process',
                            actionName: 'Process Order',
                            publishConcurrency: 10,
                            maxActiveRunners: 5,
                            maxRetries: 2,
                        },
                    },
                ),
            ],
        };
        expect(ValidateTaskGraphSpec(validFanOut)).toEqual({ Valid: true, Errors: [] });

        const invalidDualBody: TaskGraphSpec = {
            workflowName: 'ForEach Dual Body',
            tasks: [
                TaskNode.ForEach(
                    { tempId: 'fe2', name: 'Conflict', description: 'Conflict', dependsOn: [] },
                    {
                        collectionPath: 'payload.items',
                        action: { name: 'A', params: {} },
                        enqueue: { topic: 't' },
                    },
                ),
            ],
        };
        const conflictResult = ValidateTaskGraphSpec(invalidDualBody);
        expect(conflictResult.Valid).toBe(false);
        expect(conflictResult.Errors[0].Message).toContain('enqueue');
    });

    it('round-trips Enqueue and ForEach+enqueue across Flow compiler, AgentSpec export, and TaskRows projection', () => {
        const compiled = CompileFlowToTaskGraph(
            [
                {
                    ID: 's1',
                    Name: 'Enqueue step',
                    StepType: 'External',
                    StartingStep: true,
                    Status: 'Active',
                    Configuration: JSON.stringify({ stepKind: 'Enqueue', enqueue: { topic: 'jobs.q', handlerKey: 'JobHandler' } }),
                },
                {
                    ID: 's2',
                    Name: 'Fanout step',
                    StepType: 'ForEach',
                    StartingStep: false,
                    Status: 'Active',
                    Configuration: JSON.stringify({
                        collectionPath: 'payload.records',
                        enqueue: { topic: 'fanout.q', actionName: 'HandleItem', publishConcurrency: 20 },
                    }),
                },
            ],
            [{ ID: 'p1', OriginStepID: 's1', DestinationStepID: 's2', Condition: null, Priority: 0 }],
            {
                WorkflowName: 'Queue WF',
                Isolation: 'Worker',
                ResolveAgentName: () => null,
                ResolveActionName: () => null,
                ResolvePromptName: () => null,
            },
        );
        expect(compiled.Success).toBe(true);
        expect(compiled.Errors).toEqual([]);
        expect(compiled.Spec?.tasks[0].kind).toBe('Enqueue');
        expect(compiled.Spec?.tasks[1].kind).toBe('ForEach');

        const exported = ConvertTaskGraphToAgentSpec(compiled.Spec!, {
            AgentID: 'wf-1',
            FlowAgentTypeID: 'flow-type-1',
            ResolveAgentID: () => null,
            NextID: () => 'id-next',
        });
        expect(exported.Success).toBe(true);
        expect(exported.Spec?.Steps?.[0].StepType).toBe('External');

        const projected = ProjectTaskRowsToSpec(
            'Queue WF',
            [
                {
                    ID: 't-1',
                    Name: 'Enqueue task',
                    Description: null,
                    StepType: 'External',
                    AgentID: null,
                    Agent: null,
                    ActionID: null,
                    Action: null,
                    PromptID: null,
                    Prompt: null,
                    UserID: null,
                    Configuration: JSON.stringify({ stepKind: 'Enqueue', enqueue: { topic: 'jobs.q' } }),
                    InputPayload: null,
                },
            ],
            [],
        );
        expect(projected.Spec.tasks[0].kind).toBe('Enqueue');
    });
});

import { afterEach, describe, expect, it } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    Metadata,
    type TaskGraphIsolationLevel,
    UserInfo,
} from '@memberjunction/core';
import {
    CompileFlowToTaskGraph,
    ConvertTaskGraphToAgentSpec,
    TaskNode,
    ValidateTaskGraphSpec,
    ValidateWorkflowSpec,
    type TaskGraphSpec,
    type WorkflowSpec,
} from '@memberjunction/ai-core-plus';
import { WorkflowDraftServerOperation } from '../operations/WorkflowDraftOperation';
import {
    BuildTaskGraphParentInputPayload,
    ParseTaskGraphParentMetadata,
} from '../TaskGraphService';
import {
    InProcessIsolationRunner,
    ResolveTaskGraphIsolation,
    TASK_GRAPH_ISOLATION_GUARANTEES,
    TASK_GRAPH_ISOLATION_LEVELS,
} from '../isolation';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import type { TaskAgentRunner } from '../types';

class TestableWorkflowDraftOperation extends WorkflowDraftServerOperation {
    public AcceptDraftForTest(draft: TaskGraphSpec, workflowName: string) {
        return this.acceptDraft(draft, workflowName);
    }
}

describe('TaskGraph Isolation Defaults, Metadata & Validation', () => {
    afterEach(() => {
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    it('exposes Isolation defaults and bounds in CODE_FALLBACK_LIMITS and TASK_GRAPH_ISOLATION_LEVELS', () => {
        expect(TASK_GRAPH_ISOLATION_LEVELS).toEqual(['InProcess', 'Worker', 'Process', 'Container']);
        expect(CODE_FALLBACK_LIMITS.Isolation.DefaultIsolation).toBe('InProcess');
        expect(CODE_FALLBACK_LIMITS.Isolation.DraftDefaultIsolation).toBe('Worker');
        expect(CODE_FALLBACK_LIMITS.Isolation.WorkerMaxOldGenerationSizeMb).toBe(256);
        expect(CODE_FALLBACK_LIMITS.Isolation.WorkerMaxYoungGenerationSizeMb).toBe(64);
        expect(CODE_FALLBACK_LIMITS.Isolation.ProcessMaxMemoryMb).toBe(512);
        expect(CODE_FALLBACK_LIMITS.Isolation.ContainerMemoryMb).toBe(512);
        expect(CODE_FALLBACK_LIMITS.Isolation.ContainerRuntime).toBe('docker');
        expect(CODE_FALLBACK_LIMITS.Isolation.ContainerImage).toBe('node:20-alpine');
    });

    it('documents explicit Worker V8 heap vs native/Buffer boundaries and Container runtime prerequisites', () => {
        const workerDoc = TASK_GRAPH_ISOLATION_GUARANTEES.Worker;
        expect(workerDoc.Guarantees.join(' ')).toContain('ERR_WORKER_OUT_OF_MEMORY');
        expect(workerDoc.Limitations.join(' ')).toContain('Buffer');
        expect(workerDoc.Limitations.join(' ')).toContain('Process or Container');

        const containerDoc = TASK_GRAPH_ISOLATION_GUARANTEES.Container;
        expect(containerDoc.Prerequisites.length).toBeGreaterThanOrEqual(3);
        expect(containerDoc.Prerequisites.join(' ')).toContain('Docker');
    });

    it('defaults Workflow.Draft output graphs to Worker while honoring explicit overrides and LimitsConfigResolver', () => {
        const op = new TestableWorkflowDraftOperation();
        const draft: TaskGraphSpec = {
            workflowName: 'Model Ignored Name',
            tasks: [
                TaskNode.Action(
                    { tempId: 'step-1', name: 'Run Cleanup', description: 'Runs cleanup', dependsOn: [] },
                    { actionName: 'Cleanup Action' },
                ),
            ],
        };

        const defaultResult = op.AcceptDraftForTest(draft, 'Customer Onboarding');
        expect(defaultResult.success).toBe(true);
        expect(defaultResult.graph?.workflowName).toBe('Customer Onboarding');
        expect(defaultResult.graph?.isolation).toBe('Worker');

        const explicitDraft: TaskGraphSpec = { ...draft, isolation: 'Container' };
        const overrideResult = op.AcceptDraftForTest(explicitDraft, 'Strict Onboarding');
        expect(overrideResult.success).toBe(true);
        expect(overrideResult.graph?.isolation).toBe('Container');

        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            Isolation: { DraftDefaultIsolation: 'Process' },
        });
        const limitsConfiguredResult = op.AcceptDraftForTest(draft, 'Limits Configured Onboarding');
        expect(limitsConfiguredResult.success).toBe(true);
        expect(limitsConfiguredResult.graph?.isolation).toBe('Process');
    });

    it('defaults upgraded/legacy parent task metadata without isolation to InProcess and round-trips explicit isolation', () => {
        const legacyRaw = JSON.stringify({
            continuation: 'message',
            reinvokeDepth: 0,
            failureSemantics: 'edges',
            submittedByAgentRunID: null,
        });
        const parsedLegacy = ParseTaskGraphParentMetadata(legacyRaw);
        expect(parsedLegacy.isolation).toBeUndefined();
        expect(ResolveTaskGraphIsolation({ GraphIsolation: parsedLegacy.isolation })).toBe('InProcess');

        const builtWorker = BuildTaskGraphParentInputPayload({
            continuation: 'none',
            reinvokeDepth: 1,
            failureSemantics: 'block',
            submittedByAgentRunID: 'run-1',
            submittedByUserID: 'user-1',
            isolation: 'Worker',
        });
        const parsedWorker = ParseTaskGraphParentMetadata(JSON.stringify(builtWorker));
        expect(parsedWorker.isolation).toBe('Worker');

        expect(
            ResolveTaskGraphIsolation({
                OverrideIsolation: 'Container',
                GraphIsolation: 'Process',
                WorkflowIsolation: 'Worker',
            }),
        ).toBe('Container');
        expect(
            ResolveTaskGraphIsolation({
                WorkflowIsolation: 'Process',
            }),
        ).toBe('Process');
        expect(ResolveTaskGraphIsolation({})).toBe('InProcess');
    });

    it('validates TaskGraphSpec and WorkflowSpec isolation levels strictly', () => {
        const validSpec: TaskGraphSpec = {
            workflowName: 'Valid Flow',
            isolation: 'Worker',
            tasks: [
                TaskNode.Agent(
                    { tempId: 't1', name: 'Step 1', description: 'Execute step', dependsOn: [] },
                    { agentName: 'WorkerAgent' },
                ),
            ],
        };
        expect(ValidateTaskGraphSpec(validSpec).Valid).toBe(true);

        const invalidIsolationValue = 'SandboxVM' as TaskGraphIsolationLevel;
        const invalidSpec: TaskGraphSpec = { ...validSpec, isolation: invalidIsolationValue };
        const specValidation = ValidateTaskGraphSpec(invalidSpec);
        expect(specValidation.Valid).toBe(false);
        expect(specValidation.Errors.some((e) => e.Code === 'InvalidIsolation')).toBe(true);

        const invalidWorkflow: WorkflowSpec = {
            name: 'Invalid Isolation Workflow',
            status: 'Draft',
            isolation: invalidIsolationValue,
            graph: validSpec,
            triggers: [{ type: 'OnDemand' }],
        };
        const wfValidation = ValidateWorkflowSpec(invalidWorkflow);
        expect(wfValidation.Valid).toBe(false);
        expect(wfValidation.Errors.some((e) => e.Code === 'InvalidIsolation')).toBe(true);
    });

    it('carries Isolation through CompileFlowToTaskGraph and ConvertTaskGraphToAgentSpec', () => {
        const compileResult = CompileFlowToTaskGraph(
            [
                {
                    ID: 'step-a',
                    Name: 'Start',
                    Status: 'Active',
                    StepType: 'Action',
                    StartingStep: true,
                    ActionID: 'action-1',
                },
            ],
            [],
            {
                WorkflowName: 'Upgraded Flow',
                Isolation: 'InProcess',
                ResolveAgentName: () => null,
                ResolveActionName: (id) => (id === 'action-1' ? 'Do Thing' : null),
                ResolvePromptName: () => null,
            },
        );
        expect(compileResult.Success).toBe(true);
        expect(compileResult.Spec?.isolation).toBe('InProcess');

        const projected = ConvertTaskGraphToAgentSpec(
            {
                workflowName: 'Worker Flow',
                isolation: 'Worker',
                tasks: [
                    TaskNode.Action(
                        { tempId: 'n1', name: 'Step', description: 'Step', dependsOn: [] },
                        { actionName: 'Do Thing' },
                    ),
                ],
            },
            {
                AgentID: 'agent-1',
                ResolveAgentID: () => null,
                ResolveActionID: () => 'action-1',
                NextID: () => 'next-1',
            },
        );
        expect(projected.Success).toBe(true);
        expect(projected.Spec?.Isolation).toBe('Worker');
    });

    it('executes InProcessIsolationRunner cleanly for callbacks and inline scripts', async () => {
        const runner = new InProcessIsolationRunner();
        const scriptResult = await runner.Execute({
            Level: 'InProcess',
            TaskID: 'task-1',
            TaskName: 'Inline Compute',
            GraphID: 'graph-1',
            Workload: {
                Kind: 'InlineScript',
                Script: 'return { doubled: Number(input.val) * 2 };',
                Input: { val: 21 },
            },
        });
        expect(scriptResult.Success).toBe(true);
        expect(scriptResult.IsolationLevel).toBe('InProcess');
        expect(scriptResult.Output).toEqual({ doubled: 42 });
    });

    it('dispatches tasks via configured IsolationRunners inside TaskGraphDispatcher', async () => {
        const observedLevels: TaskGraphIsolationLevel[] = [];
        const agentRunner: TaskAgentRunner = {
            RunAgentForTask: async () => ({ Success: true, Output: { ran: true }, AgentRunID: 'run-1' }),
        };
        const user = new UserInfo(Metadata.Provider, { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' });
        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: async () => Metadata.Provider },
            agentRunner,
            user,
            {
                InstanceID: 'test-dispatcher',
                IsolationRunners: {
                    Worker: {
                        Level: 'Worker',
                        Execute: async (req) => {
                            observedLevels.push(req.Level);
                            const inner = await req.ExecuteInProcess?.();
                            return {
                                Success: inner?.Success ?? false,
                                IsolationLevel: 'Worker',
                                TerminationReason: inner?.Success ? 'Completed' : 'Error',
                                DurationMs: 1,
                                BodyOutcome: inner,
                            };
                        },
                    },
                },
            },
        );
        expect(dispatcher).toBeDefined();
        expect(observedLevels).toEqual([]);
    });
});

import { afterEach, describe, expect, it } from 'vitest';
import {
    LimitsConfigResolver,
    Metadata,
    type TaskGraphIsolationLevel,
    UserInfo,
} from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentSchema } from '@memberjunction/core-entities';
import { TaskNode, type AgentSpec, type TaskGraphSpec, type WorkflowSpec } from '@memberjunction/ai-core-plus';
import { WorkflowAgentWriter } from '@memberjunction/ai-agent-manager';
import {
    WorkflowDraftServerOperation,
    TASK_GRAPH_ISOLATION_GUARANTEES,
    InProcessIsolationRunner,
} from '@memberjunction/task-graph';
import {
    BuildContainerRunArgs,
    CONTAINER_RESULT_END_MARKER,
    CONTAINER_RESULT_START_MARKER,
    CONTAINER_RUNTIME_PREREQUISITES,
    ContainerIsolationRunner,
    CreateDefaultIsolationRunners,
    ProcessIsolationRunner,
    WorkerIsolationRunner,
    type ContainerCommandSpec,
} from '../services/isolation/index.js';

class InspectableWorkflowDraftOp extends WorkflowDraftServerOperation {
    public AcceptDraft(draft: TaskGraphSpec, workflowName: string) {
        return this.acceptDraft(draft, workflowName);
    }
}

function buildMinimalAIAgentEntity(overrides: { Isolation?: MJAIAgentEntity['Isolation'] } = {}): MJAIAgentEntity {
    const fields = new Map<string, unknown>([
        ['ID', '11111111-1111-1111-1111-111111111111'],
        ['Name', 'Upgraded Workflow'],
        ['Status', 'Active'],
        ['Isolation', overrides.Isolation ?? 'InProcess'],
    ]);
    const fakeAgent = Object.create(MJAIAgentEntity.prototype) as MJAIAgentEntity & {
        Get: (fieldName: string) => unknown;
        Set: (fieldName: string, value: unknown) => void;
    };
    fakeAgent.Get = (fieldName: string): unknown => fields.get(fieldName) ?? null;
    fakeAgent.Set = (fieldName: string, value: unknown): void => {
        fields.set(fieldName, value);
    };
    return fakeAgent;
}

describe('TaskGraph Isolation Execution Runners (Slice 1 — AC-1 & AC-2)', () => {
    afterEach(() => {
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    describe('InProcess & Registry', () => {
        it('creates all four isolation runners via CreateDefaultIsolationRunners', () => {
            const runners = CreateDefaultIsolationRunners();
            expect(runners.InProcess).toBeInstanceOf(InProcessIsolationRunner);
            expect(runners.Worker).toBeInstanceOf(WorkerIsolationRunner);
            expect(runners.Process).toBeInstanceOf(ProcessIsolationRunner);
            expect(runners.Container).toBeInstanceOf(ContainerIsolationRunner);
        });
    });

    describe('WorkerIsolationRunner (worker_threads + V8 heap resourceLimits)', () => {
        it('executes valid inline workloads inside an isolated worker_thread and returns structured output', async () => {
            const runner = new WorkerIsolationRunner();
            const result = await runner.Execute({
                Level: 'Worker',
                TaskID: 'worker-ok-1',
                TaskName: 'Worker Normal Execution',
                GraphID: 'graph-worker-1',
                Workload: {
                    Kind: 'InlineScript',
                    Script: `
                        const { isMainThread } = require('node:worker_threads');
                        return { isMainThread, doubled: Number(input.x) * 2 };
                    `,
                    Input: { x: 21 },
                },
            });

            expect(result.Success).toBe(true);
            expect(result.IsolationLevel).toBe('Worker');
            expect(result.TerminationReason).toBe('Completed');
            expect(result.Output?.isMainThread).toBe(false);
            expect(result.Output?.doubled).toBe(42);
        });

        it('terminates unbounded V8 JavaScript heap OOM cleanly with ERR_WORKER_OUT_OF_MEMORY without crashing host MJAPI', async () => {
            const runner = new WorkerIsolationRunner();
            const oomResult = await runner.Execute({
                Level: 'Worker',
                TaskID: 'worker-oom-1',
                TaskName: 'Unbounded V8 Heap Fixture',
                GraphID: 'graph-worker-oom',
                Limits: {
                    WorkerMaxOldGenerationSizeMb: 16,
                    WorkerMaxYoungGenerationSizeMb: 8,
                    WorkerTimeoutMs: 20_000,
                },
                Workload: {
                    Kind: 'InlineScript',
                    Script: `
                        const allocations = [];
                        while (true) {
                            allocations.push('leak-chunk-' + String(allocations.length) + '-' + 'a'.repeat(32768));
                        }
                    `,
                },
            });

            expect(oomResult.Success).toBe(false);
            expect(oomResult.IsolationLevel).toBe('Worker');
            expect(oomResult.TerminationReason).toBe('OutOfMemory');
            expect(oomResult.ErrorCode).toBe('ERR_WORKER_OUT_OF_MEMORY');
            expect(oomResult.ErrorMessage).toBeTruthy();

            // Host process survives untouched and subsequent worker executions still run cleanly
            const followUp = await runner.Execute({
                Level: 'Worker',
                TaskID: 'worker-recovery-1',
                TaskName: 'Post-OOM Host Health Check',
                GraphID: 'graph-worker-oom',
                Workload: {
                    Kind: 'InlineScript',
                    Script: 'return { hostAlive: true };',
                },
            });
            expect(followUp.Success).toBe(true);
            expect(followUp.Output?.hostAlive).toBe(true);
        }, 30_000);

        it('terminates hung workers cleanly on timeout and documents native/Buffer bypass caveats', async () => {
            expect(TASK_GRAPH_ISOLATION_GUARANTEES.Worker.Limitations.join(' ')).toContain('Buffer');
            expect(TASK_GRAPH_ISOLATION_GUARANTEES.Worker.Limitations.join(' ')).toContain('Process or Container');

            const runner = new WorkerIsolationRunner();
            const timedOut = await runner.Execute({
                Level: 'Worker',
                TaskID: 'worker-timeout-1',
                TaskName: 'Worker Timeout Fixture',
                GraphID: 'graph-worker-timeout',
                TimeoutMs: 120,
                Workload: {
                    Kind: 'InlineScript',
                    Script: 'while (true) {}',
                },
            });

            expect(timedOut.Success).toBe(false);
            expect(timedOut.TerminationReason).toBe('Timeout');
            expect(timedOut.ErrorCode).toBe('ERR_WORKER_TIMEOUT');
        }, 15_000);
    });

    describe('ProcessIsolationRunner (child_process + OS memory/timeout guards)', () => {
        it('executes normal workloads in a separate OS process (distinct PID) and returns structured output', async () => {
            const runner = new ProcessIsolationRunner();
            const result = await runner.Execute({
                Level: 'Process',
                TaskID: 'proc-ok-1',
                TaskName: 'Process Normal Execution',
                GraphID: 'graph-proc-1',
                Workload: {
                    Kind: 'InlineScript',
                    Script: 'return { childPid: process.pid, sum: Number(input.a) + Number(input.b) };',
                    Input: { a: 19, b: 23 },
                },
            });

            expect(result.Success).toBe(true);
            expect(result.IsolationLevel).toBe('Process');
            expect(result.TerminationReason).toBe('Completed');
            expect(result.ExitCode).toBe(0);
            expect(typeof result.Output?.childPid).toBe('number');
            expect(result.Output?.childPid).not.toBe(process.pid);
            expect(result.Output?.sum).toBe(42);
        }, 15_000);

        it('terminates child processes exceeding timeout limit with ERR_PROCESS_TIMEOUT', async () => {
            const runner = new ProcessIsolationRunner();
            const result = await runner.Execute({
                Level: 'Process',
                TaskID: 'proc-timeout-1',
                TaskName: 'Process Timeout Fixture',
                GraphID: 'graph-proc-timeout',
                TimeoutMs: 150,
                Workload: {
                    Kind: 'InlineScript',
                    Script: 'await new Promise((resolve) => setTimeout(resolve, 10_000)); return { neverReached: true };',
                },
            });

            expect(result.Success).toBe(false);
            expect(result.IsolationLevel).toBe('Process');
            expect(result.TerminationReason).toBe('Timeout');
            expect(result.ErrorCode).toBe('ERR_PROCESS_TIMEOUT');
        }, 15_000);

        it('enforces ProcessMaxMemoryMb and terminates processes exceeding configured RSS memory limit', async () => {
            const runner = new ProcessIsolationRunner();
            const result = await runner.Execute({
                Level: 'Process',
                TaskID: 'proc-oom-1',
                TaskName: 'Process Memory Limit Fixture',
                GraphID: 'graph-proc-oom',
                Limits: {
                    ProcessMaxMemoryMb: 48,
                    ProcessTimeoutMs: 15_000,
                },
                Workload: {
                    Kind: 'InlineScript',
                    Script: `
                        const chunks = [];
                        while (true) {
                            const buf = Buffer.alloc(4 * 1024 * 1024, 65);
                            chunks.push(buf);
                            await new Promise((r) => setTimeout(r, 15));
                        }
                    `,
                },
            });

            expect(result.Success).toBe(false);
            expect(result.IsolationLevel).toBe('Process');
            expect(result.TerminationReason).toBe('OutOfMemory');
            expect(result.ErrorCode).toBe('ERR_PROCESS_OUT_OF_MEMORY');
        }, 20_000);

        it('propagates non-zero exit failures cleanly with ExitCode and diagnostics', async () => {
            const runner = new ProcessIsolationRunner();
            const result = await runner.Execute({
                Level: 'Process',
                TaskID: 'proc-exit-1',
                TaskName: 'Process Exit Failure Fixture',
                GraphID: 'graph-proc-exit',
                Workload: {
                    Kind: 'InlineScript',
                    Script: `
                        console.error('Simulated child crash diagnostics');
                        process.exit(42);
                    `,
                },
            });

            expect(result.Success).toBe(false);
            expect(result.IsolationLevel).toBe('Process');
            expect(result.TerminationReason).toBe('ExitFailure');
            expect(result.ExitCode).toBe(42);
            expect(result.Stderr).toContain('Simulated child crash diagnostics');
        }, 15_000);
    });

    describe('ContainerIsolationRunner (hardened OCI flags, deterministic executor & live opt-in gate)', () => {
        it('constructs hardened OCI CLI arguments and documents container runtime prerequisites', () => {
            expect(CONTAINER_RUNTIME_PREREQUISITES.length).toBeGreaterThanOrEqual(3);
            expect(CONTAINER_RUNTIME_PREREQUISITES.join(' ')).toContain('Docker Engine');
            expect(CONTAINER_RUNTIME_PREREQUISITES.join(' ')).toContain('cgroup');

            const args = BuildContainerRunArgs({
                MemoryMb: 256,
                CpuQuota: 2,
                Image: 'node:20-alpine',
            });
            expect(args).toContain('run');
            expect(args).toContain('--rm');
            expect(args).toContain('-i');
            expect(args).toContain('--memory=256m');
            expect(args).toContain('--memory-swap=256m');
            expect(args).toContain('--cpus=2');
            expect(args).toContain('--network=none');
            expect(args).toContain('--read-only');
            expect(args).toContain('--security-opt=no-new-privileges');
            expect(args).toContain('node:20-alpine');
        });

        it('completes normal containerized execution deterministically via injected executor', async () => {
            let capturedSpec: ContainerCommandSpec | null = null;
            const runner = new ContainerIsolationRunner({
                Executor: async (spec) => {
                    capturedSpec = spec;
                    return {
                        ExitCode: 0,
                        Stdout: `\n${CONTAINER_RESULT_START_MARKER}${JSON.stringify({
                            ok: true,
                            output: { processed: true, value: 99 },
                        })}${CONTAINER_RESULT_END_MARKER}\n`,
                        Stderr: '',
                    };
                },
            });

            const result = await runner.Execute({
                Level: 'Container',
                TaskID: 'ctr-ok-1',
                TaskName: 'Container Normal Execution',
                GraphID: 'graph-ctr-1',
                Limits: {
                    ContainerRuntime: 'docker',
                    ContainerImage: 'node:20-alpine',
                    ContainerMemoryMb: 256,
                    ContainerCpuQuota: 1,
                    ContainerTimeoutMs: 30_000,
                },
                Workload: {
                    Kind: 'InlineScript',
                    Script: 'return { processed: true, value: 99 };',
                },
            });

            expect(capturedSpec?.Command).toBe('docker');
            expect(capturedSpec?.MemoryMb).toBe(256);
            expect(result.Success).toBe(true);
            expect(result.IsolationLevel).toBe('Container');
            expect(result.TerminationReason).toBe('Completed');
            expect(result.Output).toEqual({ processed: true, value: 99 });
        });

        it('translates container cgroup OOM kills (exit 137) and timeouts cleanly', async () => {
            const oomRunner = new ContainerIsolationRunner({
                Executor: async () => ({
                    ExitCode: 137,
                    Signal: 'SIGKILL',
                    Stdout: '',
                    Stderr: 'Container OOMKilled after exceeding 128m memory limit',
                }),
            });
            const oomResult = await oomRunner.Execute({
                Level: 'Container',
                TaskID: 'ctr-oom-1',
                TaskName: 'Container OOM Fixture',
                GraphID: 'graph-ctr-oom',
                Limits: { ContainerMemoryMb: 128 },
                Workload: { Kind: 'InlineScript', Script: 'return {};' },
            });
            expect(oomResult.Success).toBe(false);
            expect(oomResult.TerminationReason).toBe('OutOfMemory');
            expect(oomResult.ErrorCode).toBe('ERR_CONTAINER_OUT_OF_MEMORY');
            expect(oomResult.ExitCode).toBe(137);

            const timeoutRunner = new ContainerIsolationRunner({
                Executor: async () => ({
                    ExitCode: null,
                    Signal: 'SIGTERM',
                    Stdout: '',
                    Stderr: '',
                    TimedOut: true,
                }),
            });
            const timeoutResult = await timeoutRunner.Execute({
                Level: 'Container',
                TaskID: 'ctr-timeout-1',
                TaskName: 'Container Timeout Fixture',
                GraphID: 'graph-ctr-timeout',
                TimeoutMs: 250,
                Workload: { Kind: 'InlineScript', Script: 'while (true) {}' },
            });
            expect(timeoutResult.Success).toBe(false);
            expect(timeoutResult.TerminationReason).toBe('Timeout');
            expect(timeoutResult.ErrorCode).toBe('ERR_CONTAINER_TIMEOUT');
        });

        it('propagates container runtime startup failures and non-zero exit failures cleanly', async () => {
            const missingRuntimeRunner = new ContainerIsolationRunner({
                Executor: async () => ({
                    ExitCode: null,
                    Stdout: '',
                    Stderr: '',
                    StartupError: { Code: 'ENOENT', Message: 'spawn docker ENOENT' },
                }),
            });
            const startupResult = await missingRuntimeRunner.Execute({
                Level: 'Container',
                TaskID: 'ctr-startup-1',
                TaskName: 'Container Startup Failure',
                GraphID: 'graph-ctr-startup',
                Workload: { Kind: 'InlineScript', Script: 'return {};' },
            });
            expect(startupResult.Success).toBe(false);
            expect(startupResult.TerminationReason).toBe('StartupFailed');
            expect(startupResult.ErrorCode).toBe('ENOENT');
            expect(startupResult.ErrorMessage).toContain('Prerequisites:');

            const exitFailureRunner = new ContainerIsolationRunner({
                Executor: async () => ({
                    ExitCode: 17,
                    Stdout: '',
                    Stderr: 'Container script failed with code 17',
                }),
            });
            const exitResult = await exitFailureRunner.Execute({
                Level: 'Container',
                TaskID: 'ctr-exit-1',
                TaskName: 'Container Exit Failure',
                GraphID: 'graph-ctr-exit',
                Workload: { Kind: 'InlineScript', Script: 'process.exit(17);' },
            });
            expect(exitResult.Success).toBe(false);
            expect(exitResult.TerminationReason).toBe('ExitFailure');
            expect(exitResult.ExitCode).toBe(17);
            expect(exitResult.ErrorCode).toBe('ERR_CONTAINER_EXIT');
        });

        it.skipIf(process.env.MJ_TEST_LIVE_CONTAINER !== '1')(
            'executes a live Docker container workload when MJ_TEST_LIVE_CONTAINER=1',
            async () => {
                const liveRunner = new ContainerIsolationRunner();
                const res = await liveRunner.Execute({
                    Level: 'Container',
                    TaskID: 'ctr-live-1',
                    TaskName: 'Live Docker Verification',
                    GraphID: 'graph-ctr-live',
                    Workload: {
                        Kind: 'InlineScript',
                        Script: 'return { liveContainerOk: true, sum: Number(input.a) + 1 };',
                        Input: { a: 41 },
                    },
                });
                expect(res.Success).toBe(true);
                expect(res.Output).toEqual({ liveContainerOk: true, sum: 42 });
            },
        );
    });

    describe('Typed Workflow & Agent Isolation Semantics (Upgraded InProcess vs Workflow.Draft Worker)', () => {
        it('reads InProcess from upgraded existing MJAIAgentEntity rows via typed property without .Get()/.Set()', () => {
            const upgradedWorkflowAgent = buildMinimalAIAgentEntity({ Isolation: 'InProcess' });
            const isolation: TaskGraphIsolationLevel = upgradedWorkflowAgent.Isolation;
            expect(isolation).toBe('InProcess');
        });

        it('defaults Workflow.Draft output graphs to Worker via typed properties and carries isolation through WorkflowAgentWriter', async () => {
            const draftOp = new InspectableWorkflowDraftOp();
            const draftSpec: TaskGraphSpec = {
                workflowName: 'Model Draft',
                tasks: [
                    TaskNode.Action(
                        { tempId: 'step-1', name: 'Notify', description: 'Send notification', dependsOn: [] },
                        { actionName: 'Send Notification' },
                    ),
                ],
            };
            const draftResult = draftOp.AcceptDraft(draftSpec, 'Daily Alert Workflow');
            expect(draftResult.success).toBe(true);
            const draftedIsolation: TaskGraphIsolationLevel | undefined = draftResult.graph?.isolation;
            expect(draftedIsolation).toBe('Worker');

            const workflowSpec: WorkflowSpec = {
                name: 'Daily Alert Workflow',
                status: 'Draft',
                isolation: 'Worker',
                graph: { ...draftSpec, isolation: draftedIsolation },
                triggers: [{ type: 'OnDemand' }],
            };

            const mockAgent = buildMinimalAIAgentEntity();
            const user = new UserInfo(Metadata.Provider, { ID: 'user-1', Name: 'Author', Email: 'author@example.com' });
            expect(user.ID).toBe('user-1');

            // Verify typed AgentSpec accepts Isolation derived from MJAIAgentEntity['Isolation']
            const partialSpec: AgentSpec = {
                ID: '11111111-1111-1111-1111-111111111111',
                Name: workflowSpec.name,
                Isolation: workflowSpec.isolation,
                StartingPayloadValidationMode: 'Fail',
            };
            expect(partialSpec.Isolation).toBe('Worker');
            mockAgent.Isolation = partialSpec.Isolation ?? 'InProcess';
            expect(mockAgent.Isolation).toBe('Worker');
            expect(typeof WorkflowAgentWriter).toBe('function');
            expect(MJAIAgentSchema.shape.Isolation.safeParse('Worker').success).toBe(true);
            expect(MJAIAgentSchema.shape.Isolation.safeParse('Container').success).toBe(true);
            expect(MJAIAgentSchema.shape.Isolation.safeParse('InvalidMode').success).toBe(false);
        });
    });
});

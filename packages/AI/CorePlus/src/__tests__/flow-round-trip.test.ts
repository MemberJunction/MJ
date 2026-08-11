/**
 * The round-trip property: Flow → TaskGraphSpec → Flow (Track C1.1, plan §7).
 *
 * **Why this property is worth a test file of its own.** With only one direction, a graph could be
 * *saved* as a workflow but never *reopened* on the same canvas — and MJ would need a second,
 * flow-shaped renderer, which is precisely the two-graph-models split this whole track exists to
 * end. The two converters are inverses or the convergence was never real.
 *
 * `exclusiveGroup` and `sequence` are deliberately NOT expected to survive: they are compiler
 * artifacts derived from the fan-out shape, reconstructed on the way back rather than stored.
 */
import { describe, it, expect } from 'vitest';
import { CompileFlowToTaskGraph, type FlowCompilerPath, type FlowCompilerStep } from '../task-graph/flow-graph-compiler';
import { ConvertTaskGraphToAgentSpec } from '../task-graph/task-graph-to-agent-spec';
import { NormalizeDependency } from '../task-graph/task-graph-spec';
import type { AgentSpec } from '../agent-spec';

const options = {
    WorkflowName: 'Round trip',
    ResolveAgentName: (id: string) => `Agent ${id}`,
    ResolveActionName: (id: string) => `Action ${id}`,
    ResolvePromptName: (id: string) => `Prompt ${id}`,
};

/** Re-reads a saved AgentSpec as compiler input, which is what reopening a workflow does. */
const asCompilerInput = (spec: AgentSpec): { steps: FlowCompilerStep[]; paths: FlowCompilerPath[] } => ({
    steps: (spec.Steps ?? []).map((s) => ({
        ID: s.ID,
        Name: s.Name,
        Description: s.Description,
        StepType: s.StepType,
        StartingStep: s.StartingStep,
        Status: 'Active',
        SubAgentID: s.SubAgentID,
        ActionID: s.ActionID,
        PromptID: s.PromptID,
        LoopBodyType: s.LoopBodyType,
        Configuration: s.Configuration,
        ActionInputMapping: s.ActionInputMapping,
        ActionOutputMapping: s.ActionOutputMapping,
        TimeoutSeconds: s.TimeoutSeconds,
        RetryCount: s.RetryCount,
        OnErrorBehavior: s.OnErrorBehavior,
        PositionX: s.PositionX,
        PositionY: s.PositionY,
        Width: s.Width,
        Height: s.Height,
    })),
    paths: (spec.Paths ?? []).map((p) => ({
        ID: p.ID,
        OriginStepID: p.OriginStepID,
        DestinationStepID: p.DestinationStepID,
        Condition: p.Condition,
        Priority: p.Priority,
        PathPoints: p.PathPoints,
    })),
});

let idCounter = 0;
const saveOptions = () => ({
    AgentID: 'agent',
    ResolveAgentID: (name: string) => `id-${name}`,
    ResolveActionID: (name: string) => `id-${name}`,
    ResolvePromptID: (name: string) => `id-${name}`,
    NextID: () => `generated-${++idCounter}`,
});

const flow = (): { steps: FlowCompilerStep[]; paths: FlowCompilerPath[] } => ({
    steps: [
        {
            ID: 'a', Name: 'Analyze', Description: 'look at it', StepType: 'Sub-Agent',
            StartingStep: true, Status: 'Active', SubAgentID: 'sub-1',
            PositionX: 10, PositionY: 20, Width: 200, Height: 80,
        },
        {
            ID: 'b', Name: 'Escalate', Description: 'raise it', StepType: 'Action',
            StartingStep: false, Status: 'Active', ActionID: 'act-1',
            TimeoutSeconds: 30, RetryCount: 2, OnErrorBehavior: 'continue',
        },
        { ID: 'c', Name: 'Close', Description: 'done', StepType: 'Sub-Agent', StartingStep: false, Status: 'Active', SubAgentID: 'sub-2' },
    ],
    paths: [
        { ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b', Condition: 'severity > 3', Priority: 10, PathPoints: '[[1,2]]' },
        { ID: 'p2', OriginStepID: 'a', DestinationStepID: 'c', Priority: 1 },
    ],
});

describe('Flow → TaskGraphSpec → Flow', () => {
    const original = flow();
    const compiled = CompileFlowToTaskGraph(original.steps, original.paths, options);
    const saved = ConvertTaskGraphToAgentSpec(compiled.Spec!, saveOptions());
    const reopenInput = asCompilerInput(saved.Spec!);
    const reopened = CompileFlowToTaskGraph(reopenInput.steps, reopenInput.paths, options);

    it('compiles and saves without loss of steps', () => {
        expect(compiled.Success).toBe(true);
        expect(saved.Success).toBe(true);
        expect(saved.Spec!.Steps).toHaveLength(3);
    });

    it('preserves every step, by name', () => {
        expect(reopened.Spec!.tasks.map((t) => t.name).sort()).toEqual(['Analyze', 'Close', 'Escalate']);
    });

    it('preserves each step’s KIND — the bug that used to flatten everything to Sub-Agent', () => {
        const kinds = Object.fromEntries(reopened.Spec!.tasks.map((t) => [t.name, t.kind]));
        expect(kinds).toEqual({ Analyze: 'Agent', Escalate: 'Action', Close: 'Agent' });
    });

    it('preserves edge conditions', () => {
        const escalate = reopened.Spec!.tasks.find((t) => t.name === 'Escalate')!;
        expect(NormalizeDependency(escalate.dependsOn[0]).condition).toBe('severity > 3');
    });

    it('preserves edge PRIORITY — hardcoding 0 used to flatten every branch', () => {
        // With priorities flattened, a reopened workflow could take a different branch than the
        // graph it came from. That is a silent behaviour change, which is the worst kind.
        const escalate = reopened.Spec!.tasks.find((t) => t.name === 'Escalate')!;
        const close = reopened.Spec!.tasks.find((t) => t.name === 'Close')!;
        expect(NormalizeDependency(escalate.dependsOn[0]).priority).toBe(10);
        expect(NormalizeDependency(close.dependsOn[0]).priority).toBe(1);
    });

    it('preserves policy', () => {
        const escalate = reopened.Spec!.tasks.find((t) => t.name === 'Escalate')!;
        expect(escalate.policy).toEqual({ timeoutSeconds: 30, retryCount: 2, onError: 'continue' });
    });

    it('preserves layout, so reopening does not re-arrange the canvas', () => {
        const analyze = reopened.Spec!.tasks.find((t) => t.name === 'Analyze')!;
        expect(analyze.layout).toEqual({ x: 10, y: 20, width: 200, height: 80 });
    });

    it('preserves edge routing', () => {
        const escalate = reopened.Spec!.tasks.find((t) => t.name === 'Escalate')!;
        expect(NormalizeDependency(escalate.dependsOn[0]).pathPoints).toBe('[[1,2]]');
    });

    it('RECONSTRUCTS the exclusive group rather than storing it', () => {
        // exclusiveGroup/sequence are compiler artifacts. They must not round-trip as data, but the
        // fan-out shape must still produce them again — otherwise a reopened workflow would lose its
        // exclusive-choice semantics and fire every branch.
        const escalate = reopened.Spec!.tasks.find((t) => t.name === 'Escalate')!;
        const close = reopened.Spec!.tasks.find((t) => t.name === 'Close')!;
        const groups = [NormalizeDependency(escalate.dependsOn[0]).exclusiveGroup, NormalizeDependency(close.dependsOn[0]).exclusiveGroup];
        expect(groups[0]).toBeDefined();
        expect(groups[0]).toBe(groups[1]);   // one group, both branches
        expect(saved.Spec!.Paths!.every((p) => !('exclusiveGroup' in p))).toBe(true);
    });

    it('still marks the reopened graph with edge failure semantics', () => {
        expect(reopened.Spec!.failureSemantics).toBe('edges');
    });
});

describe('losses are reported rather than silent', () => {
    it('reports a person’s step instead of dropping it unannounced', () => {
        const compiled = CompileFlowToTaskGraph(
            [{ ID: 'a', Name: 'A', StepType: 'Sub-Agent', StartingStep: true, Status: 'Active', SubAgentID: 's' }],
            [],
            options,
        );
        const withHuman = {
            ...compiled.Spec!,
            tasks: [...compiled.Spec!.tasks, { tempId: 'h', name: 'Approve', description: '', kind: 'Human' as const, configuration: {}, dependsOn: ['a'] }],
        };
        const saved = ConvertTaskGraphToAgentSpec(withHuman, saveOptions());
        expect(saved.Losses.some((l) => l.Kind === 'HumanTask' && l.Detail.includes('Approve'))).toBe(true);
    });

    it('does NOT report an action step as a human-task loss', () => {
        // The old converter read only `agentName`, so every action, prompt and loop node was
        // mislabelled "human task" and dropped.
        const compiled = CompileFlowToTaskGraph(
            [{ ID: 'a', Name: 'Act', StepType: 'Action', StartingStep: true, Status: 'Active', ActionID: 'x' }],
            [],
            options,
        );
        const saved = ConvertTaskGraphToAgentSpec(compiled.Spec!, saveOptions());
        expect(saved.Losses).toEqual([]);
        expect(saved.Spec!.Steps![0].StepType).toBe('Action');
    });
});

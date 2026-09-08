/**
 * Tests for Save as Workflow (D17).
 *
 * The conversion is the empirical test of whether Phase 4's convergence was real: if the two graph
 * models genuinely became one model, this is a projection and not a translation. So the tests care
 * most about two things — that graph *structure* survives intact, and that anything which cannot
 * survive is **reported** rather than dropped.
 *
 * The second half matters more than it sounds. A conversion that silently omitted a human approval
 * step would hand someone a workflow that skips the approval they believed they had saved, and they
 * would only find out by running it.
 */
import { describe, it, expect } from 'vitest';
import { ConfigOf } from '../task-graph/task-graph-spec';
import {
    ConvertTaskGraphToAgentSpec,
    FormatSaveAsWorkflowLosses,
    type SaveAsWorkflowOptions,
} from '../task-graph/task-graph-to-agent-spec';
import type { TaskGraphSpec } from '../task-graph/task-graph-spec';

function optionsOf(over: Partial<SaveAsWorkflowOptions> = {}): SaveAsWorkflowOptions {
    let n = 0;
    return {
        AgentID: 'agent-1',
        ResolveAgentID: (name) => (name === 'Missing Agent' ? null : `id-of-${name}`),
        NextID: () => `gen-${++n}`,
        FlowAgentTypeID: 'flow-type',
        ...over,
    };
}

const graph = (over: Partial<TaskGraphSpec> = {}): TaskGraphSpec => ({
    workflowName: 'Quarterly review',
    reasoning: 'research then summarize',
    tasks: [
        { tempId: 'a', name: 'Gather', description: 'gather data', kind: 'Agent' as const, configuration: { agentName: 'Query Builder' }, dependsOn: [] },
        { tempId: 'b', name: 'Summarize', description: 'summarize it', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['a'] },
    ],
    ...over,
});

describe('ConvertTaskGraphToAgentSpec', () => {
    it('projects nodes onto Sub-Agent steps', () => {
        const result = ConvertTaskGraphToAgentSpec(graph(), optionsOf());
        expect(result.Success).toBe(true);
        expect(result.Spec!.Steps).toHaveLength(2);
        expect(result.Spec!.Steps![0]).toMatchObject({ Name: 'Gather', StepType: 'Sub-Agent', SubAgentID: 'id-of-Query Builder' });
    });

    it('marks dependency-free nodes as starting steps', () => {
        const result = ConvertTaskGraphToAgentSpec(graph(), optionsOf());
        const byName = new Map(result.Spec!.Steps!.map((s) => [s.Name, s]));
        expect(byName.get('Gather')!.StartingStep).toBe(true);
        expect(byName.get('Summarize')!.StartingStep).toBe(false);
    });

    it('REVERSES edge direction — dependsOn points back, a flow path points forward', () => {
        // The single most consequential detail. Getting it wrong produces a workflow that runs in
        // reverse and looks structurally valid while doing so.
        const result = ConvertTaskGraphToAgentSpec(graph(), optionsOf());
        const steps = new Map(result.Spec!.Steps!.map((s) => [s.ID, s.Name]));
        const path = result.Spec!.Paths![0];
        expect(steps.get(path.OriginStepID)).toBe('Gather');
        expect(steps.get(path.DestinationStepID)).toBe('Summarize');
    });

    it('carries an edge condition across unchanged', () => {
        // The point of the shared condition grammar: no rewriting at the boundary.
        const g = graph({
            tasks: [
                { tempId: 'a', name: 'Check', description: 'check', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [] },
                { tempId: 'b', name: 'Escalate', description: 'escalate', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [{ tempId: 'a', condition: 'output.severity > 3' }] },
            ],
        });
        const result = ConvertTaskGraphToAgentSpec(g, optionsOf());
        expect(result.Spec!.Paths![0].Condition).toBe('output.severity > 3');
    });

    it('preserves a diamond exactly', () => {
        const g = graph({
            tasks: [
                { tempId: 'a', name: 'A', description: 'a', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [] },
                { tempId: 'b', name: 'B', description: 'b', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['a'] },
                { tempId: 'c', name: 'C', description: 'c', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['a'] },
                { tempId: 'd', name: 'D', description: 'd', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['b', 'c'] },
            ],
        });
        const result = ConvertTaskGraphToAgentSpec(g, optionsOf());
        expect(result.Spec!.Steps).toHaveLength(4);
        expect(result.Spec!.Paths).toHaveLength(4);
        expect(result.Spec!.Steps!.filter((s) => s.StartingStep)).toHaveLength(1);
    });

    it('names the workflow after the graph, and honors an override', () => {
        expect(ConvertTaskGraphToAgentSpec(graph(), optionsOf()).Spec!.Name).toBe('Quarterly review');
        expect(ConvertTaskGraphToAgentSpec(graph(), optionsOf({ Name: 'Custom' })).Spec!.Name).toBe('Custom');
    });

    it('persists as a Flow, not a Loop', () => {
        expect(ConvertTaskGraphToAgentSpec(graph(), optionsOf()).Spec!.TypeID).toBe('flow-type');
    });

    it('converts a clean graph losslessly', () => {
        expect(ConvertTaskGraphToAgentSpec(graph(), optionsOf()).Losses).toEqual([]);
    });
});

describe('ConvertTaskGraphToAgentSpec — losses are reported, never silent', () => {
    it('reports a human task rather than emitting an unattended step', () => {
        const g = graph({
            tasks: [
                { tempId: 'a', name: 'Draft', description: 'draft', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [] },
                { tempId: 'b', name: 'Approve', description: 'approve', kind: 'Human' as const, configuration: {}, dependsOn: ['a'] },
            ],
        });
        const result = ConvertTaskGraphToAgentSpec(g, optionsOf());
        expect(result.Success).toBe(true);
        expect(result.Spec!.Steps).toHaveLength(1);
        expect(result.Losses.find((l) => l.Kind === 'HumanTask')).toMatchObject({ TempId: 'b' });
    });

    it('drops edges that pointed at a dropped node, rather than dangling them', () => {
        // A path to a step that does not exist would make the saved workflow unopenable.
        const g = graph({
            tasks: [
                { tempId: 'a', name: 'Draft', description: 'draft', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [] },
                { tempId: 'b', name: 'Approve', description: 'approve', kind: 'Human' as const, configuration: {}, dependsOn: ['a'] },
                { tempId: 'c', name: 'Publish', description: 'publish', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['b'] },
            ],
        });
        const result = ConvertTaskGraphToAgentSpec(g, optionsOf());
        const stepIds = new Set(result.Spec!.Steps!.map((s) => s.ID));
        for (const p of result.Spec!.Paths!) {
            expect(stepIds.has(p.OriginStepID)).toBe(true);
            expect(stepIds.has(p.DestinationStepID)).toBe(true);
        }
    });

    it('reports an unresolvable agent', () => {
        const g = graph({
            tasks: [
                { tempId: 'a', name: 'Fine', description: 'fine', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [] },
                { tempId: 'b', name: 'Broken', description: 'broken', kind: 'Agent' as const, configuration: { agentName: 'Missing Agent' }, dependsOn: ['a'] },
            ],
        });
        const result = ConvertTaskGraphToAgentSpec(g, optionsOf());
        expect(result.Losses.find((l) => l.Kind === 'UnknownAgent')).toMatchObject({ TempId: 'b' });
    });

    it('flags run-specific input rather than baking it into a reusable workflow', () => {
        // A saved workflow that replays last week's literal inputs answers last week's question
        // forever — the exact opposite of what "make this reusable" means.
        const g = graph({
            tasks: [{ tempId: 'a', name: 'Query', description: 'q', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [], inputPayload: { quarter: 'Q3' } }],
        });
        expect(ConvertTaskGraphToAgentSpec(g, optionsOf()).Losses.find((l) => l.Kind === 'InputPayload')).toBeTruthy();
    });

    it('reports a non-default continuation as inapplicable', () => {
        const result = ConvertTaskGraphToAgentSpec(graph({ continuation: 'reinvoke' }), optionsOf());
        expect(result.Losses.find((l) => l.Kind === 'Continuation')).toBeTruthy();
    });

    it('does not flag the default continuation', () => {
        expect(ConvertTaskGraphToAgentSpec(graph({ continuation: 'message' }), optionsOf()).Losses).toEqual([]);
    });

    it('refuses an empty graph', () => {
        const result = ConvertTaskGraphToAgentSpec(graph({ tasks: [] }), optionsOf());
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/empty/i);
    });

    it('refuses rather than saving an empty workflow when every node is unrepresentable', () => {
        // Returning a stepless "success" would hand the user a workflow that does nothing.
        const g = graph({
            tasks: [{ tempId: 'a', name: 'Approve', description: 'approve', kind: 'Human' as const, configuration: {}, dependsOn: [] }],
        });
        const result = ConvertTaskGraphToAgentSpec(g, optionsOf());
        expect(result.Success).toBe(false);
        expect(result.Losses).toHaveLength(1);
    });
});

describe('FormatSaveAsWorkflowLosses', () => {
    it('renders one labeled line per loss', () => {
        const g = graph({
            tasks: [
                { tempId: 'a', name: 'Draft', description: 'd', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [], inputPayload: { x: 1 } },
                { tempId: 'b', name: 'Approve', description: 'a', kind: 'Human' as const, configuration: {}, dependsOn: ['a'] },
            ],
        });
        const text = FormatSaveAsWorkflowLosses(ConvertTaskGraphToAgentSpec(g, optionsOf()).Losses);
        expect(text).toContain('[HumanTask]');
        expect(text).toContain('[InputPayload]');
        expect(text.split('\n')).toHaveLength(2);
    });

    it('is empty when nothing was lost', () => {
        expect(FormatSaveAsWorkflowLosses([])).toBe('');
    });
});

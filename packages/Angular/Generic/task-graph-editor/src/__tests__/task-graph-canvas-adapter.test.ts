/**
 * Tests for the `TaskGraphSpec` ⇄ canvas projection.
 *
 * The adapter is pure and separate from the component precisely so these can exist: everything
 * interesting about rendering a task graph — entry points, edge direction, conditional edges,
 * runtime status mapping, what removing a node does to the edges around it — is decidable from data
 * alone, and testing it through a TestBed would be testing Angular instead of graphs.
 */
import { describe, it, expect } from 'vitest';
import {
    AddDependency,
    AddTask,
    GetDependents,
    GetEntryTempIds,
    GetNodeTypeConfig,
    GetTaskNodeType,
    GetNodeTypeConfig,
    TASK_GRAPH_NODE_TYPES,
    IsHumanTask,
    NewTaskFromNodeType,
    NextTempId,
    RemoveDependency,
    RemoveTask,
    RuntimeStateToNodeStatus,
    SpecToConnections,
    SpecToNodes,
    TASK_GRAPH_NODE_TYPES,
    TaskSubtitle,
    UpdateTask,
    WouldCreateCycle,
} from '../lib/task-graph-canvas-adapter';
import { ConfigOf, ValidateTaskGraphSpec } from '@memberjunction/ai-core-plus';
import type { TaskGraphSpec, TaskGraphSpecNode } from '@memberjunction/ai-core-plus';

const task = (over: Partial<TaskGraphSpecNode> = {}): TaskGraphSpecNode => ({
    tempId: 'a',
    name: 'A',
    description: 'does a',
    kind: 'Agent' as const, configuration: { agentName: 'Sage' },
    dependsOn: [],
    ...over,
});

const spec = (over: Partial<TaskGraphSpec> = {}): TaskGraphSpec => ({
    workflowName: 'W',
    tasks: [task({ tempId: 'a' }), task({ tempId: 'b', name: 'B', dependsOn: ['a'] })],
    ...over,
});

const diamond = (): TaskGraphSpec => spec({
    tasks: [
        task({ tempId: 'a' }),
        task({ tempId: 'b', dependsOn: ['a'] }),
        task({ tempId: 'c', dependsOn: ['a'] }),
        task({ tempId: 'd', dependsOn: ['b', 'c'] }),
    ],
});

describe('SpecToNodes — geometry the spec cannot hold', () => {
    // TaskGraphSpec is an execution contract with no layout field. Before this, every projection
    // reset each node to the origin, so the component had to re-run auto-layout after EVERY edit —
    // and auto-layout ends in zoom-to-fit, which is why adding a step yanked the viewport. These
    // tests pin the carrier that makes arranging-once possible.
    it('honours a caller-supplied position', () => {
        const positions = new Map([['a', { X: 120, Y: 40 }]]);
        const node = SpecToNodes(spec(), undefined, positions).find((n) => n.ID === 'a')!;
        expect(node.Position).toEqual({ X: 120, Y: 40 });
    });

    it('falls back to the origin for a task it has never seen', () => {
        const positions = new Map([['a', { X: 120, Y: 40 }]]);
        const node = SpecToNodes(spec(), undefined, positions).find((n) => n.ID === 'b')!;
        expect(node.Position).toEqual({ X: 0, Y: 0 });
    });

    it('copies the position rather than aliasing the caller’s object', () => {
        // The canvas mutates node.Position in place during a drag; sharing the reference would let
        // that write back into the map and quietly defeat the next projection's comparison.
        const shared = { X: 5, Y: 5 };
        const node = SpecToNodes(spec(), undefined, new Map([['a', shared]])).find((n) => n.ID === 'a')!;
        node.Position.X = 999;
        expect(shared.X).toBe(5);
    });

    it('still projects at the origin when no positions are supplied', () => {
        expect(SpecToNodes(spec()).every((n) => n.Position.X === 0 && n.Position.Y === 0)).toBe(true);
    });
});

describe('SpecToNodes', () => {
    it('projects one node per task', () => {
        expect(SpecToNodes(spec())).toHaveLength(2);
    });

    it('marks dependency-free tasks as entry points', () => {
        const nodes = SpecToNodes(spec());
        expect(nodes.find((n) => n.ID === 'a')!.IsStartNode).toBe(true);
        expect(nodes.find((n) => n.ID === 'b')!.IsStartNode).toBe(false);
    });

    it('distinguishes a person step from an agent step', () => {
        const s = spec({ tasks: [task({ tempId: 'h', kind: 'Human' as const, configuration: {} })] });
        const node = SpecToNodes(s)[0];
        expect(node.Type).toBe('HumanTask');
        expect(node.Subtitle).toMatch(/person/i);
    });

    it('shows the agent name on an agent step', () => {
        expect(SpecToNodes(spec())[0].Subtitle).toBe('Sage');
    });

    it('leaves positions at the origin — layout belongs to the canvas', () => {
        // A spec carries no geometry because a task graph is a LOGICAL structure; an agent that
        // emitted one never had an opinion about where the boxes go.
        expect(SpecToNodes(spec())[0].Position).toEqual({ X: 0, Y: 0 });
    });

    it('applies runtime status when supplied', () => {
        const nodes = SpecToNodes(spec(), { a: 'Complete', b: 'In Progress' });
        expect(nodes.find((n) => n.ID === 'a')!.Status).toBe('success');
        expect(nodes.find((n) => n.ID === 'b')!.Status).toBe('running');
    });

    it('renders default status when no runtime state is supplied', () => {
        expect(SpecToNodes(spec())[0].Status).toBe('default');
    });
});

describe('RuntimeStateToNodeStatus', () => {
    it('maps Blocked to WARNING, not error', () => {
        // Nothing went wrong — the graph simply cannot reach it. Showing a failure would send
        // someone hunting for a bug that does not exist.
        expect(RuntimeStateToNodeStatus('Blocked')).toBe('warning');
    });

    it('maps Deferred to pending', () => {
        // To the person watching, waiting on a schedule and waiting on a prerequisite are the same.
        expect(RuntimeStateToNodeStatus('Deferred')).toBe('pending');
    });

    it.each([
        ['In Progress', 'running'],
        ['Complete', 'success'],
        ['Failed', 'error'],
        ['Cancelled', 'disabled'],
        ['Pending', 'pending'],
    ] as const)('maps %s to %s', (state, expected) => {
        expect(RuntimeStateToNodeStatus(state)).toBe(expected);
    });

    it('falls back to default for an unknown state', () => {
        expect(RuntimeStateToNodeStatus(undefined)).toBe('default');
    });
});

describe('SpecToConnections', () => {
    it('REVERSES direction — dependsOn points back, the drawn arrow points forward', () => {
        // The single most consequential detail in the projection. Getting it wrong renders a graph
        // that flows backwards and still looks structurally valid.
        const conn = SpecToConnections(spec())[0];
        expect(conn.SourceNodeID).toBe('a');
        expect(conn.TargetNodeID).toBe('b');
    });

    it('draws one connection per dependency', () => {
        expect(SpecToConnections(diamond())).toHaveLength(4);
    });

    it('draws a conditional edge dashed and labeled', () => {
        // "Always" vs "only sometimes" is the thing a reader is most likely to miss when scanning.
        const s = spec({
            tasks: [
                task({ tempId: 'a' }),
                task({ tempId: 'b', dependsOn: [{ tempId: 'a', condition: 'output.ok' }] }),
            ],
        });
        const conn = SpecToConnections(s)[0];
        expect(conn.Style).toBe('dashed');
        expect(conn.Condition).toBe('output.ok');
        expect(conn.LabelDetail).toBe('output.ok');
    });

    it('draws an unconditional edge solid and unlabeled', () => {
        const conn = SpecToConnections(spec())[0];
        expect(conn.Style).toBe('solid');
        expect(conn.Label).toBeUndefined();
    });

    it('skips an edge naming a task that is not in the graph', () => {
        // The validator already reports it as UnknownDependency; drawing a connection to nowhere
        // would be a second, worse way of saying the same thing.
        const s = spec({ tasks: [task({ tempId: 'a', dependsOn: ['ghost'] })] });
        expect(SpecToConnections(s)).toEqual([]);
    });

    it('gives edges stable ids, so re-rendering does not churn selection', () => {
        expect(SpecToConnections(spec())[0].ID).toBe(SpecToConnections(spec())[0].ID);
    });
});

describe('graph queries', () => {
    it('finds entry points', () => {
        expect(GetEntryTempIds(diamond())).toEqual(['a']);
    });

    it('finds dependents — the blast radius of a removal', () => {
        expect(GetDependents(diamond(), 'a').sort()).toEqual(['b', 'c']);
        expect(GetDependents(diamond(), 'd')).toEqual([]);
    });

    it('identifies a human task by assignToUser, not by the absence of an agent', () => {
        expect(IsHumanTask(task({ kind: 'Human' as const, configuration: {} }))).toBe(true);
        expect(IsHumanTask(task())).toBe(false);
        // An action step has no agent either. Reading "no agent" as "a person" is what put steps in
        // the graph claiming to wait on someone nobody had asked for.
        expect(IsHumanTask(task({ kind: 'Action' as const, configuration: { actionName: 'Send Email' } }))).toBe(false);
        expect(IsHumanTask(task({ agentName: undefined }))).toBe(false);
    });
});

describe('assignment shapes', () => {
    it('offers one palette entry per shape the spec supports — no more, no fewer', () => {
        // TaskGraphSpecNode has exactly three mutually-exclusive assignees. A fourth palette entry
        // would be a step the engine cannot run; a missing one hides a capability the spec has.
        expect(TASK_GRAPH_NODE_TYPES.map((c) => c.Type).sort()).toEqual(['ActionTask', 'AgentTask', 'HumanTask']);
    });

    it('classifies each shape', () => {
        expect(GetTaskNodeType(task())).toBe('AgentTask');
        expect(GetTaskNodeType(task({ kind: 'Action' as const, configuration: { actionName: 'Send Email' } }))).toBe('ActionTask');
        expect(GetTaskNodeType(task({ kind: 'Human' as const, configuration: {} }))).toBe('HumanTask');
    });

    it('reads an unassigned step as an agent step rather than guessing "person"', () => {
        expect(GetTaskNodeType(task({ agentName: undefined }))).toBe('AgentTask');
    });

    it('says so when a step has no assignee, instead of showing a blank subtitle', () => {
        // A blank subtitle looks like a step that is fine; this one is why validation is complaining.
        const unassigned = task({ kind: 'Agent', configuration: { agentName: '' } });
        expect(TaskSubtitle(unassigned)).toMatch(/no agent/i);
        expect(TaskSubtitle(unassigned)).not.toBe('');
    });

    it('resolves a palette entry by type, and refuses an unknown one', () => {
        expect(GetNodeTypeConfig('ActionTask')?.Label).toBe('Action Step');
        expect(GetNodeTypeConfig('NotAThing')).toBeNull();
    });
});

describe('NewTaskFromNodeType', () => {
    const empty = (): TaskGraphSpec => ({ workflowName: 'W', tasks: [] });

    it('gives each shape exactly one kind, and ignores defaults that do not apply to it', () => {
        // Under the flat spec this test counted how many of three fields were set. The union makes
        // "two assignees" unrepresentable, so what is worth pinning now is that the palette shape
        // decides the kind — and that irrelevant defaults are not smuggled into the configuration.
        expect(NewTaskFromNodeType(empty(), 'AgentTask', { agentName: 'Sage' }).kind).toBe('Agent');
        expect(NewTaskFromNodeType(empty(), 'ActionTask', { actionName: 'Send Email' }).kind).toBe('Action');

        const human = NewTaskFromNodeType(empty(), 'HumanTask', { agentName: 'Sage', actionName: 'Send Email' });
        expect(human.kind).toBe('Human');
        expect(human.configuration).toEqual({});
    });

    it('produces a graph the engine accepts when the host has something to assign', () => {
        const s = AddTask(empty(), NewTaskFromNodeType(empty(), 'AgentTask', { agentName: 'Sage' }));
        expect(ValidateTaskGraphSpec(s).Valid).toBe(true);
    });

    it('leaves an agent step unassigned when the host has nothing to offer, rather than inventing a name', () => {
        // An invented agent name passes the canvas and fails at submission. An unassigned step is
        // reported immediately, by the same validator the engine runs.
        const t = NewTaskFromNodeType(empty(), 'AgentTask');
        expect(ConfigOf(t, 'Agent')?.agentName).toBe('');
        // Reported as InvalidConfiguration, not NoAssignment: the step DOES declare what it is (an
        // agent step), it just has not been told which agent — a more precise complaint than before.
        expect(ValidateTaskGraphSpec(AddTask(empty(), t)).Errors.some((e) => e.Code === 'InvalidConfiguration')).toBe(true);
    });

    it('gives each new step a unique handle so edges stay unambiguous', () => {
        const first = NewTaskFromNodeType(empty(), 'AgentTask');
        const s = AddTask(empty(), first);
        expect(NewTaskFromNodeType(s, 'HumanTask').tempId).not.toBe(first.tempId);
    });

    it('names the step after what it is, so a new box is not blank', () => {
        expect(NewTaskFromNodeType(empty(), 'HumanTask').name).toMatch(/person/i);
        expect(NewTaskFromNodeType(empty(), 'ActionTask').name).toMatch(/action/i);
    });
});

describe('WouldCreateCycle', () => {
    it('refuses a self-edge', () => {
        expect(WouldCreateCycle(spec(), 'a', 'a')).toBe(true);
    });

    it('detects a direct back-edge', () => {
        // b already depends on a, so a depending on b would close the loop.
        expect(WouldCreateCycle(spec(), 'b', 'a')).toBe(true);
    });

    it('detects a transitive cycle', () => {
        const s = spec({
            tasks: [task({ tempId: 'a' }), task({ tempId: 'b', dependsOn: ['a'] }), task({ tempId: 'c', dependsOn: ['b'] })],
        });
        expect(WouldCreateCycle(s, 'c', 'a')).toBe(true);
    });

    it('allows an edge that does not close a loop', () => {
        expect(WouldCreateCycle(diamond(), 'b', 'c')).toBe(false);
    });

    it('does not hang on a spec that already contains a cycle', () => {
        // Defensive: the spec can arrive from an LLM, and the answer must be a refusal rather than
        // an infinite walk.
        const cyclic = spec({
            tasks: [task({ tempId: 'a', dependsOn: ['b'] }), task({ tempId: 'b', dependsOn: ['a'] })],
        });
        expect(WouldCreateCycle(cyclic, 'a', 'b')).toBe(true);
    });
});

describe('mutations are immutable', () => {
    it('AddDependency returns a new spec and leaves the original alone', () => {
        const original = spec();
        const next = AddDependency(original, 'b', 'a');
        expect(next).not.toBe(original);
        expect(original.tasks.find((t) => t.tempId === 'a')!.dependsOn).toEqual([]);
        expect(next.tasks.find((t) => t.tempId === 'a')!.dependsOn).toEqual(['b']);
    });

    it('AddDependency stores a condition as the object form', () => {
        const next = AddDependency(spec(), 'b', 'a', 'output.ok');
        expect(next.tasks.find((t) => t.tempId === 'a')!.dependsOn[0]).toEqual({ tempId: 'b', condition: 'output.ok' });
    });

    it('AddDependency is a no-op when the edge already exists', () => {
        // Dragging the same connection twice is a slip, not a request to corrupt the graph.
        const next = AddDependency(spec(), 'a', 'b');
        expect(next.tasks.find((t) => t.tempId === 'b')!.dependsOn).toHaveLength(1);
    });

    it('RemoveDependency drops just that edge', () => {
        const next = RemoveDependency(diamond(), 'b', 'd');
        expect(next.tasks.find((t) => t.tempId === 'd')!.dependsOn).toEqual(['c']);
    });

    it('RemoveTask also severs every edge INTO it', () => {
        // Leaving them would produce a graph whose dependsOn names a task that no longer exists —
        // which the validator rejects. Deleting a box should not make the graph invalid.
        const next = RemoveTask(diamond(), 'b');
        expect(next.tasks.map((t) => t.tempId)).toEqual(['a', 'c', 'd']);
        expect(next.tasks.find((t) => t.tempId === 'd')!.dependsOn).toEqual(['c']);
    });

    it('RemoveTask leaves the original spec untouched', () => {
        const original = diamond();
        RemoveTask(original, 'b');
        expect(original.tasks).toHaveLength(4);
    });

    it('AddTask appends', () => {
        expect(AddTask(spec(), task({ tempId: 'z' })).tasks).toHaveLength(3);
    });

    it('UpdateTask replaces in place by tempId', () => {
        const next = UpdateTask(spec(), 'a', task({ tempId: 'a', name: 'Renamed' }));
        expect(next.tasks.find((t) => t.tempId === 'a')!.name).toBe('Renamed');
        expect(next.tasks).toHaveLength(2);
    });
});

describe('NextTempId', () => {
    it('does not collide with an existing id', () => {
        const s = spec({ tasks: [task({ tempId: 'task1' }), task({ tempId: 'task2' })] });
        expect(['task1', 'task2']).not.toContain(NextTempId(s));
    });

    it('works on an empty graph', () => {
        expect(NextTempId(spec({ tasks: [] }))).toBe('task1');
    });

    /**
     * Kinds a person cannot DRAW but a run can contain.
     *
     * These all collapsed to `AgentTask`, and `TaskSubtitle`'s default branch then reported
     * "No agent chosen yet" — so a fully-configured ForEach rendered as a broken agent step in the
     * run view. Drawing and rendering are different questions; the canvas has to depict every kind
     * the dispatcher can execute, whether or not the palette offers it.
     */
    describe('display-only kinds', () => {
        it('gives each run-only kind its own shape instead of the agent fallback', () => {
            expect(GetTaskNodeType(task({ kind: 'Prompt' as const, configuration: { promptName: 'Draft' } }))).toBe('PromptTask');
            expect(GetTaskNodeType(task({ kind: 'ForEach' as const, configuration: { collectionPath: 'payload.rows' } }))).toBe('ForEachTask');
            expect(GetTaskNodeType(task({ kind: 'While' as const, configuration: { condition: 'payload.ok !== true' } }))).toBe('WhileTask');
            expect(GetTaskNodeType(task({ kind: 'External' as const, configuration: { domain: 'billing' } }))).toBe('ExternalTask');
        });

        it('never tells a configured step that it has no agent', () => {
            const foreach = task({ kind: 'ForEach' as const, configuration: { collectionPath: 'payload.rows', prompt: { name: 'Describe' } } });
            const prompt = task({ kind: 'Prompt' as const, configuration: { promptName: 'Draft the piece' } });

            expect(TaskSubtitle(foreach)).not.toContain('No agent chosen');
            expect(TaskSubtitle(foreach)).toContain('Describe');      // says what it repeats
            expect(TaskSubtitle(prompt)).toBe('Draft the piece');
        });

        it('still says so for a genuinely unassigned node', () => {
            // The original behaviour, which was right — it was only wrong for kinds that never take
            // an agent in the first place.
            const unassigned = task({ kind: 'Agent' as const, configuration: {} });
            expect(TaskSubtitle(unassigned)).toBe('No agent chosen yet');
        });

        it('keeps the PALETTE to what a person can actually configure', () => {
            // Rendering is a superset. Putting these in the palette would offer steps the properties
            // panel cannot configure, which is worse than not offering them.
            expect(TASK_GRAPH_NODE_TYPES.map((t) => t.Type)).toEqual(['AgentTask', 'ActionTask', 'HumanTask']);
            expect(GetNodeTypeConfig('ForEachTask')?.Label).toBe('For Each Step');
        });
    });
});

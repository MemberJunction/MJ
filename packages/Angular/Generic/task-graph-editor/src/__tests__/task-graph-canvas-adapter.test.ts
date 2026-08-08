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
import { ValidateTaskGraphSpec } from '@memberjunction/ai-core-plus';
import type { TaskGraphSpec, TaskGraphSpecNode } from '@memberjunction/ai-core-plus';

const task = (over: Partial<TaskGraphSpecNode> = {}): TaskGraphSpecNode => ({
    tempId: 'a',
    name: 'A',
    description: 'does a',
    agentName: 'Sage',
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
        const s = spec({ tasks: [task({ tempId: 'h', agentName: undefined, assignToUser: true })] });
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
        expect(IsHumanTask(task({ agentName: undefined, assignToUser: true }))).toBe(true);
        expect(IsHumanTask(task())).toBe(false);
        // An action step has no agent either. Reading "no agent" as "a person" is what put steps in
        // the graph claiming to wait on someone nobody had asked for.
        expect(IsHumanTask(task({ agentName: undefined, actionName: 'Send Email' }))).toBe(false);
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
        expect(GetTaskNodeType(task({ agentName: undefined, actionName: 'Send Email' }))).toBe('ActionTask');
        expect(GetTaskNodeType(task({ agentName: undefined, assignToUser: true }))).toBe('HumanTask');
    });

    it('reads an unassigned step as an agent step rather than guessing "person"', () => {
        expect(GetTaskNodeType(task({ agentName: undefined }))).toBe('AgentTask');
    });

    it('says so when a step has no assignee, instead of showing a blank subtitle', () => {
        // A blank subtitle looks like a step that is fine; this one is why validation is complaining.
        expect(TaskSubtitle(task({ agentName: undefined }))).toMatch(/no agent/i);
        expect(TaskSubtitle(task({ agentName: undefined, actionName: undefined, assignToUser: undefined }))).not.toBe('');
    });

    it('resolves a palette entry by type, and refuses an unknown one', () => {
        expect(GetNodeTypeConfig('ActionTask')?.Label).toBe('Action Step');
        expect(GetNodeTypeConfig('NotAThing')).toBeNull();
    });
});

describe('NewTaskFromNodeType', () => {
    const empty = (): TaskGraphSpec => ({ workflowName: 'W', tasks: [] });

    it('sets exactly one assignee per shape — never two, which the validator rejects', () => {
        const agent = NewTaskFromNodeType(empty(), 'AgentTask', { agentName: 'Sage' });
        expect([agent.agentName, agent.actionName, agent.assignToUser].filter(Boolean)).toHaveLength(1);

        const action = NewTaskFromNodeType(empty(), 'ActionTask', { actionName: 'Send Email' });
        expect([action.agentName, action.actionName, action.assignToUser].filter(Boolean)).toHaveLength(1);

        const human = NewTaskFromNodeType(empty(), 'HumanTask', { agentName: 'Sage', actionName: 'Send Email' });
        expect([human.agentName, human.actionName, human.assignToUser].filter(Boolean)).toHaveLength(1);
        expect(human.assignToUser).toBe(true);
    });

    it('produces a graph the engine accepts when the host has something to assign', () => {
        const s = AddTask(empty(), NewTaskFromNodeType(empty(), 'AgentTask', { agentName: 'Sage' }));
        expect(ValidateTaskGraphSpec(s).Valid).toBe(true);
    });

    it('leaves an agent step unassigned when the host has nothing to offer, rather than inventing a name', () => {
        // An invented agent name passes the canvas and fails at submission. An unassigned step is
        // reported immediately, by the same validator the engine runs.
        const t = NewTaskFromNodeType(empty(), 'AgentTask');
        expect(t.agentName).toBeUndefined();
        expect(ValidateTaskGraphSpec(AddTask(empty(), t)).Errors.some((e) => e.Code === 'NoAssignment')).toBe(true);
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
});

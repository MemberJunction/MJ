/**
 * Class-level tests for `TaskGraphEditorComponent`.
 *
 * The focus is the **event contract**, because that is what hosts actually depend on and it is the
 * easiest thing to break silently. Specifically: a canceled `Before*` must not emit its `After*` and
 * must not mutate the spec. Nothing enforces that but tests — a refactor that moves the emit above
 * the `Cancel` check produces a component that looks correct, passes a smoke test, and ignores every
 * veto a host writes.
 *
 * No TestBed: the component holds no template logic worth a DOM test at this level, and the
 * behavior under test is all in the class. DOM coverage for the canvas itself belongs to
 * `ng-flow-editor`, which already has it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskGraphEditorComponent } from '../lib/task-graph-editor.component';
import { TaskNode, type TaskGraphSpec, type TaskGraphSpecNode } from '@memberjunction/ai-core-plus';
import { SpecToConnections, SpecToNodes } from '../lib/task-graph-canvas-adapter';
import type {
    AfterDependencyAddedEventArgs,
    AfterTaskAddedEventArgs,
    AfterTaskRemovedEventArgs,
    BeforeDependencyAddedEventArgs,
    BeforeTaskRemovedEventArgs,
    TaskGraphSpecChangedEventArgs,
    TaskGraphValidationChangedEventArgs,
} from '../lib/task-graph-editor-events';

const task = (over: Partial<TaskGraphSpecNode> = {}): TaskGraphSpecNode => ({
    tempId: 'a', name: 'A', description: 'does a', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [], ...over,
});

const spec = (over: Partial<TaskGraphSpec> = {}): TaskGraphSpec => ({
    workflowName: 'W',
    tasks: [task({ tempId: 'a' }), task({ tempId: 'b', name: 'B', dependsOn: ['a'] })],
    ...over,
});

describe('TaskGraphEditorComponent', () => {
    let c: TaskGraphEditorComponent;

    beforeEach(() => {
        c = new TaskGraphEditorComponent();
        c.Spec = spec();
    });

    describe('projection', () => {
        it('renders nodes and connections from the spec', () => {
            expect(c.Nodes).toHaveLength(2);
            expect(c.Connections).toHaveLength(1);
        });

        it('re-projects when the spec is replaced', () => {
            c.Spec = spec({ tasks: [task({ tempId: 'x' })] });
            expect(c.Nodes).toHaveLength(1);
            expect(c.Connections).toHaveLength(0);
        });

        it('re-projects when runtime status arrives, without touching the spec', () => {
            c.RuntimeStatus = { a: 'Complete' };
            expect(c.Nodes.find((n) => n.ID === 'a')!.Status).toBe('success');
            expect(c.Spec!.tasks).toHaveLength(2);
        });

        it('reports empty for a graph with no tasks', () => {
            c.Spec = spec({ tasks: [] });
            expect(c.IsEmpty).toBe(true);
        });

        it('tolerates a null spec', () => {
            c.Spec = null;
            expect(c.Nodes).toEqual([]);
            expect(c.IsEmpty).toBe(true);
        });
    });

    describe('validation comes from the engine', () => {
        it('reports a valid graph as valid', () => {
            expect(c.IsValid).toBe(true);
            expect(c.ValidationErrors).toEqual([]);
        });

        it('surfaces the engine codes for an invalid graph', () => {
            // The same ValidateTaskGraphSpec the Loop agent type and TaskGraphService.Submit call —
            // so what the canvas shows and what submission enforces cannot diverge.
            c.Spec = spec({ tasks: [task({ tempId: 'a', dependsOn: ['ghost'] })] });
            expect(c.IsValid).toBe(false);
            expect(c.ValidationErrors.map((e) => e.Code)).toContain('UnknownDependency');
        });

        it('emits ValidationChanged when the spec changes', () => {
            const seen: TaskGraphValidationChangedEventArgs[] = [];
            c.ValidationChanged.subscribe((a) => seen.push(a));
            c.Spec = spec({ workflowName: '' });
            expect(seen.at(-1)!.Valid).toBe(false);
        });
    });

    describe('the cancelable contract', () => {
        it('does NOT emit After* when Before* is canceled', () => {
            // The contract hosts rely on. A refactor that moves the emit above the Cancel check
            // produces a component that ignores every veto while still looking correct.
            let after = 0;
            c.BeforeTaskAdded.subscribe((a) => { a.Cancel = true; });
            c.AfterTaskAdded.subscribe(() => after++);

            expect(c.AddTask({ name: 'X' })).toBeNull();
            expect(after).toBe(0);
        });

        it('does NOT mutate the spec when Before* is canceled', () => {
            c.BeforeTaskAdded.subscribe((a) => { a.Cancel = true; });
            c.AddTask({ name: 'X' });
            expect(c.Spec!.tasks).toHaveLength(2);
        });

        it('emits After* with the updated spec when not canceled', () => {
            const seen: AfterTaskAddedEventArgs[] = [];
            c.AfterTaskAdded.subscribe((a) => seen.push(a));

            const added = c.AddTask({ name: 'X' })!;
            expect(added.name).toBe('X');
            expect(seen[0].Spec.tasks).toHaveLength(3);
        });

        it('honors a cancel on removal', () => {
            let after = 0;
            c.BeforeTaskRemoved.subscribe((a) => { a.Cancel = true; });
            c.AfterTaskRemoved.subscribe(() => after++);

            expect(c.RemoveTask('a')).toBe(false);
            expect(after).toBe(0);
            expect(c.Spec!.tasks).toHaveLength(2);
        });

        it('tells a would-be vetoer the blast radius of a removal', () => {
            // A host deciding whether to block needs to know what ELSE breaks, not just which box
            // was clicked.
            const seen: BeforeTaskRemovedEventArgs[] = [];
            c.BeforeTaskRemoved.subscribe((a) => seen.push(a));
            c.RemoveTask('a');
            expect(seen[0].DependentTempIds).toEqual(['b']);
        });

        it('removes a task and its inbound edges when not canceled', () => {
            const seen: AfterTaskRemovedEventArgs[] = [];
            c.AfterTaskRemoved.subscribe((a) => seen.push(a));

            expect(c.RemoveTask('a')).toBe(true);
            expect(seen[0].Spec.tasks).toHaveLength(1);
            expect(seen[0].Spec.tasks[0].dependsOn).toEqual([]);
        });

        it('honors a cancel on an edit', () => {
            c.BeforeTaskUpdated.subscribe((a) => { a.Cancel = true; });
            expect(c.UpdateTask('a', task({ tempId: 'a', name: 'Renamed' }))).toBe(false);
            expect(c.Spec!.tasks.find((t) => t.tempId === 'a')!.name).toBe('A');
        });
    });

    describe('dependencies', () => {
        it('adds an edge and emits After*', () => {
            // A third, independent task, so the new edge is legitimate. In the base fixture `b`
            // already depends on `a`, which makes the reverse edge a cycle — see the next test.
            c.Spec = spec({ tasks: [task({ tempId: 'a' }), task({ tempId: 'b', dependsOn: ['a'] }), task({ tempId: 'c' })] });
            const seen: AfterDependencyAddedEventArgs[] = [];
            c.AfterDependencyAdded.subscribe((a) => seen.push(a));

            expect(c.AddDependency('a', 'c')).toBe(true);
            expect(seen[0].Spec.tasks.find((t) => t.tempId === 'c')!.dependsOn).toEqual(['a']);
        });

        it('REFUSES a cycle even when no host vetoes it', () => {
            // A cyclic graph can never execute — nothing becomes eligible — so letting the canvas
            // draw one would let a user build something the engine must then reject.
            let after = 0;
            c.AfterDependencyAdded.subscribe(() => after++);
            // `b` already depends on `a`, so making `a` depend on `b` closes the loop.
            expect(c.AddDependency('b', 'a')).toBe(false);
            expect(after).toBe(0);
        });

        it('tells the host WHY the edge was refused', () => {
            // So the host can explain it rather than let a stroke silently fail to appear.
            const seen: BeforeDependencyAddedEventArgs[] = [];
            c.BeforeDependencyAdded.subscribe((a) => seen.push(a));
            c.AddDependency('b', 'a');
            expect(seen.at(-1)!.WouldCreateCycle).toBe(true);
        });

        it('honors a cancel on edge removal', () => {
            c.BeforeDependencyRemoved.subscribe((a) => { a.Cancel = true; });
            expect(c.RemoveDependency('a', 'b')).toBe(false);
            expect(c.Connections).toHaveLength(1);
        });

        it('removes an edge when not canceled', () => {
            expect(c.RemoveDependency('a', 'b')).toBe(true);
            expect(c.Connections).toHaveLength(0);
        });
    });

    describe('ReadOnly', () => {
        beforeEach(() => { c.ReadOnly = true; });

        it.each([
            ['AddTask', () => c.AddTask({ name: 'X' })],
            ['RemoveTask', () => c.RemoveTask('a')],
            ['UpdateTask', () => c.UpdateTask('a', task({ tempId: 'a', name: 'Z' }))],
            ['AddDependency', () => c.AddDependency('b', 'a')],
            ['RemoveDependency', () => c.RemoveDependency('a', 'b')],
        ])('%s is inert', (_label, act) => {
            const before = JSON.stringify(c.Spec);
            expect(act()).toBeFalsy();
            expect(JSON.stringify(c.Spec)).toBe(before);
        });

        it('does not even emit Before* when read-only', () => {
            // Read-only must be a real gate, not a UI hint the host has to re-enforce.
            let emitted = 0;
            c.BeforeTaskRemoved.subscribe(() => emitted++);
            c.RemoveTask('a');
            expect(emitted).toBe(0);
        });
    });

    describe('informational events', () => {
        it('emits SpecChanged with the reason', () => {
            const seen: TaskGraphSpecChangedEventArgs[] = [];
            c.SpecChanged.subscribe((a) => seen.push(a));
            c.AddTask({ name: 'X' });
            expect(seen[0].Reason).toBe('TaskAdded');
        });

        it('emits SelectionChanged, including on clear', () => {
            const seen: (TaskGraphSpecNode | null)[] = [];
            c.SelectionChanged.subscribe((a) => seen.push(a.Task));
            c.OnNodeSelected(c.Nodes[0]);
            c.OnNodeSelected(null);
            expect(seen[0]!.tempId).toBe('a');
            expect(seen[1]).toBeNull();
        });

        it('clears the selection when the selected task is removed', () => {
            c.OnNodeSelected(c.Nodes[0]);
            c.RemoveTask('a');
            expect(c.SelectedTask).toBeNull();
        });
    });

    describe('navigation intent stays intent', () => {
        it('emits AgentOpenRequested rather than navigating', () => {
            // This layer has no Router and must never acquire one — it cannot know whether it is
            // inside Explorer, a downstream app, or an embedded panel.
            const seen: string[] = [];
            c.AgentOpenRequested.subscribe((a) => seen.push(a.AgentName));
            c.RequestAgentOpen(task({ kind: 'Agent' as const, configuration: { agentName: 'Query Builder' } }));
            expect(seen).toEqual(['Query Builder']);
        });

        it('does not ask to open an agent for a human task', () => {
            let emitted = 0;
            c.AgentOpenRequested.subscribe(() => emitted++);
            c.RequestAgentOpen(task({ kind: 'Human' as const, configuration: {} }));
            expect(emitted).toBe(0);
        });

        it('emits RecordOpenRequested rather than navigating', () => {
            const seen: string[] = [];
            c.RecordOpenRequested.subscribe((a) => seen.push(`${a.EntityName}:${a.RecordID}`));
            c.RequestRecordOpen('MJ: Tasks', 'abc');
            expect(seen).toEqual(['MJ: Tasks:abc']);
        });
    });

    describe('canvas handlers translate to spec operations', () => {
        it('a drawn connection becomes a dependency', () => {
            c.Spec = spec({ tasks: [task({ tempId: 'a' }), task({ tempId: 'b', dependsOn: ['a'] }), task({ tempId: 'c' })] });
            c.OnConnectionCreated({ SourceNodeID: 'a', TargetNodeID: 'c', SourcePortID: 'out', TargetPortID: 'in' });
            expect(c.Spec!.tasks.find((t) => t.tempId === 'c')!.dependsOn).toEqual(['a']);
        });

        it('a deleted node becomes a task removal', () => {
            c.OnNodeRemoved(c.Nodes[0]);
            expect(c.Spec!.tasks).toHaveLength(1);
        });
    });
});

/**
 * Port identity, and why edges vanished.
 *
 * The canvas resolves a connection by looking its `fOutputId` / `fInputId` up among ALL registered
 * ports — one flat namespace for the whole graph. Every node used to declare ports literally called
 * `in` and `out`, so no connection could name which node's port it meant, and a workflow drew its
 * boxes with no edges at all. Nothing errored: an unresolvable port is just a connection with
 * nowhere to attach.
 */
describe('canvas ports are scoped to their node', () => {
    const spec: TaskGraphSpec = {
        workflowName: 'W',
        reasoning: '',
        tasks: [
            TaskNode.Action({ tempId: 'a', name: 'A', description: '', dependsOn: [] }, { actionName: 'X' }),
            TaskNode.Action({ tempId: 'b', name: 'B', description: '', dependsOn: ['a'] }, { actionName: 'Y' }),
        ],
    };

    it('gives no two nodes the same port id', () => {
        const ids = SpecToNodes(spec).flatMap((n) => n.Ports.map((p) => p.ID));
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('points a connection at ports that actually exist on its endpoints', () => {
        const nodes = SpecToNodes(spec);
        const [conn] = SpecToConnections(spec);
        const source = nodes.find((n) => n.ID === conn.SourceNodeID)!;
        const target = nodes.find((n) => n.ID === conn.TargetNodeID)!;

        expect(source.Ports.map((p) => p.ID)).toContain(conn.SourcePortID);
        expect(target.Ports.map((p) => p.ID)).toContain(conn.TargetPortID);
    });

    it('does not reuse one endpoint id for both ends', () => {
        const [conn] = SpecToConnections(spec);
        expect(conn.SourcePortID).not.toBe(conn.TargetPortID);
    });
});

/**
 * A branch the workflow declined must not read like a route it followed.
 *
 * `Skipped` was absent from the runtime-state union entirely, so it fell through to the default
 * rendering and a not-taken step drew as an ordinary node with an ordinary edge into it — which is
 * how a conditional workflow looks like it ran every branch.
 */
describe('routes the workflow did not take', () => {
    const branching: TaskGraphSpec = {
        workflowName: 'W',
        reasoning: '',
        tasks: [
            TaskNode.Action({ tempId: 'start', name: 'Start', description: '', dependsOn: [] }, { actionName: 'X' }),
            TaskNode.Action({ tempId: 'taken', name: 'Taken', description: '', dependsOn: ['start'] }, { actionName: 'Y' }),
            TaskNode.Action({ tempId: 'not-taken', name: 'Not taken', description: '', dependsOn: ['start'] }, { actionName: 'Z' }),
        ],
    };
    const runtime = { start: 'Complete', taken: 'Complete', 'not-taken': 'Skipped' } as const;

    it('draws no edge into a step the workflow declined', () => {
        expect(SpecToConnections(branching, runtime).some((c) => c.TargetNodeID === 'not-taken')).toBe(false);
    });

    it('draws no edge OUT of a declined step either', () => {
        // An edge leaving a skipped step is as untravelled as one entering it — checking only the
        // target would leave half of every abandoned branch drawn as though it had carried something.
        const withDownstream: TaskGraphSpec = {
            ...branching,
            tasks: [
                ...branching.tasks,
                TaskNode.Action({ tempId: 'after', name: 'After', description: '', dependsOn: ['not-taken'] }, { actionName: 'Q' }),
            ],
        };
        const conns = SpecToConnections(withDownstream, { ...runtime, after: 'Pending' });
        expect(conns.some((c) => c.SourceNodeID === 'not-taken')).toBe(false);
    });

    it('keeps the edges along the route that WAS taken', () => {
        expect(SpecToConnections(branching, runtime).some((c) => c.TargetNodeID === 'taken')).toBe(true);
    });

    it('gives a skipped step its own node status, not the default one', () => {
        const nodes = SpecToNodes(branching, runtime);
        expect(nodes.find((n) => n.ID === 'not-taken')?.Status).toBe('skipped');
        expect(nodes.find((n) => n.ID === 'taken')?.Status).toBe('success');
    });

    it('DESIGN mode keeps every edge — there is no route yet, only routes that could be taken', () => {
        // The same graph with no runtime is what an author is arranging; hiding a branch there would
        // hide part of what they are building.
        expect(SpecToConnections(branching)).toHaveLength(2);
    });
});

/**
 * Reading a running graph back as a spec.
 *
 * The spec was never persisted, so a run view has only rows — and everything it draws depends on
 * this projection getting the kind right. The failure that matters is not a crash: a node projected
 * as the wrong kind renders with the wrong icon, the wrong detail fields and the wrong navigation
 * target, and looks entirely plausible while doing it.
 */
import { describe, it, expect } from 'vitest';
import { ProjectTaskRowsToSpec, type TaskRunEdge, type TaskRunRow } from '../task-graph/task-rows-to-spec';
import { ConfigOf, NormalizeDependency } from '../task-graph/task-graph-spec';

const row = (over: Partial<TaskRunRow> & Pick<TaskRunRow, 'ID' | 'Name'>): TaskRunRow => ({
    Status: 'Complete', ...over,
});

describe('ProjectTaskRowsToSpec', () => {
    it('recovers each row’s KIND', () => {
        const { Spec } = ProjectTaskRowsToSpec('W', [
            row({ ID: '1', Name: 'Fetch', StepType: 'Action' }),
            row({ ID: '2', Name: 'Summarize', StepType: 'Agent' }),
            row({ ID: '3', Name: 'Approve', StepType: 'Human' }),
            row({ ID: '4', Name: 'Loop', StepType: 'ForEach' }),
        ], []);
        expect(Spec.tasks.map((t) => t.kind)).toEqual(['Action', 'Agent', 'Human', 'ForEach']);
    });

    it('uses the task ID as identity, because a run has no tempIds', () => {
        const { Spec } = ProjectTaskRowsToSpec('W', [row({ ID: 'task-abc', Name: 'X', StepType: 'Action' })], []);
        expect(Spec.tasks[0].tempId).toBe('task-abc');
    });

    it('rebuilds the edges, including what decided the branch', () => {
        const edges: TaskRunEdge[] = [
            { TaskID: '2', DependsOnTaskID: '1', Condition: 'payload.x > 5', ExclusiveGroup: 'g1', Priority: 10, Sequence: 1 },
        ];
        const { Spec } = ProjectTaskRowsToSpec('W', [
            row({ ID: '1', Name: 'A', StepType: 'Action' }),
            row({ ID: '2', Name: 'B', StepType: 'Action' }),
        ], edges);

        const dep = NormalizeDependency(Spec.tasks[1].dependsOn[0]);
        expect(dep.tempId).toBe('1');
        expect(dep.condition).toBe('payload.x > 5');
        expect(dep.exclusiveGroup).toBe('g1');
        expect(dep.priority).toBe(10);
    });

    it('recovers the mappings from the configuration bag', () => {
        const { Spec } = ProjectTaskRowsToSpec('W', [
            row({
                ID: '1', Name: 'Stock', StepType: 'Action',
                Configuration: JSON.stringify({ inputMapping: '{"t":"NVDA"}', outputMapping: '{"P":"price"}' }),
            }),
        ], []);
        expect(ConfigOf(Spec.tasks[0], 'Action')?.outputMapping).toBe('{"P":"price"}');
    });

    it('recovers the loop definition', () => {
        const { Spec } = ProjectTaskRowsToSpec('W', [
            row({
                ID: '1', Name: 'Loop', StepType: 'ForEach',
                Configuration: JSON.stringify({ forEach: { collectionPath: 'payload.items', maxIterations: 5 } }),
            }),
        ], []);
        expect(ConfigOf(Spec.tasks[0], 'ForEach')?.collectionPath).toBe('payload.items');
    });

    it('returns the AUTHOR’S positions separately from the graph', () => {
        // Separate because the caller needs to know which nodes have geometry and which need one
        // computed — an empty map means "lay this out", not "put it at the origin".
        const { AuthoredPositions } = ProjectTaskRowsToSpec('W', [
            row({ ID: '1', Name: 'A', StepType: 'Action', Configuration: JSON.stringify({ layout: { x: 120, y: 40 } }) }),
            row({ ID: '2', Name: 'B', StepType: 'Action' }),
        ], []);
        expect(AuthoredPositions.get('1')).toEqual({ X: 120, Y: 40 });
        expect(AuthoredPositions.has('2')).toBe(false);
    });

    it('drops an edge pointing outside the graph rather than inventing a node', () => {
        const { Spec } = ProjectTaskRowsToSpec('W',
            [row({ ID: '1', Name: 'A', StepType: 'Action' })],
            [{ TaskID: '1', DependsOnTaskID: 'ghost' }],
        );
        expect(Spec.tasks[0].dependsOn).toHaveLength(0);
    });

    it('renders a row with no StepType as a person’s step rather than dropping it', () => {
        // A hand-authored to-do that wandered into the same parent. A node the viewer can see and
        // question beats one that silently vanished from their graph.
        const { Spec } = ProjectTaskRowsToSpec('W', [row({ ID: '1', Name: 'Stray to-do' })], []);
        expect(Spec.tasks[0].kind).toBe('Human');
    });

    it('survives a malformed configuration bag', () => {
        const { Spec } = ProjectTaskRowsToSpec('W', [
            row({ ID: '1', Name: 'A', StepType: 'Action', Configuration: '{not json' }),
        ], []);
        expect(Spec.tasks[0].kind).toBe('Action');
    });

    it('handles an empty graph', () => {
        expect(ProjectTaskRowsToSpec('W', [], []).Spec.tasks).toHaveLength(0);
    });
});

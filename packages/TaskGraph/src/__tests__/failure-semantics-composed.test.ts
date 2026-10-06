/**
 * What `failureSemantics: 'block'` must actually produce, composed end to end. (R3-2, PR #3771.)
 *
 * The unit assertions on `DecideGate` prove it refuses to decide. This proves the CONSEQUENCE,
 * which is where the damage was and which no single-function test can show: the dropped edge did
 * not merely fail to gate, it also **severed `ComputeTasksToBlock`'s forward walk**, because that
 * walk is built from the surviving edges. So the target was skipped rather than blocked, `Skipped`
 * satisfied its dependents, and a join fed by an independent healthy route executed downstream of an
 * unhandled failure — while the parent still rolled up `Failed` and the verdict looked correct.
 *
 * The shape is the plan's, verbatim:
 *
 *     A(Failed) ──(payload.approved === true)──▶ B ──▶ D
 *     E(Complete) ───────────────────────────────────▶ D
 */
import { describe, it, expect } from 'vitest';
import {
    ComputeEligibleTasks,
    ComputeSkipCascade,
    ComputeTasksToBlock,
    ConfirmSkipSeeds,
    type TaskGraphEdge,
    type TaskGraphNode,
} from '@memberjunction/ai-core-plus';
import { DecideGate, type FailureSemantics } from '../condition-gate';

/** Runs the dispatcher's ordinary-edge pipeline for one pass, as `loadGraphState` composes it. */
function pass(failureSemantics: FailureSemantics) {
    const nodes: TaskGraphNode[] = [
        { id: 'A', status: 'Failed' },
        { id: 'E', status: 'Complete' },
        { id: 'B', status: 'Pending' },
        { id: 'D', status: 'Pending' },
    ];
    const declared: Array<TaskGraphEdge & { condition?: string }> = [
        { taskId: 'B', dependsOnTaskId: 'A', condition: 'payload.approved === true' },
        { taskId: 'D', dependsOnTaskId: 'B' },
        { taskId: 'D', dependsOnTaskId: 'E' },
    ];

    // A failed step almost never has output, so the null-safe envelope answers a positive condition
    // with a confident false. That is R2-3 working as designed — and it is what makes this defect
    // reachable on nearly every failure rather than only on exotic ones.
    const evaluateToFalse = () => ({ Success: true, Value: false });

    const liveEdges: TaskGraphEdge[] = [];
    const droppedInto = new Set<string>();
    const stillReachable = new Set<string>();
    for (const edge of declared) {
        if (edge.condition) {
            const outcome = DecideGate(
                nodes.find((n) => n.id === edge.dependsOnTaskId)!.status,
                failureSemantics,
                evaluateToFalse,
            );
            if (outcome === 'drop') { droppedInto.add(edge.taskId); continue; }
        }
        stillReachable.add(edge.taskId);
        liveEdges.push({ taskId: edge.taskId, dependsOnTaskId: edge.dependsOnTaskId });
    }

    const unreachable = [...droppedInto].filter((id) => !stillReachable.has(id));
    const seeds = ConfirmSkipSeeds(unreachable, liveEdges);
    for (const id of [...seeds, ...ComputeSkipCascade(nodes, liveEdges, seeds)]) {
        const n = nodes.find((x) => x.id === id);
        if (n && n.status === 'Pending') n.status = 'Skipped';
    }

    return {
        blocked: ComputeTasksToBlock(nodes, liveEdges),
        eligible: ComputeEligibleTasks(nodes, liveEdges).map((n) => n.id),
        statusOf: (id: string) => nodes.find((n) => n.id === id)!.status,
    };
}

describe('R3-2 composed: under block, nothing downstream of an unhandled failure runs', () => {
    it('BLOCKS the join rather than running it', () => {
        const { blocked, eligible } = pass('block');
        expect(eligible).not.toContain('D');
        expect(blocked).toContain('D');
    });

    it('blocks the guarded step too, rather than skipping it', () => {
        // The distinction is the whole defect. `Blocked` says something upstream broke and stops
        // dependents; `Skipped` says the workflow chose another route and SATISFIES them.
        const { blocked, statusOf } = pass('block');
        expect(statusOf('B')).toBe('Pending');
        expect(blocked).toContain('B');
    });

    it('and the pre-fix reading still reproduces the bug, so this fixture has teeth', () => {
        // `'edges'` is exactly what the ordinary dialect did unconditionally before R3-2. Run the
        // same graph through it: B is dropped-then-skipped, the severed edge takes D out of the
        // block walk's reach, and D becomes eligible — executing downstream of an unhandled failure.
        const { blocked, eligible, statusOf } = pass('edges');
        expect(statusOf('B')).toBe('Skipped');
        expect(eligible).toContain('D');
        expect(blocked).not.toContain('D');
    });
});

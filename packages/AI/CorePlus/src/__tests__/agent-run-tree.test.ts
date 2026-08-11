/**
 * Assembling a run tree from flat rows.
 *
 * The assembler is small, but it is the single point through which every consumer sees a run — the
 * timeline, the visualizations, and the tests that assert on runs. A defect here does not crash; it
 * renders a run that is subtly not what happened: children under the wrong parent, siblings in the
 * wrong order, or a node quietly missing. Each test below names the specific wrong-but-plausible
 * tree it rules out.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildAgentRunTree,
    FindAgentRunTreeNodes,
    FormatAgentRunTree,
    SumAgentRunTreeCost,
    WalkAgentRunTree,
    type AgentRunTreeRow,
} from '../agent-run-tree';

const row = (over: Partial<AgentRunTreeRow> & Pick<AgentRunTreeRow, 'NodeID' | 'NodeType' | 'Name'>): AgentRunTreeRow => ({
    ParentNodeID: null,
    Depth: 0,
    Sequence: 0,
    Status: 'Complete',
    StartedAt: null,
    CompletedAt: null,
    DurationMs: null,
    Cost: null,
    Tokens: null,
    SourceEntity: 'MJ: AI Agent Runs',
    SourceID: over.NodeID,
    ...over,
});

/** The shape this whole design exists for: run → step → graph → task → nested run → its steps. */
const deepRun = (): AgentRunTreeRow[] => [
    row({ NodeID: 'run', NodeType: 'Run', Name: 'Demo Flow Agent' }),
    row({ NodeID: 'step-1', ParentNodeID: 'run', Depth: 1, Sequence: 0, NodeType: 'Step', Name: 'Agent Validation' }),
    row({ NodeID: 'step-2', ParentNodeID: 'run', Depth: 1, Sequence: 1, NodeType: 'TaskGraph', Name: 'Task Graph: Demo' }),
    row({ NodeID: 'task-a', ParentNodeID: 'step-2', Depth: 2, Sequence: 0, NodeType: 'Task', Name: 'Stock Price' }),
    row({ NodeID: 'task-b', ParentNodeID: 'step-2', Depth: 2, Sequence: 1, NodeType: 'Task', Name: 'Summarize', Cost: 0.04 }),
    row({ NodeID: 'nested', ParentNodeID: 'task-b', Depth: 3, Sequence: 0, NodeType: 'Run', Name: 'Summarizer' }),
    row({ NodeID: 'nested-s1', ParentNodeID: 'nested', Depth: 4, Sequence: 0, NodeType: 'Step', Name: 'Execute Prompt', Cost: 0.04 }),
];

describe('BuildAgentRunTree', () => {
    it('nests a task graph’s tasks under the step, and a task’s run under the task', () => {
        // The whole point: the tree changes KIND as it descends, and three hardcoded levels would
        // not reach the nested run's steps.
        const tree = BuildAgentRunTree(deepRun())!;
        const graph = tree.Children.find((c) => c.NodeType === 'TaskGraph')!;
        expect(graph.Children.map((c) => c.Name)).toEqual(['Stock Price', 'Summarize']);

        const task = graph.Children[1];
        expect(task.Children[0].NodeType).toBe('Run');
        expect(task.Children[0].Children[0].Name).toBe('Execute Prompt');
    });

    it('orders siblings by Sequence, not by row order', () => {
        // Rows arrive in whatever order the query emits. Rendering them in that order would show
        // steps out of the order they happened, which reads as a different run.
        const tree = BuildAgentRunTree([
            row({ NodeID: 'run', NodeType: 'Run', Name: 'R' }),
            row({ NodeID: 'c', ParentNodeID: 'run', Depth: 1, Sequence: 2, NodeType: 'Step', Name: 'third' }),
            row({ NodeID: 'a', ParentNodeID: 'run', Depth: 1, Sequence: 0, NodeType: 'Step', Name: 'first' }),
            row({ NodeID: 'b', ParentNodeID: 'run', Depth: 1, Sequence: 1, NodeType: 'Step', Name: 'second' }),
        ])!;
        expect(tree.Children.map((c) => c.Name)).toEqual(['first', 'second', 'third']);
    });

    it('breaks a Sequence tie deterministically', () => {
        // Two loads of the same run must render identically; a tie resolved by hash order would not.
        const rows = [
            row({ NodeID: 'run', NodeType: 'Run', Name: 'R' }),
            row({ NodeID: 'zzz', ParentNodeID: 'run', Depth: 1, Sequence: 0, NodeType: 'Step', Name: 'z' }),
            row({ NodeID: 'aaa', ParentNodeID: 'run', Depth: 1, Sequence: 0, NodeType: 'Step', Name: 'a' }),
        ];
        expect(BuildAgentRunTree(rows)!.Children.map((c) => c.NodeID)).toEqual(['aaa', 'zzz']);
        expect(BuildAgentRunTree([...rows].reverse())!.Children.map((c) => c.NodeID)).toEqual(['aaa', 'zzz']);
    });

    it('ATTACHES an orphan to the root rather than dropping it', () => {
        // A node whose parent was truncated by the depth cap, or filtered by permissions, still
        // represents work that happened. Dropping it silently shrinks the run.
        const tree = BuildAgentRunTree([
            row({ NodeID: 'run', NodeType: 'Run', Name: 'R' }),
            row({ NodeID: 'lost', ParentNodeID: 'missing-parent', Depth: 3, NodeType: 'Step', Name: 'Orphaned step' }),
        ])!;
        expect(tree.Children.map((c) => c.Name)).toContain('Orphaned step');
    });

    it('keeps the shallowest root when the query returns two', () => {
        const tree = BuildAgentRunTree([
            row({ NodeID: 'deep', Depth: 2, NodeType: 'Run', Name: 'deeper root' }),
            row({ NodeID: 'shallow', Depth: 0, NodeType: 'Run', Name: 'real root' }),
        ])!;
        expect(tree.Name).toBe('real root');
        expect(tree.Children.map((c) => c.Name)).toContain('deeper root');
    });

    it('returns null for no rows rather than an empty node', () => {
        expect(BuildAgentRunTree([])).toBeNull();
    });
});

describe('traversal helpers', () => {
    it('walks depth-first in render order', () => {
        const tree = BuildAgentRunTree(deepRun())!;
        expect([...WalkAgentRunTree(tree)].map((n) => n.NodeID)).toEqual([
            'run', 'step-1', 'step-2', 'task-a', 'task-b', 'nested', 'nested-s1',
        ]);
    });

    it('finds nodes by kind — the basis of asserting on a run', () => {
        const tree = BuildAgentRunTree(deepRun())!;
        expect(FindAgentRunTreeNodes(tree, (n) => n.NodeType === 'Task')).toHaveLength(2);
    });

    it('sums cost across every nested run and dispatched graph', () => {
        // The number a UI shows as "including workflow". Summing only the top level would report
        // the near-zero cost of a run that dispatched all its real work.
        const totals = SumAgentRunTreeCost(BuildAgentRunTree(deepRun())!);
        expect(totals.Cost).toBeCloseTo(0.08);
    });

    it('formats a readable outline, so a failed assertion names the node', () => {
        const text = FormatAgentRunTree(BuildAgentRunTree(deepRun())!);
        expect(text).toContain('[TaskGraph] Task Graph: Demo');
        expect(text.split('\n').some((l) => l.startsWith('      [Run] Summarizer'))).toBe(true);
    });
});
